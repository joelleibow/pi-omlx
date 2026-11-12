import {
	loadOmlxCredential,
	type OmlxCredentialRecord,
} from "./auth-storage.ts";

export const DEFAULT_OMLX_BASE_URL = "http://127.0.0.1:8000/v1";
export const OMLX_API_KEY_ENV_VAR = "OMLX_API_KEY";

export const CREDENTIAL_SOURCE_STORED = "stored";
export const CREDENTIAL_SOURCE_ENVIRONMENT = "environment";

export type OmlxCredentialSource =
	| typeof CREDENTIAL_SOURCE_STORED
	| typeof CREDENTIAL_SOURCE_ENVIRONMENT;

export interface ConfiguredOmlxCredential {
	configured: true;
	apiRoot: string;
	apiKey: string;
	source: OmlxCredentialSource;
}

export type OmlxCredentialResolution =
	| ConfiguredOmlxCredential
	| { configured: false };

export interface OmlxConfig {
	apiRoot: string;
	apiKeyEnvVar: string;
}

export function normalizeBaseUrl(raw: string): string {
	const trimmed = raw.trim().replace(/\/+$/, "");
	if (!trimmed) throw new Error("OMLX_BASE_URL is empty");
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

// A blank URL carries no instruction, so it falls to the default before
// normalizeBaseUrl, which rejects a blank string.
function resolveBaseUrl(raw: string | undefined): string {
	const candidate = raw?.trim();
	return normalizeBaseUrl(candidate ? candidate : DEFAULT_OMLX_BASE_URL);
}

// shortcut: mirrors pi-ai resolveProviderAuth (pi 1.5.2, auth/resolve.js:24-38); re-check on a pi upgrade
export function resolveOmlxCredential(
	stored: OmlxCredentialRecord | undefined,
	env: NodeJS.ProcessEnv,
): OmlxCredentialResolution {
	if (stored?.type === "oauth") {
		return {
			configured: true,
			apiRoot: resolveBaseUrl(stored.baseUrl),
			apiKey: stored.access ?? "",
			source: CREDENTIAL_SOURCE_STORED,
		};
	}
	if (stored?.type === "api_key") {
		if (!stored.key) return { configured: false };
		return {
			configured: true,
			apiRoot: resolveBaseUrl(stored.baseUrl),
			apiKey: stored.key,
			source: CREDENTIAL_SOURCE_STORED,
		};
	}
	if (stored) return { configured: false };
	const apiKey = env[OMLX_API_KEY_ENV_VAR];
	if (!apiKey) return { configured: false };
	return {
		configured: true,
		apiRoot: resolveBaseUrl(env.OMLX_BASE_URL),
		apiKey,
		source: CREDENTIAL_SOURCE_ENVIRONMENT,
	};
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OmlxConfig {
	const stored = loadOmlxCredential();
	const baseUrl = env.OMLX_BASE_URL
		? env.OMLX_BASE_URL
		: env.OMLX_API_KEY
			? DEFAULT_OMLX_BASE_URL
			: (stored?.baseUrl ?? DEFAULT_OMLX_BASE_URL);
	return {
		apiRoot: normalizeBaseUrl(baseUrl),
		apiKeyEnvVar: "OMLX_API_KEY",
	};
}

export function resolveConfiguredApiKey(
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	if (env.OMLX_API_KEY) return env.OMLX_API_KEY;
	if (env.OMLX_BASE_URL) return undefined;
	return loadOmlxCredential()?.apiKey;
}

/**
 * True when the user has pointed us at a server even without an API key.
 * OMLX servers run with `skip_api_key_verification: true` need no key; an
 * explicit base URL (env or stored) is the signal that a keyless server is
 * intended. With neither key nor base URL there is nothing to talk to.
 */
export function hasOmlxTarget(env: NodeJS.ProcessEnv = process.env): boolean {
	if (env.OMLX_API_KEY || env.OMLX_BASE_URL) return true;
	const stored = loadOmlxCredential();
	return Boolean(stored?.apiKey || stored?.baseUrl);
}

// Legacy helper for older stored api_key credentials. Never fills only one side
// of the env pair; partial shell overrides remain explicit shell state.
export function applyStoredCredentialToEnv(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	if (env.OMLX_BASE_URL || env.OMLX_API_KEY) return false;
	const stored = loadOmlxCredential();
	if (!stored?.apiKey) return false;
	env.OMLX_BASE_URL = stored.baseUrl ?? DEFAULT_OMLX_BASE_URL;
	env.OMLX_API_KEY = stored.apiKey;
	return true;
}
