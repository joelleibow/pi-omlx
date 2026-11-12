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
	// Resolves <agent dir>/auth.json at call time, so PI_CODING_AGENT_DIR is the
	// one knob: the read takes no test seam.
	return readStoredCredential(PROVIDER_KEY);
}
