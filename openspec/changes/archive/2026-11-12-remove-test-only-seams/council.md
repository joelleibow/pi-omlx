# Council Synthesis

## Question and Scope

One pass ran. Neil's report is `council-neil-pass1.md` and Matt's is `council-matt-pass1.md`. The advisors converged on the shape of the work, so the points they still split on went to Michael directly, and his rulings are recorded below in place of a second pass.

The question: how to take two production exports that exist only for the test suite out of the code, stop the catalog cache path from being captured at module load, and bring every temporary test fixture under the run's isolation root, without weakening what the suite proves.

The constraints in play:

- Joel, `owner-rulings.md` §1: no production export or branch exists only to serve a test; the tests that used one still prove the same behavior through a temporary agent directory; `env = process.env`-style parameters are out of scope.
- Joel, carried from the isolation archive §1: "Tests never mutate operating functionality."
- Michael, `michael-orientation.md`: "Decisions that bind", "What it must not touch", the traps (each measured), and "Settled". Two earlier rulings travel with it: the per-call cache path as this card's step, with Neil P3's `mkdirSync(dirname(file))` refinement, and the `mkdtemp` fixtures under `inject("isolationRoot")`.
- The inputs both advisors worked from: `proposal.md`, the two delta specs, `research-chidi.md` and `research-eleanor.md`, plus the design gate's rule that a task whose value is catching a mistake shows how it catches one.

## Perspectives & Trade-offs

**Agreed, with no dispute raised.**

- Four steps and no new abstraction: fixtures under `inject("isolationRoot")`, the credential seam, the singleton export and its hooks, the per-call cache path.
- Fixtures move first. The cache step hands its fixture to the per-test `dir` at `index.test.ts:46`, and that directory is outside the root until the fixture move lands, so the reverse order writes a catalog cache into the system temporary directory for one step.
- Drop the per-test `rmSync`. `mkdtemp` names are unique, and `global-setup.ts` removes the root whether the run passed or failed, so the calls protect nothing. Both advisors reached this through the deletion test rather than by preference.
- Delete the imports the deletion leaves unused. Neither advisor would suppress them, on `verification` Requirement 2.
- The guard's early return stays out of scope. It is the dead-code card's question.
- Keep the two deltas where they are: `catalog-discovery` and `test-isolation`, no third home.

**Disputed, and settled by Michael.**

- **S1, what proves the credential seam's removal.** Neil would mutate `readOmlxCredential()` to return `undefined` and watch the credential tests fail. Matt would delete the `PI_CODING_AGENT_DIR` line in `storeUnderAgentDir` and show it green at HEAD, then red after the removal. Neil's mutation is red before the step and after it. Matt's is green before and red after.
- **S2, the shape of the read-side test in `catalog-discovery`.** Neil: write a cache under a temporary directory B, switch pi's agent directory to an empty C, and assert the read returns nothing, so the test never seeds `<root>/agent`. Matt: put a decoy under `<root>/agent`, leave B empty, and assert the read returns nothing. Neil's objection to Matt's: `<root>/agent` is the suite-wide default, and other tests in the same run read it.
- **S3, the label of the cache step.** Michael's ruling 2 on the isolation change called it structure-only. Matt argued that a step whose own test goes red and then green is behaviour under the two-hats rule.
- **S4, how the fixture requirement is enforced.** Matt wanted the design to carry a `shortcut:` comment saying that only a review search enforces "fixtures under the root", since the worker guard checks three fixed paths and cannot see fixture paths; he also wanted the credential scenario's AND clause cut as unasserted. Neil wanted that scenario reworded to a temporary agent directory under the root, because no fixture uses `<root>/agent`.

**Where the advisors stood.** Neil: high confidence, on Michael's four measured edits and the red mutations in traps (a) through (f). Matt: medium, because step 2's red proof and the read-side red were unmeasured when he wrote. Michael ran both this pass, and both behave as claimed.

**The advisors' own unverified claims, now closed.** Neil flagged two: whether `auth-storage.test.ts` restores `PI_CODING_AGENT_DIR` after each test, and whether a test already loads the extension twice across a `session_shutdown`. The first is yes (`:20-24`), and A2 rules on it; the second is no, and A5 records the limit that follows. Matt flagged step 2's behaviour and the read-side red; S1 measured both.

## Synthesis & Recommendation

Four steps, in the order A1 fixes, each with the red proof the task list must carry:

1. **Fixtures under the root.** Point every `tmpdir()` and `mkdtemp` fixture at `inject("isolationRoot")`: `auth-storage.test.ts:16`, `index.test.ts:46`, `catalog.test.ts:233,311,467,515`, the last being a file path a test names but never creates. Drop the per-test `rmSync` and the imports it leaves unused. Structure: green before and after. Its value shows as the leaked `pi-omlx-*` directories that stop appearing in the system temporary directory after a run.
2. **The credential seam.** Delete `authPathOverrideForTesting` and `_setAuthPathForTesting`; call `readStoredCredential(PROVIDER_KEY)`. Structure, and its proof is Matt's, per S1.
3. **The singleton export and hooks.** Remove `export` from `EXTENSION_SINGLETON_KEY` and delete the two hooks at `index.test.ts:48,54`. Structure, proved by the mutation of `index.ts:131` (A3).
4. **The per-call cache path.** Write the two tests first, then add one path helper that the read and the write share, import `dirname`, and create the directory of the file being written. Behaviour, per S3, and the `cacheFixturePath` change lands in the same step so the fixture follows the fact (trap (c)).

The spec deltas, as the rulings amend them:

- `catalog-discovery`, "The Cache Follows The Agent Directory": the write-side scenario keeps its absence check on the directory in force at load, and asserts the cache *file's* absence, never the directory's (A4). The read-side scenario switches from a populated temporary directory to one holding no cache, and says a cache-less directory supplies nothing (S2).
- `test-isolation`, "Fixtures Reach Pi's State Through The Agent Directory And Stay Under The Root": the credential scenario names a temporary agent directory under the root (S4 iii); the AND clause is gone (S4 ii); the fixture clause and its scenario cover every temporary path a fixture names, created or only referred to (A7); and the requirement's enforcement is its own scenario, a `rg -n 'tmpdir' test` search whose matches all sit in `global-setup.ts` (S4 i).

Proposal corrections: bullet five now states what the mutation shows, that shutdown clears the key (A5), and the stale list gains the three items A6 names, split between the docs pass and the steps that make the code comments false.

## Accepted & Rejected Feedback

**Accepted.**

- Neil's step order, including the warning that `cacheFixturePath` cannot move before the fixtures do (A1).
- Both advisors on dropping `rmSync` and deleting the imports rather than suppressing them (A2).
- Matt's red proof for step 2, with his two measurements recorded in the task (S1).
- Neil's read-side shape, which also keeps Matt's point from trap (d): the absence check is on the file, and the positive check is that the file exists under the directory in force (S2, A4).
- Matt's label for step 4 (S3).
- Matt's enforcement concern, kept but reshaped: a spec scenario a gate can run beats a `shortcut:` comment it cannot (S4 i).
- Matt's cut of the redundant AND clause, on the one-fact-one-place rule (S4 ii).
- Neil's reword of the credential scenario (S4 iii).
- Both advisors' stale-item lists, merged, and A7's widening from directories to paths (A6, A7).
- Matt's and Neil's shared objection that the proposal overstated what the suite proves about the guard (A5).

**Rejected.**

- Matt's decoy under `<root>/agent` for the read-side test. The `/login` test writes `<root>/agent/cache/omlx-models.json` from whichever worker runs `index.test.ts`, so the decoy and that write race in both directions (S2).
- Matt's `shortcut:` comment. A comment needs a code home and this limit has none, and nothing in a test can check it; the spec scenario replaces it (S4 i).
- Neil's `undefined` mutation as step 2's red proof. It is red at the baseline as well as after the removal, so it shows the tests depend on a credential, which was never in doubt, and says nothing about what the seam hid (S1).
- No advisor is overruled on the "structure-only" label: it was Michael's own, and he revised it when Matt raised the contradiction (S3).

## Michael's Rulings

### A1. Step order

Ruling: confirmed, with the reason stated. Fixtures first, then the credential seam, then the singleton export and hooks, then the cache path with `cacheFixturePath` following it in the same step. The credential and singleton steps are independent of each other, so either order serves.

Decided by: `test-isolation` Requirement 3, that every run resolves pi's agent directory under the isolation root, applied step by step, and his orientation trap (c) measurement. `cacheFixturePath` becomes `join(dir, "cache", ...)`, and `dir` at `index.test.ts:46` is a `tmpdir()` directory until the fixture move lands, so the reverse order writes the cache outside the root for one step.

Evidence: all four edits in a scratch copy of the repository, `npm run check` green. With teardown disabled, every file the run writes sits under the root, and none under `tmpdir()` once the fixtures moved.

### A2. Drop the per-test `rmSync`

Ruling: confirmed, and widened. `removeCacheFixture` (`index.test.ts:279`) and its `rmSync` go too, since after the cache step the fixture lives in the per-test `dir`, and `rmSync` then leaves `index.test.ts`'s import list. `verification` Requirement 2 forbids suppressing the import that leaves unused.

Decided by: the deletion test (nothing breaks without the calls, because `mkdtemp` names are unique and the root is removed after a pass or a fail) and `verification` Requirement 2.

Evidence: Neil's risk about `PI_CODING_AGENT_DIR` does not bite. `auth-storage.test.ts:20-24` already restores or deletes the variable after each test, and every test gets a fresh `mkdtemp` directory, so no test can read another's `auth.json`. Eleanor's survey found three `rmSync` sites across the two files.

### A3. The red proof for the singleton step

Ruling: confirmed. The measured mutation of the guard's clear stands as the task's red proof, and both numbers are recorded in the task.

Decided by: his orientation trap (b), re-run this pass.

Evidence: commenting out `delete globalState[EXTENSION_SINGLETON_KEY]` at `index.ts:131` leaves the `index.test.ts` suite green while the hooks are in place, and fails most of it once they are gone.

### A4. The A-to-B cache test

Ruling: confirmed, with one wording point. The test sets B after import, A is `<root>/agent` and no `vi.resetModules()` is used. It asserts the cache *file* is absent under `<root>/agent/cache`, not the directory, because the `/login` test writes that file from another worker in a full run and the test must not assume `<root>/agent` is empty. The load-bearing check is that the file under B is this test's write, because the swallowed catch hides a broken write. Revised below, after the task gate measured the race.

Decided by: his ruling 2 on the isolation change, traps (d) and (e), and Chidi's experiment 1, where the worker setup imports `src/catalog.ts` before any test and so fixes A.

Evidence: the test is green per call and red, with `existsSync` false under B, when the import-time constant is restored. A full run's root listing shows `<root>/agent/cache/omlx-models.json` present, written by the `/login` test.

Revised at the tasks gate: the file's absence is not checkable, because the `/login` test writes that path before the write test asserts, so the assertion was red in every full run and in an adverse-order sequential run Michael forced. Both checks became content checks on an `apiRoot` no other test uses. The reason above stands; only the assertion changes, and the design carries the corrected wording (D5).

### A5. The proposal overstated what the suite proves

Ruling: confirmed. The fifth What Changes bullet now says what the mutation shows: `session_shutdown` clears the key, and a run that fails to clear it is caught. The second-call early return stays untested and remains the dead-code card's question in the Impact follow-up.

Decided by: the mutation itself, which kills the clear rather than the early return, and the one-fact-one-place rule, since the bullet and the follow-up contradicted each other.

Evidence: no test in `index.test.ts` calls the factory twice without a `session_shutdown` between. The one direct call is `extension(`, and the rest go through `driveExtension`, whose `finally` shuts the fake down.

### A6. The stale items

Ruling: confirmed, and the list extended. The comment at `auth-storage.test.ts:32-35`, the seam imports at `index.test.ts:19-20` and the `cacheFixturePath` `mkdirSync` workaround join it. Each goes in the step that makes it false: the comment and the imports in the credential step, the workaround and the comment at `index.test.ts:250-254` in the cache step. The docs pass also takes `ARCHITECTURE.md` §8's sentence that new tests already take the agent-directory route, beside §9 and `AGENTS.md`.

Decided by: the implementation gate's rule that a comment the change makes false is a defect of the change.

Evidence: the comment at `auth-storage.test.ts:31-35` describes the file the seam installed, and `index.test.ts:19-20` and `250-262` carry the imports and the workaround.

### A7. Paths, not directories

Ruling: confirmed, and folded into S4. The fixture clause and its scenario name the path class, because `catalog.test.ts:515` names a file, and its proof is the search S4 rules for.

Decided by: Eleanor's survey, which records `:515` as `join(tmpdir(), "pi-omlx-missing-model-settings.json")`, a path no test creates.

Evidence: Eleanor's survey found six sites outside `test/isolation/` naming the system temporary directory, one of them that file path.

### S1. The red proof for the credential step

Ruling: Matt's. A structure step's proof is a defect the removed structure hid and the new shape catches, which is his mutation flipping from green to red across the step. Neil's is red before and after, so it says nothing about the removal. Matt's two measurements go in the task: at the baseline, deleting the environment line leaves the credential tests green; after the removal, the same deletion turns the tests that store a credential red while the tests for a missing credential stay green.

Decided by: the gate's rule that a task whose value is catching a mistake says how it will be shown catching one, plus the measurement.

Evidence: both runs done this pass. Neil's mutation fails most of both credential files in the repository with the seam gone, and would fail the same way at the baseline.

### S2. The read-side test shape

Ruling: Neil's. `<root>/agent` is the suite-wide default agent directory on one filesystem, and the `/login` test already writes a cache there from whichever worker runs `index.test.ts`. A decoy placed there races that write in both directions: the decoy can be clobbered, and the `/login` test's registration can read the decoy. Neil's shape is self-contained and red at the baseline under either ordering. Consequence for the delta: the read scenario's second clause says a directory holding no cache supplies nothing, rather than naming the directory in force at load, since the test no longer seeds it.

Decided by: `test-isolation` Requirement 3's intent, that a test's outcome not depend on state another test left, applied inside one run, and the measured write to `<root>/agent` by the `/login` test.

Evidence: Neil's test, written and run, is red at the baseline at the read under the populated directory and green after the change. A full run's root listing shows the `/login` test's cache file.

### S3. The label of the cache step

Ruling: Matt's, and it revises Michael's own earlier wording. The step is behaviour: the change is observable from outside the module, in where the file lands when the agent directory changes after import, and its test goes red at the baseline and green after, which is the definition. His "structure-only" in ruling 2 meant the step stands apart from the isolation configuration, and the mechanism and test he named there are unchanged.

Decided by: the two-hats rule itself, red-to-green being behaviour and green-to-green being structure.

Evidence: the A-to-B test measured red with the import-time constant and green per call, so the step's own test flips.

### S4. Enforcing the fixture requirement

Ruling: three parts.

1. No `shortcut:` comment. Instead, the requirement's enforcement is one of its own scenarios, on the pattern the living `verification` spec uses for suppressions: a search run from the repository root whose matches all sit in `test/isolation/global-setup.ts`. A gate can run that; it cannot check a comment.
2. The credential scenario's AND clause goes. The requirement's first sentence already says that no production export or branch exists for a test, so the clause was a second copy of one fact, and nothing in a test observes it. The mutation S1 rules on is its proof, and the design cites that.
3. Neil's reword stands: tests use a per-test directory under the root, never `<root>/agent`, so the scenario names a temporary agent directory under the root.

Decided by: `verification` Requirement 2 as the living precedent for a search-proved requirement; one fact, one place for the AND clause; the per-test `dir` at `index.test.ts:46` and `auth-storage.test.ts:16` for the reword.

Evidence: the worker guard checks three resolved paths and cannot see a fixture path, as Matt said. At the baseline the search finds `global-setup.ts` plus the six fixture sites; after the fixture move only the setup file's remain, and `mkdtempSync` under the injected root does not match the search, so the search discriminates.

## Owner Decisions Required

None. Every point the pass left open was one Michael could settle from a decision in play or from a measurement, and he marked none `joel`. The one product question in view, whether duplicate-install dedup is behavior Joel wants at all, is not a council dispute and does not block `design.md`: it belongs to the dead-code card with Michael's follow-up, where the guard's untested second call already sits.
