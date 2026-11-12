# Eleanor reconnaissance — stop blocking startup on the model fetch

Repository: `/Users/joelleibow/Projects/pi-omlx` at `3f8d06a5f898d7a48cde3837f4cf1cfdd34a672b` (`stop-blocking-startup-on-the-model-fetch`). Search boundary: repository tracked working tree, especially entry point, `src/catalog.ts`, tests, user docs and living OpenSpec specs. This is evidence/map only, not a design judgment.

## Binding context and required material

- `AGENTS.md` read: repo commands/conventions and relevant traps; no `CLAUDE.md` was found in root listing.
- `ARCHITECTURE.md` read in full. §4 says cache models register before live fetch, but startup still waits, requests bounded at two seconds; §9 lists removal of startup wait as planned.
- `openspec/changes/stop-blocking-startup-on-the-model-fetch/owner-rulings.md` read. Must-fix is startup waiting without indication; acceptance: cached models + unreachable server must not delay startup; no-cache behavior must be deliberate/documented and tested; poll interval/backoff out of scope.
- ADRs: `docs/adr/0001-one-credential-decides-the-omlx-connection.md` read in full. Accepted decision: saved credential wins, otherwise env URL+key; empty saved key is keyless; URL alone is unconfigured. Relevant because target and cache selection use this resolver. No other ADR path found.
- Build/language config: `package.json` read. TypeScript ESM, Node >=22. `npm run check` is Biome, `tsc --noEmit`, then Vitest. `tsconfig.json`, `vitest.config.ts`, `biome.json`, lockfile also exist, not read in full.
- Binding destination and scope: `openspec/changes/stop-blocking-startup-on-the-model-fetch/` with living specs in `openspec/specs/`; archived changes are historical. The owner ruling was read.

## Startup flow (`index.ts`)

- `index.ts:20-24`: `STARTUP_TIMEOUT_MS=2_000`; poll 10 minutes; retry backoff base 2 seconds, max 60 seconds.
- `index.ts:36-37`: async factory returns `Promise<void>`. `:38-39` checks global singleton and returns immediately if already loaded; `:40` sets singleton. `:42-50` creates state.
- `:52` calls `registerCachedOrSetupModels` synchronously before any network request. This resolves credential, reads the cache for that exact `apiRoot`, filters to models with positive numeric `contextWindow` and `maxTokens`, and registers those models. If no credential or no eligible cached model, it registers a login-only provider instead. (`:146-169`, `:95-116`.)
- `:53-55`: factory awaits `refreshProvider(...timeoutMs: STARTUP_TIMEOUT_MS)`. It resolves credential and if configured awaits `fetchAndRegister`; otherwise resolves `not_configured` without fetch (`:173-185`). `fetchAndRegister` awaits `fetchModels` (`:198-204`); errors are caught and returned as `failed` (`:205-207`). On valid live models it writes the cache then registers (`:216-227`).
- `:56`: if live refresh did not register (including failed/unconfigured), it synchronously invokes cached/setup registration again. Thus there are two registration opportunities: early cache/login-only, then successful live registration or fallback re-registration after the awaited fetch.
- `:58-60`: starts poll asynchronously (`void startPolling(...).catch(...)`), stores unexpected rejection in `lastError`. `:62-91` attaches event handlers; factory resolves after they are wired. Those operations themselves do not await network.
- Therefore the factory's single direct await waits for initial refresh and, transitively, live catalog requests—not merely cache lookup. Startup timeout is per HTTP request in `fetchModels` (`src/catalog.ts:91-99`, `:265-288`), not a total wall-clock budget. Initial refresh may do sequential requests, fallback requests, and global settings retrieval.
- Polling `index.ts:64-82`: each loop awaits refresh with same timeout; success sleeps 10 minutes, failure/login-only branch refreshes registration then sleeps backoff and doubles it up to 60 sec. `sleep` (`:286-290`) uses unref'ed timer. Out of-scope polling cadence/backoff is as specified by owner.
- OAuth `/login` path `index.ts:85-101`, `:189-227`: interactive login awaits fetch/register before returning success, so this fetch is intentionally synchronous with login and distinct from factory startup.

## Catalog requests/cache (`src/catalog.ts`)

- `fetchModels` lines `91-160`; default timeout 15 seconds (`:89`), overridden at startup/poll to 2 seconds. First GET `${apiRoot}/models/status` (`:105-110`). If this succeeds, parse status, overlay local settings, and resolve architecture/global limits. If it fails other than AbortError, logs debug and falls through to `/models` (`:125-139`). AbortError becomes `GET ... timed out after ...` in `getJson` (`:265-277`) and is rethrown, so timeout does **not** use `/models` fallback.
- `/models` fallback has its own timeout (`:132-136`). `applyApiGlobalDefaultsIfNeeded` (`:184-221`) makes no request when all models have context/max-token values. Otherwise fetches `/admin/api/global-settings`, timeout applied independently; errors other than parent abort are swallowed and models retained. The base URL strips `/v1` (`:229-254`). If status is rejected quickly and models/global settings are missing data, these requests can be sequential, not a single aggregate 2-second limit. Empty API key omits Authorization (`:257-264`).
- Cache path is module-captured: `CACHE_FILE = join(getAgentDir(), "cache", "omlx-models.json")` (`:567`). `readCatalogCache(apiRoot)` (`:575-578`) reads JSON and returns models only if cached `apiRoot` exactly equals selected apiRoot; parse/read errors or invalid models array mean miss (`:586-592`). `readLastCatalogCache` (`:580-582`) returns last models without URL check; `AGENTS.md` confirms it currently has no callers. `writeCatalogCache` (`:596-603`) best-effort creates `<agentDir>/cache` and stores `{apiRoot,models,savedAt:Date.now()}` at captured cache filename; errors ignored.
- “Cached models” usable at startup means cache exists for current URL and `models` include at least one entry with positive numeric context window and max tokens. The actual cache read does not validate each entry; entry filters in `index.ts:120-134`. Models without these limits are excluded; if none remain, login-only registration occurs and live discovery is awaited.

## Relevant tests

- `test/index.test.ts` read. Test harness uses temp directory, test auth-file seam, a mocked `fetch`, fake Pi API calls, and `vi.useFakeTimers()` in `driveExtension` (`:20-30`, `:104-178`). `settle()` drains 20 microtasks to settle the poll's immediate refresh (`:99-103`). URL/auth/status responses are deterministic; none of these tests exercise startup timeout against a real Pi process.
- Startup/factory coverage: several tests call `driveExtension` / `await extension`, checking selected credential, initial fetch and provider registration (roughly `:202-388`). These prove credential and registration wiring, not startup duration. No explicit test currently asserts that the factory settles before fetch resolves / rejects, or directly covers cached fallback/startup blocking.
- Polling test `test/index.test.ts:269-286` advances fake clock by `POLL_INTERVAL_MS` (10 min) and proves one refetch uses stored credential. Other keyless steady poll test proves unregister/register behavior. No polling timing/backoff assertion relates to the requested startup behavior.
- `test/catalog.test.ts` read. Its fetch tests replace `globalThis.fetch`, return synthetic `Response`s, and restore it (`:157-...`). Tests prove status preferred, keyless no auth header, `/models/status` failure fallback to `/models`, subsequent global settings URL/values, model settings behavior, and a synthetic abort-based timeout. `fetchModels times out` uses 25ms timeout and fake fetch listens to supplied signal; it tests timeout formatting, not real network duration.
- Cache startup behavior is not tested in either named file as currently read. `test/index.test.ts` writes auth fixture; it does not set up cache fixture or assert cache registration before/during failed fetch.

## Tracked Markdown / living specs timing statements

- `README.md:12`: feature says auto discovery “without blocking Pi startup.” This conflicts with observed awaited factory and architecture text.
- `ARCHITECTURE.md:37`: entry point registers provider, starts catalog poll, decides fetch/register/fallback. §4: cache models registered before live fetch, startup still waits on fetch, requests bounded two seconds; poll afterwards. §9: removing startup wait is planned.
- `docs/CONFIGURATION.md`: no startup/blocking/discovery timing claim found. It documents login/credentials, environment, metadata overlay and stream timeout only.
- Search of all living `openspec/specs/*.md`: no requirement or scenario describing startup waiting or catalog discovery timing found. There are credential/poll references (e.g. `credential-resolution/spec.md` poll scenario), but not startup-blocking behavior. `verification/spec.md` covers checks and test isolation, not runtime startup.

## Raw Pi timing experiment

Scratch: `/Users/joelleibow/Projects/pi-omlx/.pi/marbleization/stop-blocking-startup-on-the-model-fetch/scratch-eleanor/`. Installed extension by running `HOME=<scratch>/home PI_CODING_AGENT_DIR=<scratch>/agent pi install /Users/joelleibow/Projects/pi-omlx --no-approve` (local path; successful). URL supplied via `auth.json` in scratch agent directory as stored keyless OAuth credential; no environment URL/key was set. Cache fixture path was `<scratch>/agent/cache/omlx-models.json`, with matching apiRoot and model containing positive limits. Every timing invocation used `HOME` and `PI_CODING_AGENT_DIR` in the same command. `/usr/bin/time -p pi --list-models` (output redirected `/dev/null`); exit code reported separately.

| Case | Three real seconds | exit codes |
|---|---|---|
| No extension package (`pi --no-extensions --list-models`) | 0.12, 0.11, 0.11 | 0, 0, 0 |
| Installed extension, unreachable `http://10.255.255.1:8000/v1`, matching cache file | 4.15, 4.15, 4.16 | 0, 0, 0 |
| Same unreachable URL, cache file removed | 4.16, 4.16, 4.16 | 0, 0, 0 |
| Refused local port `http://127.0.0.1:1/v1` | 0.13, 0.13, 0.13 | 0, 0, 0 |

Exact underlying command form for package cases: `HOME="$S/home" PI_CODING_AGENT_DIR="$S/agent" /usr/bin/time -p pi --list-models >/dev/null`; unreachable URL case set in scratch `auth.json`; cache toggled by presence/removal of matching `omlx-models.json`; refused port swapped auth URL to `http://127.0.0.1:1/v1`. No request was made by no-package case. Measurements are raw and repeatable in this setup; interpretation of why unreachable takes about 4.15s rather than the nominal 2s, and why cache did not change observed duration, is **unverified** and belongs to Chidi. Startup timings may include pi's own work and should not be attributed solely to extension behavior without that analysis. One attempted command to set refused-port auth had an unset shell variable and failed before measurement; corrected command then yielded the three measurements above.

## Baseline and repository status

- Bare `npm run check` on HEAD `3f8d06a5f898d7a48cde3837f4cf1cfdd34a672b`: passed. Biome checked 37 files; TypeScript passed; Vitest 11 files / 94 tests passed. `/usr/bin/time -p`: real 0.89s, exit 0.
- Final `git status --short`: `?? .pi/` and `?? openspec/changes/stop-blocking-startup-on-the-model-fetch/`. The change directory and scratch are untracked run material; no tracked source/config was modified.

## Structure and feature path

- Directories: `src/`, `test/`, `test/isolation/`, `docs/`, `docs/adr/`, `docs/architecture/`, `openspec/specs/`, `openspec/changes/`, `openspec/changes/archive/`, `scripts/`, `.pi/`.
- Entry points/relevant files: `index.ts`; `src/catalog.ts`; `src/config.ts`; `src/auth-storage.ts`; `src/provider.ts`; `test/index.test.ts`; `test/catalog.test.ts`; `README.md`; `ARCHITECTURE.md`; `docs/CONFIGURATION.md`; `openspec/specs/credential-resolution/spec.md`; target `owner-rulings.md`.
- Feature path: Pi loads `index.ts` default async factory → singleton guard/state → `registerCachedOrSetupModels` synchronously resolves credential and registers valid exact-URL cached models or login-only provider → awaited `refreshProvider` → `fetchAndRegister` → `fetchModels` (HTTP status endpoint then fallback endpoint/global settings as needed) → cache write and registration on success → fallback cached/login-only registration on failure → start asynchronous polling and attach handlers. The blocking edge is the factory await at `index.ts:53-55`.

## Unknowns / questions

- Chidi to explain pi's own `--list-models` startup behavior and account for raw timing results (particularly 4.15s unreachable / same cached and uncached measurement); interpretation here is deliberately unverified.
- The experiment did not collect HTTP traces/extension debug logs or isolate pi startup stages. The unreachable request may involve runtime/network behavior beyond `fetchModels` timeout; exact cause unknown.
- No no-cache behavior requirement currently exists in living specs; the current code behavior on fetch failure is login-only provider, with `lastError` set, but user-visible reporting is not established by these files.
- No startup/cache success-vs-failure duration tests currently exist in `test/index.test.ts` or `test/catalog.test.ts`.
