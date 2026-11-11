# Design

## Context

The repository is one pi extension, `pi-omlx-picker@0.3.6` (`package.json:3`), with no living specs, no `AGENTS.md`, no `ARCHITECTURE.md` and no ADRs (`research-eleanor.md`, Sources). Joel ruled the package `pi-omlx`, living in a standalone `joelleibow/pi-omlx` with `PeachlifeAB/pi-omlx-picker` kept as `upstream`, and the clone directory `~/Projects/pi-omlx` with pi's `packages` entry his to edit (R1–R3, `owner-rulings.md`). At the PL2 gate he ruled the repository public, the npm name `pi-omlx` claimed now with a do-nothing `0.0.0-alpha` stub he publishes himself, and `LICENSE` unchanged (`owner-rulings.md`). `proposal.md` says why the name is wrong and splits the work into four pieces; `council.md` records the ten decisions this design carries out.

Five constraints shape the approach.

- Eleanor's inventory holds 22 old-name lines in 13 tracked files, plus the `picker` keyword and the `pickerDebug` helper with its 10 call sites (`michael-orientation.md` §1, reproducing `research-eleanor.md`).
- Some of those lines hold the old name inside a statement that is already false: the `~/.pi/packages/<name>` probes and the `provider-debug.log` reads in both scripts (`michael-orientation.md` trap f; `research-eleanor.md` Addendum 1).
- The debug variable is undocumented and untested; `rg PI_OMLX test/` finds nothing (`michael-orientation.md` trap a).
- The typecheck is red at baseline `c27fba9`, on `src/provider.ts:35,37` and `test/provider.test.ts:49-72`, so no task here can claim a green `npx tsc --noEmit` (`research-eleanor.md`, Baseline; `michael-orientation.md` trap g).
- Markdown documentation is not a task, and the implementation gate treats a Markdown file in the diff other than `tasks.md` as a finding, so no document edit can travel with the code (`council-neil-pass2.md` M1; `council-matt-pass2.md` N1).

The council left four facts to design, and all four are now settled. Eleanor quoted `src/debug.ts:18` as `if (!process.env[DEBUG_ENV]) return;`. Michael measured the other three at the design gate: `index.ts:30` already reads `PROVIDER_KEY`, `test/index.test.ts:53` discards the registered id, the auth-storage tests already read through `PROVIDER_KEY`, and `scripts/debug-pi.ts`'s `timeline` returns before its OMLX and changed-files sections unless the provider log yields a request. Eleanor's addendum 2 had not landed when this was written, so the gate's measurements are the source for all but the predicate.

## Goals / Non-Goals

**Goals:**

- The manifest, the lockfile, the code and the tests carry the new name, and a runnable check proves the old tokens are gone.
- The debug tracing answers to `PI_OMLX_DEBUG` and prints `[pi-omlx]`, with the predicate untouched and tests that fail if any of that changes.
- The scripts stop naming an install path the package does not use.
- The npm name is claimed by a stub that changes nobody's session.
- Every document the change makes false is corrected after the implementation gate.
- The directory moves last, with its silent consequence stated and Joel's half named.

**Non-Goals:**

- No release, and no choice of the version a release carries; the stub of decision 4 is a name claim, not a release.
- No repair of the typechecker: `npx tsc --noEmit` must fail exactly as it does at `c27fba9`, and fixing it is a separate change (`michael-orientation.md` trap g).
- No change to the provider id `omlx`, which credentials, model references and settings are keyed by (`research-chidi.md` Q2.1–Q2.2).
- No `LICENSE` edit (`owner-rulings.md`, "LICENSE (PL2)").
- No migration of pi state and no write under `~/.pi/agent`, including the `packages` entry, which is Joel's (R3; `michael-orientation.md` trap e).
- No repointing of the scripts at pi's npm install path: the npm name reaches the registry as a stub that registers nothing, a local install loads where it sits, and nothing writes the log they read (`council-matt-pass3.md` Q1; `research-eleanor.md` Addendum 1).
- The council's two out-of-scope findings stay out: `scripts/debug-pi.ts:79-97` reading `~/.pi/config.json`, and `CONTRIBUTING.md`'s `mise run` tasks with no tracked definition (`council-neil-pass2.md`; `council-matt-pass2.md`).

## Decisions

### 1. Structure steps first, then one behaviour per step

Three steps change no behaviour and keep the suite green on both sides. Three change behaviour, and each gets evidence of its own.

**Structure steps.**

- **S1: the singleton key gets one home.** `index.ts:31` exports the key it registers in `Symbol.for(...)`, and `test/index.test.ts:13` imports it instead of repeating the literal. pi's loader takes the default factory and ignores named exports beside it, so the export is invisible to pi (`research-chidi.md` Addendum 1 (2); `council-neil-pass3.md` P1).
- **S2: the helper is renamed.** `pickerDebug` becomes `omlxDebug` at `src/debug.ts:14`, with its call sites at `index.ts:26` and `src/stream.ts:25,155,196,203,266` (`research-eleanor.md`).

**Behaviour steps.**

- **B1: the debug variable and its prefix.** `PI_OMLX_PICKER_DEBUG` becomes `PI_OMLX_DEBUG` (`src/debug.ts:1`), and `[pi-omlx-picker]` becomes `[pi-omlx]` (`src/debug.ts:28`). The predicate at `src/debug.ts:18` does not change. The tests come first, and they are what this step is judged by.
- **B2: the name and the metadata.** `package.json:2`, the `picker` keyword at `package.json:11`, the key's string at `index.ts:31`, the test literals (`test/auth-storage.test.ts:20`, `test/catalog.test.ts:233,311,467,515`, `test/config.test.ts:60`, `test/index.test.ts:38`), and the regenerated lockfile.
- **B3: the scripts lose their dead probes, and `timeline` gets a stated end state.** The `~/.pi/packages/` lines and the `provider-debug.log` reads leave `scripts/debug-pi.ts` and `scripts/debug-omlx.ts`, and the constants that built them (`INSTALLED_PACKAGE`, `PACKAGE_ID`, `PI_DEBUG_LOG`) go with the lines that used them. `timeline` from then on anchors only on the session file, id or timestamp the caller supplies, with no default, and builds its window from that anchor's date; it still prints its OMLX and changed-files sections. The provider-request path leaves with `printProviderTimeline`, `printProviderDebugSummary`, `readProviderRows`, `findProviderRequest`, `latestProviderRequest` and the `PACKAGE_*` constants that fed them, and `printLogSummary` and `parseLogLine` in `debug-omlx.ts` follow once nothing calls them (design-gate measurement of `debug-pi.ts:147-153,344,362-367`).

Why this shape:

- **Why structure first.** Joel's rule is to make the change easy and then make the easy change. S1 turns the key's string into a one-line edit inside B2; without it the test holds a second copy of the fact and both copies have to move together (`michael-orientation.md` trap b). S2 stays out of B1 because B1 ships new tests: folding an internal rename into a step that adds tests leaves "green before and after" unable to say whether the rename or the tests moved (`council-matt-pass2.md` N4).
- **Why not one repository-wide substitution.** A substitution turns `scripts/debug-pi.ts:18` into `PACKAGE_ID = "pi-omlx"` and leaves a probe under a directory pi does not use (`michael-orientation.md` trap f; `council-matt-pass3.md` Q1). It also hides the variable rename and the key's new string inside a diff that reads as mechanical, so neither gets its own evidence.
- **Rejected: an alias for `PI_OMLX_PICKER_DEBUG`.** It would give one fact two homes and shim a knob nothing documented or tested depends on (`michael-orientation.md` trap a; `council-neil-pass1.md` 3). The diagnostics test in decision 2 closes that door: an alias makes the old variable print, and the test fails.
- **Rejected: keeping both singleton keys.** Nothing outside the process reads the key, and Joel's settings holds one package entry, so a second key buys no coexistence (`michael-orientation.md` trap b).

### 2. What proves each requirement, and what fails if the behaviour goes

**Package identity, the manifest, the lockfile and the tarball.** `npm pkg get name` prints `pi-omlx`; `git grep -n pi-omlx-picker package.json package-lock.json` returns nothing; `npm pack --dry-run` reports a tarball named `pi-omlx-0.3.6.tgz`. Each answer comes from the manifest or the lockfile, so putting either name back fails the run. Publishing is out of scope, which is why the pack check replaces the spec's original "or published" (`council-neil-pass2.md` M3).

**Package identity, the old tokens in code and metadata.** Two greps, from the repository root:

```
git grep -ni -e pi-omlx-picker -- ':!*.md' ':!openspec/'
git grep -ni -e picker -- ':!*.md' ':!openspec/'
```

The second subsumes the first and covers the keyword, the helper, the key's string and the test prefixes in one check (`council-neil-pass3.md` P1; `council-matt-pass3.md` Q1). `':!*.md'` stays until the docs pass has run, because the README, CONTRIBUTING and `docs/CONFIGURATION.md` still carry the old name at the implementation gate, and no code change can clear them (`council-neil-pass2.md` M2). The docs pass ends with the same grep over the whole tracked tree except `openspec/`. Restoring any single token (the keyword, one `pickerDebug` call site, the key's string, a temporary-directory prefix) makes a run print it, so the check fails when the work it guards is removed.

**Scripts.** Two greps over `scripts/`, both red at the start of B3 and green at its end. The first names the identifiers that build the install-path probes: `git grep -nE 'INSTALLED_PACKAGE|PACKAGE_ID|PI_DEBUG_LOG' scripts/`, which returns 11 lines at `c27fba9` (design-gate measurement). The second matches the log filenames the scripts read today: `git grep -n 'provider-debug.log' scripts/`. A literal `'.pi/packages'` check would have proved nothing here: both scripts build that path with `join(…, "packages", …)` (`debug-pi.ts:19`; `debug-omlx.ts:18-25`), so the literal never appears and that grep was already green before any work. The requirement's third clause, that each script keeps its session, cache and OMLX diagnostics, gets no test: a test over a diagnostic program's printed output would test its formatting, not its work. Its guard is the end state B3 states, recorded from both scripts' output by the task that builds it: `debug-pi.ts`'s `timeline` runs from the anchor the caller passes, with no default, and still prints the OMLX and changed-files sections, while the provider-request path and the helpers that served it are gone.

**Provider access.** Three assertions at the extension's boundary, all three added by B2, each extending a test that already drives real code.

- `test/index.test.ts` drives the extension's factory with a stand-in pi host and throws away the id it registers (`test/index.test.ts:53`). B2 extends that fake's `registerProvider` to capture the id and asserts it equals `PROVIDER_KEY`. `index.ts:30` already reads `PROVIDER_KEY`, so nothing in `index.ts` changes.
- `test/auth-storage.test.ts` already reads through `PROVIDER_KEY`. B2 adds one assertion there pinning the literal once: `PROVIDER_KEY` is `"omlx"`. Without it, setting `PROVIDER_KEY = "pi-omlx"` keeps every test green while breaking the requirement and every `omlx` credential already stored, which is the drift this spec exists to catch.
- Also in `test/auth-storage.test.ts`, and read-only: a fixture stored under `PROVIDER_KEY` comes back from `loadOmlxCredential`, and one stored under `pi-omlx` does not. Nothing here writes credentials (`rg writeStored src` finds nothing): pi stores the login result under the registered id, so an assertion about a write path would test nothing.

The literal lives in `test/auth-storage.test.ts`, beside the constant it pins; the registration assertion uses the import. One check catches a wrong value, the other catches the two sites drifting apart (`council-matt-pass3.md` Q2). `src/auth-storage.ts:4` stays the one place the id lives in code (`specs/provider-access/spec.md`, "Provider Id Is omlx"), and a test that reads it is where a pinned value belongs.

Deleting the behaviour fails a test: a registered id of `pi-omlx` fails the index test's capture, a `PROVIDER_KEY` of anything but `omlx` fails the literal, and a credential keyed by the package's name fails the read (`council-neil-pass3.md` P2). The scenarios the council dropped stay dropped: credentials, model references and the models store are all keyed by provider id inside pi's own runtime, so they follow from these assertions and have nothing here to test (`research-chidi.md` Q2.1–Q2.3).

**Diagnostics.** `src/debug.ts:18` is a falsy check on the variable, `if (!process.env[DEBUG_ENV]) return;`. Three answers follow from the operator: unset and the empty string are falsy, so tracing stays off, and `0` arrives as the string `"0"`, which is truthy, so tracing turns on. Those are the answers B1 preserves while it renames the variable and the prefix; nothing else about which values enable tracing changes.

A new test file (`test/debug.test.ts`) runs four cases (the variable unset, the empty string, `0`, and a value that turns tracing on), each in a fresh module instance through `vi.resetModules()` and `vi.stubEnv`, with `process.stderr.write` spied, and asserts the four answers as literals. The tests are written before the rename and run against the unchanged predicate, so a run confirms the answers above rather than this design asserting them. That run is B1's evidence; if it disagrees with the derivation, the run wins and the test records what the code does. Two more assertions live in the same file: an emitted line carries `[pi-omlx]` and never `[pi-omlx-picker]`, and setting `PI_OMLX_PICKER_DEBUG` alone emits nothing. The last one fails the moment an alias appears.

Each case runs against a fresh module instance, so the test does not depend on whether the module reads the variable at import time or on every call. What it pins is the answer for each value, which is the behaviour the spec describes.

### 3. The lockfile is regenerated, never hand-edited

`npm install --package-lock-only --ignore-scripts` runs after B2's manifest edit, and the task verifies that `git diff package-lock.json` shows the name on the root entry and on the `packages[""]` entry and nothing else. Michael ran the same command on a copy carrying the new name: the diff was exactly those two lines, with no `latest` bumps to dev dependencies (`michael-orientation.md` trap c).

Rejected: editing the two lines by hand. The next real install rewrites the file from the manifest, so a hand edit is true only until someone runs `npm install`. Rejected: a full `npm install`, which also rewrites `node_modules` and can float transitive dependencies this change has no business moving.

### 4. The npm claim is a stub built outside this tree, and Joel publishes it

The stub is a package of its own in `~/Projects/pi-omlx-stub`, a directory outside this repository's working tree, holding:

- a `package.json` declaring `name: "pi-omlx"`, `version: "0.0.0-alpha"`, `license: "MIT"` and a description pointing at `joelleibow/pi-omlx`;
- a copy of `LICENSE`, so the tarball's license field matches what it ships;
- `extensions/pi-omlx.ts`, whose default export is a factory with an empty body.

Where the factory sits is what makes it load. pi reads a package's extensions from its `pi.extensions` list or from a conventional `extensions/` directory and from nowhere else (`package-manager.js:2001-2044`), so a root `index.ts` would load nothing, and the stub would become the package pi cannot load, which is the case this decision exists to avoid. pi requires each entry to be a function and errors otherwise with `Extension does not export a valid factory function` (`research-chidi.md` Addendum 1 (2); `loader.js:490-494`), then calls it (`:523`). This factory's body is empty, so nothing reaches the model registry; that follows from the file the stub ships, and no run is needed to establish it. pi-jefferson's claim commit `cf3a8a4` puts its factory at `extensions/jefferson.ts` with no `pi` manifest, the layout chosen here (`brief-bambadjan-design.md` §4).

What the stub leaves out, and why:

- **No `pi-package` keyword.** That keyword is what makes an npm package eligible for the pi gallery (`research-chidi.md` Q3.1), and a stub carrying it would be listed as a package that installs nothing.
- **No `npm:pi-omlx` line in any document.** The stub registers nothing, so naming it would install nothing useful; the README keeps the git source (decision 5).

Why not build it here: this repository's manifest carries `version` `0.3.6` and a `files` allowlist of `index.ts`, `src`, `README.md` and `LICENSE` (`research-eleanor.md`, Version and release surface), so `npm publish` from the working tree ships the real extension at the real version. A tracked `npm-stub/` directory inside the repository was rejected for a different reason: it would hold a second copy of the name and a second version number to keep in step, and the name check would pass while the repository carried both.

The three files are written where they live, `~/Projects/pi-omlx-stub`, outside the repository, so no gate sees them and no task needs an exemption for them; `npm pack --dry-run` run in that directory is what checks the shape before Joel publishes. Joel publishes it (`npm whoami` returns E401 in this shell, `michael-orientation.md` trap h), and the task that asks him to is marked as his. Nothing else in the change waits on it: no file names `npm:pi-omlx`, so a late publish fails no check, and the directory persists until he does it.

### 5. The docs pass corrects the lines the change made false, and adds no record

The pass starts from the list of Markdown files the change made false, which Derek reports at the implementation gate. It also covers the lines the council and this design already name.

- `README.md:19` becomes `pi install git:github.com/joelleibow/pi-omlx`, the form pi documents (`research-chidi.md` Addendum 1 (1)); `:1` (title) and `:8` (the demo image's alt text) take the new name. No sentence about repository access: the repository is public by Joel's ruling, which was the only thing that could have added one (`council-matt-pass2.md` N3).
- `docs/CONFIGURATION.md:9` keeps `pi uninstall` and passes `git:github.com/joelleibow/pi-omlx`, the source the install leaves behind. Removal matches on package identity, and a bare `pi-omlx` parses as `npm:pi-omlx` and matches nothing (`council-matt-pass2.md` M6; `research-chidi.md` Addendum 1 (1)).
- `CONTRIBUTING.md:3` takes the new name in the development description, and `:27` stops naming `~/.pi/packages/pi-omlx-picker/…`: that path is corrected rather than renamed, because a local package loads where it sits (`research-chidi.md` Q1.11; `michael-orientation.md` trap f).
- The pass ends with the wide name check from decision 2, over the whole tracked tree except `openspec/`.

**No ADR.** An ADR records a choice between alternatives about structure, pattern or dependency. This change makes none: the name is Joel's ruling with a home in `owner-rulings.md`, and the choices left to design (the two hats, the checks, the stub) are local sequencing whose reasons are in this file. An ADR would be a second copy of a decision that already has one.

**No `AGENTS.md`.** The repository has none, and this change adds no command, convention or trap an agent would need. The install and uninstall commands belong to the README, the red typecheck predates the change and belongs to the change that repairs it, and publishing is Joel's.

Alternative rejected: an `AGENTS.md` recording the red typecheck and "publishing is Joel's". Both statements are true, and neither is a fact this change creates; writing them now would put the repository's pre-existing baseline into a file the change is otherwise not touching.

### 6. The directory moves last, and Joel's settings edit is its other half

The sequence, after the change is archived: `~/Projects/pi-omlx-picker` becomes `~/Projects/pi-omlx` (R3), then Joel changes `~/.pi/agent/settings.json:19` from `"../../Projects/pi-omlx-picker"` to `"../../Projects/pi-omlx"`.

What the move costs while the entry is stale: pi resolves a relative local source against `~/.pi/agent` (`research-chidi.md` Q1.2), and `resolveLocalExtensionSource` returns on `!existsSync()` without logging (`package-manager.js:1194-1196`). The `omlx` provider is simply absent, and pi says nothing about it, so the symptom reads as a broken extension rather than a moved directory.

How Joel confirms pi loads the package from the new path: `pi list` prints the configured source and the path it resolves to (`research-chidi.md` Q1.6), so the entry reads `../../Projects/pi-omlx` and its resolved path sits under `~/Projects/pi-omlx`; the `omlx` provider is back in pi's model list. Sessions do not follow the move: they stay in `~/.pi/agent/sessions/--Users-joelleibow-Projects-pi-omlx-picker--`, and the new directory starts a fresh bucket (`research-chidi.md` Q1.9).

Why not inside the implementation: every brief path and this session's working directory are absolute paths under the old name, so a move mid-run breaks the pipeline's own inputs (`council-matt-pass1.md`; `council-neil-pass1.md` risk 2). The change writes nothing under `~/.pi/agent`; it moves the directory and stops (R3; `michael-orientation.md` trap e).

Rollback is the same `mv` in reverse plus the settings line back. Nothing else is keyed to the path: pi identifies a local package by its resolved path, and the name change reaches nothing persisted (`research-chidi.md` Q1.1; `michael-orientation.md` §1).

## Risks / Trade-offs

- **The window between the move and Joel's edit silently removes the `omlx` provider.** → The move is the last step, and the settings edit happens in the same sitting; `pi list` confirms the resolution before Joel relies on the package.
- **A green `vitest` run can be read as a healthy baseline, because the typecheck is red.** → Each task records `npx tsc --noEmit` failing exactly as at `c27fba9` (`michael-orientation.md` trap g).
- **The first `vitest` run writes a real cache into the pi agent directory.** → Accepted; that is the suite's normal behaviour, and the run's output is a task's evidence rather than a claim this design makes (`research-eleanor.md`, Assumptions).
- **`':!*.md'` is dropped too early or kept too long**, failing the code check or missing the documents. → Two named forms, one per phase: the narrow form at the implementation gate, the wide form closing the docs pass.
- **The stub is mistaken for a release, or the README drifts to `npm:pi-omlx`.** → The stub carries `0.0.0-alpha` and no `pi-package` keyword, and no document names `npm:pi-omlx`; the README names the git source.
- **B3 removes more than the probe lines: `timeline`'s provider-request path and the helpers behind it.** → B3 states `timeline`'s end state instead of leaving it to a deletion: the anchor comes from the caller with no default, and the OMLX and changed-files sections stay. The provider-row matching it loses never worked, because nothing writes the log it read (`research-eleanor.md` Addendum 1).
- **The diagnostics tests freeze a quirk of the current predicate.** → That is the point: the rename changes the variable's name, and any change to which values turn tracing on becomes a visible test change instead of riding along with a rename (`council-matt-pass3.md` Q3).

## Migration Plan

1. S1 and S2, the structure steps, with the suite green before and after each.
2. B1, B2 and B3, each starting from its failing check or new test.
3. The name checks, `npm pack --dry-run`, `npx biome check`, a vitest run, and `npx tsc --noEmit` compared against `c27fba9` (decision 2; `michael-orientation.md` trap g).
4. The stub's three files are written to `~/Projects/pi-omlx-stub`, outside the repository, and `npm pack --dry-run` run there lists `package.json`, `LICENSE` and `extensions/pi-omlx.ts` (decision 4).
5. Michael's implementation gate.
6. The docs pass (decision 5), ending with the wide name check.
7. `openspec archive`, which merges the three delta specs into the living specs and moves the change into the archive.
8. The directory move and Joel's settings edit (decision 6).
9. Joel publishes the stub from `~/Projects/pi-omlx-stub` whenever he chooses (decision 4). Nothing in steps 1–8 waits on it.

Rollback is per step: each is a commit and reverses with `git revert`. There is no release and no persisted state to unwind, and the directory move reverses with the same `mv` plus the settings line restored.

## Open Questions

None. Joel's two questions are ruled (`owner-rulings.md`, PL2), and the four measurements the council left to design are all in, each cited where it is used:

- The predicate at `src/debug.ts:18` is a falsy check on the variable, quoted here from Eleanor.
- `index.ts:30` already reads `PROVIDER_KEY`, `test/index.test.ts:53` discards the registered id, and the auth-storage tests already read through `PROVIDER_KEY`, so decision 2's change is to the tests and not to `index.ts`.
- `scripts/debug-pi.ts`'s `timeline` depends on the provider log for more than its provider rows (`:147-153`, `:344`, `:362-367`), so B3 states what `timeline` becomes rather than assuming the probe lines are all that leaves.
