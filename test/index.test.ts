import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { Provider, RefreshModelsContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, inject, test, vi } from "vitest";
import extension from "../index.ts";

type EntryFunction = (pi: ExtensionAPI) => Promise<void>;

const FIXTURE_BASE_URL = "https://omlx.home.g33k.top/v1";
const FIXTURE_MODELS = {
	models: [{ id: "real-model", max_context_window: 32768, max_tokens: 4096 }],
};

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(inject("isolationRoot"), "pi-omlx-index-"));
});

const ENV_KEYS = [
	"PI_CODING_AGENT_DIR",
	"OMLX_API_KEY",
	"OMLX_BASE_URL",
	"PI_OMLX_DEBUG",
] as const;

type TestEnv = Partial<Record<(typeof ENV_KEYS)[number], string>>;

function withEnv(env: TestEnv): () => void {
	const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const);
	for (const key of ENV_KEYS) delete process.env[key];
	Object.assign(process.env, env);
	return () => {
		for (const key of ENV_KEYS) delete process.env[key];
		for (const [key, value] of saved) {
			if (value !== undefined) process.env[key] = value;
		}
	};
}

interface Fetched {
	url: string;
	authorization: string | undefined;
}

interface NotifyCall {
	message: string;
	type: string | undefined;
}

interface SessionShape {
	hasUI: boolean;
	mode: string;
}

type Handler = (event?: unknown, ctx?: unknown) => unknown;

function jsonResponse(body: unknown): Response {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		json: async () => body,
		text: async () => JSON.stringify(body),
	} as Response;
}

// A pi that registers a native provider and nothing else: a string registration
// throws, which is what fails a run that kept the legacy path.
function fakePi() {
	const providers: Provider[] = [];
	const notifies: NotifyCall[] = [];
	const setModels: unknown[] = [];
	const handlers = new Map<string, Handler>();
	const notify = (message: string, type?: string) => {
		notifies.push({ message, type });
	};
	const pi = {
		registerProvider: (provider: Provider) => {
			if (typeof provider === "string") {
				throw new Error("the extension registered a provider by name");
			}
			providers.push(provider);
		},
		on: (event: string, handler: Handler) => {
			handlers.set(event, handler);
		},
		getThinkingLevel: () => "off",
		setModel: (model: unknown) => {
			setModels.push(model);
			return true;
		},
	} as unknown as ExtensionAPI;
	return {
		pi,
		providers,
		notifies,
		setModels,
		startSession: (shape: SessionShape = { hasUI: true, mode: "rpc" }) => {
			handlers.get("session_start")?.({}, { ...shape, ui: { notify } });
		},
	};
}

// The credential pi synthesises for the network phase: `resolve`'s output.
function storedCredential() {
	return {
		type: "api_key" as const,
		key: "stored-key",
		env: { OMLX_BASE_URL: FIXTURE_BASE_URL },
	};
}

// What pi's own refresh does with a provider: publish with the network allowed,
// running the update it returns.
async function publishCatalog(provider: Provider): Promise<void> {
	const refresh = provider.refreshModels;
	assert.ok(refresh, "the registered provider supplies no refreshModels");
	const context: RefreshModelsContext = {
		credential: storedCredential(),
		allowNetwork: true,
		signal: new AbortController().signal,
		publish: async (publication) => {
			publication.update?.();
			return true;
		},
	};
	await refresh(context);
}

interface DriveContext {
	fetches: Fetched[];
	providers: Provider[];
	notifies: NotifyCall[];
	setModels: unknown[];
	load: () => Promise<void>;
	startSession: (shape?: SessionShape) => void;
	stderr: () => string[];
}

async function driveExtension(
	env: TestEnv,
	body: (context: DriveContext) => Promise<void>,
	loadEntry: () => Promise<EntryFunction> = async () => extension,
): Promise<void> {
	const restoreEnv = withEnv({ ...env, PI_CODING_AGENT_DIR: dir });
	const originalFetch = globalThis.fetch;
	const fetches: Fetched[] = [];
	globalThis.fetch = (async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		const headers = init?.headers as Record<string, string> | undefined;
		fetches.push({
			url: String(url),
			authorization: headers?.Authorization,
		});
		return jsonResponse(FIXTURE_MODELS);
	}) as typeof fetch;
	const fake = fakePi();
	const write = vi
		.spyOn(process.stderr, "write")
		.mockImplementation(() => true);
	// vitest intercepts console.* before process.stderr.write, so seeing what
	// the extension puts on stderr takes both observers.
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
	const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.useFakeTimers();
	try {
		// Loaded after withEnv, so an entry module that sets the environment has
		// its writes still visible to the body instead of being cleared first.
		const entry = await loadEntry();
		await entry(fake.pi);
		await body({
			fetches,
			providers: fake.providers,
			notifies: fake.notifies,
			setModels: fake.setModels,
			load: async () => {
				await entry(fake.pi);
			},
			startSession: fake.startSession,
			stderr: () => [
				...write.mock.calls.map(([chunk]) => String(chunk)),
				...consoleError.mock.calls.map((call) => call.map(String).join(" ")),
				...consoleWarn.mock.calls.map((call) => call.map(String).join(" ")),
			],
		});
	} finally {
		vi.useRealTimers();
		write.mockRestore();
		consoleError.mockRestore();
		consoleWarn.mockRestore();
		globalThis.fetch = originalFetch;
		restoreEnv();
	}
}

test("the factory registers a native provider with an API-key login and no OAuth handler", async () => {
	await driveExtension({}, async ({ providers, fetches }) => {
		assert.equal(providers.length, 1, "the factory registered no provider");
		const provider = providers[0];
		assert.equal(provider?.id, "omlx");
		assert.equal(provider?.name, "OMLX");
		assert.ok(provider?.auth.apiKey?.login, "no API-key login");
		assert.ok(provider?.auth.apiKey.check, "no API-key check");
		assert.ok(provider?.auth.apiKey.resolve, "no API-key resolve");
		assert.equal(
			provider?.auth.oauth,
			undefined,
			"an OAuth handler is offered",
		);
		assert.ok(provider?.refreshModels, "no refreshModels");
		// A provider with no catalog yet lists nothing and fetches nothing.
		assert.deepEqual(provider?.getModels(), []);
		assert.deepEqual(fetches, []);
	});
});

// catalog-discovery: pi owns when the catalog is fetched, and never on a timer.
test("advancing the clock performs no catalog fetch and no cache write", async () => {
	await driveExtension(
		{ OMLX_API_KEY: "environment-key", OMLX_BASE_URL: FIXTURE_BASE_URL },
		async ({ fetches, providers }) => {
			await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
			assert.deepEqual(fetches, []);
			const provider = providers[0];
			assert.ok(provider, "the factory registered no provider");
			// A publish writes pi's store and nothing of the extension's.
			await publishCatalog(provider);
			assert.equal(existsSync(join(dir, "cache")), false);
		},
	);
});

// catalog-discovery: a catalog that lands after the session started moves no
// model. The extension calls no setModel, so the choice stays pi's.
test("a late publish leaves the session's model alone", async () => {
	await driveExtension({}, async ({ providers, setModels, startSession }) => {
		startSession();
		const provider = providers[0];
		assert.ok(provider, "the factory registered no provider");
		await publishCatalog(provider);
		assert.deepEqual(
			provider.getModels().map((model) => model.id),
			["real-model"],
		);
		assert.deepEqual(setModels, []);
	});
});

test("a second load in one process registers again with no shutdown first", async () => {
	await driveExtension({}, async ({ providers, load }) => {
		assert.equal(providers.length, 1);
		await load();
		assert.equal(providers.length, 2);
	});
});
