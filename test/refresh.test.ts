import { strict as assert } from "node:assert";
import type {
	Api,
	Credential,
	Model,
	ModelsPublication,
	ModelsStoreEntry,
	RefreshModelsContext,
} from "@earendil-works/pi-ai";
import { afterEach, test } from "vitest";
import { refreshOmlxCatalog } from "../src/catalog.ts";
import { KEYLESS_PLACEHOLDER } from "../src/config.ts";

const BASE_URL = "http://127.0.0.1:9400/v1";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function catalogResponse(models: unknown[]): Response {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		json: async () => ({ models }),
		text: async () => JSON.stringify({ models }),
	} as Response;
}

// A model as pi's store holds it: the complete shape the extension publishes.
function storedModel(id: string): Model<"openai-completions"> {
	return {
		id,
		name: id,
		api: "openai-completions",
		provider: "omlx",
		baseUrl: BASE_URL,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 32768,
		maxTokens: 4096,
	};
}

interface Fetched {
	url: string;
	authorization: string | undefined;
	signal: AbortSignal | undefined;
}

interface Harness {
	state: {
		committed: readonly Model<Api>[] | undefined;
		commitCalls: number;
		persisted: ModelsStoreEntry | undefined;
	};
	publications: ModelsPublication[];
	fetched: Fetched[];
	context: RefreshModelsContext;
	/** pi's network phase: the same context with the network allowed. */
	refresh: () => Promise<void>;
	/** pi's offline phase: the same context with the network disallowed. */
	refreshOffline: () => Promise<void>;
	/** Make the next publish answer false, as pi does for a refused one. */
	refusePublish: (refuse: boolean) => void;
}

function refreshHarness(options: {
	stored?: ModelsStoreEntry;
	credential?: Credential;
	allowNetwork?: boolean;
	signal?: AbortSignal;
	respond?: () => Response | Promise<Response>;
}): Harness {
	const fetched: Fetched[] = [];
	const publications: ModelsPublication[] = [];
	const state = {
		committed: undefined as readonly Model<Api>[] | undefined,
		commitCalls: 0,
		persisted: undefined as ModelsStoreEntry | undefined,
	};

	globalThis.fetch = (async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		const headers = init?.headers as Record<string, string> | undefined;
		fetched.push({
			url: String(url),
			authorization: headers?.Authorization,
			signal: init?.signal ?? undefined,
		});
		return options.respond?.() ?? catalogResponse([]);
	}) as typeof fetch;

	let refusePublish = false;
	const context: RefreshModelsContext = {
		credential: options.credential,
		stored: options.stored,
		allowNetwork: options.allowNetwork ?? true,
		signal: options.signal ?? new AbortController().signal,
		publish: async (publication) => {
			publications.push(publication);
			if (refusePublish) return false;
			if (publication.persist) state.persisted = publication.persist;
			publication.update?.();
			return true;
		},
	};

	const run = async (allowNetwork: boolean) => {
		await refreshOmlxCatalog({ ...context, allowNetwork }, (models) => {
			state.committed = models;
			state.commitCalls++;
		});
	};

	return {
		state,
		publications,
		fetched,
		context,
		refresh: () => run(context.allowNetwork),
		refreshOffline: () => run(false),
		refusePublish: (refuse: boolean) => {
			refusePublish = refuse;
		},
	};
}

test("the offline phase publishes the stored models and fetches nothing", async () => {
	const harness = refreshHarness({
		stored: { models: [storedModel("stored-model")] },
		allowNetwork: false,
	});

	await harness.refresh();

	assert.deepEqual(
		harness.state.committed?.map((model) => model.id),
		["stored-model"],
	);
	assert.deepEqual(harness.fetched, []);
	assert.equal(
		harness.state.persisted,
		undefined,
		"the offline phase persisted",
	);
});

test("an empty store publishes an empty list and throws nothing", async () => {
	const harness = refreshHarness({ allowNetwork: false });

	await harness.refresh();

	assert.deepEqual(harness.state.committed, []);
	assert.deepEqual(harness.fetched, []);
});

test("the network phase publishes the fetched models with persist", async () => {
	const harness = refreshHarness({
		credential: {
			type: "api_key",
			key: "stored-key",
			env: { OMLX_BASE_URL: BASE_URL },
		},
		respond: () =>
			catalogResponse([
				{ id: "fetched-model", max_context_window: 65536, max_tokens: 8192 },
			]),
	});

	await harness.refresh();

	assert.equal(harness.fetched.length, 1);
	assert.equal(harness.fetched[0]?.url, `${BASE_URL}/models/status`);
	assert.deepEqual(
		harness.state.persisted?.models.map((model) => model.id),
		["fetched-model"],
	);
	assert.equal(typeof harness.state.persisted?.checkedAt, "number");
	assert.deepEqual(
		harness.state.committed?.map((model) => model.id),
		["fetched-model"],
	);
});

// D7/D13: pi hands this phase resolveOmlx's own output, so a credential that is
// absent, is not api_key, is keyless or carries no env.OMLX_BASE_URL is a broken
// contract. It throws where pi records it, instead of returning and leaving the
// user with no models and no cause.
test("a credential the resolution cannot produce throws, fetches nothing and publishes nothing", async () => {
	const cases = [
		{ credential: undefined, names: /no credential/i },
		{
			credential: {
				type: "oauth",
				access: "old-key",
				refresh: "",
				expires: 0,
			},
			names: /oauth.*api_key/i,
		},
		{
			credential: { type: "api_key", env: { OMLX_BASE_URL: BASE_URL } },
			names: /no API key/i,
		},
		{
			credential: { type: "api_key", key: "stored-key" },
			names: /no OMLX_BASE_URL/,
		},
	] as const;

	for (const { credential, names } of cases) {
		const harness = refreshHarness({ credential });

		await assert.rejects(harness.refresh, (error: Error) => {
			assert.match(error.message, names, JSON.stringify(credential));
			return true;
		});
		assert.deepEqual(harness.fetched, [], JSON.stringify(credential));
		assert.deepEqual(harness.publications, [], JSON.stringify(credential));
		assert.equal(harness.state.committed, undefined);
	}
});

test("the published model carries provider omlx, api openai-completions and the fetch URL as baseUrl", async () => {
	const harness = refreshHarness({
		credential: {
			type: "api_key",
			key: "stored-key",
			env: { OMLX_BASE_URL: BASE_URL },
		},
		respond: () =>
			catalogResponse([
				{
					id: "thinking-model",
					thinking_default: true,
					max_context_window: 65536,
					max_tokens: 8192,
				},
				{
					id: "plain-model",
					thinking_default: false,
					max_context_window: 65536,
					max_tokens: 8192,
				},
			]),
	});

	await harness.refresh();

	const [thinking, plain] = harness.state.committed ?? [];
	assert.ok(thinking && plain, "both models were published");
	assert.equal(thinking.provider, "omlx");
	assert.equal(thinking.api, "openai-completions");
	assert.equal(thinking.baseUrl, BASE_URL);
	// `reasoning` is true only for the model the catalog calls thinking-by-default.
	assert.equal(thinking.reasoning, true);
	assert.equal(plain.reasoning, false);
});

test("a mixed response publishes the registrable model and skips the limit-less one", async () => {
	const harness = refreshHarness({
		credential: {
			type: "api_key",
			key: "stored-key",
			env: { OMLX_BASE_URL: BASE_URL },
		},
		respond: () =>
			catalogResponse([
				{ id: "usable", max_context_window: 65536, max_tokens: 8192 },
				{ id: "no-limits" },
			]),
	});

	await harness.refresh();

	assert.deepEqual(
		harness.state.committed?.map((model) => model.id),
		["usable"],
	);
});

test("no registrable model throws and leaves the store and the published list unchanged", async () => {
	const harness = refreshHarness({
		credential: {
			type: "api_key",
			key: "stored-key",
			env: { OMLX_BASE_URL: BASE_URL },
		},
		stored: { models: [storedModel("stored-model")] },
		respond: () =>
			catalogResponse([{ id: "no-limits" }, { id: "also-no-limits" }]),
	});

	// pi's offline phase first, so "unchanged" is a real prior value.
	await harness.refreshOffline();
	assert.deepEqual(
		harness.state.committed?.map((model) => model.id),
		["stored-model"],
	);
	const publicationsBefore = harness.publications.length;

	await assert.rejects(harness.refresh, (error: Error) => {
		assert.ok(error.message.includes(BASE_URL), error.message);
		assert.match(error.message, /2 models/);
		return true;
	});
	assert.deepEqual(
		harness.state.committed?.map((model) => model.id),
		["stored-model"],
	);
	assert.equal(harness.state.persisted, undefined, "the failure persisted");
	assert.equal(
		harness.publications.length,
		publicationsBefore,
		"the failure published",
	);
});

test("the fetch receives context.signal and a publish that resolves false without running update leaves getModels unchanged", async () => {
	const controller = new AbortController();
	const harness = refreshHarness({
		credential: {
			type: "api_key",
			key: "stored-key",
			env: { OMLX_BASE_URL: BASE_URL },
		},
		stored: { models: [storedModel("stored-model")] },
		signal: controller.signal,
		respond: () =>
			catalogResponse([
				{ id: "fetched-model", max_context_window: 65536, max_tokens: 8192 },
			]),
	});

	// pi's offline phase establishes the list the refused publish must leave.
	await harness.refreshOffline();
	assert.deepEqual(
		harness.state.committed?.map((model) => model.id),
		["stored-model"],
	);
	const publicationsBefore = harness.publications.length;
	harness.refusePublish(true);

	await harness.refresh();

	// The request's signal is composed with the fetch timeout, so following the
	// refresh's signal is what shows: aborting the context aborts the request.
	const requestSignal = harness.fetched[0]?.signal;
	assert.ok(requestSignal, "the request carried no signal");
	assert.equal(requestSignal.aborted, false);
	controller.abort();
	assert.equal(requestSignal.aborted, true);
	assert.equal(
		harness.publications.length,
		publicationsBefore + 1,
		"the network phase published once",
	);
	assert.equal(harness.state.commitCalls, 1, "a refused publish committed");
	assert.deepEqual(
		harness.state.committed?.map((model) => model.id),
		["stored-model"],
		"the refused publish left getModels unchanged",
	);
});

test("an already-aborted signal makes no request", async () => {
	const controller = new AbortController();
	controller.abort();
	const harness = refreshHarness({
		credential: {
			type: "api_key",
			key: "stored-key",
			env: { OMLX_BASE_URL: BASE_URL },
		},
		signal: controller.signal,
		respond: () =>
			catalogResponse([
				{ id: "fetched-model", max_context_window: 65536, max_tokens: 8192 },
			]),
	});

	await harness.refresh();

	assert.deepEqual(harness.fetched, []);
	assert.equal(harness.state.persisted, undefined);
	assert.equal(harness.state.commitCalls, 0, "an aborted refresh committed");
	assert.equal(harness.publications.length, 0, "an aborted refresh published");
});

function withEnv(key: string, value: string): () => void {
	const saved = process.env[key];
	process.env[key] = value;
	return () => {
		if (saved === undefined) delete process.env[key];
		else process.env[key] = saved;
	};
}

test("the fetch carries the stored key while OMLX_API_KEY names a different one", async () => {
	const restoreEnv = withEnv("OMLX_API_KEY", "environment-key");
	try {
		const harness = refreshHarness({
			credential: {
				type: "api_key",
				key: "stored-key",
				env: { OMLX_BASE_URL: BASE_URL },
			},
			respond: () =>
				catalogResponse([
					{ id: "fetched-model", max_context_window: 65536, max_tokens: 8192 },
				]),
		});

		await harness.refresh();

		assert.equal(harness.fetched[0]?.authorization, "Bearer stored-key");
	} finally {
		restoreEnv();
	}
});

test("a stored keyless login sends the placeholder while OMLX_API_KEY is set", async () => {
	const restoreEnv = withEnv("OMLX_API_KEY", "environment-key");
	try {
		const harness = refreshHarness({
			credential: {
				type: "api_key",
				key: KEYLESS_PLACEHOLDER,
				env: { OMLX_BASE_URL: BASE_URL },
			},
			respond: () =>
				catalogResponse([
					{ id: "fetched-model", max_context_window: 65536, max_tokens: 8192 },
				]),
		});

		await harness.refresh();

		assert.equal(
			harness.fetched[0]?.authorization,
			`Bearer ${KEYLESS_PLACEHOLDER}`,
		);
	} finally {
		restoreEnv();
	}
});
