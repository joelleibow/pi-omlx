/** What one catalog refresh did, and so which notice it earns. */
export type RefreshResult = "registered" | "not_configured" | "failed";

/**
 * The one user-facing sentence a refresh earns, or `undefined` when the session
 * has nothing worth saying. The session's start shape decides whether arrived
 * models are news: only a login-only start has a model the user may not want.
 */
export function catalogNotice(
	result: RefreshResult,
	startedLoginOnly: boolean,
	url: string | undefined,
	cachedCount: number,
): string | undefined {
	if (url === undefined) return undefined;
	if (result === "failed") {
		return cachedCount > 0
			? unavailableWithCache(url, cachedCount)
			: unavailableLoginOnly(url);
	}
	if (result === "registered" && startedLoginOnly) return arrivedLoginOnly(url);
	return undefined;
}

function unavailableWithCache(url: string, cachedCount: number): string {
	return `oMLX model list unavailable at ${url}; using ${cachedCount} cached models.`;
}

function unavailableLoginOnly(url: string): string {
	return `oMLX model list unavailable at ${url}; using the login-only provider.`;
}

function arrivedLoginOnly(url: string): string {
	return `oMLX session started login-only; models from ${url} are now available; choose one with /model.`;
}
