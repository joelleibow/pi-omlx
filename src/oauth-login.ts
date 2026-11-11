import type {
	OAuthCredentials,
	OAuthLoginCallbacks,
} from "@earendil-works/pi-ai";
import { normalizeBaseUrl } from "./config.ts";

/**
 * Fetches the live model catalog for (baseUrl, apiKey) and registers it as
 * the real provider. Called from inside login() so the catalog is live by
 * the time pi's login dialog closes — pi calls modelRegistry.refresh()
 * synchronously right after login() resolves, before credentials even reach
 * storage. This login path deliberately fetches immediately; the background
 * poll is only a fallback for startup/refresh outside the login flow.
 */
// OMLX keys never expire, but pi needs a finite number: Infinity serializes to
// null in auth.json, which pi reads as already expired (refreshing on every
// request) and its read-only auth check rejects as an invalid auth.json.
export const OMLX_CREDENTIAL_EXPIRES = Number.MAX_SAFE_INTEGER;

export type RegisterOmlxFromLogin = (
	baseUrl: string,
	apiKey: string,
) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Drives pi's native "Use a subscription" /login flow for omlx: prompts for
 * base URL then API key via the two onPrompt calls the login dialog exposes.
 * Stored as an oauth-typed credential (access/refresh/expires are required by
 * OAuthCredentials but unused — omlx has no token refresh); auth-storage.ts
 * reads baseUrl/access back out via loadOmlxCredential().
 */
export function createLoginOmlx(register: RegisterOmlxFromLogin) {
	return async function loginOmlx(
		callbacks: OAuthLoginCallbacks,
	): Promise<OAuthCredentials> {
		const rawBaseUrl = await callbacks.onPrompt({
			message: "OMLX base URL",
			placeholder: "http://localhost:8000",
		});
		const baseUrl = normalizeBaseUrl(rawBaseUrl);

		const apiKey = (
			await callbacks.onPrompt({
				message: "OMLX API key (leave empty for a keyless server)",
				allowEmpty: true,
			})
		).trim();

		callbacks.onProgress?.("Fetching OMLX model catalog...");
		const result = await register(baseUrl, apiKey);
		if (!result.ok) {
			throw new Error(`Could not reach OMLX at ${baseUrl}: ${result.error}`);
		}

		return {
			access: apiKey,
			refresh: "",
			expires: OMLX_CREDENTIAL_EXPIRES,
			baseUrl,
		};
	};
}

export function refreshOmlxToken(
	credentials: OAuthCredentials,
): Promise<OAuthCredentials> {
	// Also repairs credentials stored by older versions with expires: null.
	return Promise.resolve({ ...credentials, expires: OMLX_CREDENTIAL_EXPIRES });
}

export function getOmlxApiKey(credentials: OAuthCredentials): string {
	return typeof credentials.access === "string" ? credentials.access : "";
}
