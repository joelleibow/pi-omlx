# Proposal

## Why

Production code here carries two things that exist only for the test suite. `src/auth-storage.ts` keeps a module variable `authPathOverrideForTesting` and exports `_setAuthPathForTesting` so a test can point the credential read at its own file. `index.ts` exports `EXTENSION_SINGLETON_KEY` so a test can delete the extension's load guard between cases. Joel ruled on 2026-11-11 (triage item 6, `owner-rulings.md` §1) that this is a smell the repository should not keep: production code carries no export or branch that exists only to serve a test, and the tests that used one still prove the same behavior through a temporary agent directory.

Two related defects sit on the same card at Michael's ruling. `src/catalog.ts` captures the cache file path at module load, while it creates the cache directory from an agent directory resolved at call time, so a changed agent directory splits the write (Eleanor, "Catalog cache paths and callers"). And the fixtures several tests build sit directly in the system temporary directory, outside the isolation root the guard checks and outside the root the run removes (Eleanor, "Temporary directories and cleanup").

## What Changes

- The credential path seam goes: `readOmlxCredential` calls `readStoredCredential(PROVIDER_KEY)` with no path, and pi resolves the agent directory at every call (Chidi §1, §2). The tests that set the override isolate by setting `PI_CODING_AGENT_DIR` instead, which `test/auth-storage.test.ts` and `test/index.test.ts` already do for their other fixtures.
- The singleton's export goes and its guard stays: `EXTENSION_SINGLETON_KEY` loses its `export` keyword, because the guard is production behavior, added upstream for a production reason and cleared in `session_shutdown` (Michael, "Settled"). Only the export and the two test hooks that reach through it go.
- The cache path is derived per call: the cache read and the cache write each compute the file path from the agent directory pi resolves at that moment, and the write creates the directory of the file it writes (Michael's ruling 2 on the isolation change, with its trap (d)).
- Every temporary fixture moves under the isolation root: the `mkdtemp` and `tmpdir()` fixtures in `test/auth-storage.test.ts`, `test/index.test.ts` and `test/catalog.test.ts` move to `inject("isolationRoot")`, and the cache fixture states the path the cache now uses (Michael's Validate verdict on `stop-loading-a-dotenv`; his traps (c) and (f)).
- The suite proves the load guard through the production path: with the hooks gone, a test file that loads the extension twice drives it through `session_shutdown` first. Michael measured the difference: commenting out the guard's clear leaves the suite green while the hooks are in place, and fails most of `index.test.ts` once they are gone (trap (b)).
- Two capabilities each gain a requirement (see below): where the cache lives, and how the suite reaches pi's state and where its fixtures live.

Deliberately not in this change: the guard's own behavior, the removal of `readLastCatalogCache` (dead-code card), the `env = process.env` parameters `owner-rulings.md` §1 excludes, a new isolation mechanism or provide/inject key, and fixing `writeCatalogCache`'s swallowed catch. Michael's trap (d) puts that catch outside this card, and the cache test asserts the file exists under the new directory, so a write that fails silently cannot pass.

## Capabilities

### New Capabilities

None. Both spec changes land in capabilities that already exist.

### Modified Capabilities

- `catalog-discovery`: gains a requirement that the cache is read and written under the agent directory pi resolves at the moment of the call.
- `test-isolation`: gains a requirement that the suite reaches pi's stored credential and cache through the agent directory, uses no production export or branch that exists only for it, and keeps every temporary fixture under the isolation root.

## Impact

- Code: `src/auth-storage.ts`, `index.ts`, `src/catalog.ts`.
- Tests: `test/auth-storage.test.ts`, `test/index.test.ts`, `test/catalog.test.ts`. The isolation harness under `test/isolation/` keeps its provide/inject keys and its guard list; nothing here needs a new one (Michael, "What it must not touch").
- Removed exports: `_setAuthPathForTesting`, the module state behind it, and `EXTENSION_SINGLETON_KEY`. Eleanor found no consumer of either seam outside the tests. The singleton's value, `Symbol.for("pi-omlx/loaded")`, does not change, so two module instances still share one key, which is what the guard was built for.
- Documentation this change makes false, for the docs pass: `AGENTS.md`'s line that new tests reach the credential store "never through a test-only seam" with the seams deferred to "another card", and `ARCHITECTURE.md` §9's listing of the seams as due for removal. Two code comments also go stale, the override's in `src/auth-storage.ts` and the cache fixture's at `test/index.test.ts:250-254`; those are Derek's, not the docs pass.
- Baseline: Eleanor measured `main` at 84da931 with `npm run check` green (Biome, `tsc`, Vitest).
- Follow-up this change does not take: the guard's second-call path stays untested, because no test drives the factory twice and the one production path that fires it, a project-local install beside a global one, has never been measured. Michael's consult hands that to the dead-code card as "measure a dual install; delete the guard or test it", with the product question beside it: does Joel want duplicate-install dedup at all?
