import type { OmlxCredentialRecord } from "./auth-storage.ts";

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
