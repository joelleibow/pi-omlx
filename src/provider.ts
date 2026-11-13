import type {
	ApiKeyCredential,
	AuthCheck,
	AuthContext,
	AuthResult,
	Model,
	Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/compat";
import { PROVIDER_KEY } from "./auth-storage.ts";
import { type OmlxModel, refreshOmlxCatalog } from "./catalog.ts";
import { OMLX_BASE_URL_ENV_VAR, resolveOmlx } from "./config.ts";
import { loginOmlx } from "./login.ts";
import { FREE_COST } from "./pricing.ts";
import {
	resolveFirstDeltaTimeoutMs,
	streamOmlxOpenAICompletions,
} from "./stream.ts";
import { thinkingFormatFor } from "./thinking-format.ts";

const BASE_COMPAT = {
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	supportsLongCacheRetention: true,
	maxTokensField: "max_tokens",
} as const;

/**
 * The one provider pi registers for `omlx`: a native API-key login, the model
 * list its own refresh hook publishes, and both stream entry points. pi uses the
 * object untouched unless `models.json` overlays it.
 */
export function createOmlxProvider(): Provider<"openai-completions"> {
	// The concrete API is captured once: it is what both stream entry points
	// reach, and it can never be this provider's own wrapper.
	const openAICompletions = openAICompletionsApi();
	let models: readonly Model<"openai-completions">[] = [];

	const resolve = async (input: {
		ctx: AuthContext;
		credential?: ApiKeyCredential;
	}): Promise<AuthResult | undefined> => {
		const resolution = await resolveOmlx(input.credential, (name) =>
			input.ctx.env(name),
		);
		if (!resolution) return undefined;
		return {
			auth: { apiKey: resolution.apiKey, baseUrl: resolution.baseUrl },
			env: { [OMLX_BASE_URL_ENV_VAR]: resolution.baseUrl },
			source: resolution.source,
		};
	};

	const check = async (input: {
		ctx: AuthContext;
		credential?: ApiKeyCredential;
	}): Promise<AuthCheck | undefined> => {
		const resolution = await resolveOmlx(input.credential, (name) =>
			input.ctx.env(name),
		);
		return resolution
			? { type: "api_key", source: resolution.source }
			: undefined;
	};

	return {
		id: PROVIDER_KEY,
		name: "OMLX",
		auth: {
			apiKey: {
				name: "OMLX",
				login: loginOmlx,
				check,
				resolve,
			},
		},
		getModels: () => models,
		refreshModels: async (context) =>
			refreshOmlxCatalog(context, (next) => {
				models = next;
			}),
		stream: (model, context, options) =>
			openAICompletions.stream(model, context, options),
		streamSimple: (model, context, options) =>
			streamOmlxOpenAICompletions(
				model,
				context,
				options,
				resolveFirstDeltaTimeoutMs(),
			),
	};
}

function requirePositive(
	value: number | undefined,
	modelId: string,
	field: string,
): number {
	if (typeof value === "number" && value > 0) return value;
	throw new Error(
		`OMLX model "${modelId}" did not report ${field}; cannot register it without a real value.`,
	);
}

/**
 * One catalog entry as a complete pi chat model: pi lists a model and routes a
 * request by `provider`, and reaches it through `baseUrl` and `api`.
 */
export function toProviderModel(
	m: OmlxModel,
	baseUrl: string,
): Model<"openai-completions"> {
	const reasoning = m.thinkingDefault === true;
	return {
		id: m.id,
		name: m.displayName ?? m.id,
		api: "openai-completions",
		provider: PROVIDER_KEY,
		baseUrl,
		reasoning,
		input: m.modelType === "vlm" ? ["text", "image"] : ["text"],
		cost: { ...FREE_COST },
		contextWindow: requirePositive(m.contextWindow, m.id, "max_context_window"),
		maxTokens: requirePositive(m.maxTokens, m.id, "max_tokens"),
		compat: reasoning
			? { ...BASE_COMPAT, thinkingFormat: thinkingFormatFor(m.reasoningParser) }
			: { ...BASE_COMPAT },
	};
}
