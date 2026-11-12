# Proposal

## Why

pi awaits every extension factory before it chooses a session's starting model. This extension's factory awaits a live catalog request (`index.ts:57-60`, Eleanor, `Startup flow`). An oMLX server that accepts a connection and never answers therefore holds pi's startup: 4.15 s for `pi --list-models` with the extension installed, against 0.12 s without it and 0.13 s against a refused port (Eleanor, raw timing table). A warm cache does not shorten that either, because the cached registration happens before the await and never gates it (Michael: 4011 ms with a cache, 4010 ms without).

One attempt costs that much because a `/models/status` timeout is rewrapped as an ordinary error and falls through to `/models`, which times out again (Eleanor, Addendum 1, which supersedes the opposite sentence in her first report; Michael traced `catalog_status_failed` at 2006 ms and the throw at 4009 ms). Settings add a request only when a parsed model lacks limits.

Nobody is told any of it. `state.lastError` is read in one place, the oauth login callback (Michael, trap 3). Joel made this a must-fix: "It's directly impacting user's experience without any indication of doing so." He ran the card after PR #9 merged, with the acceptance criteria recorded in `owner-rulings.md`.

## What Changes

- **Startup stops waiting for the catalog.** The factory registers the cached models for the resolved base URL, or the login-only provider when no cache covers it, and then resolves. The catalog request continues after it, and its result still registers and writes the cache (`owner-rulings.md` §"Startup blocking is a must-fix", §"No-cache startup does not wait").
- **The no-cache start becomes deliberate and documented.** A session with no cache starts on the login-only provider. pi picks its starting model without oMLX models, and the extension leaves that choice alone when the catalog lands; the user switches with `/model` (Joel's ruling; Chidi §2, selection happens once). Users will notice the difference: a saved default `omlx` model is not selected on a session that starts without a cache, which covers a first run and any `/login` to a new URL, because the cache is keyed by `apiRoot` (Michael, trap 2). The README and `ARCHITECTURE.md` state it in the docs pass, and documentation never blocks (Michael, `Standing` 9).
- **The user gets one warning per session.** It fires on a failed catalog fetch, naming the resolved base URL and whether cached models or the login-only provider are in use. A catalog that arrives after startup warns only when the session started login-only, so a warm-cache session whose catalog arrives normally gets nothing (`owner-rulings.md` §"When the notice fires").
- **Each case gets a test**, inside the suite's existing isolation, with no new test-only seam (Joel's acceptance criteria; the carried rulings on tests and on seams).

Four things stay as they are, because nothing asks for them: the credential rule (ADR 0001 and `credential-resolution`, including the cases that make no request at all, since a background request is still a request), the poll interval and backoff (out of scope by Joel's ruling), the await inside the oauth login callback (`index.ts:126-134`, which is not startup), and `readLastCatalogCache` plus the `CACHE_FILE` path shape (Michael's rulings 7 and 8, board card 3).

## Capabilities

### New Capabilities

- `catalog-discovery`: what the extension does about the oMLX catalog at a session's start, namely that startup never awaits a request, that a session starting without a catalog stays as pi left it, and that the user gets one warning per session when the request fails or the catalog lands late.

### Modified Capabilities

None. The three behaviours share one subject, and no living capability owns it.

`credential-resolution` owns which credential decides the URL and the key, and every one of its requirements keeps holding. A request moved off the startup path is still a request, so its two "makes no catalog fetch" scenarios stay true, and so does the rule that the catalog and the registered provider come from one resolution (Michael, `Decisions that bind` 5). `diagnostics` owns stderr tracing that `PI_OMLX_DEBUG` turns on. A warning the user sees without opting in is a different channel with a different trigger, and a delta for an existing capability carries no Purpose section, so folding it into `diagnostics` would widen that capability's stated scope without saying so. `provider-access` owns the provider id, `environment-configuration` owns where the environment comes from, and `test-isolation` and `verification` own the suite and the gate. The new capability is named for a durable behaviour rather than for this card.

No living requirement changes, so the delta carries no MODIFIED, REMOVED or RENAMED section. Eleanor found no startup-timing requirement or scenario anywhere under `openspec/specs/`, and nothing adjacent to the request becomes false when it leaves the startup path.

## Impact

- `index.ts`: the factory's awaited refresh, and the place a session-scoped warning is shown from. pi passes `ctx.ui` only to event handlers, so `session_start` is the first moment one is reachable (Chidi §3).
- `test/index.test.ts`: the tests that treat the factory's refresh as the awaited fetch, namely `settle()`'s contract, `fetches[0]`, and the poll test's expected request count (Michael, trap 6). `test/catalog.test.ts` is untouched.
- `README.md:12`, `ARCHITECTURE.md` §4 and §9: all three describe the wait the code no longer has. They land in the docs pass (Eleanor, `Tracked Markdown`; Michael, `Standing` 9).
- No dependency changes, and no change to `src/catalog.ts`.

## What This Change Does Not Do

- It does not change `POLL_INTERVAL_MS`, `BACKOFF_BASE_MS`, `BACKOFF_MAX_MS`, or the loop's shape (Joel's exclusion).
- It does not change which credential wins, and it does not make an unconfigured extension request a catalog.
- It does not remove `readLastCatalogCache`, move `CACHE_FILE`, or fix its capture at import; that is the seam card's (Michael's rulings 7 and 8).
- It does not remove `_setAuthPathForTesting` or add a test-only seam.
- It does not re-run pi's starting-model selection, and it does not switch the session's model on the user's behalf.
- It does not write pi's `auth.json`.
- It does not change the 2-second per-request timeout, only its role on the startup path.

## Open Questions

For the council and the design, not settled here:

1. Does the factory's refresh get deleted, letting the poll's first tick be the startup request, or do the two cooperate? Dropping the `await` alone leaves the factory's request running alongside the poll's immediate first tick, and the race then decides which registration and cache write wins (Michael, trap 1; he leans delete, and the interval and backoff stay either way).
2. Where does re-registration after a failed fetch live, now that the fallback at `index.ts:60` and the one at `:110` describe one behaviour in two homes (Michael, "Open for the council")?
3. What shape do the tests take? "Not delayed" needs a request that never resolves under fake timers, so the test is red on today's code and cannot pass by advancing past a timeout. The existing assumptions in `test/index.test.ts` get re-derived with it (Michael, traps 5 and 6).
4. How does the extension know a catalog arrived after startup, and does the warning come from `session_start`? pi's UI context exists only for event handlers, and it is a no-op where `hasUI` is false (Chidi §3).
5. Does `STARTUP_TIMEOUT_MS` keep its name once startup no longer waits (Michael, trap 6)? Its 2-second value is neither interval nor backoff, so nothing asks to change it.
