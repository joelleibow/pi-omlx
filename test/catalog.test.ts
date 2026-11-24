import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inject, test } from "vitest";
import type { CatalogDebugEvent, OmlxModel } from "../src/catalog.ts";
import {
	applyLocalModelSettings,
	fetchModels,
	parseModelsResponse,
	parseModelsStatusResponse,
	registrableModels,
	resolveArchContextLimits,
	toProviderModel,
} from "../src/catalog.ts";

// The URL the mapper writes onto every model it produces.
const BASE_URL = "http://127.0.0.1:9400/v1";

// The limits a status entry carries in the fixtures below.
const L = { max_context_window: 1000, max_tokens: 100 };

// The global defaults every fixture that reaches the defaults step stubs.
const GLOBAL_DEFAULTS = { max_context_window: 32768, max_tokens: 4096 };

interface FetchResult {
	models: OmlxModel[];
	events: CatalogDebugEvent[];
	calls: string[];
}

// A path under the isolation root that must not exist: the preamble's explicit
// absent `modelSettingsPath`, so no fixture reads the shared default overlay.
function absentSettingsPath(): string {
	return join(inject("isolationRoot"), "pi-omlx-absent-model-settings.json");
}

// Runs one fetch against a stubbed server answering the three endpoints a fetch
// can reach, and records every URL it asked for. A missing endpoint body is a
// 404, which is how the fixtures reach the `/models` fallback.
async function fetchCatalog(
	server: { status?: unknown; models?: unknown; globalDefaults?: unknown },
	options: { modelSettingsPath?: string } = {},
): Promise<FetchResult> {
	const originalFetch = globalThis.fetch;
	const calls: string[] = [];
	const events: CatalogDebugEvent[] = [];
	const answer = (body: unknown) =>
		body === undefined
			? new Response("not found", { status: 404 })
			: new Response(JSON.stringify(body), { status: 200 });
	globalThis.fetch = (async (url: string | URL | Request) => {
		const target = String(url);
		calls.push(target);
		if (target.endsWith("/models/status")) return answer(server.status);
		if (target.endsWith("/models")) return answer(server.models);
		if (target.endsWith("/admin/api/global-settings"))
			return answer(server.globalDefaults ?? { sampling: GLOBAL_DEFAULTS });
		throw new Error(`unexpected request to ${target}`);
	}) as typeof fetch;
	try {
		const models = await fetchModels(BASE_URL, "k", {
			modelSettingsPath: options.modelSettingsPath ?? absentSettingsPath(),
			onDebug: (event) => events.push(event),
		});
		return { models, events, calls };
	} finally {
		globalThis.fetch = originalFetch;
	}
}

// The details of the one event of a kind, or a failure naming what is missing.
function detailsOf(
	events: CatalogDebugEvent[],
	kind: string,
): Record<string, unknown> {
	const event = events.find((candidate) => candidate.kind === kind);
	assert.ok(
		event,
		`no ${kind} event among ${events.map((one) => one.kind).join(", ")}`,
	);
	return event.details;
}

function identityOf(events: CatalogDebugEvent[]): Record<string, unknown> {
	return detailsOf(events, "catalog_model_identity");
}

function identityEntries(
	events: CatalogDebugEvent[],
): Array<Record<string, unknown>> {
	return identityOf(events).entries as Array<Record<string, unknown>>;
}

test("resolveArchContextLimits uses arch ceiling as prio-3 fallback", () => {
	const [m] = resolveArchContextLimits([{ id: "x", archContextWindow: 72099 }]);
	assert.equal(m.contextWindow, 72099);
});

test("resolveArchContextLimits clamps a user value above the arch ceiling", () => {
	const [m] = resolveArchContextLimits([
		{ id: "x", contextWindow: 200000, archContextWindow: 72099 },
	]);
	assert.equal(m.contextWindow, 72099);
});

test("resolveArchContextLimits keeps a user value within the arch ceiling", () => {
	const [m] = resolveArchContextLimits([
		{ id: "x", contextWindow: 32000, archContextWindow: 72099 },
	]);
	assert.equal(m.contextWindow, 32000);
});

test("resolveArchContextLimits leaves models without an arch ceiling untouched", () => {
	const [m] = resolveArchContextLimits([{ id: "x", contextWindow: 200000 }]);
	assert.equal(m.contextWindow, 200000);
});

test("parseModelsResponse extracts ids from OpenAI shape", () => {
	const json = {
		object: "list",
		data: [
			{ id: "Qwen3.5-9B-MLX-4bit", object: "model", owned_by: "omlx" },
			{ id: "gemma-4-26b-a4b-it-4bit", object: "model", owned_by: "omlx" },
		],
	};
	assert.deepEqual(parseModelsResponse(json), [
		{ id: "Qwen3.5-9B-MLX-4bit" },
		{ id: "gemma-4-26b-a4b-it-4bit" },
	]);
});

test("parseModelsResponse drops entries without id", () => {
	const json = {
		object: "list",
		data: [{ id: "ok" }, {}, { id: "" }, { id: "also-ok" }],
	};
	assert.deepEqual(parseModelsResponse(json), [
		{ id: "ok" },
		{ id: "also-ok" },
	]);
});

test("parseModelsResponse captures max_model_len as archContextWindow", () => {
	const json = {
		object: "list",
		data: [
			{ id: "with-len", max_model_len: 72099 },
			{ id: "no-len" },
			{ id: "zero-len", max_model_len: 0 },
			{ id: "null-len", max_model_len: null },
		],
	};
	assert.deepEqual(parseModelsResponse(json), [
		{ id: "with-len", archContextWindow: 72099 },
		{ id: "no-len" },
		{ id: "zero-len" },
		{ id: "null-len" },
	]);
});

test("parseModelsResponse returns duplicate ids for the identity step to collapse", () => {
	const json = {
		object: "list",
		data: [{ id: "a" }, { id: "a" }, { id: "b" }],
	};
	assert.deepEqual(parseModelsResponse(json), [
		{ id: "a" },
		{ id: "a" },
		{ id: "b" },
	]);
});

test("parseModelsResponse throws on missing data array", () => {
	assert.throws(() => parseModelsResponse({ object: "list" }), /data/);
	assert.throws(() => parseModelsResponse(null), /data/);
});

test("parseModelsStatusResponse extracts Pi-supported fields and OMLX-only metadata", () => {
	const json = {
		models: [
			{
				id: "m1",
				display_name: "Reasoning Model",
				max_context_window: 256000,
				max_tokens: 32768,
				thinking_default: true,
				reasoning_parser: "qwen",
				model_type_override: "vlm",
			},
			{
				id: "m2",
				max_context_window: 128000,
				max_tokens: 8192,
				thinking_default: null,
			},
		],
	};
	assert.deepEqual(parseModelsStatusResponse(json), [
		{
			id: "m1",
			displayName: "Reasoning Model",
			contextWindow: 256000,
			maxTokens: 32768,
			thinkingDefault: true,
			reasoningParser: "qwen",
			modelType: "vlm",
		},
		{ id: "m2", contextWindow: 128000, maxTokens: 8192, thinkingDefault: null },
	]);
});

test("parseModelsStatusResponse omits missing numeric fields", () => {
	const json = {
		models: [{ id: "m1" }, { id: "m2", max_context_window: 64000 }],
	};
	assert.deepEqual(parseModelsStatusResponse(json), [
		{ id: "m1" },
		{ id: "m2", contextWindow: 64000 },
	]);
});

test("parseModelsStatusResponse captures model_alias as modelAlias and omits unset values", () => {
	const json = {
		models: [
			{ id: "qwen", model_alias: "qwen" },
			{ id: "absent" },
			{ id: "null", model_alias: null },
			{ id: "number", model_alias: 5 },
			{ id: "empty", model_alias: "" },
			{ id: "blank", model_alias: "  " },
			{ id: "padded", model_alias: " qwen " },
			{},
			{ id: "" },
			{ id: 5 },
		],
	};
	assert.deepEqual(parseModelsStatusResponse(json), [
		{ id: "qwen", modelAlias: "qwen" },
		{ id: "absent" },
		{ id: "null" },
		{ id: "number" },
		{ id: "empty" },
		{ id: "blank", modelAlias: "  " },
		{ id: "padded", modelAlias: " qwen " },
	]);
});

test("parseModelsStatusResponse throws on missing models array", () => {
	assert.throws(() => parseModelsStatusResponse({}), /models/);
});

test("fetchModels prefers /models/status", async () => {
	const originalFetch = globalThis.fetch;
	const calls: string[] = [];
	globalThis.fetch = (async (url: string) => {
		calls.push(url);
		if (url.endsWith("/models/status")) {
			return new Response(
				JSON.stringify({
					models: [
						{
							id: "x",
							max_context_window: 256000,
							max_tokens: 32768,
							thinking_default: false,
						},
					],
				}),
				{ status: 200 },
			);
		}
		throw new Error(`unexpected url ${url}`);
	}) as typeof fetch;
	try {
		const models = await fetchModels("http://example.test/v1", "k");
		assert.deepEqual(models, [
			{
				id: "x",
				directoryName: "x",
				contextWindow: 256000,
				maxTokens: 32768,
				thinkingDefault: false,
			},
		]);
		assert.deepEqual(calls, ["http://example.test/v1/models/status"]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("fetchModels applies local OMLX model settings for localhost metadata refinement", async () => {
	const dir = mkdtempSync(join(inject("isolationRoot"), "pi-omlx-"));
	const settingsPath = join(dir, "model_settings.json");
	writeFileSync(
		settingsPath,
		JSON.stringify({
			version: 1,
			models: {
				documenter: {
					chat_template_kwargs: {
						enable_thinking: false,
						preserve_thinking: true,
					},
					forced_ct_kwargs: ["enable_thinking"],
					thinking_budget_enabled: false,
					thinking_budget_tokens: 0,
					max_context_window: 262144,
					max_tokens: 81920,
				},
			},
		}),
	);

	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (url: string) => {
		if (url.endsWith("/models/status")) {
			return new Response(
				JSON.stringify({
					models: [
						{
							id: "documenter",
							max_context_window: 128000,
							max_tokens: 32768,
							thinking_default: true,
						},
					],
				}),
				{ status: 200 },
			);
		}
		throw new Error(`unexpected url ${url}`);
	}) as typeof fetch;
	try {
		const models = await fetchModels("http://127.0.0.1:8000/v1", "k", {
			modelSettingsPath: settingsPath,
		});
		assert.equal(models.length, 1);
		const [model] = models;
		assert.equal(model.id, "documenter");
		assert.equal(model.contextWindow, 262144);
		assert.equal(model.maxTokens, 81920);
		assert.equal(model.thinkingDefault, false);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("applyLocalModelSettings projects a full model_settings entry onto the fields the extension reads", () => {
	const dir = mkdtempSync(join(inject("isolationRoot"), "pi-omlx-"));
	const settingsPath = join(dir, "model_settings.json");
	writeFileSync(
		settingsPath,
		JSON.stringify({
			version: 1,
			models: {
				"vision-lane": {
					display_name: "Vision Lane",
					description: "Useful for screenshots",
					model_alias: "vision",
					enable_thinking: true,
					chat_template_kwargs: {
						enable_thinking: false,
						preserve_thinking: true,
						reasoning_effort: "high",
					},
					forced_ct_kwargs: ["enable_thinking", "preserve_thinking"],
					thinking_budget_enabled: true,
					thinking_budget_tokens: 12000,
					task_budget_tokens: 64000,
					max_tool_result_tokens: 4096,
					max_context_window: 512000,
					max_tokens: 131072,
					model_type_override: "VLM",
					reasoning_parser: "qwen",
					ttl_seconds: 300,
					index_cache_freq: 4,
					temperature: 0.2,
					top_p: 0.95,
					top_k: 40,
					min_p: 0.05,
					repetition_penalty: 1.05,
					presence_penalty: 0.1,
					force_sampling: true,
					dflash_enabled: true,
					dflash_draft_model: "draft-qwen",
					dflash_draft_quant_bits: 4,
					specprefill_enabled: true,
					specprefill_draft_model: "prefill-qwen",
					specprefill_keep_pct: 0.5,
					specprefill_threshold: 256,
					turboquant_kv_enabled: true,
					turboquant_kv_bits: 4,
					turboquant_skip_last: false,
					is_default: true,
					is_pinned: true,
					trust_remote_code: false,
					active_profile_name: "agentic",
				},
			},
		}),
	);

	const [model] = applyLocalModelSettings(
		[{ id: "vision-lane" }],
		"http://127.0.0.1:8000/v1",
		settingsPath,
	);

	assert.equal(model.displayName, "Vision Lane");
	assert.equal(model.thinkingDefault, true);
	assert.equal(model.contextWindow, 512000);
	assert.equal(model.maxTokens, 131072);
	assert.equal(model.reasoningParser, "qwen");
	assert.equal(model.modelType, "vlm");
});

test("fetchModels emits catalog debug events for local settings refinement", async () => {
	const dir = mkdtempSync(join(inject("isolationRoot"), "pi-omlx-"));
	const settingsPath = join(dir, "model_settings.json");
	writeFileSync(
		settingsPath,
		JSON.stringify({
			version: 1,
			models: {
				documenter: {
					chat_template_kwargs: { enable_thinking: false },
					max_context_window: 120000,
					max_tokens: 84000,
				},
			},
		}),
	);
	const events: string[] = [];

	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (url: string) => {
		if (url.endsWith("/models/status")) {
			return new Response(
				JSON.stringify({
					models: [{ id: "documenter", thinking_default: true }],
				}),
				{ status: 200 },
			);
		}
		throw new Error(`unexpected url ${url}`);
	}) as typeof fetch;
	try {
		await fetchModels("http://127.0.0.1:8000/v1", "k", {
			modelSettingsPath: settingsPath,
			onDebug: (event) => events.push(event.kind),
		});
		assert.deepEqual(events, [
			"catalog_status_loaded",
			"catalog_model_identity",
			"catalog_local_settings_considered",
			"catalog_local_model_settings_applied",
		]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

// The applied event fires on a change the extension reads, never on an entry
// that carries only keys the overlay has dropped.
test("an overlay entry carrying only unread keys emits no applied event", () => {
	const dir = mkdtempSync(join(inject("isolationRoot"), "pi-omlx-"));
	const settingsPath = join(dir, "model_settings.json");
	writeFileSync(
		settingsPath,
		JSON.stringify({
			version: 1,
			models: {
				"quiet-lane": { is_pinned: true, ttl_seconds: 300 },
			},
		}),
	);
	const kinds: string[] = [];

	applyLocalModelSettings(
		[{ id: "quiet-lane" }],
		"http://127.0.0.1:8000/v1",
		settingsPath,
		(event) => kinds.push(event.kind),
	);

	assert.deepEqual(
		kinds.filter((kind) => kind === "catalog_local_model_settings_applied"),
		[],
	);
});

test("applyLocalModelSettings honors explicit missing path without changing metadata", () => {
	const models = applyLocalModelSettings(
		[{ id: "documenter", thinkingDefault: true }],
		"https://example.test/v1",
		join(inject("isolationRoot"), "pi-omlx-missing-model-settings.json"),
	);
	assert.deepEqual(models, [{ id: "documenter", thinkingDefault: true }]);
});

test("fetchModels falls back to /models when /models/status fails", async () => {
	const originalFetch = globalThis.fetch;
	const calls: string[] = [];
	globalThis.fetch = (async (url: string) => {
		calls.push(url);
		if (url.endsWith("/models/status")) {
			return new Response("not found", { status: 404 });
		}
		if (url.endsWith("/models")) {
			return new Response(
				JSON.stringify({ object: "list", data: [{ id: "y" }] }),
				{ status: 200 },
			);
		}
		if (url.endsWith("/admin/api/global-settings")) {
			return new Response(
				JSON.stringify({
					sampling: { max_context_window: 120000, max_tokens: 84000 },
				}),
				{ status: 200 },
			);
		}
		throw new Error(`unexpected url ${url}`);
	}) as typeof fetch;
	try {
		const models = await fetchModels("http://example.test/v1", "k");
		assert.deepEqual(models, [
			{ id: "y", contextWindow: 120000, maxTokens: 84000 },
		]);
		assert.deepEqual(calls, [
			"http://example.test/v1/models/status",
			"http://example.test/v1/models",
			"http://example.test/admin/api/global-settings",
		]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("fetchModels times out", async () => {
	const originalFetch = globalThis.fetch;
	// Simulate a server that never responds.
	globalThis.fetch = ((_url: string, init?: { signal?: AbortSignal }) => {
		return new Promise((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => {
				const err = new Error("aborted");
				err.name = "AbortError";
				reject(err);
			});
		});
	}) as typeof fetch;
	try {
		await assert.rejects(
			fetchModels("http://example.test/v1", "k", { timeoutMs: 25 }),
			/timed out after 25ms/,
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("toProviderModel marks only explicit thinking_default true as reasoning capable", () => {
	const models = [
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
	].map((model) => toProviderModel(model, BASE_URL));

	assert.equal(models[0]?.reasoning, true);
	assert.equal(models[1]?.reasoning, false);
	assert.equal(models[2]?.reasoning, false);
	assert.equal(models[3]?.reasoning, false);
	assert.deepEqual(models[0]?.compat, {
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsLongCacheRetention: true,
		maxTokensField: "max_tokens",
		thinkingFormat: "qwen-chat-template",
	});
	assert.deepEqual(models[1]?.compat, {
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsLongCacheRetention: true,
		maxTokensField: "max_tokens",
	});
	assert.deepEqual(models[2]?.compat, {
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsLongCacheRetention: true,
		maxTokensField: "max_tokens",
	});
	assert.deepEqual(models[3]?.compat, {
		supportsDeveloperRole: false,
		supportsReasoningEffort: false,
		supportsLongCacheRetention: true,
		maxTokensField: "max_tokens",
	});
});

test("toProviderModel maps displayName to Pi name and keeps OMLX-only settings out of provider model", () => {
	const models = [
		{
			id: "raw-model-id",
			displayName: "Human Model Name",
			contextWindow: 32768,
			maxTokens: 8192,
			archContextWindow: 65536,
			reasoningParser: "qwen",
			thinkingDefault: true,
		},
	].map((entry) => toProviderModel(entry, BASE_URL));

	const model = models[0] as unknown as Record<string, unknown>;
	assert.equal(model.name, "Human Model Name");
	assert.equal(model.id, "raw-model-id");
	assert.equal("archContextWindow" in model, false);
	assert.equal("reasoningParser" in model, false);
	assert.equal("thinkingDefault" in model, false);
});

// The published id on /models/status: the server's alias when it is unique, and
// the endpoint id otherwise. Every case here reads the identity event, because
// that is where the decision is auditable.

test("fetchModels collapses exact duplicate /models ids and names the discarded id", async () => {
	const { models, events } = await fetchCatalog({
		models: { object: "list", data: [{ id: "a" }, { id: "a" }, { id: "b" }] },
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["a", "b"],
	);
	assert.deepEqual(identityOf(events).discardedDuplicates, ["a"]);
	assert.equal(detailsOf(events, "catalog_models_loaded").count, 3);
});

test("fetchModels collapses exact duplicate /models/status ids and names the discarded id", async () => {
	const { models, events } = await fetchCatalog({
		status: {
			models: [
				{ id: "a", ...L },
				{ id: "a", ...L },
				{ id: "b", ...L },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["a", "b"],
	);
	const identity = identityOf(events);
	assert.equal(identity.endpoint, "status");
	assert.deepEqual(
		identityEntries(events).map((entry) => entry.endpointId),
		["a", "b"],
	);
	assert.deepEqual(identity.discardedDuplicates, ["a"]);
	assert.equal(detailsOf(events, "catalog_status_loaded").count, 3);
});

test("fetchModels emits an empty identity event for an empty /models/status list", async () => {
	const { models, events } = await fetchCatalog({ status: { models: [] } });

	assert.deepEqual(models, []);
	assert.deepEqual(identityOf(events), {
		endpoint: "status",
		entries: [],
		discardedDuplicates: [],
		caseOnlyPairs: [],
	});
});

test("fetchModels publishes a unique status alias as the model id", async () => {
	const { models } = await fetchCatalog({
		status: {
			models: [
				{ id: "Qwen3-dir", model_alias: "qwen", ...L },
				{ id: "plain", ...L },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["qwen", "plain"],
	);
});

test("fetchModels publishes the endpoint id when model_alias is absent, null, non-string or empty", async () => {
	const { models, events } = await fetchCatalog({
		status: {
			models: [
				{ id: "a", ...L },
				{ id: "b", model_alias: null, ...L },
				{ id: "c", model_alias: 5, ...L },
				{ id: "d", model_alias: "", ...L },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["a", "b", "c", "d"],
	);
	const entries = identityEntries(events);
	assert.deepEqual(
		entries.map((entry) => entry.alias),
		[null, null, null, null],
	);
	assert.deepEqual(
		entries.map((entry) => entry.publishedId),
		["a", "b", "c", "d"],
	);
});

test("fetchModels publishes a whitespace-only alias verbatim", async () => {
	const { models } = await fetchCatalog({
		status: { models: [{ id: "w-dir", model_alias: "  ", ...L }] },
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["  "],
	);
});

test("fetchModels publishes a padded alias verbatim", async () => {
	const { models, events } = await fetchCatalog({
		status: { models: [{ id: "p-dir", model_alias: " qwen ", ...L }] },
	});

	assert.deepEqual(
		models.map((model) => model.id),
		[" qwen "],
	);
	const [entry] = identityEntries(events);
	assert.equal(entry?.alias, " qwen ");
	assert.equal(entry?.publishedId, " qwen ");
});

test("fetchModels computes caseOnlyPairs with toLowerCase for ids that differ only by case", async () => {
	const { models, events } = await fetchCatalog({
		status: {
			models: [
				{ id: "Foo", ...L },
				{ id: "foo", ...L },
				{ id: "FOO", ...L },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["Foo", "foo", "FOO"],
	);
	const identity = identityOf(events);
	assert.deepEqual(identity.caseOnlyPairs, [
		{ a: "Foo", b: "foo" },
		{ a: "Foo", b: "FOO" },
		{ a: "foo", b: "FOO" },
	]);
	assert.deepEqual(identity.discardedDuplicates, []);
});

test("fetchModels declines an alias two entries share, and publishes both endpoint ids", async () => {
	const { models, events } = await fetchCatalog({
		status: {
			models: [
				{ id: "A", model_alias: "foo" },
				{ id: "B", model_alias: "FOO" },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["A", "B"],
	);
	assert.deepEqual(
		identityEntries(events).map((entry) => entry.declined),
		["duplicate_alias", "duplicate_alias"],
	);
});

test("fetchModels declines an alias equal to another entry's endpoint id", async () => {
	const { models, events } = await fetchCatalog({
		status: {
			models: [
				{ id: "foo", ...L },
				{ id: "A", model_alias: "foo", ...L },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["foo", "A"],
	);
	assert.deepEqual(
		identityEntries(events).map((entry) => entry.declined),
		[null, "alias_matches_model_id"],
	);
});

test("fetchModels declines an alias that differs only by case from another entry's endpoint id", async () => {
	const { models, events } = await fetchCatalog({
		status: {
			models: [
				{ id: "foo", ...L },
				{ id: "A", model_alias: "FOO", ...L },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["foo", "A"],
	);
	assert.deepEqual(
		identityEntries(events).map((entry) => entry.declined),
		[null, "alias_matches_model_id"],
	);
});

test("fetchModels declines an alias equal to an exposed-profile id", async () => {
	const { models, events } = await fetchCatalog({
		status: {
			models: [
				{ id: "qwen:fast", source_model_id: "Qwen3-dir", ...L },
				{ id: "A", model_alias: "qwen:fast", ...L },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["qwen:fast", "A"],
	);
	assert.deepEqual(
		identityEntries(events).map((entry) => entry.declined),
		[null, "alias_matches_model_id"],
	);
});

test("fetchModels reports alias_matches_model_id when an alias equals another entry's id and another entry's alias", async () => {
	const { models, events } = await fetchCatalog({
		status: {
			models: [
				{ id: "A", model_alias: "foo" },
				{ id: "B", model_alias: "foo" },
				{ id: "foo" },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["A", "B", "foo"],
	);
	assert.deepEqual(
		identityEntries(events).map((entry) => entry.declined),
		["alias_matches_model_id", "alias_matches_model_id", null],
	);
});

test("fetchModels accepts an alias that differs only by case from its own endpoint id", async () => {
	const { models, events } = await fetchCatalog({
		status: { models: [{ id: "qwen", model_alias: "QWEN" }] },
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["QWEN"],
	);
	assert.deepEqual(identityEntries(events), [
		{
			endpointId: "qwen",
			directoryName: "qwen",
			alias: "QWEN",
			publishedId: "QWEN",
			declined: null,
		},
	]);
});

test("fetchModels runs the collision check over hidden, profile and limit-less entries", async () => {
	const { models, events } = await fetchCatalog({
		status: {
			models: [
				{ id: "A-dir", model_alias: "lane", ...L },
				{ id: "lane" },
				{ id: "C-dir", model_alias: "qwen:fast", ...L },
				{ id: "qwen:fast", source_model_id: "Qwen3-dir", ...L },
				{ id: "H-dir", model_alias: "h", is_hidden: true, ...L },
				{ id: "D-dir", model_alias: "h", ...L },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["A-dir", "lane", "C-dir", "qwen:fast", "H-dir", "D-dir"],
	);
	assert.deepEqual(
		identityEntries(events).map((entry) => entry.declined),
		[
			"alias_matches_model_id",
			null,
			"alias_matches_model_id",
			null,
			"duplicate_alias",
			"duplicate_alias",
		],
	);
});

test("fetchModels publishes a declined model under its endpoint id and succeeds", async () => {
	const { models } = await fetchCatalog({
		status: {
			models: [
				{ id: "A", model_alias: "foo", ...L },
				{ id: "foo", ...L },
			],
		},
	});

	assert.deepEqual(
		registrableModels(models).map((model) => model.id),
		["A", "foo"],
	);
});

test("fetchModels runs the collision check over the collapsed list", async () => {
	// An exact duplicate of an entry's own endpoint id is not another entry.
	const own = await fetchCatalog({
		status: {
			models: [
				{ id: "A", model_alias: "x", ...L },
				{ id: "A", model_alias: "x", ...L },
			],
		},
	});
	assert.deepEqual(
		own.models.map((model) => model.id),
		["x"],
	);
	const ownIdentity = identityOf(own.events);
	assert.deepEqual(ownIdentity.entries, [
		{
			endpointId: "A",
			directoryName: "A",
			alias: "x",
			publishedId: "x",
			declined: null,
		},
	]);
	assert.deepEqual(ownIdentity.discardedDuplicates, ["A"]);

	// The discarded copy's alias collides with nothing, because the check runs
	// after the collapse.
	const other = await fetchCatalog({
		status: {
			models: [
				{ id: "A", model_alias: "y", ...L },
				{ id: "B", model_alias: "x", ...L },
				{ id: "B", model_alias: "y", ...L },
			],
		},
	});
	assert.deepEqual(
		other.models.map((model) => model.id),
		["y", "x"],
	);
	const otherIdentity = identityOf(other.events);
	assert.deepEqual(otherIdentity.entries, [
		{
			endpointId: "A",
			directoryName: "A",
			alias: "y",
			publishedId: "y",
			declined: null,
		},
		{
			endpointId: "B",
			directoryName: "B",
			alias: "x",
			publishedId: "x",
			declined: null,
		},
	]);
	assert.deepEqual(otherIdentity.discardedDuplicates, ["B"]);
});

test("fetchModels records the directory name on the status path", async () => {
	const { models } = await fetchCatalog({
		status: {
			models: [
				{ id: "Qwen3-dir", model_alias: "qwen", ...L },
				{ id: "plain", ...L },
			],
		},
	});

	assert.deepEqual(
		models.map((model) => [model.id, model.directoryName]),
		[
			["qwen", "Qwen3-dir"],
			["plain", "plain"],
		],
	);
});

// The published id on the /models fallback: the endpoint's own id, verbatim,
// with no decline and no new field.

test("fetchModels publishes the /models id verbatim and records null directory name and alias", async () => {
	const { models, events } = await fetchCatalog({
		models: { object: "list", data: [{ id: "qwen" }] },
	});

	assert.deepEqual(models, [
		{ id: "qwen", contextWindow: 32768, maxTokens: 4096 },
	]);
	const identity = identityOf(events);
	assert.equal(identity.endpoint, "models");
	const [entry] = identityEntries(events);
	assert.deepEqual(entry, {
		endpointId: "qwen",
		directoryName: null,
		alias: null,
		publishedId: "qwen",
		declined: null,
	});
});

test("fetchModels publishes /models ids that differ only by case and names the pair", async () => {
	const { models, events } = await fetchCatalog({
		models: {
			object: "list",
			data: [{ id: "qwen" }, { id: "Qwen" }, { id: "qwen" }],
		},
	});

	assert.deepEqual(
		models.map((model) => model.id),
		["qwen", "Qwen"],
	);
	const identity = identityOf(events);
	assert.deepEqual(identity.discardedDuplicates, ["qwen"]);
	assert.deepEqual(identity.caseOnlyPairs, [{ a: "qwen", b: "Qwen" }]);
});

test("fetchModels publishes one id for a model both endpoints list", async () => {
	const status = await fetchCatalog({
		status: { models: [{ id: "Qwen3-dir", model_alias: "qwen", ...L }] },
	});
	const fallback = await fetchCatalog({
		models: { object: "list", data: [{ id: "qwen" }] },
	});

	assert.deepEqual(
		status.models.map((model) => model.id),
		["qwen"],
	);
	assert.deepEqual(
		fallback.models.map((model) => model.id),
		["qwen"],
	);
});
