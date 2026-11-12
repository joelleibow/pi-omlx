# Michael — orientation consult (not a gate)

Run `688e5fa7-d934-45d3-ac16-05e84d2b413f`, 2026-11-11, in parallel with Chidi and Eleanor.

Measured in `.pi/marbleization/remove-test-only-seams/scratch-michael/repo` (a copy of `main` 84da931 with `node_modules` symlinked); the repository is untouched (`git status --short`: only `.pi/` and the change dir). Baseline there: 12 files, 121 tests green.

## 1. Decisions that bind this change

- **Joel, `owner-rulings.md` §1 (2026-11-11, triage item 6):** "there is implementation in files like @src/auth-storage.ts that's solely for testing, e.g. `_setAuthPathForTesting`. For me this is a smell … Let's address it." Decided: no production export or branch exists only to serve tests; the tests that used a seam still prove the same behaviour, isolated through a temporary agent directory; `env = process.env`-style parameters a production caller could pass are out of scope.
- **Joel, `owner-rulings.md` §2:** "yeah. lets get these done" — this card runs now.
- **Joel, carried (`archive/2026-11-11-isolate-the-suite-from-the-agent-directory/owner-rulings.md` §1):** "#2 is a must address. Tests never mutate operating functionality." The suite may not read or write the operator's pi state in any environment; the living `test-isolation` spec (all three requirements) and `verification` Requirement 3 record it. Every fixture this card moves must stay under the per-run root the guard checks.
- **Joel, standing:** documentation never blocks a feature; Markdown lands in Bambadjan's docs pass. (`AGENTS.md` conventions/traps, `ARCHITECTURE.md` §9 "seams … due for removal", the `auth-storage.ts` comment and `index.test.ts:250-254` comment all become false; the two code comments are Derek's, the Markdown is Bambadjan's.)
- **My ruling 2, `archive/…isolate-the-suite…/council.md` "Michael's Rulings":** the catalog cache path is "out, to the seam card as a structure-only step with the dirA→dirB test", with Neil P3's refinement (compute the path once in `writeCatalogCache` and `mkdirSync(dirname(file))`). Binding here.
- **My Validate verdict on `stop-loading-a-dotenv` (recorded on the board card; `archive/…stop-loading-a-dotenv/council.md` D1 and `design.md` Open Questions):** the per-test `mkdtemp` fixtures are "a known smell the root fixes"; they move under `inject("isolationRoot")`. Binding here.
- **My rulings in `archive/2026-11-11-one-credential…/council.md` and that orientation trap i:** new tests take the `PI_CODING_AGENT_DIR` route because pi resolves per call. Re-checked at source: `readStoredCredential(providerId, authPath = join(getAgentDir(), "auth.json"))` (`pi-coding-agent/dist/core/auth-storage.js:425`) and `getAgentDir()` reading `process.env` on every call (`dist/config.js:510-516`). No cache in either.
- **`verification` spec Requirement 2:** no `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`/`biome-ignore`. Relevant because deleting the seam must not leave an unused-variable warning papered over (the one-credential tasks 6.1 already refused an underscore rename as "suppression by rename").

## 2. What it must not touch

- `readLastCatalogCache` (`src/catalog.ts:581`): dead-code card; `AGENTS.md` trap. It reads through `readCatalogCacheFile`, so it follows the per-call path automatically with no edit of its own.
- The singleton **guard** (`index.ts:31,53-54,131`): production (see §4). Only the `export` keyword goes.
- `env = process.env` parameters (`src/config.ts`), per ruling §1.
- `test/isolation/*` and the `test-isolation` spec's mechanism: nothing here needs a new provide/inject key; `isolationRoot` already exists. `CALLER_ENV_KEYS` unchanged (no new env key).
- `src/dotenv`-era mock: gone already; nothing to do.
- Any write to `auth.json` from production (`AGENTS.md` trap; ADR 0001).
- `scripts/`, pi's own code, the dead `onDebug` plumbing and `OmlxModel` fields (dead-code card).

## 3. Traps, each measured

(a) **Seam removal is green today with no other change.** Deleting `authPathOverrideForTesting`/`_setAuthPathForTesting`, calling `readStoredCredential(PROVIDER_KEY)`, and deleting the four call sites in `test/auth-storage.test.ts:18,21` and `test/index.test.ts:47,52`: 121/121 green. Both files already set `PI_CODING_AGENT_DIR` per test (`storeUnderAgentDir`, `driveExtension`'s `withEnv`). The `/login` test (`index.test.ts:57-107`) sets no env and now reads `<root>/agent/auth.json`, which no test writes; it stays inside the root. **Trap:** `test/auth-storage.test.ts` is not named in the brief but carries the same seam and the same `tmpdir()` fixture (`:16`); fix the class, not two of its three members.

(b) **The singleton hooks are already redundant, and they mask a production defect.** Unexporting `EXTENSION_SINGLETON_KEY` and deleting both `delete globalThis[...]` lines (`index.test.ts:48,54`): 121/121 green, because every path already fires the production `session_shutdown` handler (`:105`, `driveExtension`'s `finally` at `:349`). Mutation: comment out `delete globalState[EXTENSION_SINGLETON_KEY]` at `index.ts:131` — at HEAD the suite stays **37/37 green** (the hooks hide it); with the hooks gone **30 of 37 fail**. Removing the reach-in makes the suite prove a production behaviour it could not see before. Record that mutation as the red evidence. Residual risk: a factory that throws before `pi.on("session_shutdown")` would cascade into later tests returning early; the only code before that registration is `registerCachedOrSetupModels`, whose I/O is swallowed by pi and the extension, so I would accept it rather than keep a `Symbol.for("pi-omlx/loaded")` copy in the test (a second home for the key string).

(c) **Per-call cache path breaks five tests until the fixture moves.** Replacing `CACHE_FILE` with `catalogCachePath()` used by the read and by the write (`const file = catalogCachePath(); mkdirSync(dirname(file), …); writeFileSync(file, …)`): 5 `index.test.ts` tests fail because `cacheFixturePath()` (`:255-256`) hard-codes `<root>/agent/cache/omlx-models.json`. Changing it to `join(dir, "cache", "omlx-models.json")` and deleting the comment at `:250-254` and the helper's own `mkdirSync` workaround: 121/121 green, `tsc` clean. The design must name that test edit; it is not an "edited expectation", it is the fixture following the fact.

(d) **The swallowed catch hides programming errors.** My first per-call edit forgot `import { dirname }`; `writeCatalogCache`'s bare `catch {}` swallowed the ReferenceError, and only the read-side assertions caught it. The dirA→dirB test must assert the file **exists under B** (not only that `readCatalogCache` returns), or a broken write passes. I ran that test: green per-call, red (`existsSync` false) with the import-time constant restored. Do not widen scope to fix the catch; it is pre-existing mechanism and would be a design-gate addition.

(e) **`dirA` is the root.** In a worker, `src/catalog.ts` is imported by `worker-setup.ts` before any test (Chidi §4 exp 1), so "import with A" means A = `<root>/agent` and the test cannot choose it; the test sets B after import and asserts under B and not under `<root>/agent`. Say so in the task so nobody tries `vi.resetModules()` to pick A.

(f) **Fixture moves need `inject` in two more files.** `test/catalog.test.ts:233,311,467` and `:515` (the missing-file path), and `test/auth-storage.test.ts:16` gain `import { inject } from "vitest"`; the `ProvidedContext` augmentation stays in `global-setup.ts` only (design decision from the isolation card). Once under the root, the per-test `rmSync` calls become optional; keeping them is harmless, dropping them is smaller.

(g) **Copy test is unaffected.** `index.test.ts:570` imports a second `src/catalog.ts` instance; per-call derivation changes nothing there (no fetch, no cache write).

(h) **Spec alignment at PL4.** No living spec says where the cache file lives. For two-way alignment the per-call path wants one scenario in the spec that owns the cache (`catalog-discovery`: the cache is read and written under the agent directory pi resolves at that moment), and the seam/fixture work wants a `test-isolation` requirement (tests reach pi's store through the agent directory and keep their fixtures under the root). Bambadjan's call on wording; I will hold the design to having both.

## 4. Settled vs open

**Settled:**
- `_setAuthPathForTesting` and `authPathOverrideForTesting` go; `readOmlxCredential` calls `readStoredCredential(PROVIDER_KEY)`; tests isolate via `PI_CODING_AGENT_DIR` (ruling §1; measured green).
- `EXTENSION_SINGLETON_KEY` loses `export`; the two test hooks go; the mutation in (b) is the proof (ruling §1; measured).
- Per-call cache path with the dirA→dirB test (my ruling 2; measured red/green).
- All `mkdtemp`/`tmpdir()` fixtures in `test/` move under `inject("isolationRoot")`, including `auth-storage.test.ts` and `catalog.test.ts:515` (my Validate verdict; `test-isolation` Requirement 3).
- **Is the singleton guard a test seam?** No; it is production behaviour, and this card keeps it. Provenance: added upstream in f11b6f2 ("Fix OMLX autoplan retry handling") with a `debugLog("extension_load_skipped", {reason: "already_loaded"})`, i.e. a production reason, and the `session_shutdown` clear added in 52183fd. `Symbol.for` was chosen so two module instances share one key, and pi dedups extension entries by resolved path only (`dist/core/extensions/loader.js:676-684`), so a project-local plus global install of the extension runs the factory twice in one process without a `session_shutdown` between — the one case the guard fires. Chidi (stop-blocking archive, F "Factory run count") measured one factory run per process for a single install, and pi emits `session_shutdown` before every re-run (`/new`, `/resume`, `/fork`, `/reload`), so within one install the branch is never taken; that makes it a candidate for the dead-code card or a Joel product question (dual-install dedup), not a seam. Only the export served tests.
- No Node permission model, no new isolation mechanism, no `vi.resetModules()`.

**Open for the council (not Joel):** where the two spec deltas in (h) live and their wording; whether the moved fixtures keep their per-test `rmSync`. Both are mechanism-free choices.

**Open for Joel:** nothing this card needs. The only owner question in sight is whether the guard itself survives the dead-code card (product behaviour under a dual install); I would raise it there, not here.

**Decided by:** Joel: `openspec/changes/remove-test-only-seams/owner-rulings.md` §1 (no production export or branch exists only to serve tests; tests prove the same behaviour through a temporary agent directory; `env = process.env` out of scope), §2 (run now), and carried §1 of `archive/2026-11-11-isolate-the-suite-from-the-agent-directory/owner-rulings.md` ("Tests never mutate operating functionality"); Joel's standing ruling that documentation never blocks. Michael: ruling 2 in `archive/2026-11-11-isolate-the-suite-from-the-agent-directory/council.md` (per-call cache path to this card as a structure-only step with the dirA→dirB test, Neil P3 refinement); Validate verdict on `stop-loading-a-dotenv` (`mkdtemp` fixtures under the isolation root; recorded on the board card and in that archive's council.md D1 / design.md Open Questions); rulings in `archive/2026-11-11-one-credential-for-catalog-and-requests/council.md` (tests take the `PI_CODING_AGENT_DIR` route). Living specs: `test-isolation` (all three requirements), `verification` Requirements 2 and 3. Source re-checked: `pi-coding-agent/dist/core/auth-storage.js:425`, `dist/config.js:510-516`, `dist/core/extensions/loader.js:676-684`; git provenance f11b6f2 and 52183fd for the singleton. The singleton guard's status is settled by provenance and pi's loader, not by a ruling: it is production, so ruling §1 does not reach it.

**Owner:** michael

**Follow-up:** The guard survives this card untested: no test drives the factory twice, and after the hooks go the suite proves only that `session_shutdown` clears the key, not that a second factory call returns early. The one production path that fires it is a dual install (project-local plus global), which nobody has measured. Should the dead-code card carry "measure a dual install; delete the guard or test it", and does Joel want duplicate-install dedup as product behaviour at all? Not this card's question, but it should land on a card before the guard is forgotten as `readLastCatalogCache` nearly was.
