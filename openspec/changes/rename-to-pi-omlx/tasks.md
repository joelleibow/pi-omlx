# Tasks

Ordered by dependency, in `design.md`'s order of work: the two structure steps first, each green on both sides, then the three behaviour steps, each led by the check or test that fails before it. Every requirement in `specs/` maps to at least one task below, and the command that proves it is named in the task. Nothing here touches Markdown: `README.md`, `CONTRIBUTING.md` and `docs/CONFIGURATION.md` are Bambadjan's docs pass after the implementation gate.

## 1. Structure steps, no behaviour change

- [ ] 1.1 Export the singleton key from `index.ts` and import it in the test (S1). Move `Symbol.for("pi-omlx-picker/loaded")` at `index.ts:31` into an exported constant beside the default factory, and have `test/index.test.ts:13` import that constant instead of repeating the literal. Verification: `npx vitest run` is green before and after the edit, and `git grep -n 'pi-omlx-picker/loaded' test/` returns nothing while `index.ts` still holds the old string for task 3.6 to change. The named export is invisible to pi, whose loader takes only the default factory (`research-chidi.md` Addendum 1 (2)).

- [ ] 1.2 Rename the helper `pickerDebug` to `omlxDebug` (S2). Change `src/debug.ts:14` and its call sites at `index.ts:26` and `src/stream.ts:25,155,196,203,266`. Verification: `npx vitest run` is green before and after the edit, and `git grep -n pickerDebug -- ':!*.md' ':!openspec'` returns nothing.

## 2. Diagnostics: the variable and its prefix (B1)

- [ ] 2.1 Pin the predicate's answers and add `test/debug.test.ts`, which fails first. Measure what `src/debug.ts` does today with the variable it currently reads set to `""`, `0` and `1`, using a throwaway probe test file that is never added to git and is deleted before this task is ticked — `git grep` reads only tracked files, so the token never lands in the tree. Then write `test/debug.test.ts` with four cases against `PI_OMLX_DEBUG` — unset, `""`, `0` and a value that turns tracing on — each in a fresh module instance (`vi.resetModules()` with `vi.stubEnv`) and `process.stderr.write` spied, asserting the measured answers as literals and, in the on-value case, that the emitted line starts with `[pi-omlx] `. The file names no old identifier: the diagnostics spec's two SHALL NOT clauses are proven by task 3.6's name check, not here (`michael-consult-1.md`). Verification: `npx vitest run test/debug.test.ts`; the unset and empty-string cases pass against the current code, the `0` and on-value cases fail because `src/debug.ts` still reads the old variable, and that failure list is recorded. If the measured answers disagree with `design.md`'s derivation from `if (!process.env[DEBUG_ENV]) return;`, the measurement wins and the recording says so.

- [ ] 2.2 Rename the variable to `PI_OMLX_DEBUG` and the prefix to `[pi-omlx]` (B1). Change `src/debug.ts:1` and `:28`, leaving the predicate at `:18` untouched and adding no alias for the old name. Verification: `npx vitest run test/debug.test.ts` is green and `npx vitest run` is green; the old variable and old prefix being gone is task 3.6's name check. Shown catching a mistake: set the predicate at `src/debug.ts:18` to `process.env[DEBUG_ENV] === "1"` in a scratch edit and watch the `0` case fail before reverting, and separately add an old-name fallback in `src/` to watch task 3.6's grep report it.

## 3. The name and the metadata (B2)

- [ ] 3.1 Assert the provider id at registration. Extend the fake pi host in `test/index.test.ts` so its `registerProvider` records the id it receives, and assert the recorded set equals `[PROVIDER_KEY]`, imported from `src/auth-storage.ts` (`index.ts:30` already reads it, so `index.ts` itself does not change). Verification: `npx vitest run test/index.test.ts` green, and the assertion fails on a scratch edit that registers the package name instead of `PROVIDER_KEY`.

- [ ] 3.2 Pin the credential key once. In `test/auth-storage.test.ts`, assert `PROVIDER_KEY === "omlx"`. Verification: `npx vitest run test/auth-storage.test.ts` green, and red on a scratch edit that sets `PROVIDER_KEY = "pi-omlx"`.

- [ ] 3.3 Assert where credentials are read from, read-only: a fixture stored under `PROVIDER_KEY` comes back from `loadOmlxCredential`, and one stored under `pi-omlx` does not. This repository writes no credentials (`rg writeStored src` finds nothing; pi stores the login result under the registered id), so the assertion is on the read. Verification: `npx vitest run test/auth-storage.test.ts` green, and red on a scratch edit that makes `loadOmlxCredential` read `"pi-omlx"`.

- [ ] 3.4 Rename the package and drop the keyword. `package.json:2` becomes `pi-omlx`, and `"picker"` leaves the keyword list at `package.json:11` with nothing in its place. Verification: before the edit `npm pkg get name` prints `pi-omlx-picker`; after, it prints `pi-omlx`, `git grep -n pi-omlx-picker package.json` returns nothing, and `npm pkg get keywords` lists the four remaining values with no `picker` among them.

- [ ] 3.5 Regenerate the lockfile from the edited manifest. Run `npm install --package-lock-only --ignore-scripts`. Verification: `git diff package-lock.json` shows exactly two changed lines, the name on the root entry and on the `packages[""]` entry, with no version bumps to dev dependencies; `git grep -n pi-omlx-picker package-lock.json` returns nothing.

- [ ] 3.6 Change the key's string and the test literals, then run the name checks. `index.ts:31` becomes `Symbol.for("pi-omlx/loaded")`; the temporary-directory prefixes and fixture filename change at `test/auth-storage.test.ts:20`, `test/catalog.test.ts:233,311,467,515`, `test/config.test.ts:60` and `test/index.test.ts:38`. Verification: `git grep -ni -e pi-omlx-picker -- ':!*.md' ':!openspec/'` and `git grep -ni -e picker -- ':!*.md' ':!openspec/'` both return nothing (both match lines today, which is the deletion test), `npm pack --dry-run` reports a tarball named `pi-omlx-0.3.6.tgz`, and `npx vitest run` is green.

## 4. Scripts: the dead probes and `timeline`'s end state (B3)

- [ ] 4.1 Give `scripts/debug-pi.ts` its stated end state. Delete the `~/.pi/packages/` probe and the `provider-debug.log` reads with the constants that built them (`INSTALLED_PACKAGE`, `PACKAGE_ID`, `PACKAGE_DEBUG_LOG`, `PACKAGE_LOG_DIR`), delete the provider-row helpers (`readProviderRows`, `findProviderRequest`, `latestProviderRequest`, `printProviderTimeline`, `printProviderDebugSummary`), and make `timeline` anchor only on the session file, id or timestamp the caller passes, with no default, keeping `printOmlxTimeline` and `printChangedFilesTimeline`. Nothing replaces the deleted diagnostics: the provider rows it matched were never written, so no new logging stands in for them. Verification: `git grep -nE 'INSTALLED_PACKAGE|PACKAGE_ID|PI_DEBUG_LOG|PACKAGE_DEBUG_LOG|PACKAGE_LOG_DIR|provider-debug.log' scripts/debug-pi.ts` returns nothing; `node scripts/debug-pi.ts timeline <anchor>` runs from the repository root with exit 0 and prints the OMLX and changed-files sections, the anchor being a session file, id or timestamp taken from the newest JSONL under the session root that `node scripts/debug-pi.ts sessions` prints; the command, the anchor and the output are recorded in the task. Node v26 executes both scripts directly, with no vite-node or tsx (`research-eleanor.md`, Addendum 3).

- [ ] 4.2 Give `scripts/debug-omlx.ts` its stated end state. Delete `PI_DEBUG_LOG` and the package-derived log path with the reads that used them, delete `printLogSummary` and `parseLogLine` once nothing calls them, and delete any further helper the removal strands (`tailLines`, `safeJson` if uncalled). Verification: `git grep -nE 'PI_DEBUG_LOG|provider-debug.log' scripts/debug-omlx.ts` returns nothing; `node scripts/debug-omlx.ts` runs from the repository root with exit 0 and still prints its `~/.omlx` model settings, model paths and cache sections, recorded in the task (`research-eleanor.md`, Addendum 3).

- [ ] 4.3 Confirm both script greps went from red to zero. Verification: `git grep -nE 'INSTALLED_PACKAGE|PACKAGE_ID|PI_DEBUG_LOG' scripts/` and `git grep -n 'provider-debug.log' scripts/` both return nothing, against baselines of 11 lines and 4 lines at `c27fba9` — which is also the deletion test, since the 11 lines are the defect these tasks remove.

## 5. Whole-diff checks before the implementation gate

- [ ] 5.1 Lint and test the whole tree. Verification: `npx biome check` reports no fixes applied, and `npx vitest run` is green.

- [ ] 5.2 Compare the typecheck against the baseline. Verification: `npx tsc --noEmit` fails on exactly `src/provider.ts:35,37` and `test/provider.test.ts:49-72`, the same set as at `c27fba9`, with no new error; a green run is not the bar (`michael-orientation.md` trap g).

- [ ] 5.3 Confirm the diff carries no documentation and nothing stray. Verification: `git diff --name-only c27fba9 -- . ':!openspec/changes/rename-to-pi-omlx/'` lists no `.md` file at all, and every file it lists is one the change means to touch — `package.json`, `package-lock.json`, `index.ts`, `src/debug.ts`, `src/stream.ts`, `scripts/debug-pi.ts`, `scripts/debug-omlx.ts`, the four existing test files and the new `test/debug.test.ts`.

## 6. The npm name claim (outside the repository)

- [ ] 6.1 Write the stub at `~/Projects/pi-omlx-stub`. This task writes outside the repository and changes nothing in it: a `package.json` declaring `name: "pi-omlx"`, `version: "0.0.0-alpha"`, `license: "MIT"` and a description pointing at `joelleibow/pi-omlx`; a copy of `LICENSE`; and `extensions/pi-omlx.ts` whose default export is a factory with an empty body. Verification: `npm pack --dry-run` run inside that directory reports the tarball `pi-omlx-0.0.0-alpha.tgz` listing exactly `package.json`, `LICENSE` and `extensions/pi-omlx.ts`, and `git status` in this repository is unchanged by the task.

## 7. Joel's tasks

- [ ] 7.1 Joel publishes the stub. From `~/Projects/pi-omlx-stub`, `npm publish` (his credentials; `npm whoami` fails in the pipeline's shell, `michael-orientation.md` trap h). His task, ticked by the conductor with his words; nothing else in the change waits on it. Verification: he reports the publish, and `npm view pi-omlx version` reports `0.0.0-alpha`.

- [ ] 7.2 After the run closes, Joel moves the directory and edits pi's `packages` entry. `~/Projects/pi-omlx-picker` becomes `~/Projects/pi-omlx`, and `~/.pi/agent/settings.json:19` changes from `"../../Projects/pi-omlx-picker"` to `"../../Projects/pi-omlx"`. His task, ticked by the conductor with his words; between the move and the edit the `omlx` provider is silently absent (`package-manager.js:1194-1196`). Verification: `pi list` shows the entry as `../../Projects/pi-omlx` resolving under `~/Projects/pi-omlx`, and the `omlx` provider is back in pi's model list.
