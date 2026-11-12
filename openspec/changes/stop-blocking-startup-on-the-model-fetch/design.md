# Design

## Context

One thing on pi's startup path waits for the catalog: the factory's awaited `refreshProvider` at `index.ts:57-60`. `registerCachedOrSetupModels` at `:56` is synchronous, and the poll starts at `:62-64` without being awaited. `proposal.md` carries the measurements; this design starts from the mechanism.

What the code holds today, as Eleanor's Addendum 2 numbers it:

- Per-instance `state` at `:33-40`, created per factory run at `:47-54`; a global singleton key at `:26` guarded at `:42-45` and deleted by the `session_shutdown` handler at `:92-95`, which also sets `state.stopped`.
- Handlers registered at `:66-90` (`model_select`, `before_provider_request`). There is no `session_start` handler (Eleanor, Addendum 3 §1).
- `registerCachedOrSetupModels()` at `:209-227` resolves the credential, reads the exact-URL cache, and registers either the cached models or the login-only provider.
- `refreshProvider` at `:231-242` returns `RefreshResult`, a three-noun union declared at `:229` and not exported; `fetchAndRegister` at `:251-286` awaits `fetchModels` (`:261-267`), catches (`:267-270`), returns `"failed"` for a response with no registrable model (`:272-281`), writes the cache (`:283`) and registers (`:284-285`).
- `fetchModels` accepts an `onDebug` hook and emits its `catalog_*` events through it, and `index.ts` never passes one, so the poll path traces nothing today (Michael, round-1 finding; measured: a refused-port startup fetch under `PI_OMLX_DEBUG=1` writes no line).
- The poll at `:98-115` fetches on its first iteration with no sleep, sleeps on success, and on any other result calls `registerCachedOrSetupModels` again (`:109-110`) before backing off.
- The fake pi in `test/index.test.ts:187-209` stores handlers and synthesises only `session_shutdown`; `driveExtension` begins at `:226`, `settle()` at `:213-215`, the `POLL_INTERVAL_MS` fixture at `:123`.

`CACHE_FILE` is captured at import (`src/catalog.ts:567`), so a test's fixture lives at the isolation root, not under the per-test agent directory (Michael, trap 4). pi's UI context reaches an extension only through an event handler, and `ctx.ui` is a getter that throws once the runner is replaced (Chidi, Addendum 3 §4).

The binding decisions are the four requirements in `specs/catalog-discovery/spec.md`, read with Joel's rulings in `owner-rulings.md` and Michael's in `council.md`.

## Goals / Non-Goals

**Goals:**

- The factory resolves without a catalog result: cached models or the login-only provider first, the request afterwards (requirement 1).
- A session that starts without a catalog keeps pi's choice of model, and the late models register under `omlx` (requirement 2).
- One warning per session, through `ctx.ui.notify`, worded as Joel ruled, and nothing on stderr for the user (requirement 3).
- A fetch that resolves after its session ended registers nothing, writes no cache and warns nobody (requirement 4).
- The notice decision, and the request that produced it, are traceable under `PI_OMLX_DEBUG` and silent without it.
- Each of those is proven by a test that fails without it, with `npm run check` green.

**Non-Goals:**

- The poll interval and backoff values, and when a tick fetches and sleeps.
- The credential rule, and the cases that make no request at all.
- `readLastCatalogCache`, the `CACHE_FILE` path, and the seam at `_setAuthPathForTesting`.
- The oauth callback's own await, and the AbortError rewrap in `src/catalog.ts:362-366` that makes a status timeout fall through to `/models`.
- Any `pi.setModel` call, and any re-run of pi's starting-model selection.
- User-facing stderr output: none is added. The notice is a UI channel, and stderr stays the `PI_OMLX_DEBUG` trace that `diagnostics` governs.
- The documentation, which is the docs pass's work after the implementation gate.
- The 2-second per-request timeout's value.

## Decisions

### D1: the poll's first tick is the startup request, and nothing chooses a model

Delete `index.ts:57-60` and keep `:56`. The scheduled refresh at `:102-104` becomes the session's first and only startup request, and the re-register after a failure has one home, `:109-110`. `startPolling` keeps starting in the factory at `:62`.

Deleting rather than detaching is Michael's ruling. Detaching the `await` leaves this request running alongside the poll's first tick, and the race decides which registration and cache write wins. Moving `startPolling` to `session_start` was considered and rejected: it moves when the first tick fires, and the loop's `sleep` already unrefs (`:295-300`), so nothing about startup needs it there.

Requirement 2 is satisfied by what this design does not add. The extension never calls `pi.setModel` and never asks pi to resolve a starting model again, so a session that starts login-only keeps whatever model pi chose, and the models that arrive later are the poll's registration under `omlx`. No code exists for that requirement beyond the registration the poll already performs; the tests pin the two negatives that keep it true.

### D2: the session's start shape is recorded once, in the factory

`state.startedLoginOnly` means "the credential was configured and the session started on the login-only provider". `registerCachedOrSetupModels` returns the credential it resolved, and the factory sets the flag from it at the `:56` call site:

```
state.startedLoginOnly = credential.configured && !state.registered;
```

The `:109-110` call site ignores the return. Setting the flag inside the helper instead would fire it on mid-session fallbacks, and after an unconfigured start that later logs in, the next successful poll would warn "late" spuriously, which is the defect Michael's C4 ruling names. Resolving the credential a second time in the factory to read `configured` would mean two resolutions for one session start.

The flag misses one window, and carries a one-line `shortcut:` comment naming it: a catalog that lands while a later extension's factory is still loading still warns "late", because factories load in sequence (Chidi §1). The upgrade, reading `ctx.model.provider` in `session_start`, is unverified and is not built.

### D3: the notice's URL travels with the result the poll receives

After D1, `refreshProvider` has one caller, the poll loop, so its return carries what the loop needs to word the notice: `{ result: RefreshResult; apiRoot: string | undefined }`, both taken from the single credential resolution inside it, which is the only place the URL is known. The loop keeps the two as locals and passes `apiRoot` to `catalogNotice`; nothing is stored on `state` for it.

Michael's C6 named four fields on `state`, and this design adds none beyond them. Three alternatives were weighed. A `state.apiRoot` field would keep the URL as long as the instance, which is longer than the message needs, and it would then need the risk note about outliving a resolution that did not set it. Putting the URL inside `RefreshResult` would add a value to the classification C3 fixes as three nouns. Reading it out of `state.lastError` would read a proxy whose text changes freely, which his provability rule forbids.

### D4: one pure rule decides the text, in `src/notice.ts`

```
catalogNotice(result: RefreshResult, startedLoginOnly: boolean, url: string | undefined, cachedCount: number): string | undefined
```

`RefreshResult` moves from `index.ts:229` into `src/notice.ts` and is exported there, with `index.ts` importing it. The union is the notice's input contract, so that is its home: left in the composition root, a `src/` module would either import upward into `index.ts` or redeclare the three nouns in a second place, and `index.ts` already imports this module.

A missing URL yields `undefined` by itself, so the call site needs no branch of its own and the `not_configured` row below is reachable as it stands.

It has no I/O and no state. Three named text builders produce the wording, and the results that need no warning get `undefined`:

| Text | When |
|---|---|
| `oMLX model list unavailable at <url>; using <n> cached models.` | `failed` with `cachedCount > 0` |
| `oMLX model list unavailable at <url>; using the login-only provider.` | `failed` with `cachedCount === 0` |
| `oMLX session started login-only; models from <url> are now available; choose one with /model.` | `registered` with `startedLoginOnly` |
| `undefined` | `not_configured`, or `registered` without `startedLoginOnly` |

The text names the URL and whether cached models or the login-only provider are in use, which is what Joel's ruling asks for; the late text also says the session started login-only and the models are now available, which is what the spec's scenario asserts.

`src/notice.ts` rather than `index.ts`, because `index.ts` is the composition root and this is user-facing policy, and because the wording can then be tested without a session. `src/catalog.ts` was rejected as a home: it is the HTTP and cache adapter, and the notice answers a different question.

### D5: the warning lives as long as the factory instance, and one edge flushes it

Four fields join the per-instance `state`, the four C6 named: `startedLoginOnly` (D2), `pendingNotice`, `warned` and `ui`. `ui` holds only `ctx.ui`, not the whole `ctx`.

One `showOnce(notice)` closure over `state`:

- no notice, or `state.warned` already true: the decision is `suppressed` and nothing is shown;
- no `state.ui` held yet: keep the notice in `state.pendingNotice`, and only when that is empty, so the first notice wins;
- otherwise: set `state.warned`, clear `state.pendingNotice`, call `state.ui.notify(notice, "warning")`, and the decision is `shown`.

First wins in both branches. Replacing a held notice was rejected twice over: it would give one session two rules for which notice it shows, and it is unreachable in pi, because `session_start` follows the factory by about 10 to 25 ms while the earliest second result is a backoff of at least 2 s away.

The poll calls it after the `:109-110` re-register and passes `state.catalog.length` as the cached count; that field is the only place the count lives, and after that fallback it holds the cached models or nothing. A `session_start` handler, registered beside `:66-90`, sets `state.ui = ctx.ui` and flushes `state.pendingNotice` through `showOnce`. That handler is idempotent, because RPC emits `session_start` twice on one instance after `new_session` (Chidi, Addendum 3 §1), and nothing resets `warned`: one factory instance is one session, since every session change runs `session_shutdown` and the factory again. `session_shutdown` at `:92-95` does not change; D6's guards stop anything from reaching `state.ui` afterwards.

Each decision also traces: one `catalog_notice` event through `omlxDebug` from `src/debug.ts`, carrying the decision (`shown`, `held` or `suppressed`) and never a key. What else it carries depends on the edge: at the poll it also carries the result and the URL, while at the `session_start` flush it carries the notice text instead, because `pendingNotice` holds a text and that text already names the URL and the shape in use. The request that fed it traces as well, because `fetchAndRegister` passes the adapter lambda `onDebug: (e) => omlxDebug(e.kind, e.details)` to `fetchModels`, so a failed load shows its status fall-through and its timeout through the events `src/catalog.ts` already emits. The lambda exists because `omlxDebug`'s `(event: string, data?)` signature is not assignable to `onDebug`'s `(event: CatalogDebugEvent) => void`.

Module-level state was rejected because the module is cached across sessions and tests, which makes it a second lifecycle home. Resetting `warned` on `session_start` was rejected because RPC's double emit would then warn twice. On `/reload` the factory runs again, so the new instance registers its own handler and holds its own `ui`; nothing is carried across.

The notice is computed only in the poll. The oauth callback's own fetch (`:126-134`) reports to the login dialog and produces none; that follows from D2, because an unconfigured session never sets `startedLoginOnly`.

### D6: a fetch that outlives its session changes nothing

Two reads of the flag that already exists, each placed at the side effect it guards:

- in `fetchAndRegister`, after the fetch completes and before `writeCatalogCache` and registration: `if (state.stopped) return "failed";`
- in the poll loop, after `await refreshProvider` and before the `:109-110` re-register and the notice: `if (state.stopped) break;`

They fire when `session_shutdown` (`:92-95`) has set `state.stopped`, which also gates the loop at `:101`. The first guard is not enough on its own, because the loop's fallback re-registers through `pi` after a non-`registered` result. The cache write is skipped for a reason of its own: a stale fetch for one URL landing after the next session resolved another would overwrite the single cache file with the wrong catalog.

A `try`/`catch` around the stale throw was rejected: it hides the cause, and the fake pi does not throw, so a test would not see it. Clearing `state.ui` on shutdown was rejected as unnecessary once these two guards hold.

### D7: no `hasUI` guard

The notice reaches the user only through `ctx.ui.notify`. pi's `noOpUIContext` is what print and JSON modes get, so a `hasUI` guard would change no observable behaviour in any mode and would exist only for a test fake. Stderr carries the trace D5 describes and nothing user-facing, and `openspec/specs/diagnostics/spec.md` keeps governing that channel.

### D8: the constant is renamed in its own step

`STARTUP_TIMEOUT_MS` becomes `CATALOG_TIMEOUT_MS`, and the 2-second value stays. After D1 its only use is the poll's request. The step is structure only: no behavioural difference, and the suite is green before and after it, so it lands as its own commit rather than riding with a behaviour. Keeping the old name was rejected because after D1 it names something that no longer exists, and the next reader would look for a startup wait that is gone.

### D9: test mechanism

- The fake pi in `test/index.test.ts` gains dispatch for `session_start` and recorders for `notify` and `setModel` calls, and `recordCatalogFetches`'s `respond` widens to `() => Response | Promise<Response>` so a test can hold a response open across a shutdown. That is test scaffolding for pi's contract, in the test file only; a production hook for the tests was rejected by Joel's carried ruling that code must not exist for tests.
- Cache fixtures are written, read and removed at the isolation-root path (`<isolation root>/agent/cache/omlx-models.json`), because `CACHE_FILE` is captured at import. Every existing successful-fetch test already writes that file, so each new cached or cache-less test sets or removes it, and no test depends on order.
- `catalogNotice` gets its own test file, `test/notice.test.ts`, walking D4's table row by row, because the wording is policy and needs no session. The wiring's tests then assert that a notice reached `notify` once, not what it said.
- "Does not wait" is proven with a fetch that never resolves under `vi.useFakeTimers()`, and the timers are never advanced.
- `settle()`, the `fetches[0]` assumption and the poll test's request count are re-derived for a single startup tick, since the request they observe is now the poll's first.
- The stderr and console spies `driveExtension` restores are the observer for the trace: one test with `PI_OMLX_DEBUG` set asserts the `catalog_notice` line and the request's events, and the same scenario with the flag unset asserts an empty stderr.

## Red And Green Steps

| Behaviour | Red step (on today's code) | Green step |
|---|---|---|
| Startup never waits, with a cache | A cache fixture plus a fetch that never resolves under fake timers: `await extension(pi)` never settles, so the test times out | The factory resolves with the cached models registered, the clock unmoved, and exactly one request recorded |
| Startup never waits, with no cache | Same shape: the factory never settles | The factory resolves with the login-only provider registered, the clock unmoved, one request recorded |
| The request still runs, registers and caches | None. It holds today, and the change must keep it green; the mutations that redden it are deleting the poll's first tick and removing the `writeCatalogCache` call | The existing success tests, re-derived, observe the poll's first tick and still see registration; the cache write gets its own assertion, because no test reads that file today |
| A session stays as pi left it | None on today's code, since nothing calls `setModel` and registration already happens under `omlx`. The mutations that redden the two pins are a `setModel` call, and a registration path that skips late models | The extension makes no `setModel` call after a late registration, and `registerProvider` is called with `omlx` and the fetched models |
| One warning on a failed load | Red: nothing in the extension ever notifies, so every warning assertion fails | One notify with the URL and the cached count when a cache is registered; with the URL and the login-only provider when it is not; a response with nothing registrable counts as a failure and writes no cache |
| One warning on a late catalog | Red, as above | One notify naming the URL, the login-only start and the models now available; a warm cache and an unconfigured credential produce none; a later success adds no second |
| A fetch that outlives its session | Red: shut down with a fetch pending and resolve it, and today's continuation registers through `pi` and writes the cache, both recorded by the fake | After the shutdown no `registerProvider` call follows, the cache file is unchanged, and no notify fires |
| The notice decision is traceable | Red: the poll path writes nothing under `PI_OMLX_DEBUG` today | Under the flag the `catalog_notice` line names the result, the decision and the URL, and the request's `catalog_*` events appear; with the flag unset, stderr stays empty |

The two "none" rows are pins, not red steps: they hold on both sides of the change, and each is paired in the table with the mutation that reddens it, so the gate can show it catching a mistake. Everything the extension cannot observe stays untested here: pi's own model selection, its picker and its fallback to another provider are pi's behaviour, and the spec's scenarios for them were written as extension actions for that reason.

## What The Implementation Gate Covers

The implementation gate in `michael-the-architect.md` holds the diff and `tasks.md` to this design, the specs and Derek's standards. Concretely, for this change:

- **Contract adherence.** Every change in the diff maps to a task in `tasks.md`, and every ticked box matches code that exists.
- **Mechanism.** The list this design authorises is closed: the deletion of `:57-60`; `state.startedLoginOnly`, `state.pendingNotice`, `state.warned`, `state.ui`; the `showOnce` closure; the `session_start` handler; the `registerCachedOrSetupModels` return value; `refreshProvider`'s return carrying the result and the URL (D3); `src/notice.ts` with `catalogNotice`, its three text builders, and `RefreshResult` moved there and exported, with `index.ts` importing it; the `catalog_notice` event through `src/debug.ts`'s `omlxDebug`, and the adapter lambda `onDebug: (e) => omlxDebug(e.kind, e.details)` passed to `fetchModels`; the two `stopped` guards; the rename. Anything else in the diff goes back through the design gate.
- **Tests.** Assertions are behavioral and sit at the extension's boundary. The fake pi stands in for pi's contract and is never the thing under test; `catalogNotice` is tested through its return value, not its internals; the "does not wait" test is re-run with D1 reverted by hand to show it red. No edited expectation, no production branch or parameter for a test, no weakened or skipped assertion.
- **Mechanical.** `npm run check` (Biome, `tsc --noEmit`, the whole suite), and the suppression search `git grep -nE '@ts-ignore|@ts-expect-error|@ts-nocheck|biome-ignore' -- ':!*.md'` that `openspec/specs/verification/spec.md` requires.
- **Observability.** The gap the Context records is what this change closes: with `PI_OMLX_DEBUG` set, a session's poll fetch emits the `catalog_*` events and its notice decision emits `catalog_notice`; with the flag unset, stderr is empty. A line without the flag, or a notice with no `catalog_notice` behind it, is a finding.
- **Shape.** Each new `state` field has the consumer named in D2 and D5; no field is written twice for one fact; no Markdown file other than `tasks.md` appears in the diff.
- **Not covered here.** pi's own selection behaviour, which this suite cannot observe; a live `pi` run against a real server; and the documentation below, which the docs pass writes after this gate.

## The Docs Pass

After the implementation gate, by Bambadjan, not as implementation tasks.

- `README.md:12`: "without blocking Pi startup" becomes true. The sentence stays, and the no-cache behaviour named under Risks is stated next to it.
- `ARCHITECTURE.md` §4: it currently says the cache registers before the live fetch while startup still waits, with requests bounded at two seconds. The wait goes, the 2-second per-request bound and the cache-before-fetch order stay, and the poll's first tick becomes the request.
- `ARCHITECTURE.md` §9: the planned "remove the startup wait" item is done, so it is removed or marked done.
- `docs/CONFIGURATION.md`: gains what a reader needs about the behaviour. A cache-less start covers a first run and any `/login` to a new base URL, because the cache is keyed by the resolved URL. A successful fetch writes the cache and the next start uses it. The extension shows one warning per session when the list fails to load or lands late, and the doc quotes what it says. The warning is a UI notice, so `-p` and JSON runs show none. With no cache, `pi --list-models` lists no oMLX models until a session has written the cache.

`AGENTS.md` takes no change from this work: the change adds no command, convention or trap it does not already carry.

## Risks / Trade-offs

- **[Risk]** A saved default `omlx` model is not selected on a session that starts without a cache, so the user notices a different provider's model. → Mitigation: Joel accepted it in `owner-rulings.md`, the warning names the URL and the shape in use, and the docs pass documents it.
- **[Risk]** `pi --list-models` with no cache lists no oMLX models, where the awaited fetch used to win the race. → Mitigation: it follows from Joel's ruling in `owner-rulings.md` §"No-cache startup does not wait" ("startup never waits on the model fetch, cached or not"), a session that runs once writes the cache, and the docs pass states it.
- **[Risk]** A catalog that lands while a later extension's factory is still loading warns "late" although the session already had it. → Mitigation: the `shortcut:` comment names the window and the unverified upgrade; the window is narrow and needs a slow later factory.
- **[Risk]** The warning is invisible in `-p` and JSON runs, because pi's UI is a no-op there. → Mitigation: documented in `docs/CONFIGURATION.md`; the stderr channel stays reserved for `PI_OMLX_DEBUG` traces, which `diagnostics` governs.
- **[Risk]** The `stopped` guards are flag reads, not locks, and one of them is ahead of a cache write. → Mitigation: both sit in the only two functions that touch the provider or the cache, and `session_shutdown` is the only writer of the flag.
- **[Risk]** A fetch that fails after its session ended still records `state.lastError` on the dead instance. → Accepted: the state dies with the instance, and nothing reads it after shutdown.
- **[Trade-off]** One warning per session means a session whose first failure is followed by a second, different failure says nothing about the second. → Accepted: Joel ruled one per session, and the first is the one that explains the state the user is in.

## Migration Plan

No persisted data moves. The cache file's path, shape and key stay as they are, so nothing needs converting and an existing cache keeps working. The change ships in the next package release with no flag and no environment variable: a flag would leave the silent wait reachable, which is the thing Joel ruled out. Rollback is reverting the commit: the awaited refresh comes back, the notice and the two guards go with it, and no state has to be unwound. Within the work, the behaviour steps land with the suite green, and the rename (D8) lands last on its own, with no behavioural diff.

## Open Questions

1. Can `session_start`'s `ctx.model.provider` distinguish the sequential-loader window D2 describes? Chidi did not test it. Nothing depends on it: the `shortcut:` comment names the upgrade, and a positive answer would only narrow the false warning.
2. Should `pi`'s `/new` picking up the default `omlx` model from the cache deserve its own line as the recovery path after a cache-less start? The docs pass decides, and no behaviour changes either way.
