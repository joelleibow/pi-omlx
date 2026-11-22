import { readStoredCredential } from "@earendil-works/pi-coding-agent";

export const PROVIDER_KEY = "omlx";

/**
 * The one thing the extension reads from the stored `omlx` credential: its
 * type, which is what the startup remedy keys on. Pi judges what a present
 * credential means for requests; nothing here is filtered or validated.
 */
export interface OmlxCredentialRecord {
	type: string;
}

export function readOmlxCredential(): OmlxCredentialRecord | undefined {
	// <agent dir>/auth.json, resolved per call (research-chidi §3:
	// auth-storage.js:425-433; getAgentDir reads PI_CODING_AGENT_DIR per call,
	// michael-orientation trap i: config.js:510-516).
	return readStoredCredential(PROVIDER_KEY);
}
