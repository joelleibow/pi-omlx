# Eleanor research — remove-test-only-seams

Scope: `/Users/joelleibow/Projects/pi-omlx` (tracked source/tests/config plus the change's owner ruling and living OpenSpec specifications). Research target: production-only-for-tests seams, their test callers, catalog cache paths, temporary-directory fixtures and isolation harness. No code-quality judgment or implementation design is made here.

## Required reads and binding material

- Instructions: read `/Users/joelleibow/Projects/pi-omlx/AGENTS.md`. It identifies this as a Pi extension, documents `npm run check`, and says tests should use the agent directory instead of test-only credential seams. It also points to `ARCHITECTURE.md` and `docs/adr/`.
- Architecture: read `/Users/joelleibow/Projects/pi-omlx/ARCHITECTURE.md`. Relevant sections: §1 describes root entry point, `src/`, `test/`, and `openspec/`; §4 describes auth and cache data stores; §8 describes test isolation; §9 flags both the credential test seam and intentionally unused cache helper.
- ADRs: `docs/adr/0001-one-credential-decides-the-omlx-connection.md` (Accepted), title **“One credential decides the OMLX connection.”** Summary: stored `omlx` credential wins over environment configuration; one resolution governs catalog and provider registration, with empty-key login for keyless servers. This is the only ADR file located. Its relevance here is context on the credential store, not a direction to change its resolution.
- Language/build: read `package.json`: ESM TypeScript package, Node `>=22`; `check` runs Biome, `tsc --noEmit`, and Vitest. Dev dependencies include Vitest, TypeScript, Biome, and Pi packages.
- Change binding: read `openspec/changes/remove-test-only-seams/owner-rulings.md`. It requires no production export/branch solely for tests and preservation of tests' behavior via a temporary agent directory. Legitimate production parameters such as `env = process.env` are out of scope. It carries the cache per-call path and `tmpdir()` fixtures onto this card.
- Living specification read: `openspec/specs/test-isolation/spec.md` requires fresh per-run root removal on run completion (including a failing run), a pre-test path escape guard, and isolation from operator/caller state.

## Production seams and their test consumers

- **Credential path override:** `src/auth-storage.ts:17-20` defines module state `authPathOverrideForTesting` and exports `_setAuthPathForTesting(path)`. The sole production reader of this state is `readOmlxCredential()` at `src/auth-storage.ts:23-28`, which passes it as the optional second argument to `readStoredCredential`. Production call sites found: `index.ts:274` and `index.ts:299` call `readOmlxCredential()` without passing a path; there are no production callers of `_setAuthPathForTesting` or the override state. The setter and state are exported/kept only for tests.
- `test/auth-storage.test.ts:7-8,16-21` imports and sets the seam in `beforeEach`, resets it in `afterEach`, then `storeUnderAgentDir` also points `PI_CODING_AGENT_DIR` at its fixture directory (`:32-35`). Its cases at `:41-79` prove credential record passthrough (api_key including empty key, oauth fields, unrelated/missing provider, unknown type) and missing-auth behavior. They do currently exercise a file at a temp path through the seam; the comments explain agent-dir resolution matches the same directory (`:32-35`).
- `test/index.test.ts:19-20,45-55` imports both seams, sets auth path and deletes the singleton global in `beforeEach`, then resets both in `afterEach`. The auth seam supplies credentials for extension integration tests; `storeCredential` and related setup are in this file (for example cache/auth scenarios at `:617-637`, `:690-722`). Thus the index tests exercise extension registration, cache/fetch, login and related behaviors with fixture auth state, not the setter's behavior as an isolated feature.
- **Singleton symbol export:** `index.ts:31` exports `EXTENSION_SINGLETON_KEY`; production uses the symbol at `:53-54` to prevent duplicate extension initialization and at `:131` to delete it on session shutdown. Test-only consumer is `test/index.test.ts:19,48,54`, which deletes it around cases so the extension can be instantiated repeatedly. The symbol export exists for tests to reach/reset the module-global singleton; no other external consumer was found within the repository. The guard itself is runtime functionality, not test-only.

## Catalog cache paths and callers

- `src/catalog.ts:567` captures `CACHE_FILE = join(getAgentDir(), "cache", "omlx-models.json")` at module import. `readCatalogCache(apiRoot)` (`:575-579`) uses `readCatalogCacheFile()` then returns only matching-API-root models. `readLastCatalogCache()` (`:581-583`) returns the last cached models without API-root check; it is exported but has no callers (also noted by `AGENTS.md` and `ARCHITECTURE.md` §9; deferred to the dead-code card per task brief). The internal `readCatalogCacheFile()` (`:585-593`) reads the captured `CACHE_FILE`, validates only that parsed `models` is an array, and returns undefined on read/parse failure. `writeCatalogCache()` (`:596-604`) creates `join(getAgentDir(), "cache")` using a fresh `getAgentDir()` call but writes to the import-captured `CACHE_FILE`; errors are swallowed as best-effort. Therefore its mkdir path and file path may refer to different agent directories if the environment changes after import.
- Production cache consumers are `index.ts:276` (`readCatalogCache` during cached registration) and `:356` (`writeCatalogCache` after catalog processing). No production caller of `readLastCatalogCache` found.
- Test cache fixture helpers are `test/index.test.ts:250-280`. `cacheFixturePath()` hardcodes `join(inject("isolationRoot"), "agent", "cache", "omlx-models.json")` (`:255-256`); write/read/remove helpers operate on that file. Its comment at `:252-254` explicitly records the import-time capture and the discrepancy: writer mkdir uses call-time agent dir while cache file remains captured, so test makes the captured `<root>/agent/cache` itself.
- `test/index.test.ts` uses this helper across cache startup/fetch/write and error/warning behavior. Representative assertions: cache used with never-answering request `:617-632`; cached startup registration `:670-685`; successful fetched catalog writes cache and expected models/limits `:690-722`; cached failure warning `:724-743`; further failure/stale-fetch cases `:961-983`. These exercise `readCatalogCache` and `writeCatalogCache` through the extension. No direct catalog-cache unit-test call was found.

## Temporary directories and cleanup

All `mkdtemp` / `tmpdir()` use in test code found by repository-wide search:

- `test/isolation/global-setup.ts:27`: creates per-run root under `realpathSync(tmpdir())` with prefix `pi-omlx-test-`; teardown `:34-39` recursively removes it.
- `test/auth-storage.test.ts:16`: creates `pi-omlx-auth-*` directly under system `tmpdir()`, outside isolation root. `afterEach` `:20-24` removes it normally. A process crash or termination before hook cleanup can leak it; the run-root teardown cannot remove it because it is outside that root.
- `test/index.test.ts:46`: creates `pi-omlx-index-*` directly under `tmpdir()`, outside isolation root. `afterEach` `:51-55` removes it normally; crash before cleanup can leak it. Same file creates `extension-copy-*` under injected isolation root at `:570`; no individual `rmSync` for that copy directory appears in the file, but normal global teardown removes it with the root.
- `test/catalog.test.ts:233,311,467`: three `pi-omlx-*` directories created directly under `tmpdir()` for model-settings fixtures. The file imports only `mkdtempSync, writeFileSync` (`:2`), and no cleanup/removal call was found in it. They persist even after a normal suite run; a crash likewise leaks them.
- `test/catalog.test.ts:515`: uses `join(tmpdir(), "pi-omlx-missing-model-settings.json")` as a missing-file fixture; it does not create the file.

## Isolation already provided

- `test/isolation/global-setup.ts:7-10` supplies the typed `isolationRoot`. `setup()` creates a realpath-normalized temp root (`:27`), sets `HOME=<root>/home` and `PI_CODING_AGENT_DIR=<root>/agent` (`:28-29`), clears extension environment keys (`:30` and `CALLER_ENV_KEYS` at `:13-19`), then provides the root (`:31`). `teardown()` recursively removes it (`:34-39`). Its explicit shortcut comment says signal termination can leak the run root (`:35-36`).
- `test/isolation/worker-setup.ts:8-19` obtains injected root and throws if absent; it guards the agent dir, `homedir()`, and overlay path, with `escapedPaths` from `guard.ts` (`:11-19`). `test/isolation/guard.ts:3-21` detects paths outside root (including absent path).
- `vitest.config.ts:4-10` installs the global and worker setups before test files; `test-isolation` spec documents required behavior.
- Root-wide isolation does not currently cover those direct `tmpdir()` fixtures, hence catalog fixtures are outside the guard and outside run cleanup.

## Feature path / structure map

- Entry point and runtime flow: `index.ts` (extension startup and singleton; reads `src/auth-storage.ts`, reads cache in `src/catalog.ts`, fetches/registers models and writes cache).
- Relevant files: `src/auth-storage.ts`, `src/catalog.ts`, `test/auth-storage.test.ts`, `test/index.test.ts`, `test/catalog.test.ts`, `test/isolation/{global-setup.ts,worker-setup.ts,guard.ts}`, `vitest.config.ts`, `package.json`, `openspec/changes/remove-test-only-seams/owner-rulings.md`, `openspec/specs/test-isolation/spec.md`, `docs/adr/0001-one-credential-decides-the-omlx-connection.md`.
- Project directories observed: `.pi/`, `docs/` (`adr/`, `architecture/`), `openspec/` (`specs/`, `changes/`, `config.yaml`), `scripts/`, `src/`, `test/` (`isolation/`). There are no top-level `CLAUDE.md` or `pyproject.toml`; `AGENTS.md`, `ARCHITECTURE.md`, and `package.json` are present.
- Feature path: auth fixture setup in tests → `readOmlxCredential()` → `readStoredCredential(PROVIDER_KEY, override)`; extension obtains credential in `index.ts` → cache read in startup and cache write following refresh. Singleton test reset wraps calls to the default extension export. Isolation root enters via Vitest global setup → environment/context provision → worker path guard → teardown cleanup.

## Baseline and status

- Repository `HEAD` was `84da93163b93b1cc39443a9284f101524b044315` (short `84da931`), matching requested baseline `main`.
- Ran bare `npm run check` without environment prefix. Passed: Biome checked 39 files, TypeScript emitted no errors, Vitest **12 test files / 121 tests passed** (Vitest 5.1.0; 608 ms).
- Final `git -C /Users/joelleibow/Projects/pi-omlx status --short`: `?? .pi/` and `?? openspec/changes/remove-test-only-seams/` only.

## Unknowns / boundaries

- No Pi or Vitest external behavior was researched; task delegates that research to Chidi. This report relies only on repository evidence for the cache and isolation behavior.
- Crash leakage assessment follows fixture locations and cleanup hooks; no forced-crash experiment was run.
- Cache path behavior is described from current source and test helper comments; no code was changed and no post-change behavior is asserted.
