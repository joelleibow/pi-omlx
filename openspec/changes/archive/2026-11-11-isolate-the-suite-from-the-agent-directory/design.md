# Design

## Context

`proposal.md` carries the motivation and the measurements. The constraints that shape this design:

- Joel's rulings (`owner-rulings.md`): the suite must not read or write the operator's pi agent directory whatever environment it runs in (§1); the `~/.omlx` overlay and the `.env` beside `index.ts` are in scope (§4, §5); no production code that exists only for tests (§2).
- The suite is vitest 5.1.0 on the default `forks` pool with `isolate: true`; `vitest.config.ts` sets `environment: "node"`, `clearMocks`, `restoreMocks` and nothing else (Chidi, "Sources"; Eleanor, "Config, docs, ADR, baseline").
- The environment must be in place before `src/catalog.ts` and `index.ts` are first imported, because `CACHE_FILE` is captured at import and the `.env` merge runs at `index.ts:10` (Eleanor, "External paths and timing").
- `globalSetup` sets `process.env` in the main process before workers spawn, so every worker inherits it before its first import, in every pool and under `--no-isolate` (Chidi F3, F8). The inheritance is source-derived and experimentally confirmed, not documented (Chidi F3), which is why decision 2 exists.
- `os.homedir()` honours `$HOME` when it is set before the process starts, which a main-process assignment in `globalSetup` satisfies in every pool (Chidi F12).
- Teardown runs after passing and failing runs and not on a signal (Chidi F9a, F9b).
- The extension reads five environment keys besides `PI_CODING_AGENT_DIR`: `OMLX_BASE_URL`, `OMLX_API_KEY`, `OMLX_MODEL_SETTINGS_PATH`, `OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS`, `PI_OMLX_DEBUG` (Eleanor Addendum 1, searched over `index.ts`, `src/*.ts` and `.env.example`).
- `src/catalog.ts:606` exports `resolveLocalModelSettingsPath`, and `index.ts:16` imports it to resolve the overlay path at `index.ts:261`, so the guard can read production's derivation (conductor's answer, 2026-11-11).
- The council settled the mechanism, the guard, the `.env` route, the cache path and signal cleanup (`council.md`); Michael's rulings 1 to 3 bind.

## Goals / Non-Goals

**Goals:**

- Every run of the suite, bare or prefixed, resolves pi's agent directory and the overlay under a root it creates and removes, and never reads the repository `.env`.
- A guard that fails the run, naming every escaped path, when any of the three paths leaves the root.
- The `verification` and `test-isolation` requirements hold with no caller-supplied `PI_CODING_AGENT_DIR`.

**Non-Goals:**

- No production change. The catalog cache path and the test seams belong to the seam card, and the `.env` loader's deletion is its own card (`owner-rulings.md` §2, §5; Michael's ruling 2).
- No Node permission model (Chidi F14; `council.md`, Accepted).
- No signal cleanup: an interrupted run leaks its root, recorded as a `shortcut:` comment (Michael's ruling 3).
- No change to `scripts/`, which talk to a live server on purpose.

## Decisions

### 1. The global setup

A new directory, `test/isolation/`, holds the three isolation pieces. The global setup is `test/isolation/global-setup.ts`. Its `setup()` creates `mkdtempSync(join(realpathSync(tmpdir()), "pi-omlx-test-"))`, assigns `HOME = join(root, "home")` and `PI_CODING_AGENT_DIR = join(root, "agent")` unconditionally, deletes one named constant, `CALLER_ENV_KEYS`, holding the five extension keys, and provides the root with `project.provide("isolationRoot", root)`. Its `teardown()` calls `rmSync(root, { recursive: true, force: true })` and is the single removal site, with a `shortcut:` comment recording the signal leak.

- **The parent is `realpathSync(tmpdir())`** so the string the environment carries and the string the guard compares agree. On macOS `tmpdir()` is `/var/folders/...` and its real path is `/private/var/folders/...`; without the realpath the guard can read a false escape.
- **The prefix `pi-omlx-test-`** is what the removal check observes, and it cannot be confused with the catalog tests' `pi-omlx-*` directories (Michael, trap f).
- **Unconditional assignment**, not `??=`: Joel's "whatever environment it is run in" requires the override, and `??=` would leave a caller's value in place (Michael, orientation §1; Chidi F2).
- **One delete list**, because the overlay path must keep one home. With `OMLX_MODEL_SETTINGS_PATH` deleted and the `.env` stopped, `resolveLocalModelSettingsPath` takes its `homedir()` branch under the root (Neil M1; Matt N1). The other four are deleted because each changes the run's outcome: the credential pair would point the suite at a live server, the timeout would change timing, and `PI_OMLX_DEBUG` would turn tracing on.
- **The `home` and `agent` subdirectories are not created.** Nothing in the suite writes there without creating its own parent (`writeCatalogCache` mkdirs the cache directory recursively, `src/catalog.ts:598`; Eleanor Addendum 1), the overlay read checks existence first, and `os.homedir()` returns `$HOME` verbatim without consulting the disk (Chidi F12).
- **Workers inherit the assignments** because the pool builds each worker's env from `...process.env` after `setup()` returns (Chidi F1 source, F3).
- **Teardown is the only removal site.** Ruling 3's deletion test: every run creates a fresh root, so a leaked one is never read, and `tmpdir()` is not operator state.

Alternatives that lost:

- **`test.env` in `vitest.config.ts`**: documented, but `os.homedir()` stays the operator's home under `threads` and `vmThreads` (Chidi F12), and a `mkdtemp` in the config has no teardown hook of its own (Chidi F9d).
- **`setupFiles` alone**: runs per file (Chidi F2), and the same `homedir()` problem under threads (Chidi F12).
- **`vi.stubEnv` or `vi.hoisted`**: per file, and a top-level `stubEnv` lands after the imports that capture the path (Chidi F6).
- **`provide`/`inject` alone**: carries values, not `process.env` (Chidi F4).
- **A `package.json` script prefix**: a second home for the suite's entry, and `npx vitest run` bypasses it, so it fails the spec's "every run".
- **Node's permission model through `execArgv`**: `--allow-child-process` and `--allow-worker` weaken it, the full suite was never run under it (Chidi F14), and the guard already proves the property.

### 2. The guard

**`test/isolation/guard.ts`** exports `escapedPaths(root: string, paths: readonly (string | undefined)[]): string[]`, a pure function returning the paths that are neither the root nor under it. A path is inside when `path.relative(root, path)` is `""` or is neither absolute nor starts with `..`. `path.relative`, never a string prefix: `/tmp/pi-omlx-test-abc-leak` must not pass for a root `/tmp/pi-omlx-test-abc` (Neil pass 1 item 3; Matt pass 1 item 4).

**An absent path is escaped.** `resolveLocalModelSettingsPath` is typed `string | undefined` (`src/catalog.ts:606-608`), so the signature admits `undefined` rather than forcing a cast at the call site, and a path that is not there cannot be shown to be under the root.

**`test/isolation/worker-setup.ts`** is the `setupFiles` entry. It reads the root with `inject("isolationRoot")`, throws when it is absent, and calls `escapedPaths(root, [getAgentDir(), os.homedir(), resolveLocalModelSettingsPath(process.env.OMLX_MODEL_SETTINGS_PATH)])`. When the result is non-empty it throws `pi-omlx test isolation escaped: <paths> are not under <root>`, listing every escaped path. A throwing setup file fails that file's collection (Chidi F13), so every file fails and the run exits non-zero.

- **The root comes from `provide`/`inject`**, vitest's documented channel for values from `globalSetup` (Chidi F4), and not from `dirname(process.env.HOME)`. With the `HOME` assignment missing, that derivation would set the root to `dirname` of the operator's real home, which contains the real agent directory, so the guard would pass on exactly the failure it exists to catch.
- **The `inject` call typechecks through one augmentation.** `inject("isolationRoot")` is `never`-typed without a `declare module "vitest" { interface ProvidedContext { isolationRoot: string } }`, which lives in `test/isolation/global-setup.ts` beside the `provide` call, one place. Without it the repository's strict tsconfig, which includes `test/**`, rejects the call (TS2345).
- **The overlay path is production's.** `resolveLocalModelSettingsPath` is exported and already imported by `index.ts:16`, so the guard reads the artifact rather than re-deriving it in the setup file. A re-derivation would be near-tautological once `homedir()` is checked, and the deletion test would kill it.
- **The checked paths are not `realpath`'d.** The root is already real, and the agent directory may not exist yet, so `realpathSync` would throw on a legitimate path.
- **Removing the whole global setup also fails the run**, because nothing provides the root and the setup file's own missing-root check throws. The escaped-path message is what the proving check produces, by deleting the `HOME` assignment instead.

Alternatives that lost: a prefix check (sibling false pass, above); deriving the root from `HOME` or `PI_CODING_AGENT_DIR` (false pass, above); checking in `globalSetup` only, which reads the main process's view rather than what a worker resolves (Matt pass 1 item 4).

### 3. The `.env` mock

In the same `test/isolation/worker-setup.ts`, `vi.mock("node:fs", async (importOriginal) => …)` spreads the original module and overrides `existsSync` on both the namespace and `default` with a plain function, returning `false` only when `path.resolve(String(p))` equals the repository's `.env` and deferring to the real `existsSync` otherwise. The repository path is `fileURLToPath(new URL("../../.env", import.meta.url))`.

- **`node:fs`, not `src/dotenv.ts`**, is Michael's ruling 1: the loader is part of the extension `index.test.ts` drives through `index.ts:10`, so mocking it mocks the thing under test, and the file system is the boundary the loader does I/O through.
- **A plain function, not `vi.fn`**, because how `restoreMocks` interacts with a mock factory was untested (Chidi Addendum 1 caveat); ruling 1 requires it.
- **Verified**: the mock reaches `src/dotenv.ts`'s `existsSync` through `index.ts` in forks and under `--no-isolate`, and survives the repository's `restoreMocks` and `clearMocks` (Chidi Addendum 1 (2); Michael's ruling 1 evidence).
- **The setup file holds a second derivation** of "the `.env` beside `index.ts`". Michael accepted that cost because the proving scenario fails loudly when the mock stops matching.

Alternatives that lost: assigning a value to every key (the merge fills empty keys too, Eleanor Addendum 1 on `src/dotenv.ts:33`, and `OMLX_API_KEY` and `PI_OMLX_DEBUG` have no value that both blocks the merge and stays falsy, Neil pass 1 item 2); mocking the loader (ruling 1).

### 4. Config

`vitest.config.ts` gains two entries and changes nothing else:

```ts
globalSetup: ["./test/isolation/global-setup.ts"],
setupFiles: ["./test/isolation/worker-setup.ts"],
```

The default `forks` pool and `isolate: true` stay unpinned. The guard makes a future pool switch fail loudly if it ever breaks `homedir()`, and no pool breaks it today because the assignment happens in the main process (Chidi F12). Pinning the pool would be a second home for a fact the guard already holds.

### 5. Existing tests

**No existing test changes.** `test/index.test.ts`'s `withEnv` and `driveExtension` save, delete and restore `PI_CODING_AGENT_DIR` and set it per test; `test/auth-storage.test.ts` saves and restores it; both keep working under a run-wide value and restore it afterwards (Michael, trap j). `test/debug.test.ts`'s `vi.stubEnv("PI_OMLX_DEBUG", …)` still works, because the run-wide value is unset and the file restores the stub itself with `vi.unstubAllEnvs()` at `test/debug.test.ts:20` (`unstubEnvs` defaults to false, Chidi F6). No test sets `HOME`.

The per-test `mkdtemp` directories stay where they are, outside the root. A test that sets `PI_CODING_AGENT_DIR` per test still writes its cache under the root, because `CACHE_FILE` was captured from the run-wide value at import (Eleanor, "External paths and timing"; Michael's ruling 2 evidence). Both outcomes stay inside the root, so nothing in this card depends on which one happens.

Alternatives that lost: rewriting `withEnv` to stop setting the variable, and moving the per-test directories under the root. Both are the seam card's work (`owner-rulings.md` §2; `ARCHITECTURE.md` §9), and ruling 2 measured that nothing here requires them.

### 6. Tests and proofs

**Automated.** `test/isolation/guard.test.ts` unit-tests `escapedPaths` at its edges: the root itself (inside), a path under the root (inside), a sibling whose name starts with the root (`/tmp/pi-omlx-test-abc-leak` against `/tmp/pi-omlx-test-abc`, escaped), a relative path (escaped), an empty string (escaped), an absent path (escaped), and a mixed list returning only the escaped entries, which is what proves "every path". The guard's own per-worker call is the automated proof that the three paths resolve under the root on every run.

**Runnable checks.** The rest need a poisoned operator home or a deleted assignment, which a test cannot stage without touching the operator's machine, so each is a command run once and recorded in `tasks.md`. Automating them as subprocess tests would test the harness rather than the extension, and would double the suite's runtime for properties one run proves.

| Requirement | Check | Fails when |
|---|---|---|
| test-isolation: overlay does not decide the run | `HOME=<dir with .omlx/model_settings.json holding real-model> npm test` exits 0 | the `HOME` assignment is deleted (10 of 16 `index.test.ts` tests fail, Michael trap c) |
| test-isolation: a caller's exported overlay path does not decide the run | `OMLX_MODEL_SETTINGS_PATH=<poisoned file> npm test` exits 0 | the key leaves `CALLER_ENV_KEYS`, and the poisoned overlay reaches the wiring tests as in Michael's trap c |
| test-isolation: the `.env` does not reach the suite | a `.env` beside `index.ts` setting `OMLX_MODEL_SETTINGS_PATH` to a poisoned overlay, `npm test` exits 0 | the `node:fs` mock is removed (10 of 88 with Michael's ruling-1 fixture; 4 with the overlay key alone, trap d) |
| test-isolation: a finished run leaves no root | `npm test`, then no `pi-omlx-test-*` directory in `tmpdir()` | `teardown()` is removed |
| test-isolation: a failing run still removes its root | a scratch failing test file, run, no `pi-omlx-test-*` left, file deleted | `teardown()` is removed |
| test-isolation: a missing isolation fails the run | delete the `HOME` assignment, `npm test` exits non-zero naming the operator's home, assignment restored | the guard call is removed |
| test-isolation: a path beside the root is escaped | the unit test above | `escapedPaths` uses a prefix check |
| verification: a bare run writes nothing into the agent directory | `env -u PI_CODING_AGENT_DIR HOME=<empty directory> npx vitest run` exits 0 and `<empty directory>/.pi` is absent | the global setup is removed (Eleanor's bare-run measurement) |
| verification: a caller's agent directory is left as it was | `PI_CODING_AGENT_DIR=<populated directory> npm run check` exits 0 and `diff -r` against a copy shows no change | the `PI_CODING_AGENT_DIR` assignment is removed |
| verification: the check exits zero | bare `npm run check` exits 0 | the isolation breaks any test |

### 7. Order of work

Joel's two-hats rule: the structure lands before the behavior it makes easy.

1. **Structure.** `test/isolation/guard.ts` and `test/isolation/guard.test.ts`. Check: the new test file passes, `npm run check` is green, and nothing else changed. The guard's consumer arrives in step 3; the two land in the same card.
2. **Behavior, the root.** `test/isolation/global-setup.ts` and the `globalSetup` entry. Check: bare `npm test` green, the poisoned-`HOME` check green, and no `pi-omlx-test-*` directory left in `tmpdir()`.
3. **Behavior, the guard.** `test/isolation/worker-setup.ts` and the `setupFiles` entry, guard call only. Check: green, and the run with the `HOME` assignment deleted fails naming the operator's home, then the assignment is restored.
4. **Behavior, the `.env`.** The `node:fs` mock in the same file. Check: the `.env` check green, and with the mock removed the run reproduces 10 failures, then the mock is restored.

**Done** when a bare `npm run check` exits 0 and the operator's state shows no write by the suite: `~/.pi/agent/cache/omlx-models.json` holds neither the fixture `apiRoot` (`https://omlx.home.g33k.top/v1`) nor the fixture model id `real-model`, and `~/.pi/agent/auth.json` and `~/.omlx/model_settings.json` are byte-identical by `shasum` before and after.

Byte identity over all of `~/.pi/agent` is not the criterion. The operator's live pi writes there continuously (`sessions/`, `missions/`), and the installed extension's poll loop rewrites the cache every ten minutes with a fresh `savedAt`, so a whole-directory check fails whether or not the suite escaped. The content assertion is the one the removed `verification` Requirement 3 scenario used.

Alternative lost: wiring all four steps in one commit. The two-hats rule separates them, and each step's check is what tells a reviewer which change broke the suite.

### 8. Docs

Three files tell a contributor to set the variable, in four places, and all four are corrected in the docs pass after the implementation gate:

- `AGENTS.md`: the `PI_CODING_AGENT_DIR=<scratch dir>` prefix in the three command rows, and the trap that says the variable "is not optional".
- `CONTRIBUTING.md`: the setup paragraph that says a bare run replaces the cached model list and to point the variable at an empty scratch directory.
- `ARCHITECTURE.md` §8: "the agent directory every run must point at", the second half of that sentence.
- `README.md`: Eleanor found no instruction there ("No `README.md` PI_CODING_AGENT_DIR instruction was found"), so nothing to correct there. The docs pass still searches every Markdown file for the variable, because that list is a search result, not a guarantee.

Joel's standing ruling keeps documentation out of the gate: it never blocks the feature, and until the pass lands the prefix is harmless rather than necessary. Alternative lost: correcting the docs inside this change's implementation commit, which the docs pass owns.

## Risks / Trade-offs

- [Risk] The environment inheritance from `globalSetup` to workers is source-derived and experimentally confirmed, not documented (Chidi F3). → Mitigation: the guard runs in every worker on every run and fails the run when a path escapes (decision 2).
- [Risk] An environment key added to the extension later is not on `CALLER_ENV_KEYS`, so a caller's export of it reaches the suite. → Mitigation: the list is one named constant in one file, with a comment citing Eleanor's Addendum 1 search; the `.env` mock stops the repository file whatever keys it holds; the residual is a caller's own export.
- [Risk] The setup file's `.env` path is a second derivation of "the `.env` beside `index.ts`". → Mitigation: the `.env` check fails loudly when the mock stops matching (Michael's ruling 1).
- [Risk] A root leaks on `SIGINT`, `SIGTERM` and `SIGKILL` (Chidi F9b). → Mitigation: the `shortcut:` comment; every run creates a fresh root, so a leaked one is never read (Michael's ruling 3).
- [Trade-off] The suite ignores a caller's `PI_CODING_AGENT_DIR` and `HOME` and clears `PI_OMLX_DEBUG`, so `PI_OMLX_DEBUG=1 npm test` no longer traces a whole run. → Accepted: "whatever environment it is run in" requires the override, and `test/debug.test.ts`'s per-test stub still covers the trace line.
- [Trade-off] vitest's secret token and npm's logs still land in the operator's real `HOME`, because they are written before `globalSetup` runs (Eleanor, "Other HOME-based behavior measured"). → Accepted and out of scope: neither is pi's agent directory or the overlay, which is why the specs assert on `.pi` and `.omlx` rather than on nothing under `HOME` (Michael, orientation 2b).

## Migration Plan

No deployment: the change is test infrastructure, so it ships in one commit and there is nothing to roll back in production. Rolling back means deleting the two config entries and `test/isolation/`, after which the suite runs as it does today and the operator's state is exposed again. The docs pass follows the implementation gate; until then the prefix that `AGENTS.md` and `CONTRIBUTING.md` ask for is harmless rather than necessary.

## Open Questions

None. The one unverified premise, whether the overlay resolver is importable, was settled before drafting: `src/catalog.ts:606` exports `resolveLocalModelSettingsPath` and `index.ts:16` imports it.
