# Tasks

Groups 1, 3 and 4 are structure steps, and the suite's behavior must be unchanged by each: their
evidence is the suite staying green plus the check each task names. Group 2 is the one behavior
step. It starts with a test that fails against HEAD's loader, and the deletion that turns it green
is named in the same task, so a reviewer can see the test is not one that stays green when the
behavior goes. Record every run as the command, its exit code and the first line of its output.

The `environment-configuration` spec and the `test-isolation` delta already sit in this change's
`specs/`, so nothing here builds them. `ARCHITECTURE.md:71` and `CONTRIBUTING.md` are the docs
pass's, after the implementation gate, so nothing here writes them either.

Two design decisions need no task. D9 leaves `.gitignore`'s `.env` line and `.npmignore` alone, and
there is no change to make. D7's diff search belongs to the implementation gate, and 5.2 runs the
same searches locally so the gate is not the first place they run.

No task here is Joel's: the suite drives the entry module on every run, so no check waits on his
machine. No task adds logging or error handling, because the change adds no use case, adapter or
entry point, and the isolation guard's thrown message is untouched.

## 1. The harness the proof needs

- [x] 1.1 Structure step: give `driveExtension` in `test/index.test.ts` one optional parameter, the
  loader thunk, defaulting to `async () => extension`, and resolve it after the helper's `withEnv`
  call has prepared the environment (design D5). Leave every assertion in the file as it is. Verify:
  `npx vitest run test/index.test.ts` green with every existing call site unchanged, then
  `npm run check` green. The ordering has nothing to show yet, because no test depends on it until
  2.1; that task carries the mutation check that holds it.

## 2. The read comes out

- [x] 2.1 Fails first: add a test to `test/index.test.ts` that makes a directory with
  `mkdtempSync(join(inject("isolationRoot"), "extension-copy-"))`, copies `index.ts` and `src/` into
  it recursively so `src/` keeps its tree, symlinks `<repo>/node_modules` into it, and writes a
  `.env` holding `OMLX_BASE_URL=http://from-dotenv.invalid/v1` and `OMLX_API_KEY=from-dotenv`. The
  test calls `driveExtension` with
  `async () => (await import(pathToFileURL(join(copyDir, "index.ts")).href)).default`, with
  `pathToFileURL` from `node:url`. In the body it asserts that `process.env` holds neither key, that
  `recordCatalogFetches` is empty, and that the registration is login-only while the fake catalog
  answers `FIXTURE_MODELS`. Run it
  before touching the loader: both assertions fail, because the copy's `.env` reaches `process.env`
  and the driven export fetches from `http://from-dotenv.invalid/v1`. Then delete `src/dotenv.ts`
  and `test/dotenv.test.ts` (the suite cannot import a deleted module, so the parser's test goes in
  the same change), remove `index.ts:3` and `index.ts:10`, and run `npm run format` for the import
  block Biome reorders; the test passes. Boundary cases: (a) an empty catalog makes the login-only
  assertion vacuous, so the fake answers `FIXTURE_MODELS`; (b) a loader that parsed the file into the
  config object instead of `process.env` is caught only by the driven export, which is why both
  assertions are kept; (c) a stored credential would hide the environment, so the test's `dir` holds
  no `auth.json` and `storeCredential` is never called; (d) a key the extension does not read would
  leave the second assertion green, so the fixture sets the two keys `src/config.ts` reads. Add the
  `shortcut:` comment: this proves a `.env` beside the entry module, not a cwd-relative read or
  another filename, and it should be upgraded if a config-file reader is proposed. Verify: the run
  red before the deletion and green after; resolve the thunk before `withEnv` instead of after, in
  the HEAD state with the loader present, and the test goes green, which is the false green the
  ordering exists to prevent, so restore it and see it red again; `ls -d ${TMPDIR:-/tmp}/pi-omlx-test-*`
  finds nothing after the passing run, so the copy left with the root; `npm run check` green. Proves
  `environment-configuration` "A .env beside index.ts configures nothing", both THEN lines.

## 3. The suite stops naming the read

- [x] 3.1 Structure step: remove the `vi.mock("node:fs")` block from
  `test/isolation/worker-setup.ts`, with the `vi` and `import type { PathLike }` imports it leaves
  unused (design D11). Keep the root injection and the guard exactly as they are. Verify:
  `rg -n 'node:fs' test/isolation/worker-setup.ts` returns no match; the guard still fires, shown by
  deleting the `HOME` assignment from `test/isolation/global-setup.ts`'s `setup()` and running
  `npm test`, which exits non-zero naming the operator's home, then restoring it and seeing the suite
  green; `npm run check` green, which is also what catches a leftover unused import. Proves
  `test-isolation` "A missing isolation fails the run" still holds with the mock gone.

- [ ] 3.2 Structure step: drop the `.env.example` citation from the comment above
  `CALLER_ENV_KEYS` in `test/isolation/global-setup.ts`, leaving the five keys untouched (design
  D10). Verify: `rg -n 'env\.example' test/` returns no match; `rg -n
  'OMLX_API_KEY|OMLX_BASE_URL|OMLX_MODEL_SETTINGS_PATH|OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS|PI_OMLX_DEBUG'
  test/isolation/global-setup.ts` returns five matching lines, one per key; `npm run check` green.

## 4. The pointers outside the suite

- [ ] 4.1 Structure step: delete `.env.example`, whose instruction to copy it to a `.env` describes a
  read this change removed (design D1, and the card's second acceptance criterion for the file
  half). Verify: `test ! -e .env.example` exits 0; `git grep -nE '"\.env"|/\.env|^\.env' --
  ':!*.md' ':!openspec/'` returns exactly three lines, `.gitignore:2` and `.npmignore:31` which
  design D9 keeps by decision, plus the one fixture line in `test/index.test.ts` that writes the
  copy's `.env` under the repository's double quotes. That pattern matches a `.env` filename, where a
  bare `\.env` would match every `process.env` read. `npm run check` green.

- [ ] 4.2 Structure step: add `.envrc` to `.gitignore`, on the line after its `.env` entry, as the
  guard for the direnv guidance the docs pass will add (design D8, the half that is not Markdown).
  Verify: `git check-ignore -v .envrc` prints the `.gitignore` rule and `git check-ignore -v .env`
  still prints its own, so both are covered; delete the line and `git check-ignore .envrc` exits 1,
  so the check bites, then restore it and record both runs; `npm run check` green.

## 5. The whole gate

- [ ] 5.1 Verify the change from a clean state, which means no `pi-omlx-test-*` root in the system
  temporary directory, no `.env` in the repository, and no `extension-copy-*` anywhere. Run the new
  test alone, then `test/isolation/` alone, then a bare `npm run check`, and record each command,
  its exit code and its first line. Then add a scratch failing test file under `test/`, run
  `npm test`, confirm it fails and leaves no root behind, and delete the scratch file; record both
  the failure line and the empty root listing, which is the copy being cleaned up on a failing run.
  Then re-run the two isolation checks the `test-isolation` requirement still promises, both exit 0:
  `npm test` with `HOME` pointing at a home whose `~/.omlx/model_settings.json` holds an entry for
  the fixture model `real-model`, and `npm test` with `OMLX_MODEL_SETTINGS_PATH` naming that same
  overlay. Proves
  `test-isolation` "The operator's overlay does not decide the run" and "A caller's exported overlay
  path does not decide the run", after the mock and its imports are gone.

- [ ] 5.2 Verify the change's shape and the searches the implementation gate will run.
  `git diff --stat` and `git status --short` show `src/dotenv.ts`, `test/dotenv.test.ts` and
  `.env.example` as deletions and `index.ts`, `test/index.test.ts`,
  `test/isolation/worker-setup.ts`, `test/isolation/global-setup.ts` and `.gitignore` as the only
  edits, with nothing else beyond this change's own Markdown under
  `openspec/changes/stop-loading-a-dotenv/` and the git-excluded `.pi/`; `rg -c 'shortcut:'
  test/index.test.ts` reports 1; `git grep -nE 'dotenv|loadEnvFile|env-file' -- ':!*.md'
  ':!openspec/'` returns no match; `git grep -nE '"\.env"|/\.env|^\.env' -- ':!*.md'
  ':!openspec/'` returns exactly `.gitignore:2`, `.npmignore:31`, and the one fixture line in
  `test/index.test.ts` that writes the copy's `.env`; and the suppression search
  `git grep -nE '@ts-ignore|@ts-expect-error|@ts-nocheck|biome-ignore' -- ':!*.md'` returns no
  match. Show the filename search biting: add a temporary line
  `readFileSync(join(dir, ".env"), "utf8")` to a file under `src/`, see the search return that file
  and line beside the three above, and delete it. Record each command and each result, including the
  temporary file's removal.
