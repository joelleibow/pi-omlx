# Council — neil, pass 1

Run `dbd4a766-470f-45f4-aa0c-297946916381`.

## Recommendation

Settle a four-step green-to-green plan with zero new abstractions, drop per-test rmSync, and fix four draft mismatches before PL4:

1. Red before green (two hats):
- Fixture moves (test structure): Red baseline is Eleanor's 3 leaked pi-omlx-* dirs in os.tmpdir() after catalog.test.ts. Move all 6 tmpdir() sites under inject("isolationRoot") with 121/121 green before and after; post-run tmpdir() leak drops to zero.
- Credential seam (structure): Delete authPathOverrideForTesting, _setAuthPathForTesting, and 4 test calls. Mutation red check: returning undefined from readOmlxCredential() fails auth-storage.test.ts and index.test.ts credential tests; restoring passes.
- Singleton export (structure + harness): Remove export on EXTENSION_SINGLETON_KEY (index.ts:31) and delete index.test.ts:48,54 hooks; ensure one single test reloads after session_shutdown. Mutation red check: commenting out delete globalState[EXTENSION_SINGLETON_KEY] (index.ts:131) fails 30/37 tests (trap (b)); restoring passes.
- Per-call cache path (behavior): First write a red test in catalog.test.ts without vi.resetModules() (dirA is <root>/agent, trap (e)): point PI_CODING_AGENT_DIR at dirB under isolationRoot, call writeCatalogCache, assert existsSync(<dirB>/cache/omlx-models.json) is true (trap (d)) and <dirA>/cache/omlx-models.json is false, assert readCatalogCache returns dirB's models, then point PI_CODING_AGENT_DIR at empty dirC and assert readCatalogCache returns undefined. Make green by replacing CACHE_FILE with catalogCachePath() (importing dirname, computing const file = catalogCachePath() once in writeCatalogCache) alongside cacheFixturePath -> join(dir, "cache", "omlx-models.json").

2. Step order: (1) Move all 6 tmpdir() fixtures under isolationRoot first so index.test.ts:46 is inside the root before caches target it. (2) Remove credential seam. (3) Unexport singleton key and drop hooks. (4) Add red dirA->dirB test, then land catalogCachePath() + cacheFixturePath together (trap (c)).

3. Open items: Keep deltas in catalog-discovery and test-isolation. Drop per-test rmSync everywhere (mkdtempSync prevents collisions; global-setup removes isolationRoot; saves ~45 sync deletes and afterEach boilerplate).

4 & 5. Draft corrections and design rules:
- proposal.md overclaims the suite "proves the load guard"; revise to state it proves session_shutdown clears the key, while early-return stays untested (dead-code card).
- Add test/auth-storage.test.ts:32-35's stale comment and cacheFixturePath's workaround mkdirSync to Derek's cleanup alongside src/auth-storage.ts and index.test.ts:250-254.
- Reword test-isolation Scenario 1 from "the isolation root's agent directory" (<root>/agent) to "a temporary agent directory under the isolation root", and widen Scenario 3 to temporary fixture paths (covering catalog.test.ts:515).
- Reword catalog-discovery Scenario 2 from seeding load-time <root>/agent (shared across workers) to switching away from a populated agent directory (dirB -> dirC).
- Restore mutated PI_CODING_AGENT_DIR in afterEach/finally, keep ProvidedContext in global-setup.ts only, leave readLastCatalogCache untouched, remove unused imports without suppressions, and accept trap (b)'s pre-shutdown throw risk rather than duplicating "pi-omlx/loaded".

## Evidence

- Removing _setAuthPathForTesting and EXTENSION_SINGLETON_KEY export stays 121/121 green; commenting out index.ts:131 fails 30/37 index tests only after hooks go. (michael-orientation.md §3(a)-(b); research-eleanor.md 'Production seams')
- writeCatalogCache's bare catch swallows ReferenceError when dirname is omitted; only existsSync under dirB catches broken writes. (michael-orientation.md §3(d)-(e); research-chidi.md §4 exp 1)
- Per-call catalogCachePath breaks 5 index.test.ts cases until cacheFixturePath(:255-256) switches from <root>/agent to dir. (michael-orientation.md §3(c); research-eleanor.md 'Catalog cache paths')
- Six test sites use tmpdir(), and catalog.test.ts:233,311,467 leak 3 directories per run while index.test.ts:570 already relies on root teardown without rmSync. (research-eleanor.md 'Temporary directories and cleanup'; michael-orientation.md §3(f))
- test/auth-storage.test.ts:32-35 also carries a seam-comparison comment, and removing singleton hooks leaves the guard's early-return branch untested. (research-eleanor.md 'Production seams'; michael-orientation.md 'Follow-up')

## Assumptions

- [verified] pi 1.5.2 readStoredCredential and getAgentDir resolve PI_CODING_AGENT_DIR per call without module-load caching.
- [verified] worker-setup.ts imports src/catalog.ts before tests run, fixing load-time dirA to <isolationRoot>/agent.
- [unverified] Whether test/auth-storage.test.ts restores PI_CODING_AGENT_DIR in afterEach was not directly checked; if yes keep it, if no set/restore PI_CODING_AGENT_DIR per test before dropping rmSync.
- [unverified] Whether one test in test/index.test.ts already loads twice across session_shutdown was not checked; if yes reuse it, if no add one self-contained reload test.
- [unverified] Living openspec/specs/catalog-discovery/spec.md and raw src/ and test/ files were not read directly; if the living capability name differs, target the existing catalog spec.

## Risks

- Switching cacheFixturePath to index.test.ts:46's dir before moving that fixture under isolationRoot writes catalog caches into os.tmpdir() outside the guard.
- Dropping rmSync in auth-storage.test.ts without restoring process.env.PI_CODING_AGENT_DIR per test lets a missing-auth test read the previous test's retained auth.json.
- Writing a cache fixture into load-time <isolationRoot>/agent for catalog-discovery Scenario 2 pollutes default PI_CODING_AGENT_DIR state for parallel Vitest workers.

## Confidence

high: Michael measured all four edits at 121/121 green plus red mutations in traps (a)-(f), backed by Chidi's pi 1.5.2/Vitest 5.1 source checks and Eleanor's full caller inventory.

## Challenge claims

- Per-test rmSync under isolationRoot fails the deletion test: mkdtempSync prevents collisions and global-setup teardown removes the root even on failing runs.
- Fixture moves must precede switching cacheFixturePath(dir), or index.test.ts:46 transiently writes cache files into os.tmpdir() outside isolationRoot.
- Scenario 2 of catalog-discovery must switch between isolated temp dirs (dirB -> dirC) rather than seeding shared <isolationRoot>/agent across parallel workers.

## Owner decisions



## What would change my mind

- A measurement showing parallel test runs exceed tmpfs capacity without per-test rmSync would justify keeping rmSync.
- Evidence that no worker ever runs with default PI_CODING_AGENT_DIR=<isolationRoot>/agent would make seeding <isolationRoot>/agent safe, though dirB -> dirC remains simpler.
