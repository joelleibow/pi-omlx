# Council Synthesis

## Question and Scope

The change deletes the `.env` loader, so the new `environment-configuration` requirement needs a
test that goes red if a loader returns. Two passes of the design council, neil and matt
(`council-neil-pass1.md`, `council-matt-pass1.md`, `council-neil-pass2.md`,
`council-matt-pass2.md`), took up four questions: how to prove the requirement without a test seam
and without writing into the clone; where a copy of the extension lives and which test file drives
it; where the direnv guidance that replaces `.env.example` goes, and whether `.gitignore` needs a
line to go with it; and three factual corrections to `proposal.md`.

Inputs: `proposal.md`, `specs/environment-configuration/spec.md`, `specs/test-isolation/spec.md`,
Chidi's report with Addendum 3 (the in-process import of a copy), Eleanor's report with Addenda 2
and 3 (loader timing, the guard's coverage, the docs inventory), `owner-rulings.md`, and Michael's
orientation.

The boundaries come from the card. Its acceptance criteria are its proposal (owner-rulings §1), so
the requirement restates "Nothing in the extension reads a file to set environment variables".
Everything about how the dev scripts get their configuration, beyond a pointer at direnv, is out of
scope, and documentation goes to the docs pass, which never blocks a feature (Michael, decisions 1
and 6).

## Perspectives & Trade-offs

Both advisors changed their recommendation in pass 2, each on new measurement. They agree on most of
the ground:

- The direnv guidance is an untracked `.envrc` in the clone: exported variables, then
  `direnv allow`, with no `.envrc.example`, and `.envrc` joining `.env` in `.gitignore` (neil pass 1
  §1; matt pass 1 §1; both pass 2, C5). Without the line, `export OMLX_API_KEY=…` can be committed,
  because no global git excludes cover `.envrc` (Michael, Traps).
- No test writes into the clone. A fixture beside the live `index.ts` would let any pi startup in
  that window read the probe values, and the loader runs at module load, so a write inside `it()`
  followed by a call to the statically imported function stays green (neil pass 1, Risks; matt pass
  1, Risks). `worker-setup.ts` does not guard writes to the repository root (Eleanor Addendum 2
  §7).
- The copy is `index.ts` plus `src/`, with `node_modules` linked, so `import.meta.url` resolves
  inside it (both, pass 1). Chidi Addendum 3 measured that an in-process import loads the copy and
  vite transforms it, and that `tsx` also works but needs a copied `package.json`.
- The red step comes from the copy's own `.env`: the PR #8 mock hides only `<repo>/.env`, so the
  test is red at HEAD with the loader present whether or not the mock is in place (Chidi Addendum 3
  answer 5). matt withdrew his pass-1 demand to remove the mock first.
- The proposal's three corrections: the live test totals go, `.env` "reached every pi session that
  loads the clone", and the docs-pass targets narrow to two files (both, pass 2, C4).

Where they split:

- **C1, one assertion or two.** matt pass 1 wanted one scenario with one assertion, because the
  second half restated `credential-resolution`. neil pass 2 argued for two THEN lines: Eleanor's
  "Environment read timing" shows `index.ts:214,240` handing an env object to `src/config.ts:60,64`,
  so a loader that parsed the file into that object without writing `process.env` would leave a
  `process.env`-only assertion green. matt accepted the second assertion in pass 2 and said the
  advisor reports measure neither: Chidi measured the import and `process.env`, not driving the
  copy's default export against a fake pi.
- **C2, the requirement's wording.** Both kept it. It restates Joel's acceptance criterion, and
  narrowing it to what a black-box test can enumerate would drop scope Joel approved. The gap (a
  cwd-relative read, or some other file) is named in a `shortcut:` comment on the test, and the
  implementation gate's diff search covers the rest (matt pass 2; neil pass 2).
- **C3, the mechanism.** Settled on in-process import. neil pass 1 had offered a `tsx` subprocess
  fallback and a `chdir` into the copy; his pass 2 dropped `chdir`, because it changes process-wide
  state, nothing in scope resolves from cwd, `worker_threads` throws
  `ERR_WORKER_UNSUPPORTED_OPERATION` on it, and Chidi tested the import without it.
- **D1, where the copy lives.** matt: `mkdtempSync(join(inject("isolationRoot"), "extension-copy-"))`,
  so the global teardown removes it even after a crash. neil: a test-owned `mkdtempSync` under
  `realpathSync(tmpdir())`, removed in `finally`, matching `test/index.test.ts:35-37` and keeping
  the copy out of the directory holding `HOME` and `PI_CODING_AGENT_DIR`.
- **D2, which file.** matt: a new `test/environment-configuration.test.ts`, named after the
  capability, with its own small inline fake pi, because `test/index.test.ts` statically imports the
  repository's `index.ts`. neil: `test/index.test.ts`, to reuse its fake pi, its fetch harness and
  its singleton cleanup.

Both advisors also reported, out of scope, that `CONTRIBUTING.md` sends contributors to `mise run …`
tasks and no `mise.toml` is tracked at HEAD (Eleanor Addendum 3). Each called it parked before this
change and neither asked for a ruling on it.

## Synthesis & Recommendation

The council converged on this, and Michael's rulings fixed the rest.

The capability keeps one scenario with two THEN lines, and one test proves both. The test lives in
`test/index.test.ts`. It copies `index.ts` and `src/` under the isolation root, links
`node_modules`, writes a `.env` there holding `OMLX_API_KEY` and `OMLX_BASE_URL`, imports the copy
in-process with `await import(/* @vite-ignore */ pathToFileURL(...).href)`, and drives the copy's
default export through the file's existing `driveExtension` harness, which gains one optional
parameter for the entry function. `withEnv` restores the two keys, the fetch recorder answers
`FIXTURE_MODELS`, and `recordCatalogFetches` counts the zero. A `finally`, with the file's
`afterEach`, deletes the keys the fixture set, clears the extension singleton, and leaves the copy
to the isolation root's teardown.

The red step is the copy's `.env` reaching `process.env` with HEAD's loader still in place, and the
green step is the same test after the deletion. The `.gitignore` line for `.envrc` rides in the
implementation diff and the design names it in the same breath as the contribution guidance, so the
two cannot drift apart. The proposal drops its moving totals, says the `.env` reached every pi
session that loads the clone, and narrows the docs pass to `ARCHITECTURE.md:71` and
`CONTRIBUTING.md`.

The rationale throughout is provability. The scenario has to fail when the behavior it names comes
back, which is why the two assertions are both kept and why the fake's catalog has to answer with
registrable models. A green that a fake empty catalog would produce anyway proves nothing.

## Accepted & Rejected Feedback

**Accepted.**

- Two THEN lines in one scenario, with "the resolution reports not configured" dropped (C1: neil
  pass 2, against matt pass 1, which then concurred). The observable assertions are a `process.env`
  check and a driven default export.
- The requirement keeps its full "no file" wording, with the test's `shortcut:` comment naming what
  it proves and the diff search covering the rest (C2: both advisors).
- In-process import of a copy, no `chdir`, cleanup of the keys and the singleton in `finally` and
  `afterEach` (C3: neil pass 2 and matt pass 2; neil's pass-1 `tsx` and `chdir` ideas withdrawn).
- The proposal's three corrections (C4).
- `.envrc` in `.gitignore`, in the implementation diff (C5: both passes of both advisors, confirmed
  by Michael).
- The copy under the isolation root (D1: matt, confirmed by Michael).
- The test in `test/index.test.ts`, reusing `driveExtension` and `recordCatalogFetches` (D2: neil,
  confirmed by Michael).

**Rejected.**

- A second fake pi and fetch recorder in a new `test/environment-configuration.test.ts` (matt pass
  1 and 2). It would be a second home for the harness, and the repository names test files after the
  module under test, not the capability (Michael, D2).
- A test-owned directory under `realpathSync(tmpdir())` with a `finally` `rmSync` (neil pass 1 and
  2). The isolation root's teardown already removes the copy on a pass, a fail or a thrown test, and
  a crash before the `finally` would leave a directory holding a fake key (Michael, D1).
- `process.chdir()` into the copy and the `tsx` subprocess fallback (neil pass 1). Withdrawn by neil
  in pass 2; nothing in scope resolves from cwd.
- Removing the `node:fs` mock before the test can go red (matt pass 1). Withdrawn by matt in pass 2;
  the mock hides only `<repo>/.env`.
- A single `process.env`-only assertion (matt pass 1). Superseded by his own pass-2 concurrence.
- "The resolution reports not configured" in the scenario (both, pass 1). Internal, and
  `credential-resolution` already owns it.
- The "11 files and 93 tests" totals, "started in the clone", and `CONFIGURATION.md`/`README.md` as
  docs-pass targets (C4). The first is a live count over a set the change moves, the second
  misstates what `import.meta.url` reached, and the third names files whose text is already correct
  (Eleanor Addendum 3).
- The `mise` observation. Out of scope, already parked, and outside this card (both advisors).

## Michael's Rulings

Michael settled all seven disputes. None went to Joel.

**C1, the scenario's assertions: settled.** One `environment-configuration` scenario with two THEN
lines. `process.env` lacking the fixture's keys after the copy's `index.ts` is imported, and zero
catalog fetches, are the discriminating assertions and stay. "Registers the login-only provider"
survives only with a condition, and the condition is now in the scenario: the fake catalog answers
with the suite's fixture models. Without registrable models the extension falls to the login-only
provider on its own, so the line would be a false green; he measured the loader-present copy
fetching twice from the fake server and registering login-only anyway. Dropping "reports not
configured" is right, since it is internal and `credential-resolution` owns it. **Decided by:** Joel's
rule that a test green after the behavior goes proves nothing. **Evidence:** his probe in
`scratch-michael/c1`, a `git archive HEAD` copy with `node_modules` symlinked, a `.env` holding both
keys, an in-process import, and a driven `mod.default(fakePi)` with a recording `fetch`; loader
present gave both keys set and two fetches, loader stripped gave both `undefined` and no fetch.

**C2, the requirement's wording: settled.** The wording keeps "no file" because it restates
acceptance criterion 1, which Joel approved as the card's proposal; narrowing it to fit the test
would drop scope he set. The test carries a `shortcut:` comment naming what it proves, and the
residual reader is caught by the diff search he runs at the implementation gate. The delta's colon
clause repeated the sentence before it, so that copy is trimmed and the rule keeps its full width.
**Decided by:** `owner-rulings.md` §1 and Joel's shortcut-comment standard.

**C3, the proving mechanism: settled**, on every converged point: in-process
`await import(pathToFileURL(...).href)` of a copy of `index.ts` and `src/` with `node_modules`
symlinked, no `chdir`, cleanup deleting the fixture keys from `process.env` and clearing the
singleton, the red step at HEAD with the loader present, and no mock-first ordering. Two facts the
design carries from his measurement: the copy's `src/*` are separate module instances, so a
`_setAuthPathForTesting` seam set on the repository's `auth-storage` does not reach the copy, and the
copy reads `auth.json` through `getAgentDir()` under the test's `PI_CODING_AGENT_DIR`, which is the
production path and what "nothing stored" means here. `Symbol.for("pi-omlx/loaded")` is shared
across instances, so the existing singleton clear covers the copy, and the two fixture keys persist
in the worker until they are deleted. **Decided by:** Chidi Addendum 3, re-run by him, and the
archived ruling that tests never mutate operating functionality, which rules out touching the clone.

**C4, the proposal's corrections: settled.** The totals go, because they count a set this change
moves. "Loads the clone" is the accurate phrase: the loader resolves from `import.meta.url`. The
docs pass corrects `ARCHITECTURE.md:71` and adds the direnv guidance to `CONTRIBUTING.md` beside the
script tasks; `README.md` and `docs/CONFIGURATION.md` are unchanged. **Decided by:** PL4's rule
against live counts over a moving set, Joel's standing ruling that documentation lands in the docs
pass, and Eleanor Addendum 3's search, which he re-ran.

**C5, `.envrc` in `.gitignore`: settled.** The line joins `.env` in Derek's diff, because the
guidance tells contributors to put a secret in an untracked `.envrc` in the clone and nothing else
keeps it out of `git add`. `.gitignore` is not Markdown, so it is Derek's, and the design must state
the line and the guidance as one decision so they cannot drift apart; if the design moves the
guidance outside the clone, the line goes with it. **Decided by:** his orientation trap, re-checked,
and Joel's "never cut security" floor. **Evidence:** `core.excludesfile` unset, one unrelated
pattern in `~/.config/git/ignore`, and Joel's other projects holding secrets in untracked `.envrc`
files.

**D1, where the copy lives: settled, under the isolation root.** No test-owned `rmSync` is needed,
because `teardown()` removes the root after a pass, a fail or a thrown test, where a copy under
`tmpdir()` needs test-owned removal and leaks a directory holding a `.env` with a fake key if the run
dies first. neil's objection does not bite: `HOME` is `<root>/home` and the agent dir is
`<root>/agent`, so the copy is a sibling, nothing enumerates the root, and the guard compares paths
with `path.relative`. The precedent neil cited uses `join(tmpdir(), …)` with an `afterEach`, and
`test/catalog.test.ts` already leaks its `mkdtemp` directories, a known smell the root fixes. The
keys and the singleton still need their cleanup either way. **Decided by:** the deletion test on each
constraint, and `test-isolation`'s removal requirement, which the root's teardown already satisfies.
**Evidence:** his probe ran the copy from both locations, loader present and stripped, with identical
results, and `global-setup.ts:36-41` removes the root.

**D2, which file: settled, `test/index.test.ts`.** The repository names test files after the module
under test, not the capability, and the thing under test is the extension entry loaded from a copy.
The static import is no obstacle: the copy is a different module id, both instances coexist in one
worker, and the shared `Symbol.for` singleton is already cleared by the file's `afterEach`.
`driveExtension` takes one optional parameter, the entry function, defaulting to the static import,
so the new test passes the copy's `mod.default`. `withEnv` then restores both fixture keys for free,
the fetch recorder answers `FIXTURE_MODELS` so C1's login-only line discriminates, and
`recordCatalogFetches` gives the zero-fetch count. A second fake pi in a new file would be a second
home for roughly sixty lines of harness. **Decided by:** Joel's one-home rule and the repository's
file-per-module convention, measured against `test/`. **Evidence:** every file in `test/` is named
for a `src/` module or `index.ts`; `test/index.test.ts:10` statically imports `../index.ts`, `:35-45`
clears the singleton before and after each test, `:118-137` keeps both keys in `ENV_KEYS`, and
`:208-240` is `driveExtension` defaulting its response to `FIXTURE_MODELS`.

## Owner Decisions Required

None. Michael marked no dispute `joel`. The card's own terms, including the `.envrc` line, the
requirement's wording and the re-added `test-isolation` requirement's name, are settled above or in
`owner-rulings.md`, and the `mise` observation is out of scope for this change.
