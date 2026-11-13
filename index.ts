import type {
	OAuthCredentials,
	OAuthLoginCallbacks,
} from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { PROVIDER_KEY, readOmlxCredential } from "./src/auth-storage.ts";
import {
	fetchModels,
	type OmlxModel,
	readCatalogCache,
	registrableModels,
	resolveLocalModelSettingsPath,
	writeCatalogCache,
} from "./src/catalog.ts";
import {
	KEYLESS_PLACEHOLDER,
	OMLX_API_KEY_ENV_VAR,
	type OmlxResolution,
	resolveOmlx,
} from "./src/config.ts";
import { omlxDebug } from "./src/debug.ts";
import {
	getOmlxApiKey,
	loginOmlx,
	OMLX_CREDENTIAL_EXPIRES,
	refreshOmlxToken,
} from "./src/login.ts";
import { catalogNotice, type RefreshResult } from "./src/notice.ts";
import { toProviderConfig } from "./src/provider.ts";
import { applyOmlxThinkingControls } from "./src/thinking.ts";

const PROVIDER = PROVIDER_KEY;

const CATALOG_TIMEOUT_MS = 2_000;
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;

interface State {
	catalog: OmlxModel[];
	registered: boolean;
	stopped: boolean;
	lastError: string | undefined;
	startedLoginOnly: boolean;
	pendingNotice: string | undefined;
	warned: boolean;
	ui: ExtensionUIContext | undefined;
}

export default async function (pi: ExtensionAPI): Promise<void> {
	const state: State = {
		catalog: [],
		registered: false,
		stopped: false,
		lastError: undefined,
		startedLoginOnly: false,
		pendingNotice: undefined,
		warned: false,
		ui: undefined,
	};

	// One warning per session: the first notice that has somewhere to go wins,
	// and one that arrives before `session_start` waits there, so a session that
	// started is told even when its first request failed in milliseconds.
	const showOnce: ShowNotice = (notice, details) => {
		let decision = "suppressed";
		if (notice && !state.warned) {
			if (state.ui) {
				decision = "shown";
				state.warned = true;
				state.pendingNotice = undefined;
				state.ui.notify(notice, "warning");
			} else {
				decision = "held";
				state.pendingNotice ??= notice;
			}
		}
		omlxDebug("catalog_notice", { ...details, decision });
	};

	const credential = await registerCachedOrSetupModels(pi, state);
	// shortcut: a catalog that lands while a later extension's factory is still
	// loading is still read as "late" here; reading ctx.model.provider in
	// session_start would close that window, unverified.
	state.startedLoginOnly = credential !== undefined && !state.registered;

	void startPolling(pi, state, showOnce).catch((err) => {
		state.lastError = err instanceof Error ? err.message : String(err);
	});

	pi.on("session_start", (_event, ctx) => {
		state.ui = ctx.ui;
		showOnce(state.pendingNotice, { notice: state.pendingNotice });
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
	});
}

type ShowNotice = (
	notice: string | undefined,
	details: Record<string, unknown>,
) => void;

async function startPolling(
	pi: ExtensionAPI,
	state: State,
	showOnce: ShowNotice,
): Promise<void> {
	let backoffMs = BACKOFF_BASE_MS;

	while (!state.stopped) {
		const { result, apiRoot } = await refreshProvider(pi, state, {
			timeoutMs: CATALOG_TIMEOUT_MS,
		});
		// The session ended while this refresh was in flight; its fallback would
		// register and warn on a dead instance.
		if (state.stopped) break;

		const registered = result === "registered";
		if (registered) backoffMs = BACKOFF_BASE_MS;
		else await registerCachedOrSetupModels(pi, state);
		// After the fallback, so the count is the models the session holds now.
		showOnce(
			catalogNotice(
				result,
				state.startedLoginOnly,
				apiRoot,
				state.catalog.length,
			),
			{ result, url: apiRoot },
		);

		if (registered) {
			await sleep(POLL_INTERVAL_MS);
		} else {
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
		login: async (
			callbacks: OAuthLoginCallbacks,
		): Promise<OAuthCredentials> => {
			const credential = await loginOmlx({
				signal: callbacks.signal ?? new AbortController().signal,
				prompt: (prompt) =>
					callbacks.onPrompt({
						message: prompt.message,
						placeholder:
							prompt.type === "select" ? undefined : prompt.placeholder,
						allowEmpty: prompt.type === "secret",
					}),
				notify: () => {},
			});
			const resolved = await resolveOmlx(credential, noEnvironment);
			if (!resolved) throw new Error("the login produced no credential");
			const result = await fetchAndRegister(pi, state, resolved);
			if (result !== "registered") {
				throw new Error(state.lastError ?? "unknown error");
			}
			return {
				access: credential.key ?? "",
				refresh: "",
				expires: OMLX_CREDENTIAL_EXPIRES,
				baseUrl: resolved.baseUrl,
			};
		},
		refreshToken: refreshOmlxToken,
		getApiKey: getOmlxApiKey,
	};
}

function registerModels(
	pi: ExtensionAPI,
	state: State,
	credential: OmlxResolution,
	models: OmlxModel[],
): void {
	const keyless = credential.apiKey === KEYLESS_PLACEHOLDER;
	// registerProvider merges the previous registration's defined values and
	// skips undefined ones (research-chidi Addendum 1: model-runtime.js:674-686),
	// so a keyless registration that omits apiKey would inherit it. The trigger
	// is the registration shape, never remembered keyed-ness.
	if (keyless) pi.unregisterProvider(PROVIDER);
	pi.registerProvider(PROVIDER, {
		name: "OMLX",
		oauth: buildOmlxOauth(pi, state),
		...toProviderConfig(credential.baseUrl, OMLX_API_KEY_ENV_VAR, models, {
			keyless,
		}),
	});
	state.catalog = models;
	state.registered = true;
	state.lastError = undefined;
	omlxDebug("provider_registered", {
		provider: PROVIDER,
		models: models.length,
		streamSimple: true,
		source: credential.source,
	});
}

function registrableCachedModels(
	models: OmlxModel[] | undefined,
): OmlxModel[] | undefined {
	const registrable = registrableModels(models ?? []);
	return registrable.length > 0 ? registrable : undefined;
}

function registerLoginOnlyProvider(pi: ExtensionAPI, state: State): void {
	pi.unregisterProvider(PROVIDER);
	pi.registerProvider(PROVIDER, {
		name: "OMLX",
		oauth: buildOmlxOauth(pi, state),
	});
}

async function registerCachedOrSetupModels(
	pi: ExtensionAPI,
	state: State,
): Promise<OmlxResolution | undefined> {
	const credential = await currentResolution();
	const models = credential
		? registrableCachedModels(readCatalogCache(credential.baseUrl))
		: undefined;
	if (!credential || !models) {
		state.catalog = [];
		state.registered = false;
		state.lastError = credential
			? "No cached OMLX models with real max_context_window/max_tokens; waiting for live catalog refresh."
			: "OMLX credentials are not set. Run /login and choose OMLX.";
		registerLoginOnlyProvider(pi, state);
		return credential;
	}

	registerModels(pi, state, credential, models);
	return credential;
}

// pi hands a stored credential to the provider's own hooks; until the provider
// object exists these two call sites stand in for it, reading the entry the
// same way: only an api_key credential is a login.
async function currentResolution(): Promise<OmlxResolution | undefined> {
	const stored = readOmlxCredential();
	return resolveOmlx(
		stored?.type === "api_key" ? stored : undefined,
		readEnvironment,
	);
}

const readEnvironment = async (name: string): Promise<string | undefined> =>
	process.env[name];

const noEnvironment = async (): Promise<string | undefined> => undefined;

async function refreshProvider(
	pi: ExtensionAPI,
	state: State,
	opts: { timeoutMs?: number } = {},
): Promise<{ result: RefreshResult; apiRoot: string | undefined }> {
	const credential = await currentResolution();
	if (!credential) {
		state.lastError = "OMLX credentials are not set";
		return { result: "not_configured", apiRoot: undefined };
	}
	return {
		result: await fetchAndRegister(pi, state, credential, opts),
		apiRoot: credential.baseUrl,
	};
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
	credential: OmlxResolution,
	opts: { timeoutMs?: number } = {},
): Promise<RefreshResult> {
	const modelSettingsPath = resolveLocalModelSettingsPath(
		process.env.OMLX_MODEL_SETTINGS_PATH,
	);

	let models: OmlxModel[];
	try {
		models = await fetchModels(credential.baseUrl, credential.apiKey, {
			modelSettingsPath,
			timeoutMs: opts.timeoutMs,
			// The adapter exists because omlxDebug takes (event, data), not a
			// CatalogDebugEvent.
			onDebug: (event) => omlxDebug(event.kind, event.details),
		});
	} catch (err) {
		state.lastError = err instanceof Error ? err.message : String(err);
		return "failed";
	}

	// The session ended while this fetch was in flight: its catalog belongs to
	// no session, and writing it would overwrite the cache the next one reads.
	if (state.stopped) return "failed";

	const registrable = registrableModels(models);

	if (registrable.length === 0) {
		state.lastError =
			models.length > 0
				? `No OMLX models have max_context_window and max_tokens (${models.length} models missing limits)`
				: "OMLX returned 0 models";
		return "failed";
	}

	writeCatalogCache(credential.baseUrl, registrable);
	registerModels(pi, state, credential, registrable);
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
