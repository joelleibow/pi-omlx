import { readStoredCredential } from "@earendil-works/pi-coding-agent";

export const PROVIDER_KEY = "omlx";

/**
 * The stored `omlx` credential exactly as auth.json presents it: pi's record
 * plus the `baseUrl` this extension's login wrote. Nothing here is filtered or
 * validated; the resolver judges what a present record means.
 */
export interface OmlxCredentialRecord {
	type: string;
	baseUrl?: string;
	key?: string;
	access?: string;
}

let authPathOverrideForTesting: string | undefined;

export function _setAuthPathForTesting(path: string | undefined): void {
	authPathOverrideForTesting = path;
}

export function readOmlxCredential(): OmlxCredentialRecord | undefined {
	// Defaults to <agent dir>/auth.json, resolved per call (research-chidi §3:
	// auth-storage.js:425-433; getAgentDir reads PI_CODING_AGENT_DIR per call,
	// michael-orientation trap i: config.js:510-516). The path argument is the
	// existing test seam, honoured only when a test sets one.
	return readStoredCredential(PROVIDER_KEY, authPathOverrideForTesting);
}
