# Council Synthesis

## Question and Scope

How does the extension take its catalog request off pi's startup path without moving the credential rule, the poll's schedule or the suite, and how is the one warning per session delivered, bounded and worded? The council also had to say what a session is for that warning, and what happens to a fetch that outlives its session.

Inputs: `proposal.md` and the `catalog-discovery` delta; `owner-rulings.md`, whose three no-cache and notice rulings postdate the orientation (no-cache startup does not wait, one notice when it matters, when the notice fires); `michael-orientation.md`, whose decisions and traps bind; `research-chidi.md` with Addendum 3 (pi 1.5.2 lifecycle, `ctx.ui` per mode); `research-eleanor.md` with Addendum 3 (singleton and `state`, `RefreshResult`, the fake pi).

Out of scope, by Joel's ruling and Michael's orientation: `POLL_INTERVAL_MS` and the backoff values, `readLastCatalogCache`, the `CACHE_FILE` path shape, `_setAuthPathForTesting`, the oauth callback's own await, and the AbortError rewrap at `src/catalog.ts:362-366` that makes a status timeout fall through to `/models`. Neil and Matt both put the last two on their out-of-scope lists.

Two passes ran. Reports: `council-neil-pass1.md`, `council-matt-pass1.md`, `council-neil-pass2.md`, `council-matt-pass2.md`. Both advisors changed their recommendation in pass 2, after the addenda; Matt withdrew the one owner decision he had raised.

## Perspectives & Trade-offs

**Where they agreed in pass 1.** Both advisors opened with the same fix: delete the awaited refresh at `index.ts:57-60` and let `startPolling`'s immediate first tick be the only startup request. Both rejected making the existing refresh non-awaited, because the poll's first tick already fetches with no sleep before it, so dropping only the `await` leaves two concurrent requests and lets the race decide which registration and which cache write wins. Both buffered a notice that settles before `session_start`, since a refused port fails in about 15 ms and `session_start` follows the factory by about 10 to 25 ms (Michael's measurement; Chidi §1). Matt also asked for the text to be picked by one pure function, which pass 2 adopted for both.

**Where they split in pass 1.**

- **The `hasUI` guard.** Neil asked for `if (!ctx.hasUI) return` before `notify`, so unit tests would not depend on pi's internals. Matt called it dead code: pi's `noOpUIContext` already makes `notify` silent in `-p` and JSON, and in RPC `hasUI` is true, so the branch would only ever fire in a test.
- **The warning's lifetime.** Neil reset `warned` on every `session_start`. Matt thought a reset was probably right but called it an owner decision, since a user could read `/new` as a new session.
- **State's home and the handle.** Neil put the fields on the extension instance and held the whole `ctx`; Matt put them at module level and held only `ctx.ui`.
- **The draft spec.** Matt objected that two scenarios assert what pi did (which model pi chose, what the picker offers) and that the no-UI scenario asserts pi's behaviour. Neil raised the same no-UI objection and added two line-level defects: the unconditional claim that a fetch registers and caches, and the late-catalog `THEN` that says login-only is in use at the moment live models just registered.

**What the addenda settled.** Chidi's Addendum 3 shows all four session commands (`/new`, `/resume`, `/fork`, `/reload`) emit `session_shutdown` and re-run the factory with fresh state, so one factory instance is one session. It also shows RPC firing `session_start` twice on one instance after `new_session`. Eleanor's Addendum 3 shows `RefreshResult` already returning `"failed"` for a 200 with no registrable model, that `CACHE_FILE` and registration happen only after at least one model with positive limits, and that the fake pi stores handlers without synthesising `session_start`.

**Where they converged in pass 2.** No `hasUI` guard; `warned` scoped to the factory instance with an idempotent `session_start`; one pure `catalogNotice` plus four per-instance fields holding only `ctx.ui`; a `state.stopped` guard after the fetch, which Neil strengthened with a check in the poll loop too, because the loop's own fallback re-register would still reach a dead instance; `startedLoginOnly` qualified by a configured credential; and the spec edits on all six points.

## Synthesis & Recommendation

Take the request off the startup path by deletion, not by detaching it: delete `index.ts:57-60`, keep the synchronous `registerCachedOrSetupModels` at `:56`, and let the poll's immediate first tick (`:102-104`) be the startup fetch. The re-register after a failed fetch then has one home, `:110`.

Deliver the notice from one pure function, `catalogNotice(result, startedLoginOnly, url, cachedCount)`, returning the text or `undefined`, with each text a named constant. Hold four fields on the per-instance `state` (`index.ts:33-40`): `startedLoginOnly`, `pendingNotice`, `warned`, and `ui`, holding only `ctx.ui`. One `showOnce` edge notifies when `ui` is held, a notice exists and `!warned`, then sets `warned` and clears `pendingNotice`; it is called from the poll after `:110` re-registration, so `state.registered` reflects the post-fallback state, and from `session_start`, where it also sets `ui` and flushes a pending notice. `session_start` stays idempotent, because RPC emits it twice.

Set `startedLoginOnly` in the factory only when the credential is configured and login-only was registered, and carry a `shortcut:` comment naming the one window it misses: a catalog that lands while a later extension's factory is still loading still warns late, and the upgrade (`session_start` `ctx.model.provider`) is unverified.

Guard the widened stale-handle defect in two places, both reading `state.stopped`: return `"failed"` from `fetchAndRegister` after `await fetchModels` and before the cache write and registration; `break` from the poll after `await refreshProvider` and before the fallback re-register and the notice.

Rename `STARTUP_TIMEOUT_MS` in a structure-only step with the tests green. Its name is the only wrong part: the 2-second value stays, and it still feeds the poll at `:103`.

The stale-instance case gets its own requirement in the delta, `A Fetch That Outlives Its Session Changes Nothing`. It constrains registration and the cache write as well as the warning, so it is not a scenario of the notice.

The rationale throughout is the same: the per-instance `state` is already the session's single home, so no new lifecycle noun arrives; the deletion removes a second path rather than adding a flag; and every warning decision sits in one pure function so the messages can be tested without a session.

## Accepted & Rejected Feedback

**Adopted.** Deleting `:57-60` instead of detaching the refresh (both passes). One pure `catalogNotice` with named text constants (Matt pass 1, agreed in pass 2). Per-instance state over module state (Neil pass 1, and Chidi's Addendum 3 §1 shows the module survives across sessions). Holding `ctx.ui` rather than `ctx` (Matt). The pending notice and the flush on `session_start` (both). The `state.stopped` guard after the fetch (Matt pass 2), and Neil's loop check as well (Michael made it required). `startedLoginOnly` restricted to configured-plus-no-cache (both, refined from Joel's ruling). All six spec edits (C5), with Matt's and Neil's versions merged.

**Rejected.** The `hasUI` guard (Neil pass 1), because it changes no observable behaviour in any mode and exists only for a test fake. Resetting `warned` on `session_start` (Neil pass 1, Matt pass 1), because RPC's double `session_start` would then warn twice. Module-level warning state (Matt pass 1), because it is a second lifecycle home and leaks across tests. Holding the whole `ctx` (Neil pass 1), because `notify` is the only call and the smaller handle keeps pi's stale-context trap out of reach. Neil's optional reading of the loop check: Michael made it required. The spec's two pi-side `THEN`s and its unconditional cache-and-register claim (raised by Matt and Neil, confirmed as C5).

**Withdrawn.** Matt's owner decision, "does `/new`, resume, fork or `/reload` reset the once-per-session warning?", withdrawn in pass 2 once Chidi's Addendum 3 showed each of those runs `session_shutdown` and a fresh factory.

**Left in place, deliberately.** The stale-handle throw on later poll ticks (Matt) is closed by the same `fetchAndRegister` guard, so it needs no separate line. The question of whether a `/new` can pick up a default `omlx` model the previous instance cached belongs to the docs pass, not here.

## Michael's Rulings

None of the disputes below is marked `joel`: Michael settled every one of them.

### The startup fetch: delete `index.ts:57-60`

**Ruling.** Delete it. The poll's first tick is the only startup request, and the post-failure re-register lives only at `:110`. Renaming `STARTUP_TIMEOUT_MS` is a separate structure-only step.

**What decided it.** Dropping only the `await` would leave two concurrent fetches, which is his own orientation trap 1; deleting removes the second home for the fallback. The constant also feeds the poll at `:103`, so the rename touches both uses and leaves the 2-second value alone. He cites Joel's rulings ("startup never waits on the model fetch, cached or not", and the interval/backoff exclusion, since a per-request timeout is neither) and both passes.

**Evidence.** He re-read `index.ts:56-64` and `:98-114`: `registerCachedOrSetupModels` at `:56` is synchronous, `:57` is the only await on the factory path, and the poll's first iteration calls `refreshProvider` with no sleep. His orientation measured the factory resolving after 4011 ms with a cache and 4010 ms without, against a server that accepts and never answers.

### C1: no `hasUI` guard

**Ruling.** No guard. The spec sentence "no warning SHALL be shown where pi provides no session UI" describes pi, not the extension; restate it as the warning going only through `ctx.ui.notify`, with nothing on stderr beyond what `diagnostics` allows.

**What decided it.** Joel's carried ruling against production code that exists only for tests, and the deletion test. He read pi 1.5.2's `runner.js:132-135` (`notify: () => { }` on `noOpUIContext`), `:355-356` and `:404-405`, plus `print-mode.js:60` (no `uiContext`), `rpc-mode.js:234-236` (`hasUI` true) and `agent-session.js:2819-2820`. Chidi's Addendum 3 §3 measured `-p` and `--mode json` writing nothing on either stream.

### C2: "per session" means per factory instance

**Ruling.** One factory instance is one session. `warned`, `startedLoginOnly`, `pendingNotice` and `ui` live on that instance's `state`, nothing resets on `session_start`, and the handler is idempotent. This one is not Joel's: his ruling says "per session", and pi's lifecycle says what a session is.

**What decided it.** He read `agent-session-runtime.js:102-113` (`teardownCurrent`: shutdown, then dispose, then a fresh `createRuntime`), `agent-session.js:3094-3135` (`reload`: shutdown, `invalidate`, factories re-run, `session_start`), the RPC double emit at `rpc-mode.js:356-360` with `agent-session-runtime.js:120-123`, and `index.ts:92-95` deleting the singleton key on shutdown.

### C3: a fetch that outlives its session does nothing

**Ruling.** Confirmed, with Neil's loop check required rather than optional. `fetchAndRegister` returns `"failed"` — the return type demands a value, and no new result noun arrives — before `writeCatalogCache` and `registerModels`. That alone leaves Matt's test red, because the loop's `else` branch at `:110` calls `registerCachedOrSetupModels`, which registers through `pi`; so the loop also breaks after the `await`, before the fallback re-register and the notice. The cache write is skipped for a reason of its own: a stale fetch for URL A landing after the new session logged into URL B would overwrite the single cache file with A's catalog, and the next start under B would find no cache.

**What decided it.** The standing rule that a defect a change introduces or widens is fixed in that change, and pi's `loader.js:117-121` with `agent-session.js:3104` and `:1081`: `invalidate()` makes every `pi.*` call throw. He notes the window is nil today only because the factory blocks for about 4 s, and that he derived the "test stays red" claim from source rather than by running it.

### C4: `startedLoginOnly` needs a configured credential

**Ruling.** Confirmed. The flag means "configured, and no usable cache at startup". An unconfigured start made no request, so the catalog a `/login` brings is the user's own action, and warning about it up to 60 s later would be a spurious warning. The narrow window Matt named is real; a one-line `shortcut:` naming the upgrade is the right size, and the design states the qualifier so Joel sees it at PL2.

**What decided it.** Joel's option text for the late warning ("only warns if the session started login-only, which is when you might be sitting on another provider's model"), the `credential-resolution` scenarios that make no fetch when unconfigured, and Chidi §1's sequential factory loading. He read `index.ts:209-227` (one helper registers login-only for both cases, so the flag needs the qualifier), `:124-139` (the oauth callback fetches outside the poll) and `loader.js:559-583` (the window itself).

### C5: six spec edits

**Ruling.** Confirmed on all six: registrable models (positive limits) are what get registered and cached; a 200 with zero registrable models already returns `"failed"` and so warns, and needs its own scenario; the late-catalog scenario says the session started login-only and the models are now available; the pi-side `THEN`s become extension actions (no `pi.setModel`; registered under `omlx`); four new scenarios (a failure with no cache, an unconfigured credential, a failure before `session_start`, the stale instance); and the no-UI scenario keeps only the stderr assertion.

**What decided it.** `index.ts:181-188` and `:272-285` for the registrable rule and the zero-model `"failed"`; Joel's two notice rulings for what the text says; and his own PL4 rule that every scenario is a behavioural assertion about the application rather than about pi. He read the draft at the lines that carried the defects.

### C6: one pure function, four instance fields, one `showOnce` edge

**Ruling.** Confirmed, holding `ctx.ui` as Matt proposed. `catalogNotice` is the one place the rule lives; the edges only call it. Module-level state goes, because the module is cached across sessions and would both leak across tests and create a second lifecycle home. `pendingNotice` is justified by measurement: a refused port settles in about 15 ms, and `session_start` can fall on either side of that. `showOnce` idempotence is what C2's double `session_start` requires. The notice is computed only in the poll; the oauth login's own fetch reports to the login dialog and produces no notice.

**What decided it.** Joel's two notice rulings for content and trigger, C2 and C3 for the lifecycle and the stale guard, Chidi's Addendum 3 §1 and §4, and `runner.js:620-637`: `ctx.ui` is a getter that asserts active, so holding the returned object bypasses the assert — which is why C3's guard must run before any notify.

## Owner Decisions Required

None. Michael marked every dispute `settled`, and both questions the advisors had left for a decision were closed by evidence before he ruled: Matt's "does `/new` reset the warning?" was withdrawn in pass 2 on Chidi's Addendum 3 §1, and his other open item, what counts as a failed load, was answered by `index.ts:272-285`. Joel's three rulings in `owner-rulings.md` (no-cache startup does not wait, one notice when it matters, when the notice fires) settle the product side of this change; C4 records one qualifier he should see at PL2: the late warning does not fire for an unconfigured start that later logs in.
