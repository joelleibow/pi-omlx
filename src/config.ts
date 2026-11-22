import type { ProviderEnv } from "@earendil-works/pi-ai";

export const DEFAULT_OMLX_BASE_URL = "http://127.0.0.1:8000/v1";
export const OMLX_BASE_URL_ENV_VAR = "OMLX_BASE_URL";
export const OMLX_API_KEY_ENV_VAR = "OMLX_API_KEY";

export const CREDENTIAL_SOURCE_STORED = "stored";
export const CREDENTIAL_SOURCE_ENVIRONMENT = "environment";

// A keyless login still sends a bearer: pi-ai's openai-completions client
// throws on a falsy key, and pi's own keyless provider sends this sentinel.
export const KEYLESS_PLACEHOLDER = "local";

export type OmlxCredentialSource =
	| typeof CREDENTIAL_SOURCE_STORED
	| typeof CREDENTIAL_SOURCE_ENVIRONMENT;

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

/** What one credential decides: the URL, the key, and which side it came from. */
export interface OmlxResolution {
	baseUrl: string;
	apiKey: string;
	source: OmlxCredentialSource;
}

/** The parts of pi's stored api_key credential a resolution reads. */
export type OmlxStoredCredential = { key?: string; env?: ProviderEnv };

/** The environment pi's `AuthContext` offers a hook. */
export type OmlxEnvLookup = (name: string) => Promise<string | undefined>;

/**
 * The one resolution pi's `check` and `resolve` hooks run, and the login's
 * probe with them. A credential pi supplies decides both halves on its own; the
 * environment is read only when there is none, which is
 * docs/adr/0001-one-credential-decides-the-omlx-connection.md's order.
 */
export function resolveOmlx(
	credential: OmlxStoredCredential,
	envLookup: OmlxEnvLookup,
): Promise<OmlxResolution>;
export function resolveOmlx(
	credential: OmlxStoredCredential | undefined,
	envLookup: OmlxEnvLookup,
): Promise<OmlxResolution | undefined>;
export async function resolveOmlx(
	credential: OmlxStoredCredential | undefined,
	envLookup: OmlxEnvLookup,
): Promise<OmlxResolution | undefined> {
	if (credential) {
		return {
			baseUrl: resolveBaseUrl(credential.env?.[OMLX_BASE_URL_ENV_VAR]),
			apiKey: credential.key || KEYLESS_PLACEHOLDER,
			source: CREDENTIAL_SOURCE_STORED,
		};
	}
	const apiKey = await envLookup(OMLX_API_KEY_ENV_VAR);
	if (!apiKey) return undefined;
	return {
		baseUrl: resolveBaseUrl(await envLookup(OMLX_BASE_URL_ENV_VAR)),
		apiKey,
		source: CREDENTIAL_SOURCE_ENVIRONMENT,
	};
}
