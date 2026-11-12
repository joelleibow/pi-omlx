# Council — matt, pass 1

Run `ab49fa64-faae-4ca8-a6c0-9561e2660e70`.

## Recommendation

1. **Startup fetch.** Delete the awaited refresh at `index.ts:57-60` and let the poll's first tick (`:101-104`) be the only startup fetch. That fetch starts inside the factory, but nothing waits on it. Deleting it also settles the re-register question: after the fetch fails, re-registering happens only at `:110`. Making the refresh non-awaited would leave two fetches running at once, and the race would decide which registration and which cache write wins (Michael, trap 1). Renaming `STARTUP_TIMEOUT_MS` is a structure step and gets its own commit with the tests green (Joel's 'two hats' rule).
2. **Warning.** Put the rule in one pure function: `catalogNotice(outcome, startedLoginOnly, url, cachedCount)` returns the text or undefined. Keep three fields of module state: `startedLoginOnly` (set from what the factory registered), `pendingNotice`, and `warnedThisSession`. Wire it at the edges:
   - When a fetch finishes: work out the notice. If no warning has shown yet and a session UI is held, call `notify(text, "warning")`. Otherwise store it as pending.
   - On `session_start`: hold `ctx.ui`, reset `warnedThisSession`, and show any pending notice. This covers a failure before `session_start`, such as a refused port at about 15 ms.
   - On `session_shutdown`: drop the held UI.
   - Do not branch on `hasUI`. In print and JSON mode pi's UI is already a no-op (Chidi §3), so a guard would change nothing (deletion test).
   - The warning fires on a failed fetch only. Not-configured is not a failure, so the cases that make no fetch get no warning.
   - Text, as named constants: `oMLX model list unavailable from <url>; using N cached models.` / `…; only the oMLX login entry is available.` / `oMLX models from <url> arrived after startup; choose one with /model.`
3. **Tests.** All run through the existing `driveExtension` with fake timers, with no new seam.
   - Not delayed: the fetch never resolves, timers are never advanced, and `await extension(pi)` resolves with the cached models registered and `fetches.length === 1`. On today's code this hangs, so it is red. The count of 1 also fails if someone reintroduces the concurrent fetch.
   - No-cache: login-only is registered, also with exactly one fetch.
   - Warnings, using a fake `session_start` ctx that records `notify` calls:
     - cache plus failure: one notify containing the URL and 'cached';
     - no cache plus failure: one notify saying 'login entry';
     - no cache plus success: the 'late' text;
     - cache plus success: no notify;
     - failure, then a backoff tick that succeeds: still one notify;
     - failure settled before `session_start` is emitted: one notify at `session_start`;
     - unconfigured credential: no notify.
   - Cache fixture: written at the isolation-root path (trap 4), and removed in a `beforeEach` so test order cannot decide the result. Import `CACHE_FILE` rather than rebuilding the path, if it is exported.
4. **The draft.**
   - The 'stays as pi left it' THEN describes pi's selection, which the extension cannot observe. Restate it as 'the extension does not call `pi.setModel`'.
   - The 'model picker' scenario tests pi. Restate it as 'registered under `omlx`'.
   - The no-UI scenario: keep only 'the extension writes nothing beyond what diagnostics allows', and drop 'no warning shown', which pi guarantees.
   - Add scenarios for a failure with no cache (says login-only), for an unconfigured credential (no warning), and for a failure before `session_start`.
   - The claim that the background fetch writes the cache is supported (`:283-285`).
5. **Open, still to decide.** Whether a new `session_start` resets the once-per-session flag (see owner decisions), and what counts as a failure when a fetch succeeds but returns zero usable models (I would count it as one).

## Evidence

- The await at `:57` is the only blocking edge. The poll's first tick fetches immediately, so dropping only the await leaves two concurrent fetches. (michael-orientation.md Decisions 1, Trap 1; research-eleanor.md Startup flow)
- `ctx.ui` exists only in handlers. It is a no-op in print and JSON mode and emits JSON over RPC. (research-chidi.md §3)
- A failure can be settled before `session_start` (refused port in 15 ms) or after it (a timeout takes about 4 s), so the warning needs both a pending path and a held UI. (michael-orientation.md Measurements; research-chidi.md §1 step order)
- `session_start` follows the factory by about 10–25 ms, so a catalog that takes about 100 ms usually lands after it. (research-chidi.md §1 -p/RPC exp)
- `CACHE_FILE` is captured at import, under the isolation root. (michael-orientation.md Trap 4)

## Assumptions

- [unverified] A `ctx.ui` held from `session_start` stays usable until `session_shutdown`. `assertActive` covers `pi` and `ctx` after a replacement, and is not checked for `ui`.
- [unverified] `refreshProvider` tells 'failed' apart from 'not-configured' in what it returns.
- [unverified] On `/reload` the singleton guard re-registers the `session_start` handler on the new `pi`.
- [unverified] `CACHE_FILE` is exported from `catalog.ts`.
- [unverified] The poll's first `refreshProvider` starts its fetch synchronously inside the factory.

## Risks

- Taking 'started login-only' literally from the factory: a server fast enough to land its catalog before pi picks the model would still get the 'late' warning. `shortcut: flag set at factory, upgrade to checking ctx.model if users report a spurious notice.`
- If the warning fires on the 'not registered' result, an unconfigured user (URL with no key) gets a false failure warning on every backoff tick.
- If the held `ui` goes stale after a session replacement, a `notify` from the poll throws inside the loop and lands in `lastError`. The warning would then be silently lost.

## Confidence

medium: The startup-fetch deletion and the test shapes rest on measured evidence. The warning's wiring depends on pi lifecycle facts nobody has verified.

## Challenge claims

- Making the refresh non-awaited is not a smaller fix: it leaves two concurrent fetches, two cache writes, and a race over which registration wins (trap 1).
- A `hasUI` guard fails the deletion test, because pi's no-op UI already prevents the print-mode warning.
- The spec's 'pi's model picker' and 'the model pi chose' THENs cannot be asserted by this extension's tests, so they would test pi.

## Owner decisions

- Does `/new`, resume, fork or `/reload` reset the once-per-session warning? I'd reset on every `session_start`, since each is a session from the user's view.

## What would change my mind

- Chidi showing that a held `ctx.ui` throws or no-ops after `session_start` returns. The design would then need a different delivery path for post-startup failures.
- Eleanor showing that `refreshProvider` cannot tell 'failed' from 'not-configured'. That would need a small result-type change in `index.ts`.
