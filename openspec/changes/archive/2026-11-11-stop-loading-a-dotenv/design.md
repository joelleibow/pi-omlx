# Design

## Context

At HEAD the extension sets its own environment: `index.ts:3` imports
`loadDotenvFromExtensionDir` and `index.ts:10` calls it with `import.meta.url` at module top
level, so the call runs as an import side effect. `src/dotenv.ts` parses the file and merges it
into `process.env`; `test/dotenv.test.ts` covers the parser and the merge. The loader has one
caller, and nothing else in the repository imports it (Eleanor, "Existing dotenv path and
impacts"). `proposal.md` carries the motivation; this design carries the mechanism.

Four constraints shape it.

- **The suite isolates itself already.** Global setup creates a per-run root, points `HOME` and
  `PI_CODING_AGENT_DIR` into it, and clears `CALLER_ENV_KEYS`; worker setup injects the root and
  refuses to run when the agent directory, `homedir()` or the overlay path resolves outside it.
  PR #8 added a `node:fs` mock on top. That mock hides exactly one path, `<repo>/.env`, so a copy
  anywhere else is unaffected by it (Eleanor Addendum 2 §2; Chidi Addendum 3 answer 5).
- **Tests never mutate operating functionality**, and the repository carries no production code
  that exists only for tests (archived `isolate-the-suite-from-the-agent-directory/owner-rulings.md`
  §1 and §2). A fixture therefore cannot be written beside the live `index.ts`, and the extension
  gets no seam for this test.
- **Provability.** The new requirement is worth having only with a test that fails when a loader
  returns, which is what Michael's C1, C3, D1 and D2 rulings establish and what `council.md`
  records.
- **`credential-resolution` bounds the behavior change.** `OMLX_BASE_URL` and `OMLX_API_KEY` apply
  only when no credential is stored (ADR `docs/adr/0001-one-credential-decides-the-omlx-connection.md`),
  so a saved `omlx` login loses nothing.

## Goals / Non-Goals

**Goals:**

- Nothing in the extension reads a file to set environment variables, and the `node:fs` mock and
  its spec scenario go with the read.
- The new `environment-configuration` requirement is proven by one test that fails at HEAD with the
  loader present and passes after the deletion, with the whole suite green.
- The direnv guidance that replaces `.env.example` lands with the `.gitignore` line that keeps the
  file it recommends out of a commit.

**Non-Goals:**

- How the dev scripts get their configuration, beyond a pointer at direnv. `scripts/*.ts` read
  `process.env` directly and never saw loader values (Michael, "Scripts are unaffected").
- `.npmignore`, whose `.env*` line is measured non-load-bearing under `package.json`'s `files`
  allow-list (Chidi Addendum 1).
- The `mise run …` tasks in `CONTRIBUTING.md` with no tracked `mise.toml`. Both advisors reported it
  as out of scope and already parked (Eleanor Addendum 3).
- Documentation, including any new ADR. Markdown lands in the docs pass after the implementation
  gate, and this change makes no decision about structure, patterns or a dependency for an ADR to
  record.

## Decisions

**D1. The loader is deleted, not flagged or deprecated.** The card's first acceptance criterion is
that nothing in the extension reads a file to set environment variables (owner-rulings §1), and a
flag keeps the reader in the tree while making the criterion false in the default case. A
deprecation warning leaves the same read and adds a second mechanism to maintain. So `index.ts`
loses the import and the call, and `src/dotenv.ts` is deleted. Biome's `organizeImports` reorders
`index.ts`'s import block once the loader's line is gone; that is mechanical and belongs to the
same commit (Michael, Traps).

**D2. The parser's tests go with the parser.** `test/dotenv.test.ts` exercises a function no code
calls any more. Keeping it would test a library the extension no longer has, and
`credential-resolution` and `diagnostics` already own the behavior that matters: which credential
wins, and which variables enable tracing. No alternative is worth weighing: keeping a test for a
module nothing calls leaves a second home for behavior the extension no longer has.

**D3. The requirement is proven by loading a copy of the entry module in process.** The test copies
`index.ts` and `src/` under the isolation root, links `<repo>/node_modules` into the copy so its
imports resolve, writes a `.env` beside the copied `index.ts`, and imports it through that
harness with `await import(/* @vite-ignore */ pathToFileURL(join(copyDir, "index.ts")).href)`.
Chidi's Addendum
3 measured that an in-process import loads the copy and vite SSR-transforms it, and that the PR #8
mock does not touch it because the mock compares one repository path. The copy needs no
`package.json`, which only the subprocess variant needs.

Three alternatives were beaten. Writing `<repo>/.env` and calling the statically imported
`extension` stays green when a loader returns, because the loader ran at import time, and it writes
into the clone, which §1 rules out (neil pass 1, Risks). A `tsx` subprocess agrees in Chidi's
measurement but needs a copied `package.json` and a child process for the same answer. Extracting
the loader's absence into a production helper would be production code that exists only for a test.

**D4. The copy lives under the isolation root, and global teardown owns it.** The test makes it with
`mkdtempSync(join(inject("isolationRoot"), "extension-copy-"))` and does not remove it itself:
`teardown()` deletes the root after a pass, a fail or a thrown test, so a crashed run leaves no
directory holding a fake key (Michael, D1; `test/isolation/global-setup.ts:34-39`). A copy under
`tmpdir()` would need a test-owned `rmSync` and would leak on a crash before it. The copy sits
beside `<root>/home` and `<root>/agent`; nothing enumerates the root, and the guard compares paths
with `path.relative`, so a sibling is inside the isolation by the guard's own rule.

**D5. The test lives in `test/index.test.ts`, and `driveExtension` takes a loader thunk.**
`driveExtension` gains one optional parameter, resolved after its `withEnv` call has prepared the
environment: `async () => extension` by default, and the new test passes
`async () => (await import(pathToFileURL(join(copyDir, "index.ts")).href)).default`, so the copy is
imported inside the harness.

The order is the decision. `ENV_KEYS` holds both fixture keys, and `withEnv` clears them when the
test starts, so an import taken before the harness would have written keys that `withEnv` then
deleted before the export ever ran. Michael measured that: import before `withEnv` leaves both keys
`undefined`, no fetch, and the login-only provider registered. That is the false green C1 added the
second THEN line to catch. Imported inside the harness, the keys are still in `process.env` when the
body asserts, and the same measurement gives both keys set and two fetches. Once the test ends,
`withEnv`'s `restoreEnv()` deletes and restores them, so nothing else owns that cleanup. The
harness's other supplies are unchanged: the fetch recorder answers `FIXTURE_MODELS`, and
`recordCatalogFetches` counts requests (Michael, D2 and his round-1 finding, with the line
references in `test/index.test.ts`).

The repository names test files after the module under test rather than the capability, and a second
fake pi in a capability-named file would be a second home for the same harness. The extension's own
contract does not move: the same default export, the same `EXTENSION_SINGLETON_KEY`, the same
registration and the same credential resolution. The one signature that changes is the test
helper's.

**D6. The scenario's two THEN lines, and the one condition that makes the second discriminate.**
Both assertions run in the harness's body, after the import and after the drive, which is where a
loader's keys are still visible: `process.env` holds neither `OMLX_API_KEY` nor `OMLX_BASE_URL`, and
the copy's default export, run against the fake pi, makes no catalog fetch and registers the
login-only provider. The `.env` sets `OMLX_BASE_URL=http://from-dotenv.invalid/v1` and
`OMLX_API_KEY=from-dotenv`, a name that cannot resolve and a value that is obviously no secret.
"Nothing is stored" holds without a seam: the harness points the copy's `getAgentDir()` at the
test's own `dir` through `withEnv`'s `PI_CODING_AGENT_DIR` (`test/index.test.ts:36,222`), and the
test never calls `storeCredential`, so no `auth.json` exists there. The copy's `src/*` are separate
module instances, so a `_setAuthPathForTesting` call on the repository's `auth-storage` would not
reach it either (Michael, C3).

The second assertion exists because the first cannot see a loader that parses the file into the
environment object `index.ts:214,240` hands to `src/config.ts:60,64` without touching
`process.env` (Eleanor, "Environment read timing"; neil pass 2). The login-only line discriminates
only because the fake catalog answers with `FIXTURE_MODELS`: with an empty catalog the extension
falls to the login-only provider whether or not the loader ran, which Michael measured, and the
assertion would then be a false green. That condition sits in the scenario's WHEN, which is where
the spec fixes it.

**D7. The test carries a `shortcut:` comment, and the diff search covers what it cannot.** The
comment says the test proves a `.env` beside the entry module and nothing else, and that it should
be upgraded if a configuration-file reader is proposed. The requirement keeps its full width because
it restates the card's acceptance criterion; a black-box test cannot enumerate filenames it has
never been told about (Michael, C2).

**D8. The `.envrc` line and the direnv guidance are one decision.** The docs pass tells contributors
to put `export OMLX_BASE_URL=…` and `export OMLX_API_KEY=…` in an untracked `.envrc` in the clone and
run `direnv allow`, beside `CONTRIBUTING.md`'s script tasks; the implementation diff adds `.envrc`
to `.gitignore`, beside its existing `.env` line, in the same change. Both halves live or die
together: without the line, the guidance teaches contributors to leave a key where `git add` can
reach it, since no global excludes cover `.envrc` (Michael, C5 and his orientation trap); if the
design ever pointed the guidance outside the clone, the line would go with it. A committed
`.envrc.example` was rejected because an example file is one more thing that points at a filename
the extension must not read.

**D9. `.gitignore` keeps `.env`, and `.npmignore` is untouched.** An ignore entry points nobody at a
`.env`; it keeps a key out of git, and `package.json`'s `files` allow-list already decides what npm
packs (Chidi Addendum 1; Michael's ruling). Removing the line would make a leftover `.env`, or one
direnv loads under its `load_dotenv` option, committable with a key in it.

**D10. `CALLER_ENV_KEYS` keeps its five keys and loses its `.env.example` citation.** The list is
unchanged: a search over `index.ts` and `src/*.ts` alone yields exactly those five keys (Michael,
"What is settled"). The comment above it cites `.env.example`, which this change deletes, so the
citation goes; the list stays because callers' exports still reach the suite.

**D11. Nothing replaces the mock, and the isolation guard keeps its three paths.**
`test/isolation/worker-setup.ts` loses the `vi.mock("node:fs")` block with the `vi` and
`PathLike` imports it leaves unused, and keeps the root injection and the guard. That guard refuses
a path outside the isolation root and fires before any test runs when the agent directory,
`homedir()` or the overlay path escapes, naming every escaped path. The guard never read a file;
the mock's single hidden path was all the suite added on top of it, and with no reader there is
nothing left to mask. `openspec/specs/test-isolation`'s `.env` clause and its scenario go with the
mock, because no input can make that scenario fail once nothing reads the file. What the mock gave
up, the new test's two assertions and the diff search take over: a reader that comes back sets the
keys or fetches, and both fail the test.

## Risks / Trade-offs

- **[Risk] A reader the test cannot see.** A cwd-relative read, another filename, or a read that
  reaches neither `process.env` nor the catalog fetch would stay green. → The implementation gate
  runs a search over the diff for `dotenv`, `loadEnvFile`, `env-file`, `.env` string literals, a
  config path passed to `readFile`/`readFileSync`, and an `--env-file` flag in `package.json`'s
  scripts, which is the coverage the test's `shortcut:` comment names. Michael runs it.
- **[Risk] A clone-installed user's `.env` stops working.** → Bounded by `credential-resolution`: a
  saved `omlx` login is unaffected, `/login omlx` is the documented global path, and a published
  install never carried a `.env` (Chidi Addendum 1). The docs pass says the file is no longer read.
- **[Risk] The `.env` was global to every pi session that loads the clone; direnv is per
  directory.** → That is the card's point ("without touching pi"), and ADR 0001 makes `/login` the
  global mechanism, so nothing a spec promises is lost.
- **[Risk] The extension singleton persists in the worker after the copy runs.** → It is a
  `Symbol.for` key, shared across module instances, so the file's existing `afterEach` clears the
  copy's registration along with the rest (Michael, C3).
- **[Risk] Removing the mock is a net loss of one guard.** → It is a trade the deletion earns: the
  mock proved a file could not reach the suite while a reader existed, and the test now proves no
  reader exists. Keeping the mock would leave a test whose subject is gone, which the design gate
  counts as a test that cannot fail.
- **[Trade-off] The proving test is a heavier test.** It copies a directory and imports it in
  process. The alternative tests are all cheaper and none of them goes red when the behavior comes
  back, which is the only property this test is for.

## Migration Plan

This is a repository change with no deployment. The order below is the order a writer follows, and
each step has an observable outcome.

1. **Red step.** Add the test to `test/index.test.ts`, passing the loader thunk to `driveExtension`
   so the copy is imported after `withEnv` has prepared the environment and before the body
   asserts. Run it against HEAD's `index.ts` and `src/dotenv.ts`, before anything is deleted: the
   import writes both keys, the body still sees them in `process.env`, and the driven export fetches
   from `http://from-dotenv.invalid/v1`. Every assertion is red. The PR #8 mock does not hide the
   copy's file, so the failure is not masked and no mock-first reordering is needed (Chidi Addendum
   3 answer 5).
2. **Green step.** Delete `src/dotenv.ts`, `test/dotenv.test.ts` and `.env.example`. Remove
   `index.ts:3` and `index.ts:10`, strip the mock and its unused imports from
   `test/isolation/worker-setup.ts`, and drop the `.env.example` citation from
   `test/isolation/global-setup.ts`'s comment. Add `.envrc` to `.gitignore`. Run `npm run format`
   for the import block. The new test passes, and `npm run check` is green over the whole suite.
3. **Docs pass, after the implementation gate.** `ARCHITECTURE.md:71` loses its clause about the
   worker setup keeping a `.env` beside `index.ts` out of the run. `CONTRIBUTING.md` gains the
   direnv guidance beside its script tasks, as D8 states. `README.md`, `docs/CONFIGURATION.md` and
   `AGENTS.md` are correct as they stand, and no ADR is written. This step blocks nothing.
4. **Rollback.** Revert the commit. The loader held no state, so nothing needs unwinding, and the
   change touches no `.env` file on disk: `.gitignore` keeps its `.env` line and only the tracked
   `.env.example` is deleted.

## Open Questions

- Whether the other suites' `mkdtemp` fixtures (`test/catalog.test.ts`, and the auth fixture
  directory in `test/index.test.ts`) move under the isolation root. Michael named the leak as a
  known smell and the root as the fix for that class of it; it is not this card's task, and moving
  them changes no spec here.
