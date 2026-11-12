# Research Report

## Question and Scope

Map all repository paths by which the Vitest suite can reach operator state; measure a bare `npx vitest run` in a scratch clone with empty HOME; inventory current test isolation; record config/docs instructions and baseline. Scope: repository `/Users/joelleibow/Projects/pi-omlx`, change `openspec/changes/isolate-the-suite-from-the-agent-directory`. Owner rulings in `owner-rulings.md` bind: tests must not read or write the operator's Pi agent directory, and this change must not add production test-only seams (owner-rulings.md:3-15).

## Sources / Files Examined

- `openspec/changes/isolate-the-suite-from-the-agent-directory/owner-rulings.md`
- `ARCHITECTURE.md`, `AGENTS.md`, `package.json`, `vitest.config.ts`, `index.ts`
- `src/catalog.ts`, `src/auth-storage.ts`, `src/dotenv.ts`
- `test/` (all 11 `*.test.ts`; detailed path/env inventory by search; full relevant auth and index files read)
- `docs/adr/0001-one-credential-decides-the-omlx-connection.md` (title, status, summary)
- `README.md`, `CONTRIBUTING.md`, `openspec/specs/verification/spec.md`
- `openspec instructions research --change isolate-the-suite-from-the-agent-directory --json` (research template)

No `README.md` PI_CODING_AGENT_DIR instruction was found. No `ADRs` outside the single `docs/adr/0001...` were found. Repository includes `AGENTS.md` (the initial conventional-name search did not discover it; directory listing confirmed it and it was read).

## Findings

### External paths and timing

- **Pi catalog cache:** `src/catalog.ts:567` initializes `CACHE_FILE = join(getAgentDir(), "cache", "omlx-models.json")` at module evaluation, so this path is captured once on import. Reads use that constant in `readCatalogCacheFile` (`src/catalog.ts:575-592`); writes create `join(getAgentDir(), "cache")` per call but write to the module-captured `CACHE_FILE` (`src/catalog.ts:596-603`). Thus if the agent directory changes after module load, directory creation and file target can disagree. The entry point reads cache at startup and writes refreshed models (`index.ts:214-216, 287`). The wiring suites in `test/index.test.ts` exercise `extension` and therefore its polling/write path; the measured bare run created `$HOME/.pi/agent/cache/omlx-models.json`. The catalog unit tests primarily exercise local model settings; `readLastCatalogCache` has no caller per `AGENTS.md:28` and `ARCHITECTURE.md:73`.
- **Pi auth.json:** `src/auth-storage.ts:25-29` calls Pi's `readStoredCredential(PROVIDER_KEY, authPathOverrideForTesting)`; with no override, Pi resolves `<agent-dir>/auth.json` per call, using `PI_CODING_AGENT_DIR` when supplied (documented mirror comment at `src/auth-storage.ts:25-28`). The extension reads, not writes, auth.json (`ARCHITECTURE.md:22,48`; ADR `docs/adr/0001-one-credential-decides-the-omlx-connection.md`, Decision/Consequences). `test/auth-storage.test.ts:15-24,36-38,77-79` installs a temp auth path seam and also points PI_CODING_AGENT_DIR to temp storage. `test/index.test.ts:35-43,104-135,222` likewise overrides auth path; its `driveExtension` sets PI_CODING_AGENT_DIR to its temporary directory. Auth read calls are reached by `test/index.test.ts` extension scenarios and `test/auth-storage.test.ts` direct cases.
- **OMLX model settings:** `resolveLocalModelSettingsPath` resolves explicit `OMLX_MODEL_SETTINGS_PATH` or uses `homedir()/.omlx/model_settings.json` (`src/catalog.ts:606-610`). `applyLocalModelSettings` reads the configured/default path at invocation, not module load, and first checks existence (`src/catalog.ts:393-413`); `fetchModels` invokes it for server status and fallback responses (`src/catalog.ts:210-213,249-252`). `index.ts` resolves it per refresh from `process.env.OMLX_MODEL_SETTINGS_PATH` (`index.ts:261-268`). The `homedir()` default is independent of `PI_CODING_AGENT_DIR`. Catalog tests using temporary settings are `test/catalog.test.ts:232-278,310-... ,466-500`; one missing-explicit-path case is at `test/catalog.test.ts:511-...`. Tests without explicit override can probe HOME's `.omlx/model_settings.json`; the empty HOME measurement found no such file read can be inferred from fd, only that the suite created no `.omlx` file.
- **Extension `.env`:** `index.ts:10` calls `loadDotenvFromExtensionDir(import.meta.url)` during module initialization. `src/dotenv.ts:36-46` computes `dirname(fileURLToPath(importMetaUrl))/.env` then checks/reads it, merging into environment. This is inside the repository/extension directory, not HOME; parse/merge tests (`test/dotenv.test.ts`) do not call the loader (`test/dotenv.test.ts:1-2`). `PI_CODING_AGENT_DIR` is not used for this path.
- **Other HOME-based behavior measured:** Vitest created its secret token at `$HOME/Library/Application Support/vitest/.vitest-secret-token`; npm created debug log and update-check marker under `$HOME/.npm` while invoking `npx`.

### Bare-run measurement

Copied the repository to `.pi/marbleization/isolate-the-suite-from-the-agent-directory/scratch/` (excluding `.git` and `node_modules`, with node_modules symlinked to the repository), created empty `.pi/marbleization/isolate-the-suite-from-the-agent-directory/empty-home/`, confirmed it had no files with `find`, then ran from scratch with `PI_CODING_AGENT_DIR` unset and `HOME` set to that empty directory:

`env -u PI_CODING_AGENT_DIR HOME=<change scratch>/empty-home npx vitest run`

Result: 11 test files and 88 tests passed. Post-run `find` listed exactly:

- `empty-home/Library/Application Support/vitest/.vitest-secret-token`
- `empty-home/.npm/_logs/2026-11-12T02_18_35_209Z-debug-0.log`
- `empty-home/.npm/_update-notifier-last-checked`
- `empty-home/.pi/agent/cache/omlx-models.json`

The cache was populated with test fixtures by the extension wiring run. `fd` was not installed/used; `find` provided before/after inventories. This detects files remaining after the run, not transient reads of files that were not left behind.

### Current test isolation

- `test/auth-storage.test.ts:15-24`: per-test `mkdtempSync(tmpdir())`; saves prior `PI_CODING_AGENT_DIR`, sets `_setAuthPathForTesting(temp/auth.json)`; afterEach clears seam, restores/deletes env value, recursively removes temp directory. `storeUnderAgentDir` sets env to temp (`:36-38`); final missing-auth case sets it at `:78`.
- `test/index.test.ts:35-43`: per-test temp dir; sets auth path seam, deletes extension singleton; afterEach clears seam, removes temp and singleton. `withEnv` saves/deletes/restores exactly `PI_CODING_AGENT_DIR`, `OMLX_API_KEY`, `OMLX_BASE_URL`, `PI_OMLX_DEBUG` (`:118-135`). `driveExtension` uses it with PI_CODING_AGENT_DIR=temp (`:222`), and restores in `finally` (`:229-250`); `finally` also restores fetch, timers, stderr spy and shutdown. First login test has no `withEnv`; it restores `globalThis.fetch` and shuts down in finally (`:52-98`), while file hooks clean temp/seam.
- `test/catalog.test.ts`: three temporary directories for settings fixtures at lines 233, 311, 467 and explicit missing path around 515; test code writes paths there. These dirs are not removed (imports include `mkdtempSync, writeFileSync`, but no `rmSync`), so temporary fixture files remain in system temp. These settings paths are passed explicitly; other catalog paths may fall back to HOME default.
- `test/debug.test.ts:9` calls `vi.stubEnv("PI_OMLX_DEBUG", value)`; Vitest config `restoreMocks: true` (`vitest.config.ts:8`) restores mocks/stubbed env after each test. `clearMocks: true` clears mocks; no `unstubEnvs` config is present.
- Search across all test files found no other direct `process.env` assignment, `vi.stubEnv`, `_setAuthPathForTesting`, `mkdtempSync`, or `withEnv` instances. `test/dotenv.test.ts` tests pure parsing/merging with no explicit env mutation (`:1-2`).

### Config, docs, ADR, baseline

- `vitest.config.ts:3-9`: Node environment, `test/**/*.test.ts`, `clearMocks: true`, `restoreMocks: true`.
- `package.json:17-21`: `check` runs Biome, `tsc --noEmit`, then `vitest run`; `test` runs `vitest run`; watch script runs `vitest`. Therefore `npm run check` invokes the suite with no isolation mechanism of its own.
- PI_CODING_AGENT_DIR contributor instructions: `CONTRIBUTING.md:14` says bare verify/check/test overwrites operator cache and to point variable to empty scratch dir. `AGENTS.md:9-11` gives env-prefixed check/typecheck/per-file commands; `AGENTS.md:23` says env is mandatory due to bare run cache write. `openspec/specs/verification/spec.md:14,34,38` requires env-prefixed verification / forbids agent cache write only under stated env condition. `README.md` has none. `ARCHITECTURE.md:69` refers contributors to AGENTS commands and the agent directory setting but does not literally name PI_CODING_AGENT_DIR.
- ADR: `docs/adr/0001-one-credential-decides-the-omlx-connection.md`, title “One credential decides the OMLX connection”, Accepted. Summary: stored credential outranks env for catalog and registration; extension reads Pi auth store and never writes it; resolution mirrors Pi and needs upkeep when Pi changes.
- Required baseline command passed at HEAD using assigned scratch agent directory: `PI_CODING_AGENT_DIR=/Users/joelleibow/Projects/pi-omlx/.pi/marbleization/isolate-the-suite-from-the-agent-directory/agent-dir npm run check`. Biome checked 35 files, typecheck succeeded, Vitest 11 files / 88 tests passed (exit 0).

## Assumptions, Differences, and Unknowns

- The measured “read under HOME” list is file creation/remaining-file evidence. `find` before/after cannot prove absence of transient reads, nor identify reads of preexisting files; the HOME directory was initially empty. As requested, no `fs_usage` trace was performed.
- `npx` itself generated npm log and update marker files; these are tooling effects and should be distinguished from Vitest's own secret token and application cache file.
- Production catalog path combines a module-time cache filename with per-call `getAgentDir()` for mkdir, potentially inconsistent if `PI_CODING_AGENT_DIR` changes while loaded. This is a relevant edge case for isolation design.
- No path to `~/.omlx/model_settings.json` was left as a file by the run; whether Vitest or test code transiently probed that path is not established from post-run inventory.
- The archive verification spec also contains PI_CODING_AGENT_DIR language, but the task specifically requested the living `openspec/specs/verification/spec.md`; archived spec is not included in the contributor-doc inventory above.

## Addendum 1 — the env surface and the cache path

`src/dotenv.ts:33` merges only when `env[key] === undefined || env[key] === ""`; whitespace is preserved. `loadDotenvFromExtensionDir` derives `<dirname(importMetaUrl)>/.env`, returns if absent, then reads and merges (`:36-45`). `parseDotenv` trims each line/value (`:5-22`), but does not trim existing process env.

Env readers (`index.ts`, `src/*.ts`, `.env.example`):
- `OMLX_BASE_URL`: `.env.example:3`; `src/config.ts:32-34,64` trims; empty/whitespace falls back to default. Env resolution is gated by API key (`config.ts:61-64`).
- `OMLX_API_KEY`: `.env.example:4`; `src/config.ts:60-61` tests truthiness; empty disables env credential, whitespace is truthy/key content.
- `OMLX_MODEL_SETTINGS_PATH`: `index.ts:261-262`, `src/catalog.ts:396,606-610`; empty/falsy selects `~/.omlx/model_settings.json`; whitespace is a truthy literal path.
- `OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS`: `src/stream.ts:53-59`; empty uses default; whitespace converts to 0 and uses default.
- `PI_OMLX_DEBUG`: `src/debug.ts:1,15`; empty is off; whitespace is truthy/on.
- `PI_CODING_AGENT_DIR`: not directly read in index/src; Pi helper `getAgentDir()` is used at `src/catalog.ts:567,598` (the suite environment supplies this key).

Tested each listed key individually as empty in the scratch copy with `PI_CODING_AGENT_DIR` set to the scratch agent dir: `OMLX_BASE_URL`, `OMLX_API_KEY`, `OMLX_MODEL_SETTINGS_PATH`, `OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS`, `PI_OMLX_DEBUG`, `PI_CODING_AGENT_DIR` — all passed (11 files, 88 tests each).

Cache (`src/catalog.ts:567-610`): `CACHE_FILE` is captured at module load from `getAgentDir()`; `readCatalogCache(apiRoot)` reads shared file and filters by root (`:575-579`); `readLastCatalogCache()` returns its models without root check (`:581-583`); private `readCatalogCacheFile` catches read/parse errors and rejects non-array models (`:585-594`); `writeCatalogCache` mkdirs using per-call `getAgentDir()` but writes captured `CACHE_FILE`, swallowing errors (`:596-603`). `resolveLocalModelSettingsPath` accepts truthy explicit path else joins homedir (`:606-610`). Callers: `index.ts:216` reads and `:287` writes. No other callers in `src/` or `test/`; `readLastCatalogCache` is unused.