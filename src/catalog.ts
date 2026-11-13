import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	AnyModel,
	Model,
	RefreshModelsContext,
} from "@earendil-works/pi-ai";
import { isModelType } from "@earendil-works/pi-ai";
import { PROVIDER_KEY } from "./auth-storage.ts";
import { OMLX_BASE_URL_ENV_VAR } from "./config.ts";
import { omlxDebug } from "./debug.ts";
import { FREE_COST } from "./pricing.ts";
import { thinkingFormatFor } from "./thinking-format.ts";

export interface OmlxModel {
	id: string;
	displayName?: string;
	contextWindow?: number;
	maxTokens?: number;
	/** Model architectural ceiling (`max_model_len`). Prio-3 fallback and clamp limit. */
	archContextWindow?: number;
	thinkingDefault?: boolean | null;
	reasoningParser?: string;
	modelType?: string | null;
}

export interface CatalogDebugEvent {
	kind: string;
	details: Record<string, unknown>;
}

interface OpenAIModelsResponse {
	object: string;
	data: Array<{ id: string; object?: string; max_model_len?: number | null }>;
}

interface OmlxModelsStatusResponse {
	models: Array<{
		id: string;
		display_name?: string | null;
		max_context_window?: number;
		max_tokens?: number;
		thinking_default?: boolean | null;
		enable_thinking?: boolean | null;
		chat_template_kwargs?: Record<string, unknown> | null;
		reasoning_parser?: string | null;
		model_type?: string | null;
		engine_type?: string | null;
		model_type_override?: string | null;
	}>;
}

interface OmlxGlobalSettingsResponse {
	sampling?: {
		max_context_window?: number;
		max_tokens?: number;
	};
}

interface OmlxGlobalDefaults {
	contextWindow?: number;
	maxTokens?: number;
}

export function parseModelsResponse(json: unknown): OmlxModel[] {
	const r = json as OpenAIModelsResponse | undefined;
	if (!r || !Array.isArray(r.data)) {
		throw new Error("OMLX /models response is missing `data` array");
	}
	const seen = new Set<string>();
	const out: OmlxModel[] = [];
	for (const entry of r.data) {
		if (!entry || typeof entry.id !== "string" || !entry.id) continue;
		if (seen.has(entry.id)) continue;
		seen.add(entry.id);
		const m: OmlxModel = { id: entry.id };
		if (typeof entry.max_model_len === "number" && entry.max_model_len > 0)
			m.archContextWindow = entry.max_model_len;
		out.push(m);
	}
	return out;
}

export function parseModelsStatusResponse(json: unknown): OmlxModel[] {
	const r = json as OmlxModelsStatusResponse | undefined;
	if (!r || !Array.isArray(r.models)) {
		throw new Error("OMLX /models/status response is missing `models` array");
	}
	const seen = new Set<string>();
	const out: OmlxModel[] = [];
	for (const entry of r.models) {
		if (!entry || typeof entry.id !== "string" || !entry.id) continue;
		if (seen.has(entry.id)) continue;
		seen.add(entry.id);
		const m: OmlxModel = { id: entry.id };
		if (typeof entry.display_name === "string" && entry.display_name.trim())
			m.displayName = entry.display_name;
		if (typeof entry.max_context_window === "number")
			m.contextWindow = entry.max_context_window;
		if (typeof entry.max_tokens === "number") m.maxTokens = entry.max_tokens;
		const chatTemplateKwargs = asRecord(entry.chat_template_kwargs);
		if (typeof entry.enable_thinking === "boolean") {
			m.thinkingDefault = entry.enable_thinking;
		} else if (
			chatTemplateKwargs &&
			typeof chatTemplateKwargs.enable_thinking === "boolean"
		) {
			m.thinkingDefault = chatTemplateKwargs.enable_thinking;
		} else if ("thinking_default" in entry) {
			m.thinkingDefault = entry.thinking_default ?? null;
		}
		if (
			typeof entry.reasoning_parser === "string" &&
			entry.reasoning_parser.trim()
		)
			m.reasoningParser = entry.reasoning_parser;
		const type =
			entry.model_type_override ?? entry.model_type ?? entry.engine_type;
		if (typeof type === "string") m.modelType = type.toLowerCase();
		out.push(m);
	}
	return out;
}

/**
 * Pi's `refreshModels` for `omlx`: restore what pi stored, then (with the
 * network allowed) fetch, filter and publish a fresh catalog. `commit` is the
 * provider's own list, swapped only inside a publish pi accepted.
 */
export async function refreshOmlxCatalog(
	context: RefreshModelsContext,
	commit: (models: readonly Model<"openai-completions">[]) => void,
): Promise<void> {
	// Read before anything is published: a broken credential throws where pi
	// records it, and the provider's list keeps what it held (D7, D13).
	const network =
		context.allowNetwork && !context.signal.aborted
			? networkCredential(context.credential)
			: undefined;

	const stored = restoreStoredModels(context.stored);
	await context.publish({ update: () => commit(stored) });
	if (!network) return;

	const fetched = await fetchModels(network.baseUrl, network.key, {
		signal: context.signal,
		modelSettingsPath: resolveLocalModelSettingsPath(
			process.env.OMLX_MODEL_SETTINGS_PATH,
		),
		onDebug: (event) => omlxDebug(event.kind, event.details),
	});
	const registrable = registrableModels(fetched);
	if (registrable.length === 0) {
		// pi records the throw against omlx; this is the only place the operator
		// can read what the response actually held.
		omlxDebug("catalog_refresh_failed", {
			url: network.baseUrl,
			models: fetched.length,
		});
		throw new Error(noRegistrableModelMessage(network.baseUrl, fetched.length));
	}
	const published = registrable.map((model) =>
		toProviderModel(model, network.baseUrl),
	);

	await context.publish({
		persist: { models: published, checkedAt: Date.now() },
		update: () => commit(published),
	});
}

/**
 * What the network phase fetches with. pi hands this phase `resolveOmlx`'s own
 * output, so a missing piece is a broken contract between the extension and pi
 * rather than a state to handle: it throws, naming the piece.
 */
function networkCredential(credential: RefreshModelsContext["credential"]): {
	baseUrl: string;
	key: string;
} {
	if (!credential) throw new Error("OMLX refresh: pi supplied no credential");
	if (credential.type !== "api_key") {
		throw new Error(
			`OMLX refresh: pi supplied an ${credential.type} credential, not an api_key one`,
		);
	}
	const baseUrl = credential.env?.[OMLX_BASE_URL_ENV_VAR];
	if (!baseUrl) {
		throw new Error("OMLX refresh: the credential carries no OMLX_BASE_URL");
	}
	if (!credential.key) {
		throw new Error("OMLX refresh: the credential carries no API key");
	}
	return { baseUrl, key: credential.key };
}

/**
 * The one sentence a response holding nothing registrable earns. The refresh
 * throws it, so pi records it against `omlx` and `/model` can say the catalog
 * could not be refreshed; the login's probe throws it into the dialog, which is
 * the only place pi shows the cause.
 */
export function noRegistrableModelMessage(
	baseUrl: string,
	count: number,
): string {
	const noun = count === 1 ? "model" : "models";
	return `OMLX at ${baseUrl} returned ${count} ${noun}, none with max_context_window and max_tokens.`;
}

// The store holds plain pi models, so only the ones this provider published are
// ours to restore.
function restoreStoredModels(
	stored: RefreshModelsContext["stored"],
): readonly Model<"openai-completions">[] {
	return (stored?.models ?? []).filter(isPublishedModel);
}

function isPublishedModel(
	model: AnyModel,
): model is Model<"openai-completions"> {
	return isModelType(model, "chat") && model.api === "openai-completions";
}

const BASE_COMPAT = {
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	supportsLongCacheRetention: true,
	maxTokensField: "max_tokens",
} as const;

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

/**
 * The models worth publishing: pi needs a real context window and output limit
 * for each, and the overlay may be what supplies them. Every caller that
 * decides what is registrable goes through this one rule.
 */
export function registrableModels(models: readonly OmlxModel[]): OmlxModel[] {
	return models.filter(
		(model) =>
			typeof model.contextWindow === "number" &&
			model.contextWindow > 0 &&
			typeof model.maxTokens === "number" &&
			model.maxTokens > 0,
	);
}

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export async function fetchModels(
	apiRoot: string,
	apiKey: string,
	opts: {
		signal?: AbortSignal;
		timeoutMs?: number;
		modelSettingsPath?: string;
		onDebug?: (event: CatalogDebugEvent) => void;
	} = {},
): Promise<OmlxModel[]> {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
	let models: OmlxModel[];

	try {
		const json = await getJson(
			`${apiRoot}/models/status`,
			apiKey,
			opts.signal,
			timeoutMs,
		);
		models = parseModelsStatusResponse(json);
		opts.onDebug?.({
			kind: "catalog_status_loaded",
			details: { apiRoot, count: models.length },
		});
		models = applyLocalModelSettings(
			models,
			apiRoot,
			opts.modelSettingsPath,
			opts.onDebug,
		);
		return resolveArchContextLimits(
			await applyApiGlobalDefaultsIfNeeded(
				models,
				apiRoot,
				apiKey,
				opts.signal,
				timeoutMs,
				opts.onDebug,
			),
		);
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") throw err;
		opts.onDebug?.({
			kind: "catalog_status_failed",
			details: {
				apiRoot,
				error: err instanceof Error ? err.message : String(err),
			},
		});
		// Fall through to /models for servers without /models/status.
	}

	const json = await getJson(
		`${apiRoot}/models`,
		apiKey,
		opts.signal,
		timeoutMs,
	);
	models = parseModelsResponse(json);
	opts.onDebug?.({
		kind: "catalog_models_loaded",
		details: { apiRoot, count: models.length },
	});
	models = applyLocalModelSettings(
		models,
		apiRoot,
		opts.modelSettingsPath,
		opts.onDebug,
	);
	return resolveArchContextLimits(
		await applyApiGlobalDefaultsIfNeeded(
			models,
			apiRoot,
			apiKey,
			opts.signal,
			timeoutMs,
			opts.onDebug,
		),
	);
}

/**
 * Final context-window resolution, applied after model-specific (prio 1) and
 * global (prio 2) settings. The model's architectural ceiling
 * (`archContextWindow`, from `max_model_len`) is the prio-3 fallback when no
 * user setting exists, and the hard clamp when a user setting exceeds it.
 */
export function resolveArchContextLimits(models: OmlxModel[]): OmlxModel[] {
	return models.map((model) => {
		const arch = model.archContextWindow;
		if (arch == null) return model;
		const next: OmlxModel = { ...model };
		if (next.contextWindow == null) next.contextWindow = arch;
		else if (next.contextWindow > arch) next.contextWindow = arch;
		return next;
	});
}

async function applyApiGlobalDefaultsIfNeeded(
	models: OmlxModel[],
	apiRoot: string,
	apiKey: string,
	signal: AbortSignal | undefined,
	timeoutMs: number,
	onDebug?: (event: CatalogDebugEvent) => void,
): Promise<OmlxModel[]> {
	if (!models.some((m) => m.contextWindow == null || m.maxTokens == null))
		return models;
	let defaults: OmlxGlobalDefaults | undefined;
	try {
		defaults = await fetchGlobalDefaults(apiRoot, apiKey, signal, timeoutMs);
		onDebug?.({
			kind: "catalog_global_settings_loaded",
			details: { apiRoot, defaults },
		});
	} catch (err) {
		if (signal?.aborted) throw err;
		onDebug?.({
			kind: "catalog_global_settings_failed",
			details: {
				apiRoot,
				error: err instanceof Error ? err.message : String(err),
			},
		});
		return models;
	}
	if (defaults.contextWindow == null && defaults.maxTokens == null)
		return models;
	return models.map((model) => {
		const next: OmlxModel = { ...model };
		if (next.contextWindow == null && defaults.contextWindow != null)
			next.contextWindow = defaults.contextWindow;
		if (next.maxTokens == null && defaults.maxTokens != null)
			next.maxTokens = defaults.maxTokens;
		return next;
	});
}

async function fetchGlobalDefaults(
	apiRoot: string,
	apiKey: string,
	parent: AbortSignal | undefined,
	timeoutMs: number,
): Promise<OmlxGlobalDefaults> {
	const base = apiRoot.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
	const json = (await getJson(
		`${base}/admin/api/global-settings`,
		apiKey,
		parent,
		timeoutMs,
	)) as OmlxGlobalSettingsResponse;
	const sampling = asRecord(json?.sampling);
	return {
		contextWindow:
			typeof sampling?.max_context_window === "number"
				? sampling.max_context_window
				: undefined,
		maxTokens:
			typeof sampling?.max_tokens === "number"
				? sampling.max_tokens
				: undefined,
	};
}

async function getJson(
	url: string,
	apiKey: string,
	parent: AbortSignal | undefined,
	timeoutMs: number,
): Promise<unknown> {
	const signal = withTimeout(parent, timeoutMs);
	// Empty key => keyless server (skip_api_key_verification): omit the header.
	const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
	const res = await fetch(url, {
		headers,
		signal,
	}).catch((err) => {
		if (err instanceof Error && err.name === "AbortError") {
			// A caller's abort is not our timeout: it must not become a fallback
			// request on a signal that is already cancelled.
			if (parent?.aborted) throw err;
			throw new Error(`GET ${url} timed out after ${timeoutMs}ms`);
		}
		throw err;
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(
			`GET ${url} -> ${res.status} ${res.statusText}${body ? `: ${body}` : ""}`,
		);
	}
	return res.json();
}

function withTimeout(
	parent: AbortSignal | undefined,
	timeoutMs: number,
): AbortSignal {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), timeoutMs);
	if (parent) {
		if (parent.aborted) ctl.abort();
		else parent.addEventListener("abort", () => ctl.abort(), { once: true });
	}
	ctl.signal.addEventListener("abort", () => clearTimeout(timer), {
		once: true,
	});
	return ctl.signal;
}

export function applyLocalModelSettings(
	models: OmlxModel[],
	apiRoot: string,
	modelSettingsPath = process.env.OMLX_MODEL_SETTINGS_PATH,
	onDebug?: (event: CatalogDebugEvent) => void,
): OmlxModel[] {
	const path = resolveLocalModelSettingsPath(modelSettingsPath);
	onDebug?.({
		kind: "catalog_local_settings_considered",
		details: {
			apiRoot,
			path,
			explicitPath: !!modelSettingsPath,
			exists: path ? existsSync(path) : false,
		},
	});
	if (!path || !existsSync(path)) return models;

	let settings: Record<string, unknown>;
	try {
		settings = JSON.parse(readFileSync(path, "utf8")) as Record<
			string,
			unknown
		>;
	} catch {
		onDebug?.({
			kind: "catalog_local_settings_read_failed",
			details: { path },
		});
		return models;
	}

	const byModel = settings.models;
	if (!byModel || typeof byModel !== "object" || Array.isArray(byModel)) {
		onDebug?.({
			kind: "catalog_local_settings_invalid",
			details: { path, reason: "models object missing" },
		});
		return models;
	}

	return models.map((model) => {
		const entry = (byModel as Record<string, unknown>)[model.id];
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			return model;
		}
		const next = applyModelSettingsEntry(
			model,
			entry as Record<string, unknown>,
		);
		if (JSON.stringify(next) !== JSON.stringify(model)) {
			onDebug?.({
				kind: "catalog_local_model_settings_applied",
				details: {
					path,
					modelId: model.id,
					before: model,
					after: next,
				},
			});
		}
		return next;
	});
}

function applyModelSettingsEntry(
	model: OmlxModel,
	entry: Record<string, unknown>,
): OmlxModel {
	const next: OmlxModel = { ...model };
	const chatTemplateKwargs = asRecord(entry.chat_template_kwargs);

	if (typeof entry.display_name === "string" && entry.display_name.trim())
		next.displayName = entry.display_name;
	if (typeof entry.enable_thinking === "boolean") {
		next.thinkingDefault = entry.enable_thinking;
	}
	if (chatTemplateKwargs) {
		const enableThinking = chatTemplateKwargs.enable_thinking;
		if (
			typeof enableThinking === "boolean" &&
			typeof entry.enable_thinking !== "boolean"
		) {
			next.thinkingDefault = enableThinking;
		}
	}
	if (typeof entry.max_context_window === "number")
		next.contextWindow = entry.max_context_window;
	if (typeof entry.max_tokens === "number") next.maxTokens = entry.max_tokens;
	if (
		typeof entry.reasoning_parser === "string" &&
		entry.reasoning_parser.trim()
	)
		next.reasoningParser = entry.reasoning_parser;
	if (typeof entry.model_type_override === "string")
		next.modelType = entry.model_type_override.toLowerCase();
	return next;
}

export function resolveLocalModelSettingsPath(
	modelSettingsPath: string | undefined,
): string | undefined {
	if (modelSettingsPath) return modelSettingsPath;
	return join(homedir(), ".omlx", "model_settings.json");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
