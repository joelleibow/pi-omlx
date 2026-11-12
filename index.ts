import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PROVIDER_KEY, readOmlxCredential } from "./src/auth-storage.ts";
import { loadDotenvFromExtensionDir } from "./src/dotenv.ts";
import {
	createLoginOmlx,
	getOmlxApiKey,
	refreshOmlxToken,
} from "./src/oauth-login.ts";

loadDotenvFromExtensionDir(import.meta.url);

import {
	fetchModels,
	type OmlxModel,
	readCatalogCache,
	resolveLocalModelSettingsPath,
	writeCatalogCache,
} from "./src/catalog.ts";
import {
	type ConfiguredOmlxCredential,
	CREDENTIAL_SOURCE_STORED,
	OMLX_API_KEY_ENV_VAR,
	resolveOmlxCredential,
} from "./src/config.ts";
import { omlxDebug } from "./src/debug.ts";
import { toProviderConfig } from "./src/provider.ts";
import { applyOmlxThinkingControls } from "./src/thinking.ts";

const PROVIDER = PROVIDER_KEY;
export const EXTENSION_SINGLETON_KEY = Symbol.for("pi-omlx/loaded");

const STARTUP_TIMEOUT_MS = 2_000;
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;

interface State {
	catalog: OmlxModel[];
	registered: boolean;
	stopped: boolean;
	lastError: string | undefined;
	lastRefreshAt: string | undefined;
	modelSettingsPath: string | undefined;
}

export default async function (pi: ExtensionAPI): Promise<void> {
	const globalState = globalThis as Record<PropertyKey, unknown>;
	if (globalState[EXTENSION_SINGLETON_KEY]) return;
	globalState[EXTENSION_SINGLETON_KEY] = true;

	const state: State = {
		catalog: [],
		registered: false,
		stopped: false,
		lastError: undefined,
		lastRefreshAt: undefined,
		modelSettingsPath: undefined,
	};

	registerCachedOrSetupModels(pi, state);
	const initialResult = await refreshProvider(pi, state, {
		timeoutMs: STARTUP_TIMEOUT_MS,
	});
	if (initialResult !== "registered") registerCachedOrSetupModels(pi, state);

	void startPolling(pi, state).catch((err) => {
		state.lastError = err instanceof Error ? err.message : String(err);
	});

	pi.on("model_select", (event) => {
		omlxDebug("model_select", {
			provider: event.model.provider,
			model: event.model.id,
			source: event.source,
		});
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (ctx.model?.provider !== PROVIDER) return;
		omlxDebug("before_provider_request", {
			provider: ctx.model.provider,
			model: ctx.model.id,
			payloadKeys:
				event.payload && typeof event.payload === "object"
					? Object.keys(event.payload as object)
					: [],
		});
		const activeModel = findCatalogModel(state, ctx.model.id);
		return applyOmlxThinkingControls(
			event.payload,
			pi.getThinkingLevel(),
			activeModel?.thinkingDefault,
		);
	});

	pi.on("session_shutdown", () => {
		state.stopped = true;
		delete globalState[EXTENSION_SINGLETON_KEY];
	});
}

async function startPolling(pi: ExtensionAPI, state: State): Promise<void> {
	let backoffMs = BACKOFF_BASE_MS;

	while (!state.stopped) {
		const result = await refreshProvider(pi, state, {
			timeoutMs: STARTUP_TIMEOUT_MS,
		});

		if (result === "registered") {
			backoffMs = BACKOFF_BASE_MS;
			await sleep(POLL_INTERVAL_MS);
		} else {
			registerCachedOrSetupModels(pi, state);
			await sleep(backoffMs);
			backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
		}
	}
}

// Attached to every registerProvider call so "Use a subscription" in pi's
// native /login always offers OMLX with a base-URL prompt (e.g. a Tailscale
// host) followed by an API key prompt. "Use an API key" only asks for a key.
// The oauth login itself fetches and registers the real catalog before
// returning, so pi's post-login modelRegistry.refresh() sees real models
// immediately.
function buildOmlxOauth(pi: ExtensionAPI, state: State) {
	return {
		name: "OMLX",
		login: createLoginOmlx(async (baseUrl, apiKey) => {
			const result = await fetchAndRegister(pi, state, {
				configured: true,
				apiRoot: baseUrl,
				apiKey,
				source: CREDENTIAL_SOURCE_STORED,
			});
			return result === "registered"
				? { ok: true as const }
				: { ok: false as const, error: state.lastError ?? "unknown error" };
		}),
		refreshToken: refreshOmlxToken,
		getApiKey: getOmlxApiKey,
	};
}

function registerModels(
	pi: ExtensionAPI,
	state: State,
	credential: ConfiguredOmlxCredential,
	models: OmlxModel[],
	modelSettingsPath?: string,
): void {
	const keyless = credential.apiKey === "";
	// registerProvider merges defined values, so a keyless registration would
	// inherit the previous apiKey. The trigger is the shape, not remembered
	// keyed-ness: pi stays keyless until it is told otherwise.
	if (keyless) pi.unregisterProvider(PROVIDER);
	pi.registerProvider(PROVIDER, {
		name: "OMLX",
		oauth: buildOmlxOauth(pi, state),
		...toProviderConfig(
			credential.apiRoot,
			OMLX_API_KEY_ENV_VAR,
			models,
			undefined,
			{
				keyless,
			},
		),
	});
	state.catalog = models;
	state.registered = true;
	state.lastError = undefined;
	state.lastRefreshAt = new Date().toISOString();
	state.modelSettingsPath = modelSettingsPath;
	omlxDebug("provider_registered", {
		provider: PROVIDER,
		models: models.length,
		streamSimple: true,
		source: credential.source,
	});
}

function isRegistrableModel(model: OmlxModel): boolean {
	return (
		typeof model.contextWindow === "number" &&
		model.contextWindow > 0 &&
		typeof model.maxTokens === "number" &&
		model.maxTokens > 0
	);
}

function registrableCachedModels(
	models: OmlxModel[] | undefined,
): OmlxModel[] | undefined {
	const registrable = models?.filter(isRegistrableModel) ?? [];
	return registrable.length > 0 ? registrable : undefined;
}

function missingLimitModelIds(models: OmlxModel[]): string[] {
	return models.filter((model) => !isRegistrableModel(model)).map((m) => m.id);
}

function registerLoginOnlyProvider(pi: ExtensionAPI, state: State): void {
	pi.unregisterProvider(PROVIDER);
	pi.registerProvider(PROVIDER, {
		name: "OMLX",
		oauth: buildOmlxOauth(pi, state),
	});
}

function registerCachedOrSetupModels(pi: ExtensionAPI, state: State): void {
	const credential = resolveOmlxCredential(readOmlxCredential(), process.env);
	const models = credential.configured
		? registrableCachedModels(readCatalogCache(credential.apiRoot))
		: undefined;
	if (!credential.configured || !models) {
		state.catalog = [];
		state.registered = false;
		state.lastError = credential.configured
			? "No cached OMLX models with real max_context_window/max_tokens; waiting for live catalog refresh."
			: "OMLX credentials are not set. Run /login and choose OMLX.";
		state.lastRefreshAt = new Date().toISOString();
		state.modelSettingsPath = undefined;
		registerLoginOnlyProvider(pi, state);
		return;
	}

	registerModels(pi, state, credential, models);
}

type RefreshResult = "registered" | "not_configured" | "failed";

async function refreshProvider(
	pi: ExtensionAPI,
	state: State,
	opts: { timeoutMs?: number } = {},
): Promise<RefreshResult> {
	const credential = resolveOmlxCredential(readOmlxCredential(), process.env);
	if (!credential.configured) {
		state.lastError = "OMLX credentials are not set";
		return "not_configured";
	}
	return fetchAndRegister(pi, state, credential, opts);
}

/**
 * Fetches the live catalog for one resolved credential and registers it.
 * Used by the poll loop (one resolution per cycle) and by the oauth login flow
 * (the URL and key just entered in the dialog, before pi persists them) — the
 * login flow can't wait for the poll's next tick, since pi calls
 * modelRegistry.refresh() synchronously right after login() resolves.
 */
async function fetchAndRegister(
	pi: ExtensionAPI,
	state: State,
	credential: ConfiguredOmlxCredential,
	opts: { timeoutMs?: number } = {},
): Promise<RefreshResult> {
	const modelSettingsPath = resolveLocalModelSettingsPath(
		process.env.OMLX_MODEL_SETTINGS_PATH,
	);

	let models: OmlxModel[];
	try {
		models = await fetchModels(credential.apiRoot, credential.apiKey, {
			modelSettingsPath,
			timeoutMs: opts.timeoutMs,
		});
	} catch (err) {
		state.lastError = err instanceof Error ? err.message : String(err);
		return "failed";
	}

	const missingLimitIds = missingLimitModelIds(models);
	const registrable = models.filter(isRegistrableModel);

	if (registrable.length === 0) {
		state.lastError =
			missingLimitIds.length > 0
				? `No OMLX models have max_context_window and max_tokens (${missingLimitIds.length} models missing limits)`
				: "OMLX returned 0 models";
		return "failed";
	}

	writeCatalogCache(credential.apiRoot, registrable);
	registerModels(pi, state, credential, registrable, modelSettingsPath);
	return "registered";
}

function findCatalogModel(
	state: State,
	id: string | undefined,
): OmlxModel | undefined {
	return id ? state.catalog.find((model) => model.id === id) : undefined;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref?.();
	});
}
