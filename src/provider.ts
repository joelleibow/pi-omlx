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
import { refreshOmlxCatalog } from "./catalog.ts";
import {
	OMLX_BASE_URL_ENV_VAR,
	type OmlxCredentialSource,
	resolveOmlx,
} from "./config.ts";
import { omlxDebug } from "./debug.ts";
import { loginOmlx } from "./login.ts";
import {
	resolveFirstDeltaTimeoutMs,
	streamOmlxOpenAICompletions,
} from "./stream.ts";

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
	// The last source the trace reported. Per instance, so a fresh load reports
	// again and no reset seam exists for a test to reach for.
	let tracedSource: OmlxCredentialSource | undefined;

	const resolve = async (input: {
		ctx: AuthContext;
		credential?: ApiKeyCredential;
	}): Promise<AuthResult | undefined> => {
		const resolution = await resolveOmlx(input.credential, (name) =>
			input.ctx.env(name),
		);
		if (!resolution) return undefined;
		if (resolution.source !== tracedSource) {
			tracedSource = resolution.source;
			omlxDebug("provider_registered", {
				provider: PROVIDER_KEY,
				models: models.length,
				streamSimple: true,
				source: resolution.source,
			});
		}
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
