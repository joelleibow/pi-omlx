# Council — neil, pass 1

Run `67bc26cd-b3c9-4073-957a-afebbe9502ce`.

## Recommendation

Delete the awaited startup refresh and its fallback (`index.ts:57-60`) so `startPolling`'s immediate first tick (`:102-104`) is the sole startup catalog request, and deliver the once-per-session warning via `ctx.ui.notify(..., "warning")` gated on `ctx.hasUI` and coordinated through `session_start` and `session_shutdown`.

1. **Startup fetch & fallback (`index.ts:56-64, 98-115`).** Keep synchronous `registerCachedOrSetupModels` (`:56`) in the factory and delete `:57-60`. Dropping only `await` runs two concurrent startup fetches and races cache writes and provider registrations; deleting `:57-60` removes lines, leaves `POLL_INTERVAL_MS` and backoff untouched, and collapses post-failure `registerCachedOrSetupModels` (`:60` and `:110`) into one home at `:109-110`. Rename `STARTUP_TIMEOUT_MS` (`:28`) to `CATALOG_TIMEOUT_MS` (`2_000` unchanged) so its name matches reality. Keep `startPolling` started in the factory (`:62`) rather than moving it to `session_start`: `sleep` already `.unref()`s (`:295-300`), `--list-models` exits at `main.js:776`, and non-session factory tests keep their shape.

2. **Warning mechanism & session lifecycle.** Store session-scoped state (`warned: boolean`, `startedConfiguredLoginOnly: boolean`, `pendingWarning: string | undefined`, `activeCtx: ExtensionContext | undefined`) on the extension instance, reset per session—never sticky across sessions. Set `startedConfiguredLoginOnly = true` only when startup resolved a configured credential with no usable cache (excluding unconfigured starts that later run `/login`, whose callback awaits `fetchAndRegister` at `:126-134`). Because `startPolling` fires before `session_start` (`Chidi §1`) and `ECONNREFUSED` settles in ~15 ms (`Michael`), store any pre-`session_start` warning in `pendingWarning` and flush it in `session_start`; after `session_start`, call `activeCtx.ui.notify(msg, "warning")` directly when `activeCtx.hasUI` is true. On each `session_start` (`startup|reload|new|resume|fork`), reset `warned = false` and recompute `startedConfiguredLoginOnly` against current registration state; on `session_shutdown`, clear `activeCtx` (and stop the poll on reload) so stale handles never trip `loader.js:151` `assertActive()`.
   - Failed fetch text: `oMLX catalog fetch failed for <apiRoot>; using cached models.` or `...; login-only provider is in use.`
   - Late arrival text (`startedConfiguredLoginOnly`): `oMLX session started login-only; models from <apiRoot> are now available via /model.`

3. **Provable tests (zero production seams).** Under `vi.useFakeTimers()`, mock `fetch` as `new Promise(() => {})` and assert `await extension(pi)` resolves with cached models (or login-only) registered **without advancing timers** (red on today's code). Write/unlink the cache fixture at `<inject("isolationRoot")>/agent/cache/omlx-models.json` (`CACHE_FILE`, `src/catalog.ts:567`) in both cached and no-cache tests so test order cannot leak state. Cover pre-`session_start` failure, post-`session_start` failure + next-tick recovery (1 warning), login-only late arrival (1 warning, model unchanged), warm-cache arrival (0 warnings), unconfigured start (0 fetches/warnings), and `hasUI: false` (0 warnings, clean stderr). Re-derive `settle()`, `fetches[0]`, and `beforePoll + 1` in `test/index.test.ts` for the single startup tick, naming expectation changes.

4. **Draft fixes (`proposal.md`, `spec.md`).**
   - `spec.md` L74 ("says the login-only provider is in use" on late arrival) is false once live models just registered; change `THEN` to state the session *started* login-only and models from `<url>` are now available.
   - `spec.md` L10/L29 ("what it fetches is registered and written to the cache") overstates `fetchAndRegister` (`:283-285`), which writes/registers only when models have positive `contextWindow` and `maxTokens` (`:181-195`).
   - `spec.md` L55/L80 ("where pi provides no session UI"): pi always passes `ctx.ui` (`noOpUIContext` when `hasUI === false`, JSON stdout in RPC when `hasUI === true`); guard `if (!ctx.hasUI) return;` explicitly so unit tests do not depend on pi's internal `noOpUIContext`.

## Evidence

- Deleting index.ts:57-60 removes the 4010 ms startup block while avoiding concurrent duplicate startup fetches, cache writes, and registration races with startPolling's immediate first tick (:102-104). (michael-orientation.md (Decisions 1, Measurements, Trap 1); research-eleanor.md (Startup flow, Raw Pi timing experiment, Addendum 1 & 2))
- Pi awaits factories before findInitialModel and before session_start; late registerProvider updates the registry without changing the selected model, and ctx.ui exists only from session_start onward (TUI/RPC hasUI=true; print/JSON hasUI=false noOpUIContext; --list-models exits before session_start). (research-chidi.md (§1 steps 1-6, §2, §3); michael-orientation.md (Trap 2, Trap 3))
- Captured pi/ctx handles throw via loader.js:151 assertActive() if used after reload or session replacement. (research-chidi.md (§2 Events/APIs usable after startup))
- fetchAndRegister writes the cache and registers live models only when fetched models have positive numeric contextWindow and maxTokens (index.ts:181-195, :283-285), and CACHE_FILE (src/catalog.ts:567) is captured at module import. (research-eleanor.md (Startup flow, Catalog requests and cache); michael-orientation.md (Decisions 6, Trap 4))
- Startup never waits (cached or not), Poll/backoff and OAuth login await (index.ts:126-134) stay untouched, no test-only seams are allowed, and one warning per session fires on failed fetch or on late catalog arrival only when the session started login-only. (owner-rulings.md (all sections); michael-orientation.md (Decisions 2-4, What it must not touch))

## Assumptions

- [verified] registerCachedOrSetupModels (index.ts:56) is synchronous and await refreshProvider (index.ts:57-59) is the sole await blocking the factory.
- [verified] startPolling (index.ts:98-115) runs refreshProvider immediately on its first iteration before sleeping.
- [verified] Pi awaits extension factories before initial model selection and before session_start, and exposes ctx.ui only to handlers starting at session_start.
- [verified] CACHE_FILE (src/catalog.ts:567) is captured at module import to <isolationRoot>/agent/cache/omlx-models.json rather than per-test PI_CODING_AGENT_DIR.
- [unverified] Pending Eleanor addendum on index.ts:42-54 and :66-95: how the singleton guard and existing event handlers behave on /reload or a second in-process session (pick: tear down poll and clear singleton/ctx on session_shutdown if singleton currently blocks re-binding; otherwise attach session_start/session_shutdown alongside :66-95).
- [unverified] Pending Eleanor addendum on index.ts:251-286: how fetchAndRegister reports an HTTP-200 catalog with zero usable positive-limit models (pick: treat zero usable models as a failed catalog load for the session warning and do not claim cache was written).
- [unverified] Pending Eleanor addendum on index.ts:109-110: whether calling registerCachedOrSetupModels after a mid-session poll failure overwrites previously registered live models (pick: leave :109-110 untouched per loop-shape exclusion unless it drops working models on a transient blip).
- [unverified] Pending Eleanor addendum on test/index.test.ts:226: whether driveExtension's fake pi already supports pi.on('session_start') and ctx.ui.notify (pick: add minimal handler dispatch and notify spy in test/index.test.ts only, zero production seams).
- [unverified] Pending Chidi addendum on pi 1.5.2 lifecycle: whether session_start's ctx.ui.notify stays callable after the handler returns until session_shutdown, and whether /new fires session_start without re-running the factory (pick: if ctx stays valid, capture activeCtx until session_shutdown; if /new keeps live models registered, recomputing startedConfiguredLoginOnly at session_start prevents false late-arrival warnings).
- [unverified] openspec/specs/diagnostics/spec.md was not read directly (inferred from proposal.md and spec.md L85); ctx.ui.notify verified not to write to stderr in Chidi §3.

## Risks

- A fast failure (e.g. ~15 ms ECONNREFUSED or mocked fetch rejection) completes startPolling's first tick before session_start runs; without pendingWarning buffering, activeCtx is undefined and the session warning is silently lost.
- An unconfigured session registers login-only at startup and the user later runs /login (index.ts:126-134); if startedConfiguredLoginOnly does not require a configured credential at session start, the next poll tick falsely warns that the catalog arrived late.
- After /reload or session replacement, pi's assertActive() (loader.js:151) throws on captured pi/ctx calls; if startPolling or activeCtx is not stopped/cleared on session_shutdown, background poll ticks throw unhandled errors.
- Implementing spec.md L74 verbatim tells the user 'the login-only provider is in use' immediately after fetchAndRegister registered live models, misleading users into thinking /model still has no oMLX models.
- Because CACHE_FILE is captured at import to <isolationRoot>/agent/cache/omlx-models.json, omitting explicit unlink in no-cache tests lets an earlier test's cache write make no-cache tests pass down the warm-cache path.

## Confidence

medium: Core startup mechanics, timings, and owner rulings are verified in Michael, Chidi, and Eleanor's reports, while exact singleton/event lines in index.ts:42-95, fetchAndRegister's empty-model branch (:251-286), and post-handler ctx validity await the pending addenda.

## Challenge claims

- Deleting index.ts:57-60 strictly beats un-awaiting :57 or coordinating two fetches: startPolling (:102-104) already runs immediately before sleeping, so keeping :57 either creates a double-fetch race or adds synchronization code for zero gain.
- spec.md's late-catalog THEN ('says the login-only provider is in use') is false at fire time because fetchAndRegister has just registered live models; the spec and message must say the session started login-only and models are now available via /model.
- A pre-session_start warning buffer flushed on session_start (guarded by ctx.hasUI) is mandatory because a ~15 ms ECONNREFUSED failure settles startPolling's first tick before session_start binds ctx.

## Owner decisions



## What would change my mind

- Evidence from Eleanor's addendum that index.ts:60 upholds a startup invariant that startPolling's :109-110 fallback does not cover.
- Evidence from Chidi's addendum that pi invalidates ctx.ui.notify as soon as the session_start handler returns, preventing asynchronous poll ticks from notifying through a captured ctx.
- Evidence from Eleanor's addendum that index.ts:42-54's singleton intentionally outlives session_shutdown to satisfy an existing spec requirement.
