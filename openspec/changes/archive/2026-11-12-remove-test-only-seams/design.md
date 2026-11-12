# Design

## Context

`proposal.md` says why this runs; this section records only what shapes the approach.

Four things are true at the baseline and each one fixes part of the mechanism:

- `src/auth-storage.ts` reads the credential through `readStoredCredential(PROVIDER_KEY, authPathOverrideForTesting)`, so the seam's value, `undefined` by default, selects pi's own default parameter. pi resolves `getAgentDir()` on every call and caches nothing, so removing the second argument changes no route a production caller takes (Chidi §1, §2).
- `index.ts` keeps its load guard on `globalThis` under `Symbol.for("pi-omlx/loaded")`, and the guard is production behavior: it was added upstream with a production reason, and `session_shutdown` clears it (Michael, "Settled"). Only the `export` keyword served the suite.
- `src/catalog.ts` captures `CACHE_FILE` when the module loads, while `writeCatalogCache` creates the cache directory from an agent directory resolved at call time, so a move of pi's agent directory splits the directory from the file (Eleanor, "Catalog cache paths and callers").
- The suite's isolation harness already gives every test a per-run root through `inject("isolationRoot")`; what it does not do is cover the temporary paths the fixtures themselves name, which sit in the system temporary directory (Eleanor, "Temporary directories and cleanup").

Two measurements fix the order of the work. `cacheFixturePath()` in `test/index.test.ts` hard-codes `<root>/agent/cache/omlx-models.json` and has to become `join(dir, "cache", "omlx-models.json")`, where `dir` is `index.test.ts:46`'s `tmpdir()` directory until the fixtures move (Michael's trap (c) and council A1). And `test/auth-storage.test.ts` already points `PI_CODING_AGENT_DIR` at its fixture directory, so the seam's removal alone leaves the suite green (trap (a)).

Joel's two-hats rule, as it applies here: a structure step changes no behavior, so its tests are green before and after, and its proof is a mutation or a search that shows what the removed structure hid. A behavior step starts with a test that fails, and the mechanism lands to turn it green. Council's S3 ruling labels each step, and A1 fixes their order.

## Goals / Non-Goals

**Goals:**

- Remove both production artifacts that exist only for the suite, and leave the suite proving the same behaviors through configurations pi reads per call.
- Make the catalog cache location a function of the agent directory at the moment of each read and each write, proven by a test that fails at the baseline.
- Bring every temporary path a fixture names under the isolation root, so the run's removal covers it and the search in `test-isolation` can prove it.
- Satisfy both requirements this change adds to the living specs, with a test for each scenario.

**Non-Goals:**

- The load guard's early-return path, `readLastCatalogCache`, the `env = process.env` parameters, and `writeCatalogCache`'s swallowed catch. Each has an owner or a card, and the last one is a pre-existing mechanism this change deliberately leaves alone (Michael, "What it must not touch" and trap (d)).
- A new isolation mechanism, a new provide/inject key, or a new `CALLER_ENV_KEYS` entry. Nothing here needs one.
- `vi.resetModules()`. The cache tests set the environment after import instead (trap (e)).
- Any Markdown other than `tasks.md`. The docs pass owns the rest.
- New logging, tracing or error handling. The change adds no use case, adapter or entry point.

## Decisions

### D1. Four steps, in council A1's order, each with the label S3 gives it

The order is part of the mechanism, not a preference: step 1 must land before step 4, or the cache fixture points into the system temporary directory for one step.

| Step | Hat | What it removes or adds | Its proof |
|---|---|---|---|
| 1. Fixtures under the root | Structure | `inject("isolationRoot")` in `test/auth-storage.test.ts`, `test/index.test.ts`, `test/catalog.test.ts`; the `rmSync` calls that clear a test's own directory, and the imports they leave unused | Green before and after; the `tmpdir` search, and the leaked directories it stops |
| 2. The credential seam | Structure | `authPathOverrideForTesting`, `_setAuthPathForTesting`, their call sites, the seam imports | Green at the baseline with the env line deleted; red after the step (council S1) |
| 3. The singleton export | Structure | `export` on `EXTENSION_SINGLETON_KEY`, the hooks at `index.test.ts:48,54`, the key's import | The mutation of `index.ts:131` (council A3) |
| 4. The per-call cache path | Behaviour | `catalogCachePath()`, `mkdirSync(dirname(file))`, the tests in `test/catalog.test.ts`, `cacheFixturePath` and `removeCacheFixture` following it | Both tests red at the baseline, green after (council S2, A4) |

### D2. The fixture move, and why nothing replaces the `rmSync`

Every temporary directory a fixture creates becomes `mkdtempSync(join(inject("isolationRoot"), ...))`: `test/auth-storage.test.ts:16`, `test/index.test.ts:46` and `test/catalog.test.ts:233,311,467`. `test/catalog.test.ts:515` names a file instead of creating a directory, so it becomes `join(inject("isolationRoot"), "pi-omlx-missing-model-settings.json")`, a path nothing creates, which is what that test is for (council A7). This is the first step because the cache step's fixture lands in `index.test.ts:46`'s directory.

The `rmSync` calls that clear a directory the test itself created, at `test/auth-storage.test.ts:24` and `test/index.test.ts:53`, go in this step. They stood in for a cleanup the harness already does: `mkdtemp` names are unique, and `global-setup.ts` removes the root whether the run passed or failed (council A2, the deletion test). `rmSync` keeps its remaining use in `index.test.ts` until step 4, and the import leaves with it. Whatever this step strands is deleted; `verification` Requirement 2 forbids suppressing it. The alternative, a shared cleanup helper so the calls stay, loses the deletion test: it would add a mechanism whose absence changes nothing.

`removeCacheFixture` and its `rmSync` wait for step 4, which is where council A2 put them. Until `cacheFixturePath()` follows the per-call path, that helper is the only thing clearing `<root>/agent/cache/omlx-models.json`, the file the cache fixture writes. Delete it before step 4 and the tests that begin with no cache read the write an earlier test left behind: Michael measured that at the baseline, where the failures are the no-cache startup, the failed load with no cache, the 200 with nothing registrable, the late catalog and the notice-decision trace. The helper, its `mkdirSync` and its call sites at `index.test.ts:636,657,692` go in step 4, beside the `cacheFixturePath` change, where the fixture lives in the fresh per-test `dir` and there is nothing to remove. This step is green at both ends: that measurement fails only when the helper's deletion comes with it.

`test/index.test.ts:570` already creates its fixture under the injected root and removes nothing per test, so it needs no change and is the pattern the other fixtures are brought to (trap (g)).

The `ProvidedContext` augmentation stays in `global-setup.ts` alone; the three test files gain `import { inject } from "vitest"` and no augmentation of their own (trap (f)). The harness itself, `test/isolation/*`, its keys and its guard list are untouched.

Its proof is a search, and the search is a scenario in the spec rather than a note here: at the baseline `rg -n 'tmpdir' test` reports `global-setup.ts` plus the fixture sites; after this step only `global-setup.ts` matches, because `mkdtempSync` under the injected root never names `tmpdir`. A fixture added the old way matches again, which is how the search is shown catching a mistake.

### D3. The credential read keeps one route: pi's default parameter

`readOmlxCredential()` calls `readStoredCredential(PROVIDER_KEY)`. The module variable and the setter are deleted, and so are `test/auth-storage.test.ts:18,21` and `test/index.test.ts:47,52`, the seam imports at `test/index.test.ts:19-20`, and the comment at `test/auth-storage.test.ts:32-35` that describes what the seam installed (council A6: a comment the change makes false goes in the step that makes it false).

Nothing takes the seam's place. A test isolates by setting `PI_CODING_AGENT_DIR` to a per-test directory, which both files already do and which pi honours per call. The production call sites at `index.ts:274` and `index.ts:299` change no argument they pass, so the extension's resolution is the same in a stable environment.

The alternatives lost for reasons Joel's ruling settles: a test-only path parameter kept under a private name is the same seam with a different label, and a path passed from the test through the extension's own call chain would put test-shaped state in production.

The step's proof is Matt's, from council S1: delete `process.env.PI_CODING_AGENT_DIR = dir` from `storeUnderAgentDir` at the baseline and the credential tests stay green, because the seam supplied the path; make the same deletion after the step and the tests that store a credential fail, while the tests that expect no credential stay green, as they should. The task records both runs. The mutation that returns `undefined` from the read is not the proof, because it fails at the baseline too and so says nothing about what the seam hid.

### D4. The singleton keeps its guard and loses its export

`index.ts:31` loses `export`; the guard at `:53-54` and the clear at `:131` stay as they are. `test/index.test.ts` drops the two `delete globalThis[EXTENSION_SINGLETON_KEY]` hooks at `:48,54` and the key's import at `:19`.

No test replaces the hooks. Every existing path already fires the production handler: `driveExtension`'s `finally` calls the fake's shutdown, which runs the extension's `session_shutdown` handler, and the next test loads the extension again. That is the spec's "second load after a session shutdown" scenario, and the mutation is its proof: comment out the clear at `index.ts:131` and the suite stays green while the hooks are present, then fails across most of `index.test.ts` once they are gone (council A3, A5). The design says this plainly so the tasks do not invent a duplicate reload test: the scenario is proven by `driveExtension` plus the mutation. The alternative, a `Symbol.for("pi-omlx/loaded")` copy in the test, is a second home for a string production owns, and Michael's trap (b) rejects it.

### D5. The cache path is computed where it is used, by one function

`CACHE_FILE` is deleted. `src/catalog.ts` gains a module-private `catalogCachePath()` returning `join(getAgentDir(), "cache", "omlx-models.json")`. `readCatalogCacheFile()` reads the file that returns; `writeCatalogCache()` binds it once to a local, creates `dirname(file)` with `mkdirSync(..., { recursive: true })`, and writes that file, still inside its best-effort `try`/`catch` (Michael's ruling 2, Neil P3's refinement).

`catalogCachePath()` is not exported. An export so a test can see the path would be the seam this change removes, and no test needs it: the tests assert on the file, not on the string. `readLastCatalogCache` is untouched and follows the change through `readCatalogCacheFile`.

Two alternatives lost. A lazily initialized constant keeps one capture for the life of the process, so the stale-path defect survives the first move of the agent directory. Exporting the helper so tests can compare paths recreates a public surface that exists for the suite.

The step is behaviour, and the two tests come first, in `test/catalog.test.ts`: that file is the home of the module they test, which is the suite's convention. The tests:

1. **The write.** `A` is `<root>/agent`, because `test/isolation/worker-setup.ts` imports `src/catalog.ts` before any test runs, so the test cannot choose the directory in force at load (trap (e), Chidi's experiment 1). The test sets B after import, with no `vi.resetModules()`, and writes a catalog whose `apiRoot` is one no other test uses (`https://cache-path-test.invalid/v1`). Both assertions are content checks: the cache file under B holds that `apiRoot`, and the file at `<root>/agent/cache/omlx-models.json` either does not exist or does not hold it. Presence alone cannot be checked, because the `/login` test writes that same path from another worker in a full run (council A4, whose wording this corrects and whose reason stands).
2. **The read.** A cache exists under a temporary directory B; the read made while B is in force reports its models; pi's agent directory then moves to a C holding no cache, and the read reports nothing (council S2). The test seeds no fixture under `<root>/agent`, so it cannot collide with the `/login` test's write.

At the baseline the write goes to the path captured at load rather than into B, landing there when that path's directory already exists and being swallowed when it does not, and the read under B reports nothing either way, so both tests fail before the mechanism lands (trap (d) reproduces it). Green depends on the content check on the file, not on a read: the write's `catch` swallows its own errors, and it hid a missing `dirname` import on Michael's first attempt, so a broken write must fail the test that opens the file.

In the same step, and named here so the implementation gate does not read it as an expectation edited to fit: `cacheFixturePath()` becomes `join(dir, "cache", "omlx-models.json")` with `dir` the per-test directory step 1 put under the root, its comment at `test/index.test.ts:250-254` goes, and its `mkdirSync` workaround goes (trap (c), council A6). `removeCacheFixture`, its `mkdirSync` and its call sites go in this step too, for the reason D2 gives: only here is there nothing left to remove. The fixture follows the fact.

### D6. What each guard refuses, and what fires it

- **`test/isolation/global-setup.ts` setup.** It refuses nothing itself; it makes the isolation real by pointing `HOME` and `PI_CODING_AGENT_DIR` into the fresh root and clearing the extension's environment keys before any test file loads. The refusal lives in the worker setup below.
- **`test/isolation/worker-setup.ts`.** Fires before any test runs and fails the run when the agent directory, `homedir()` or the overlay path resolves outside the root, naming the path. It reads the resolved paths, not a proxy. It cannot see a fixture path, which is why the fixture requirement is proven by a search rather than by this guard (council S4).
- **The teardown.** Fires at the end of every run, pass or fail, and removes the root. It is the only reason the per-test `rmSync` calls can go.
- **The `tmpdir` search.** Fires on a test file that names the system temporary directory; its only permitted match is `global-setup.ts`. It is a convention check Derek and the gate run by hand, not a runtime guard.
- **`verification` Requirement 2's suppression search.** Fires on any `@ts-ignore`-class comment, and it is what makes "delete the import" the only option when the seam removal strands one.
- **The load guard in `index.ts`.** Fires when a second factory run happens in one process while the key is set. Production, kept.
- **`writeCatalogCache`'s `catch`.** Deliberately refuses nothing, and this change does not touch it; the cache test's content check is what covers a silent write failure.

### D7. The implementation gate's coverage for this change

The gate reads the diff against these tasks, and each check below is answered deliberately rather than by default:

- **Contract adherence.** Each step's diff maps to its own tasks and nothing lands outside them. Step 1 touches the three test files that carry fixtures, and no production file. Step 2 touches `src/auth-storage.ts` and the two test files that use the seam. Step 3 touches `index.ts` and `test/index.test.ts`. Step 4 touches `src/catalog.ts`, `test/catalog.test.ts` with the new tests, and `test/index.test.ts`, where the cache fixture and the cleanup helper follow the fact.
- **Mechanism the design never described.** The only new mechanism is `catalogCachePath()` and the `mkdirSync(dirname(file))` call; the only deletions are named above with their files. A new helper, export or hook beyond those goes back through this gate.
- **Making it pass.** Two edits would read as an edited expectation to a gate that had not seen this section: `cacheFixturePath` following the cache path, and the deleted `mkdirSync` workaround. Both are the fixture following a fact the spec now states (D5). The cleanup helper's deletion belongs to the same fact, and it edits no expectation: once the fixture is written in a fresh per-test directory, nothing needs clearing. No assertion is weakened: the write-side test gains a content check on an `apiRoot` no other test uses, which the baseline cannot satisfy.
- **Tests.** No test mocks `src/catalog.ts` or the extension; both cache tests call the exported functions directly, and the reload scenario rides the production `session_shutdown` handler through `driveExtension`. The gate re-runs three mutations instead of reading about them: the guard's clear (D4), the environment line in `storeUnderAgentDir` (D3), and a fixture written with `tmpdir()` against the search (D2).
- **Fix the class.** `test/auth-storage.test.ts` is not named in Joel's card text but carries the same seam and a fixture outside the root, and `test/catalog.test.ts:515` names a path without creating it. Both are in scope, which is trap (a)'s point.
- **Shape.** Each removed export is left with no consumer, which Eleanor's inventory establishes and the gate re-checks by search. No compatibility shim is added for a caller inside the repository, and `Symbol.for("pi-omlx/loaded")` keeps its value so a dual install still shares one key.
- **Observability and errors.** No new use case, adapter or entry point, so no new logging and no changed error path. The swallowed catch stays as it is, and this design says so rather than leaving the gate to find it.
- **Mechanical.** `npm run check` (Biome, `tsc --noEmit`, the suite) after each step, and the suppression search from `verification` Requirement 2 over the whole diff.
- **Documentation.** No Markdown in the diff beyond `tasks.md`. What the change makes false goes on Derek's report for the docs pass (D8).

### D8. The docs pass, after the implementation gate

Joel's standing ruling is that documentation never blocks the feature, so none of this is a task; it is the state the docs pass has to leave behind. The system's shape goes to `ARCHITECTURE.md`, commands and conventions to `AGENTS.md`, and no decision here needs an ADR:

- **`ARCHITECTURE.md` §9.** Its first bullet, "The test seams that let a test point the credential store at a file are due for removal; the agent directory variable is the replacement, and new tests already take that route", is false once this change lands, because no seam exists and nothing is due. The bullet goes, and the rest of the list stands.
- **`ARCHITECTURE.md` §8.** It describes the run's isolation and says nothing about fixtures, so it is not made false. It gains one sentence, that a test's temporary fixtures are created under the root, because that is now part of the shape the section describes.
- **`AGENTS.md` conventions.** "New tests reach the credential store through the agent directory, never through a test-only seam. The seams that exist are another card's work" is half false: the route stands, the deferral does not. It becomes a convention that stays true, and the design adds the check that goes with it: a fixture's temporary path is under the isolation root, and `rg -n 'tmpdir' test` matches only `test/isolation/global-setup.ts`. A command plus a convention is `AGENTS.md`'s home, not `ARCHITECTURE.md`'s.
- **`AGENTS.md` traps.** Every trap there stays true. The guard-list convention for paths a test reads outside the repository stays true as well; after this change no test reads one, which is a consequence of the fixture requirement rather than an edit to the convention.
- **No ADR.** The seam-versus-agent-directory choice is Joel's ruling, recorded in this change's `owner-rulings.md`; the per-call cache path is stated by the `catalog-discovery` requirement. A second home for either would break one-fact-one-place. ADR 0001 stands unchanged, because which credential decides the connection does not move.
- **Derek's list is authoritative for what this section misses.** The docs pass starts from his list of Markdown files the diff made false and checks every tracked Markdown file it names, including `CONTRIBUTING.md` and anything under `docs/`. This design names what it can see; his report names the rest.

### D9. Requirement traceability

Every scenario in both deltas has a test here, and every change this design makes has a source:

| Spec scenario | Carried by |
|---|---|
| `catalog-discovery`: a write after the agent directory changes lands under the new directory | D5, the write test |
| `catalog-discovery`: a read follows the agent directory in force when it runs | D5, the read test |
| `test-isolation`: a credential fixture reaches the extension through a temporary agent directory | D3, with the per-test directory D2 provides |
| `test-isolation`: a second load after a session shutdown needs no reach into production state | D4, the mutation plus `driveExtension` |
| `test-isolation`: every temporary fixture path is under the root | D2 |
| `test-isolation`: no fixture names the system temporary directory | D2, the search |

The two removals are asked by Joel's ruling (`owner-rulings.md` §1) rather than by a spec requirement; the specs record the suite's side of them. Nothing else here lacks a source.

## Risks / Trade-offs

- **[Risk]** A factory that throws before `pi.on("session_shutdown")` registers leaves the key set, and later tests in the same process return early, cascading into failures that name the wrong test. → **Mitigation:** accepted, not eliminated. The only code before that registration is `registerCachedOrSetupModels`, whose I/O is swallowed by pi and by the extension, so the window is one swallowed call (Michael, trap (b)). The alternative, a copied `Symbol.for("pi-omlx/loaded")` string in the test, is a second home for the key and a worse trade.
- **[Risk]** The write-side cache test could pass on a broken write if someone later drops the content check, because `writeCatalogCache` swallows its own errors. → **Mitigation:** the spec scenario names the write's base URL landing under the new directory and no cache for it under the load-time directory, and the mutation is re-run at the gate (D5, trap (d)).
- **[Risk]** The fixture requirement is enforced by a search, and a test can still build a path outside the root without naming `tmpdir`, through an environment variable for instance. → **Mitigation:** none beyond the search and the review. The worker guard cannot see fixture paths, and this limit is stated rather than papered over (council S4).
- **[Risk]** Without the per-test `rmSync`, a hard-killed run leaves fixtures behind until the next run's root is created fresh. → **Mitigation:** teardown removes the root on pass and fail; a signal kill can leak a root today as well, which `global-setup.ts` already records.
- **[Risk]** A cache file written by the previous version sits where the module-load capture pointed, and after this change nothing reads it. → **Mitigation:** none needed. The two paths coincide whenever the agent directory is stable, which is the production case, so the only orphan is one a test or a moved environment created.
- **[Trade-off]** The suite loses the ability to point the credential read at an arbitrary file, which was occasionally convenient for a fixture. → The spec's route, the agent directory, does the same job per run and is the only route the operator's pi uses, so the suite now exercises what ships.
- **[Trade-off]** The cache step carries a test-file edit alongside its production edit. → Unavoidable: the fixture has to follow the fact, and splitting the two would leave one commit red (trap (c)).

## Migration Plan

No runtime migration and no operator action. In production the agent directory does not move during a process, so the path derived per call equals the path captured at load; no file changes location and no config is read differently.

- Land the four steps in D1's order, one task group at a time, each with `npm run check` green before the next starts.
- Verify each step by its own proof: the `tmpdir` search and the leaked directories (step 1), the environment-line mutation (step 2), the guard mutation (step 3), and the two cache tests red before and green after (step 4).
- Roll back by reverting the offending step's commit. Each step is independent of the others except that step 4 depends on step 1, so reverting step 1 requires reverting step 4 first.
- After the implementation gate passes: the docs pass (D8), then sync and archive.

## Open Questions

- Whether a project-local install beside a global one is behavior Joel wants at all. Michael's follow-up parks it on the dead-code card with the guard's untested early return; nothing in this design or its tasks changes if the answer is no.
