import { strict as assert } from "node:assert";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import { toProviderConfig } from "../src/provider.ts";

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
		undefined,
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
			description: "Shown in /omlx-status only",
			contextWindow: 32768,
			maxTokens: 8192,
			taskBudgetTokens: 64000,
			maxToolResultTokens: 4096,
			settingsSummary: { sampling: { temperature: 0.2 } },
		},
	]);

	const model = config.models?.[0] as unknown as Record<string, unknown>;
	assert.equal(model.name, "Human Model Name");
	assert.equal(model.id, "raw-model-id");
	assert.equal("description" in model, false);
	assert.equal("taskBudgetTokens" in model, false);
	assert.equal("maxToolResultTokens" in model, false);
	assert.equal("settingsSummary" in model, false);
});
