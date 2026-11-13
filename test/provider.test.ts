import { strict as assert } from "node:assert";
import {
	type AssistantMessageEventStream,
	type ApiKeyCredential,
	type Model,
	type ModelsPublication,
	type ModelsStoreEntry,
	normalizeContext,
	type RefreshModelsContext,
} from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { afterEach, test, vi } from "vitest";
import { KEYLESS_PLACEHOLDER } from "../src/config.ts";
import { createOmlxProvider, toProviderConfig } from "../src/provider.ts";

// The registered models are a union of chat, image and classifier entries, and
// only the chat member carries `reasoning` and `compat`. Narrow once so a model
// that is not a chat entry fails loudly instead of skipping an assertion.
function chatModel(m: ProviderModelConfig | undefined) {
	if (m === undefined) throw new Error("no model entry");
	if (m.type !== undefined && m.type !== "chat")
		throw new Error(`not a chat model: ${m.type}`);
	return m;
}

test("toProviderConfig marks apiKey env var references explicitly", () => {
	const config = toProviderConfig("http://example.test/v1", "OMLX_API_KEY", []);

	assert.equal(config.apiKey, "$OMLX_API_KEY");
	assert.equal(config.authHeader, true);
});

test("toProviderConfig omits apiKey and auth header for keyless servers", () => {
	const config = toProviderConfig(
		"http://example.test/v1",
		"OMLX_API_KEY",
		[],
		{ keyless: true },
	);

	assert.equal(config.apiKey, undefined);
	assert.equal(config.authHeader, false);
});

test("toProviderConfig marks only explicit thinking_default true as reasoning capable", () => {
	const config = toProviderConfig("http://example.test/v1", "OMLX_API_KEY", [
		{
			id: "qwen",
			thinkingDefault: true,
			reasoningParser: "qwen",
			contextWindow: 32768,
			maxTokens: 8192,
		},
		{
			id: "gemma",
			thinkingDefault: false,
			contextWindow: 32768,
			maxTokens: 8192,
		},
		{ id: "plain", contextWindow: 32768, maxTokens: 8192 },
		{
			id: "no-toggle",
			thinkingDefault: null,
			contextWindow: 32768,
			maxTokens: 8192,
		},
	]);

	assert.equal(chatModel(config.models?.[0]).reasoning, true);
	assert.equal(chatModel(config.models?.[1]).reasoning, false);
	assert.equal(chatModel(config.models?.[2]).reasoning, false);
	assert.equal(chatModel(config.models?.[3]).reasoning, false);
	assert.deepEqual(chatModel(config.models?.[0]).compat, {
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsLongCacheRetention: true,
		maxTokensField: "max_tokens",
		thinkingFormat: "qwen-chat-template",
	});
	assert.deepEqual(chatModel(config.models?.[1]).compat, {
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsLongCacheRetention: true,
		maxTokensField: "max_tokens",
	});
	assert.deepEqual(chatModel(config.models?.[2]).compat, {
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsLongCacheRetention: true,
		maxTokensField: "max_tokens",
	});
	assert.deepEqual(chatModel(config.models?.[3]).compat, {
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsLongCacheRetention: true,
		maxTokensField: "max_tokens",
	});
});

test("toProviderConfig maps displayName to Pi name and keeps OMLX-only settings out of provider model", () => {
	const config = toProviderConfig("http://example.test/v1", "OMLX_API_KEY", [
		{
			id: "raw-model-id",
			displayName: "Human Model Name",
			contextWindow: 32768,
			maxTokens: 8192,
			archContextWindow: 65536,
			reasoningParser: "qwen",
			thinkingDefault: true,
		},
	]);

	const model = config.models?.[0] as unknown as Record<string, unknown>;
	assert.equal(model.name, "Human Model Name");
	assert.equal(model.id, "raw-model-id");
	assert.equal("archContextWindow" in model, false);
	assert.equal("reasoningParser" in model, false);
	assert.equal("thinkingDefault" in model, false);
});

// The provider pi drives: `getModels()` is the list the last publish committed,
// and `refreshModels` is the only writer.
const BASE_URL = "http://127.0.0.1:9400/v1";
const originalFetch = globalThis.fetch;

function catalogResponse(models: unknown[]): Response {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		json: async () => ({ models }),
		text: async () => JSON.stringify({ models }),
	} as Response;
}

function stubFetch(respond: () => Response | Promise<Response>): void {
	globalThis.fetch = (async () => respond()) as typeof fetch;
}

function refreshContext(options: {
	credential?: ApiKeyCredential;
	stored?: ModelsStoreEntry;
	allowNetwork: boolean;
}): RefreshModelsContext & { persisted: ModelsStoreEntry | undefined } {
	const context = {
		credential: options.credential,
		stored: options.stored,
		allowNetwork: options.allowNetwork,
		signal: new AbortController().signal,
		persisted: undefined as ModelsStoreEntry | undefined,
		publish: async (publication: ModelsPublication) => {
			if (publication.persist) context.persisted = publication.persist;
			publication.update?.();
			return true;
		},
	};
	return context;
}

const STORED_CREDENTIAL: ApiKeyCredential = {
	type: "api_key",
	key: "stored-key",
	env: { OMLX_BASE_URL: BASE_URL },
};

test("getModels is empty before the first refresh and serves what publish committed", async () => {
	const provider = createOmlxProvider();
	const refresh = provider.refreshModels;
	assert.ok(refresh, "the provider supplies no refreshModels");
	assert.deepEqual(provider.getModels(), []);

	// The offline phase of a start with nothing stored.
	await refresh(refreshContext({ allowNetwork: false }));
	assert.deepEqual(provider.getModels(), []);

	stubFetch(() =>
		catalogResponse([
			{ id: "fetched-model", max_context_window: 65536, max_tokens: 8192 },
		]),
	);
	const published = refreshContext({
		credential: STORED_CREDENTIAL,
		allowNetwork: true,
	});
	await refresh(published);
	assert.deepEqual(
		provider.getModels().map((model) => model.id),
		["fetched-model"],
	);
	assert.equal(provider.getModels()[0]?.provider, "omlx");

	// A refresh that fails leaves the list pi's store restored it with.
	stubFetch(
		() =>
			({
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
				json: async () => ({}),
				text: async () => "unavailable",
			}) as Response,
	);
	await assert.rejects(() =>
		refresh(
			refreshContext({
				credential: STORED_CREDENTIAL,
				stored: published.persisted,
				allowNetwork: true,
			}),
		),
	);
	assert.deepEqual(
		provider.getModels().map((model) => model.id),
		["fetched-model"],
	);
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function stubEnv(values: Record<string, string> = {}) {
	return {
		env: async (name: string) => values[name],
		fileExists: async () => false,
	};
}

test("resolve returns auth, env.OMLX_BASE_URL and source for a stored credential, and check answers configured without a trace line", async () => {
	const provider = createOmlxProvider();
	const apiKey = provider.auth.apiKey;
	assert.ok(apiKey?.check, "the provider declares no API-key check");
	const ctx = stubEnv({ OMLX_API_KEY: "environment-key" });
	const signal = new AbortController().signal;

	assert.deepEqual(
		await apiKey.resolve({ ctx, credential: STORED_CREDENTIAL, signal }),
		{
			auth: { apiKey: "stored-key", baseUrl: BASE_URL },
			env: { OMLX_BASE_URL: BASE_URL },
			source: "stored",
		},
	);
	assert.deepEqual(
		await apiKey.check({ ctx, credential: STORED_CREDENTIAL, signal }),
		{ type: "api_key", source: "stored" },
	);

	// Nothing stored and no environment key: both answer nothing.
	const emptyEnv = stubEnv();
	assert.equal(
		await apiKey.resolve({ ctx: emptyEnv, credential: undefined, signal }),
		undefined,
	);
	assert.equal(
		await apiKey.check({ ctx: emptyEnv, credential: undefined, signal }),
		undefined,
	);

	// A trace would belong to resolve alone: check is side-effect free.
	const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	process.env.PI_OMLX_DEBUG = "1";
	try {
		await apiKey.check({ ctx, credential: STORED_CREDENTIAL, signal });
		assert.deepEqual(
			write.mock.calls.map(([chunk]) => String(chunk)),
			[],
		);
	} finally {
		delete process.env.PI_OMLX_DEBUG;
		write.mockRestore();
	}
});


const CHAT_MODEL: Model<"openai-completions"> = {
	id: "chat-model",
	name: "Chat Model",
	api: "openai-completions",
	provider: "omlx",
	baseUrl: BASE_URL,
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 32768,
	maxTokens: 4096,
};

const CHAT_CONTEXT = normalizeContext({ messages: [] });

interface StreamRequest {
	url: string;
	authorization: string | undefined;
}

function failingFetch(requests: StreamRequest[]): typeof fetch {
	return (async (url: string | URL | Request, init?: RequestInit) => {
		requests.push({
			url: String(url),
			authorization: new Headers(init?.headers).get("authorization") ?? undefined,
		});
		return new Response(JSON.stringify({ error: { message: "boom" } }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

async function drain(stream: AssistantMessageEventStream): Promise<void> {
	for await (const _event of stream) {
		// The assertions are about the request, not the response.
	}
}

test("stream and streamSimple reach the fake server, call options.onPayload and carry the resolved bearer", async () => {
	const provider = createOmlxProvider();
	const apiKey = provider.auth.apiKey;
	assert.ok(apiKey, "the provider declares no API-key auth");
	const signal = new AbortController().signal;
	const resolved = await apiKey.resolve({
		ctx: stubEnv(),
		credential: STORED_CREDENTIAL,
		signal,
	});
	assert.ok(resolved, "the stored credential resolved to nothing");
	const keyless = await apiKey.resolve({
		ctx: stubEnv(),
		credential: { type: "api_key", env: { OMLX_BASE_URL: BASE_URL } },
		signal,
	});
	assert.ok(keyless, "the keyless credential resolved to nothing");

	const entryPoints = [
		["stream", provider.stream, resolved.auth.apiKey, `Bearer stored-key`],
		[
			"streamSimple",
			provider.streamSimple,
			resolved.auth.apiKey,
			`Bearer stored-key`,
		],
		[
			"streamSimple",
			provider.streamSimple,
			keyless.auth.apiKey,
			`Bearer ${KEYLESS_PLACEHOLDER}`,
		],
	] as const;

	for (const [name, start, apiKeyValue, authorization] of entryPoints) {
		const requests: StreamRequest[] = [];
		const payloads: unknown[] = [];
		await drain(
			start(CHAT_MODEL, CHAT_CONTEXT, {
				apiKey: apiKeyValue,
				fetch: failingFetch(requests),
				onPayload: (payload) => {
					payloads.push(payload);
					return undefined;
				},
			}),
		);
		assert.equal(requests.length, 1, `${name} made no request`);
		assert.ok(
			requests[0]?.url.endsWith("/chat/completions"),
			`${name} reached ${requests[0]?.url}`,
		);
		assert.equal(requests[0]?.authorization, authorization, name);
		assert.equal(payloads.length, 1, `${name} dropped options.onPayload`);
	}
});
