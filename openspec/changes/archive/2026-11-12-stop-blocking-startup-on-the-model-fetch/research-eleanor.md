# Eleanor reconnaissance — stop blocking startup on the model fetch

Repository `/Users/joelleibow/Projects/pi-omlx`, HEAD `3f8d06a5f898d7a48cde3837f4cf1cfdd34a672b`. This consolidates the prior research report and Addendum 1, with Addendum 2 correcting `index.ts` / `test/index.test.ts` references after re-reading those files and checking exact numbers with `rg -n` and numbered reads.

## Binding context and required material

- `AGENTS.md` read; no root `CLAUDE.md` found. It describes commands/conventions and notes `readLastCatalogCache` has no callers.
- `ARCHITECTURE.md` read in full. §4 says cached models register before live fetch, but startup still waits and requests are bounded at two seconds; §9 lists removing startup wait as planned.
- `openspec/changes/stop-blocking-startup-on-the-model-fetch/owner-rulings.md` read. Acceptance: with cache, unreachable server must not delay startup; no-cache behavior must be deliberate, documented and tested; poll interval/backoff out of scope.
- ADR `docs/adr/0001-one-credential-decides-the-omlx-connection.md` read. Saved credential wins, otherwise env URL+key; empty saved key is keyless; URL alone is unconfigured.
- `package.json` read: TypeScript ESM, Node >=22; `npm run check` runs Biome, `tsc --noEmit`, Vitest. Other build configs were not fully read.

## Startup flow (`index.ts` — line references checked for Addendum 2)

- `index.ts:28-31`: `STARTUP_TIMEOUT_MS=2_000`, `POLL_INTERVAL_MS=10*60*1000`, backoff base 2 seconds and max 60 seconds.
- `:42-54`: async factory checks/sets singleton and initializes state. `:56` synchronously calls `registerCachedOrSetupModels` before any network request. That resolves credential, reads cache for exact `apiRoot`, filters to models with positive numeric `contextWindow` and `maxTokens` (`:181-195`), and registers eligible cache; otherwise it registers login-only provider (`:201-227`).
- `:57-60`: factory awaits `refreshProvider(...timeoutMs: STARTUP_TIMEOUT_MS)` and re-registers cached/setup provider if result was not `registered`. `refreshProvider` at `:231-242` returns not-configured without fetching, otherwise awaits `fetchAndRegister`; `fetchAndRegister` at `:251-286` awaits `fetchModels` (`:261-267`), catches errors (`:267-270`), and on valid live models writes cache then registers (`:283-285`).
- `:62-64`: after initial await, starts polling without awaiting it and stores unexpected rejection in `lastError`; event handlers are attached at `:66-95`. Thus the factory's awaited refresh is the startup blocking edge; timeout limits each HTTP request, not necessarily aggregate flow.
- `startPolling` is `:98-115`: each loop awaits refresh at `:102-104`; success sleeps ten minutes (`:106-108`); failure re-registers cache/login-only at `:109-110`, then sleeps backoff and increases it (`:111-112`). `sleep` is `:295-300`, using an unref'ed timer.
- OAuth flow is defined by `buildOmlxOauth` at `:123-140`; its login callback awaits `fetchAndRegister` at `:126-134`. That interactive login await is distinct and intentionally remains synchronous.

## Catalog requests and cache (`src/catalog.ts`) — corrected in Addendum 1

- Default timeout `:179`; `fetchModels` `:181-255`. First GET `/models/status` at `:194-200`; status parse/settings/limit handling at `:201-225`.
- `getJson` catches fetch AbortError and throws a new ordinary `Error` (`:350-367`, particularly `:362-366`). `fetchModels` catches at `:226-236` and rethrows only if error name remains `AbortError` (`:227`). Because the timeout has become a plain `Error`, it logs `catalog_status_failed` and falls through (`:228-235`) to `/models` at `:238-243`, which has an independent timeout. A status timeout therefore does fall through to `/models`; if that request hangs, it times out too. My first report's statement to the contrary was wrong.
- For successful fallback, local settings are applied from `:249` onward. `applyApiGlobalDefaultsIfNeeded` starts at `:279`, only requests defaults if model limits are missing (`:284-285`), and swallows non-parent-abort errors (`:287-313`). `fetchGlobalDefaults` begins `:322`; timeout signal setup at `:377-390`; empty API key omits Authorization at `:357-358`.
- Cache path `CACHE_FILE` is `:567`; URL-specific `readCatalogCache` `:575-578`; unkeyed `readLastCatalogCache` `:580-582` (no callers); read/parse/array validation `:586-592`; best-effort write `:596-603` to module-captured file. Usable cached models require an exact URL match and at least one model with positive numeric limits (`index.ts:190-195`).

## Relevant tests (line references checked for Addendum 2)

- `test/index.test.ts:35-45` per-test setup and `:47-51` cleanup; test extension singleton/auth seam handling. `settle()` is `:213-215`; comment describes settling the poll's immediate first refresh. `driveExtension` begins `:226`, uses env and mocked fetch, fake Pi and fake timers (`:232-245` and subsequent cleanup).
- Startup/factory wiring examples include stored credential test `test/index.test.ts:271-283`, login-only case `:338-344`, and other cases through `:514`. These test credential selection and registration, not startup duration or resolving before fetch. Poll tests: primary stored-credential poll `:346-361`, keyless poll `:401-414`; `POLL_INTERVAL_MS` fixture constant is `:123`.
- `test/catalog.test.ts:559-579` (`fetchModels times out`) simulates fetch rejection with `AbortError` on signal and asserts timeout rejection text. It does not assert fallback URL/call count/debug event; there is no dedicated status-timeout-fallback test. Ordinary status-failure fallback is tested separately.
- No test in the named suites directly covers cached startup with failed fetch / no-cache startup timing.

## Tracked Markdown and living specs

- `README.md:12` says auto discovery occurs “without blocking Pi startup”; this conflicts with the current awaited factory.
- `ARCHITECTURE.md:37`, §4, §9 describe entry responsibilities, cache-before-fetch but still waiting on fetch, and wait removal as planned.
- No startup/blocking/discovery timing claim found in `docs/CONFIGURATION.md`; it discusses credentials, env, metadata overlay and stream timeout.
- No startup timing requirement/scenario found in living `openspec/specs/*.md`; `credential-resolution/spec.md` discusses poll credential selection, while verification concerns gates/isolation.

## Raw Pi timing experiment

Scratch `/Users/joelleibow/Projects/pi-omlx/.pi/marbleization/stop-blocking-startup-on-the-model-fetch/scratch-eleanor/`. Installed with `HOME=<scratch>/home PI_CODING_AGENT_DIR=<scratch>/agent pi install /Users/joelleibow/Projects/pi-omlx --no-approve`. URL was stored only in scratch `auth.json`, no URL/key env. Matching cache fixture at `<scratch>/agent/cache/omlx-models.json` had a model with positive limits. Command form: `HOME="$S/home" PI_CODING_AGENT_DIR="$S/agent" /usr/bin/time -p pi --list-models >/dev/null`; cache toggled by file presence; refused URL was `http://127.0.0.1:1/v1`.

| Case | Three wall times (seconds) | exit codes |
|---|---|---|
| No package (`pi --no-extensions --list-models`) | 0.12, 0.11, 0.11 | 0, 0, 0 |
| Installed package, unreachable `http://10.255.255.1:8000/v1`, matching cache | 4.15, 4.15, 4.16 | 0, 0, 0 |
| Same unreachable URL, no cache | 4.16, 4.16, 4.16 | 0, 0, 0 |
| Refused local port | 0.13, 0.13, 0.13 | 0, 0, 0 |

Timings are raw. Michael's orientation separately reports ~4010ms in factory timing against a TCP server accepting but not answering. Cache did not shorten elapsed time because it was registered synchronously before the awaited factory refresh. Michael traced the two timeouts at ~2006 and ~4009ms. Pi-specific outer timing stages were not isolated.

## Baseline, status, structure, feature path

- Bare `npm run check` at HEAD `3f8d06a5f898d7a48cde3837f4cf1cfdd34a672b`: passed; Biome 37 files, TypeScript passed, Vitest 11 files / 94 tests; real 0.89s.
- Last observed status: `?? .pi/` and `?? openspec/changes/stop-blocking-startup-on-the-model-fetch/`; run artifacts/change folder untracked; no tracked source/config changed.
- Directories: `src/`, `test/`, `test/isolation/`, `docs/`, `docs/adr/`, `docs/architecture/`, `openspec/specs/`, `openspec/changes/`, `openspec/changes/archive/`, `scripts/`, `.pi/`.
- Relevant files: `index.ts`, `src/catalog.ts`, `src/config.ts`, `src/auth-storage.ts`, `src/provider.ts`, `test/index.test.ts`, `test/catalog.test.ts`, `README.md`, `ARCHITECTURE.md`, `docs/CONFIGURATION.md`, `openspec/specs/credential-resolution/spec.md`, target `owner-rulings.md`.
- Feature path: Pi invokes factory (`index.ts:42`) → synchronous cached/setup registration (`:56`, helper `:209-227`) → awaited `refreshProvider` (`:57`, helper `:231-242`) → `fetchAndRegister` (`:251-286`) → `fetchModels` (status, fallback, possible defaults) → cache write/register → fallback cached/login-only registration → start poll (`:62`, loop `:98-115`). Blocking edge is `:57`.

## Unknowns

- Chidi was assigned direct Pi-specific explanation for `--list-models` timings; Michael's source trace accounts for extension's ~4 seconds as sequential timeouts.
- No request trace or Pi startup-stage instrumentation collected.
- No-cache failure user-visible behavior is not settled by inspected source; implementation records error and registers login-only provider.

## Addendum 1

Re-read `fetchModels`, `getJson`, timeout/abort handling and tests. Correct behavior: `getJson` wraps AbortError into plain Error at `src/catalog.ts:362-366`; check at `:227` therefore does not match; status failure is logged at `:228-235` and falls through to `/models` at `:238-243`. A TCP server that accepted and never replied reproduced this with timeout 100ms: output showed `catalog_status_failed` at ~103ms for `/models/status`, final `/models` timeout and total ~205ms. Existing `test/catalog.test.ts:559-579` asserts timeout text only, not fallback or debug event.

## Addendum 2

Re-read `index.ts` and `test/index.test.ts`; checked line references with `rg -n` and `nl -ba`. The corrected `Startup flow` and `Relevant tests` sections above replace stale indexes. Specifically, changed index references include:

- timeout/poll/backoff constants: old `:20-24` → `:28-31`;
- factory start/state initialization: old `:36-50` → `:42-54`;
- synchronous cache/setup registration: old `:52` → `:56`;
- awaited refresh and fallback re-registration: old `:53-55` / `:56` → `:57-60`;
- poll invocation: old `:58-60` → `:62-64`; event handlers now `:66-95`;
- poll loop: old `:64-82` → `:98-115`, with refresh at `:102-104` and re-registration at `:109-110`;
- OAuth builder/login callback: old `:85-101` → builder `:123-140`, callback await `:126-134`;
- cache/setup helper: old helper refs `:95-116` / `:146-169` → `:209-227`; refresh helper `:173-185` → `:231-242`; fetch helper old `:198-227` → `:251-286`;
- model filtering old `:120-134` → `:181-195`; sleep old `:286-290` → `:295-300`.

Test references corrected/confirmed: setup hooks are `test/index.test.ts:35-51`; `settle` is `:213-215`; `driveExtension` begins `:226`; stored credential wiring test `:271-283`; no-credential test `:338-344`; poll test `:346-361`; keyless poll test `:401-414`; test poll constant `:123`. These line numbers were checked against the current file, not inferred from memory.

## Eleanor — Addendum 3: startup lifecycle and provider refresh

Bounded reconnaissance, with file:line for each code/spec claim. Paths below are repository-relative to `/Users/joelleibow/Projects/pi-omlx`.

## 1. Factory singleton, state, and lifecycle events

- `index.ts:42-45`: the default async factory reads a global symbol `EXTENSION_SINGLETON_KEY` (`:26`). If truthy, it immediately returns; otherwise it sets the symbol before creating state. A second factory invocation while the first extension instance is active therefore does not create another state, register providers, start another poll, or register event handlers (`:42-46`).
- State fields are declared at `index.ts:33-40`, initialized at `:47-54`: `catalog: []`, `registered: false`, `stopped: false`, `lastError: undefined`, `lastRefreshAt: undefined`, `modelSettingsPath: undefined`. Successful provider registration updates catalog/registered/error/time/settings at `:168-172`; login-only/cache-miss setup clears catalog and registered, sets error/time, clears settings at `:214-221`. Refresh failures set `lastError` at `:238`, `:268`, or `:276-280`.
- Factory registers `model_select` and `before_provider_request` handlers at `index.ts:66-90`; there is **no `session_start` handler** in this file. Those handlers trace model selection/request and apply thinking controls to OMLX requests (`:66-90`). Thus no behavior occurs here on `session_start`.
- `session_shutdown` handler at `index.ts:92-95` sets that instance's `state.stopped = true` and deletes the global singleton key. The polling loop checks `!state.stopped` at `:101`; its `sleep` uses an unref'ed timer (`:295-300`). A subsequent factory invocation after shutdown can pass the guard and create a new instance. A second invocation before shutdown returns at the guard and does not attach to the existing instance.

## 2. Refresh outcomes and cache writes

- `RefreshResult` is exactly `"registered" | "not_configured" | "failed"` (`index.ts:229`). `refreshProvider` (`:231-242`) resolves the credential. If unconfigured it sets `lastError` and returns `not_configured` (`:236-240`); if configured, it returns the `fetchAndRegister` result (`:241`).
- `fetchAndRegister` (`index.ts:251-286`) awaits `fetchModels` (`:261-267`). A thrown fetch/parse/timeout error sets its message in `state.lastError` and returns `failed` (`:267-270`). If the call yields zero registrable models, it sets a missing-limits or empty-catalog message and returns `failed` (`:272-281`). It filters registrable models by positive numeric contextWindow/maxTokens (`:181-188`). Only after at least one such model exists does it call `writeCatalogCache(credential.apiRoot, registrable)` (`:283`), then register models and return `registered` (`:284-285`). Thus cache writes are skipped for unconfigured credentials, any rejected/failed fetch, empty catalog, or catalog with no model meeting limits; write itself is best effort in `src/catalog.ts:596-603`.
- The factory's `:60` re-registers cached/setup models after an initial result other than `registered` (`:57-60`): refresh may have failed or been unconfigured, so it restores eligible cached models if any, otherwise resets to login-only provider. `startPolling` has the corresponding `:110` branch after each failed/not-configured result (`:98-113`), re-applying current credential/cache state after refresh did not register new live models. `registerCachedOrSetupModels` resolves credential, reads exact-URL cache and decides cached model registration vs login-only (`:209-227`). These re-register calls do not fetch or write catalog cache themselves.

## 3. Fake Pi and test teardown

- `fakePi()` is `test/index.test.ts:187-209`. Its `pi.on(event, handler)` only stores callback in a `Map` (`:193-194`); provider calls are recorded, and `getThinkingLevel` returns `"off"` (`:190-201`). Its returned `shutdown()` invokes only the stored `session_shutdown` callback (`:207-208`). It does not synthesize `session_start`, nor provide `ctx` or `ctx.ui`; the handler map is typed as callbacks with no arguments (`:189`).
- The separate simple fake in the first `/login` test also stores handlers, but only invokes `session_shutdown` on teardown (`test/index.test.ts:53-103`).
- Test hooks clear global singleton before each test (`test/index.test.ts:41-46`) and after each test (`:47-52`); afterEach also resets the auth-path seam and removes the temporary directory. `driveExtension` calls `fake.shutdown()` during its `finally` and restores fake timers, stderr spy, fetch, and env (`:226-...`, check its continuation through the remainder of the function). This shutdown sets stopped/deletes singleton through production event callback; hooks additionally delete singleton directly for isolation.

## 4. Diagnostics spec requirement

`openspec/specs/diagnostics/spec.md:8-10` requires stderr tracing only when the current `PI_OMLX_DEBUG` predicate (`src/debug.ts:18`) holds; emitted lines must have `[pi-omlx]`, and the extension must neither read `PI_OMLX_PICKER_DEBUG` nor emit `[pi-omlx-picker]`. Scenarios at `:12-31` require no diagnostics when variable is unset, preserve existing predicate outcomes for empty string and `0`, and enforce the prefix/no-old-prefix. This spec speaks to stderr diagnostics, not user notifications or lifecycle handlers.

## Boundary

This report answers the Eleanor questions only. Chidi's pi 1.5.2 lifecycle, initial model selection, `ctx.ui.notify` mode behavior, and retained-context questions require his separate runtime research; no claim is made here about them.
