/** Ruling B's remedy for a stored entry pi no longer reads (D8, D9). */
const OAUTH_REMEDY =
	"oMLX still holds an old OAuth-style login that pi no longer reads; run /logout omlx, then /login omlx.";

/** Ruling C1's warning for a start that holds no oMLX model to run on. */
const NO_MODELS =
	"oMLX is configured but pi holds no oMLX models yet, so this session landed on another provider's model; choose one with /model.";

export interface StartupNoticeInput {
	/** The stored `omlx` entry's type, as `auth.json` presents it. */
	storedType: string | undefined;
	/** Whether pi's own resolution reports `omlx` configured. */
	configured: boolean;
	/** How many models the provider serves — the list pi chose from. */
	modelCount: number;
}

/**
 * The one sentence a session's start earns, or `undefined`. A single return
 * value is what makes "at most one warning per start" structural: the OAuth
 * remedy is the first branch, so the landed-model warning cannot follow it.
 */
export function startupNotice({
	storedType,
	configured,
	modelCount,
}: StartupNoticeInput): string | undefined {
	if (storedType === "oauth") return OAUTH_REMEDY;
	if (configured && modelCount === 0) return NO_MODELS;
	return undefined;
}
