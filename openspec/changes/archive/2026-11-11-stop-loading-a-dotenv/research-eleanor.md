# Eleanor research — stop-loading-a-dotenv

Repository: `/Users/joelleibow/Projects/pi-omlx`, HEAD `c5581d67b5456aac5e6a437a0a8c0b51635e3d1e` (`c5581d6`), branch `stop-loading-a-dotenv`. Research scope: project sources excluding dependencies and archived changes. The addendum was read in full. Current status at research time showed only untracked `.pi/` and the change directory; three files were restored.

## Required reads and change binding

- `AGENTS.md`: read; check commands and guidance on environment clearing in test isolation.
- `ARCHITECTURE.md`: read; §8 describes suite isolation and the current `.env` masking.
- `package.json`: read; ES module TypeScript project, Node >=22. `npm run check` runs Biome, TypeScript, then Vitest.
- Change owner rulings: `openspec/changes/stop-loading-a-dotenv/owner-rulings.md`; read. It records the task and the earlier decision to isolate `.env` in tests temporarily while the loader removal remained a separate change.
- ADR `docs/adr/0001-one-credential-decides-the-omlx-connection.md`: read in full. Title: **One credential decides the OMLX connection**; status Accepted. It specifies stored `omlx` credential precedence, with `OMLX_BASE_URL` and `OMLX_API_KEY` used only when no stored credential exists. It does not mention `.env` or specify a mechanism for sourcing environment configuration; it discusses environment variables as inputs. No ADR status/index file was identified.

## Existing dotenv path and impacts

- `index.ts:3,10` imports and calls `loadDotenvFromExtensionDir(import.meta.url)` at startup.
- `src/dotenv.ts:5,27,36-45` defines parser/merge/loader; loader finds `.env` beside entrypoint and merges it into `process.env`. `test/dotenv.test.ts:2,4,25` tests parser/merge.
- `test/isolation/worker-setup.ts:9-22` uses `vi.mock("node:fs")` to make the repository `.env` appear absent. The masking code is loader-specific; its separate path guard is still useful.
- `test/isolation/global-setup.ts:13-20` documents and clears `CALLER_ENV_KEYS`. The comment cites `.env.example`; that citation should be removed/updated if the example is replaced or deleted. Root setup, HOME/agent override, env clearing and teardown remain independently relevant.
- `openspec/specs/test-isolation/spec.md:10,22-24` requires `.env` not to reach suite and contains a corresponding scenario. That behavior/scenario becomes moot if there is no reader. `ARCHITECTURE.md:71` says worker setup keeps `.env` out of the run; that description becomes redundant/false after loader removal.
- `.env.example:1` says copy to `.env` and fill in values, or export them. It is inconsistent with deleting extension-directory loading and should be removed or changed to direnv guidance per task scope.
- `openspec/changes/stop-loading-a-dotenv/owner-rulings.md:5,7,17` mentions `.env` as history and remains historical record.

## Corrected ignore/package evidence at HEAD

Addendum 1 identified that earlier inspection had seen a modified working tree. At HEAD, I re-read the files:

- `.gitignore` lines 1-3: ignores `node_modules/`, `.env`, `*.tgz`; no other dotenv-related line. Thus root `.env` is ignored by git.
- `.npmignore` has a `# config/env` heading and line `.env*`; no other `.env`-related line. This excludes env-named files from package output.
- `package.json` is formatted multiline and `files` at lines 24-29 is `index.ts`, `src`, `README.md`, `LICENSE`. It does not include `.env.example`; no dotenv-specific package metadata. Correction: previous observation that package.json was one line and `files` only contained `index.ts` and `src` was based on transient modified-tree state, not HEAD.

## Full `.env.example` inventory versus isolation and scripts

Full contents at HEAD:

```dotenv
# Copy to .env and fill in your values, or export them in your shell.
# Matches OMLX's canonical OpenAI-compatible endpoint (see README of oMLX).
OMLX_BASE_URL="http://127.0.0.1:8000/v1"
OMLX_API_KEY="omlx-..."
```

Its two variable keys, `OMLX_BASE_URL` and `OMLX_API_KEY`, are both included in `CALLER_ENV_KEYS` in `test/isolation/global-setup.ts:14-20`. The extension’s other keys in that list are `OMLX_MODEL_SETTINGS_PATH`, `OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS`, and `PI_OMLX_DEBUG`; those are not listed by the example. `PI_CODING_AGENT_DIR` is set separately by global setup, not in `CALLER_ENV_KEYS`.

Script env keys: `scripts/smoke-live-omlx.ts:9,11,28,31` reads `OMLX_BASE_URL`, `OMLX_API_KEY`, `OMLX_REASONING_MODEL`, `OMLX_NON_THINKING_MODEL`; `scripts/debug-omlx.ts:49-50` reads `OMLX_BASE_URL`, `OMLX_API_KEY`; `scripts/debug-pi.ts:562` reads `PATH`. The `.env.example` overlaps the first two scripts' URL and API key variables. It does not list either smoke model-selection variable. `CALLER_ENV_KEYS` is documented as extension env, not as every script env. Scripts read env directly; no dotenv loader invocation was found in them.

## Environment read timing and consequences

Static ES module imports are evaluated before the body of `index.ts` executes its loader call. No top-level extension env reads that matter were found in imported `src/*.ts`; runtime reads are:

- `src/debug.ts:15`: `PI_OMLX_DEBUG` checked when `omlxDebug` runs.
- `src/stream.ts:52-59`: timeout key checked per `resolveFirstDeltaTimeoutMs()` call.
- `src/catalog.ts:396`: overlay key used as a default parameter when called.
- `src/config.ts:60,64`, with environment passed at `index.ts:214,240`: credential variables read during resolution.

These could see the values injected by loader after entrypoint body starts. After loader deletion, explicit caller-provided process env continues to work; only extension-directory `.env` sourcing disappears.

## Test isolation / scripts

Living spec `openspec/specs/test-isolation/spec.md` has scenarios for operator overlay and caller overlay not affecting tests; `.env` not reaching suite; root cleanup after pass/fail; absent isolation failing with escaped path; sibling path reported escaped. `test/isolation/worker-setup.ts`'s dotenv masking mock can go with loader removal, but its isolation guard remains. Global setup's temp root, HOME and Pi agent-dir override, caller key clearing, and cleanup are needed regardless.

Scripts use `process.env` and built-in fallbacks directly; no project script wrapper or dotenv package was found. `smoke-live-omlx.ts` prints base URL and selected model IDs and errors with instructions to set missing reasoning/non-thinking variables. `debug-omlx.ts` prints base URL/default and whether API key is set, not the secret. No direnv guidance was found in scripts or docs; `.env.example` is the sole project usage hint for env configuration. Scope notes say script configuration itself is not to be redesigned beyond pointing users to direnv.

## Baseline verification (rerun at HEAD)

Bare `npm run check` passed at HEAD `c5581d6`:

- Biome: `Checked 39 files in 10ms. No fixes applied.`
- TypeScript: `tsc --noEmit` completed successfully (no diagnostics; command chain advanced to Vitest).
- Vitest: `Test Files 12 passed (12)`; `Tests 95 passed (95)`; duration 556ms.

Correction: previous report said Biome failed on package.json before typecheck/tests. That was an artifact of the transient one-line package rewrite, not the baseline. No files were modified by this run.

## Residual unknowns

No product/design judgment made. The full ADR and the restored ignore/config files are now inspected. Baseline green. Remaining work belongs to the implementation/change: decide exact direnv guidance and remove/update references as directed by the change acceptance criteria.

## Addendum 1

This addendum corrects the earlier reconnaissance, which accidentally read a transiently modified worktree. At HEAD, `.gitignore` ignores `.env`; `.npmignore` excludes `.env*`; `package.json` has its normal multiline formatting and its allowlist includes `index.ts`, `src`, `README.md`, `LICENSE`. `.env.example` contains exactly two keys—`OMLX_BASE_URL` and `OMLX_API_KEY`—both cleared by `CALLER_ENV_KEYS`; the full script-key comparison is above. The accepted credential-resolution ADR was read in full and has no `.env` guidance. Re-running bare `npm run check` on restored HEAD passes Biome (39 files), tsc, and Vitest (12 files / 95 tests). The prior failed Biome result and modified package/ignore observations are superseded, not baseline evidence.

## Addendum 2

Run `8ba091b8-cc76-44dc-9189-7213a4cbb555`, for the council's pass 1 (Neil's and Matt's questions).


All paths below are repository-relative. Line references refer to HEAD `c5581d6`.

### 1. Entry module and test execution

`index.ts` has static imports at lines 1-8, then invokes `loadDotenvFromExtensionDir(import.meta.url)` at module top level, line 10. Further static imports are at lines 12-27; module constants and singleton symbol are initialized at lines 29-35. The default-exported async function starts at line 46. Its body (lines 47 onward) uses the supplied Pi API, gates on singleton state, registers/fetches providers, starts polling and installs event handlers. The loader therefore runs as an import side effect, before the default function is invoked.

`test/index.test.ts:10` statically imports `extension` and `EXTENSION_SINGLETON_KEY` from `../index.ts`; tests call `await extension(pi)` (first visible at line 78 and through the `driveExtension` helper at line 232). It deletes the global singleton between tests (`:35-39,41-45`) and configures a fake Pi API and fetch. It creates a temporary directory for auth fixture data (`:35-37`), but invokes the extension in-process. No child-process execution or subprocess API was found in `test/index.test.ts` or elsewhere in the test tree. `test/index.test.ts` does not call `vi.resetModules` or dynamically import `index.ts`; its only static import is line 10. There is no evidence of an extension test run in a temp copy/directory: temp directories hold fixtures, while the imported module is the repository's `index.ts`.

### 2. Isolation implementation and tests

Vitest config (`vitest.config.ts:3-11`) sets global setup to `test/isolation/global-setup.ts` and worker setup to `test/isolation/worker-setup.ts`.

`test/isolation/global-setup.ts` steps:
1. Declares the provided `isolationRoot` context property (`:6-10`).
2. Lists extension caller env keys cleared for test runs (`:12-20`).
3. `setup` makes a fresh directory beneath canonicalized system temp (`:24-27`), sets `HOME` and `PI_CODING_AGENT_DIR` beneath it (`:28-29`), deletes each listed key from `process.env` (`:30`), and provides root to the project (`:31`).
4. `teardown` no-ops if no root was set, otherwise recursively removes it (`:34-39`).

`test/isolation/worker-setup.ts` steps:
1. Imports helpers and registers a `node:fs` mock (`:1-8`). Its factory gets the original module (`:8-10`), imports URL/path helpers itself (`:12-15`), resolves repo `.env` (`:16`), and overrides `existsSync` to return false for that exact path while forwarding all other calls (`:17-19`). This is the specific dotenv masking seam.
2. Injects the isolation root; absent root throws (`:22-25`).
3. Calls `escapedPaths` on `getAgentDir()`, `homedir()`, and the resolved overlay path (`:27-31`); any paths outside the root are reported in a thrown error (`:32-35`).

`test/isolation/guard.ts:3-18` checks passed paths using `relative(root,path)`, reports undefined as `<absent>`, and classifies absolute or `..` relative paths as escaped. `test/isolation/guard.test.ts` exercises root and descendant as contained, sibling/relative/empty/absent paths as escaped, and mixed lists (`:8-41`). The worker setup itself is activated for test workers by Vitest config; `global-setup.ts` likewise runs from config. No separate dedicated test for the setup module functions was found. Other suite tests rely on these mechanisms by running under configured Vitest.

### 3. Literal `.env`/`dotenv` hits and mise

Separating literal filename/loader mentions from `process.env`:

- `AGENTS.md`: no `.env` or `dotenv` literal occurrence. It does contain the unrelated expression `process.env` at line 19, advising updates to `CALLER_ENV_KEYS` for new extension env reads.
- `scripts/`: no literal `.env` or `dotenv` occurrences. Search hits for `process.env` in `scripts/smoke-live-omlx.ts:9,11,28,31`, `scripts/debug-omlx.ts:49-50`, and `scripts/debug-pi.ts:562` are environment access, not `.env` filenames/loader references.
- `test/index.test.ts`: no literal `.env` or `dotenv` occurrences. Search hits are `process.env` usages at lines 128-134, 222.
- `test/auth-storage.test.ts`: no literal `.env` or `dotenv` occurrences. Search hits are `process.env` accesses at lines 17, 22-23, 37, 78.
- `openspec/specs/`: literal `.env` occurs only in `openspec/specs/test-isolation/spec.md:10,22,24`, describing the suite-isolation requirement and scenario. No `dotenv` literal found.
- No `mise.toml` exists at the repository root (`ls -la mise.toml` reports not found); `find` found no matching file.

### 4. Exact living and archived specs

`openspec/specs/test-isolation/spec.md` (full current text):

```markdown
# test-isolation Specification

## Purpose
Defines how the suite keeps itself away from the operator's pi state: what every run isolates, when the isolation root is removed, and the guard that fails a run when the isolation escapes.

## Requirements

### Requirement: Every Run Isolates Itself From Operator State

Every run of the suite SHALL resolve pi's agent directory and the extension's `~/.omlx` overlay under a per-run isolation root, a directory the run creates under the system temporary directory, before any test file is imported, overriding a value the caller supplies. It SHALL keep the `.env` beside `index.ts` from reaching the run's environment. A run's outcome SHALL NOT depend on the operator's files or on the caller's environment.

#### Scenario: The operator's overlay does not decide the run

- **WHEN** `HOME` holds `~/.omlx/model_settings.json` with an entry for the suite's fixture model `real-model` and `npm test` runs
- **THEN** the run exits 0

#### Scenario: A caller's exported overlay path does not decide the run

- **WHEN** the caller exports `OMLX_MODEL_SETTINGS_PATH` naming a file with an entry for `real-model` and `npm test` runs
- **THEN** the run exits 0

#### Scenario: A .env beside index.ts does not reach the suite

- **WHEN** a `.env` beside `index.ts` sets `OMLX_MODEL_SETTINGS_PATH` to a file holding an entry for `real-model` and `npm test` runs
- **THEN** the run exits 0

### Requirement: The Isolation Root Is Removed When The Run Ends

The isolation root SHALL be created fresh for each run and removed when the run ends, whether its tests passed or failed, so no run reads what an earlier run left behind.

#### Scenario: A finished run leaves no isolation root

- **WHEN** a run of `npm test` finishes
- **THEN** no directory named `pi-omlx-test-*` remains in the system temporary directory

#### Scenario: A failing run still removes its root

- **WHEN** a run finishes with at least one failing test
- **THEN** no directory named `pi-omlx-test-*` remains in the system temporary directory

### Requirement: A Guard Fails The Run When The Isolation Escapes

The suite SHALL check, before any test runs, that pi's agent directory, `homedir()` and the overlay path all resolve under the isolation root, and SHALL fail the run when one does not, naming every path that escaped.

#### Scenario: A missing isolation fails the run

- **WHEN** the isolation is removed and `npm test` runs
- **THEN** the run fails
- **AND** its output names the escaped path

#### Scenario: A path beside the root is reported as escaped

- **WHEN** the guard is given a path beside the isolation root rather than under it
- **THEN** it reports that path as escaped
```

`openspec/changes/archive/2026-11-11-isolate-the-suite-from-the-agent-directory/specs/verification/spec.md` (full archived delta text):

```markdown
# Spec Delta

## MODIFIED Requirements

### Requirement: Check Passes On The pi Versions The Package Declares

The `check` script in `package.json` SHALL exit 0 after `npm ci`, and the `@earendil-works/pi-ai` the repository installs SHALL be the version `@earendil-works/pi-coding-agent` pins.

#### Scenario: The check exits zero

- **WHEN** `npm run check` runs in a working tree whose dependencies came from `npm ci`
- **THEN** the command exits 0

#### Scenario: The repository installs one pi-ai, the one pi pins

- **WHEN** `npm ls @earendil-works/pi-ai --all` runs
- **THEN** every copy it reports carries the same version
- **AND** that version is the one `node_modules/@earendil-works/pi-coding-agent/package.json` pins

## REMOVED Requirements

### Requirement: Verification Runs Leave The Operator's Agent Directory Alone

**Reason**: This change makes two things in it false: the premise that "until it isolates itself, the variable is the isolation", and its only scenario, which asserts the fixture write lands in the caller's scratch directory. The suite now isolates itself, so a caller's agent directory receives nothing.

**Migration**: Replaced by "Verification Runs Need No Caller-Supplied Agent Directory" in this delta's ADDED section. A bare run is safe, and a caller-supplied `PI_CODING_AGENT_DIR` no longer changes where the run writes.

## ADDED Requirements

### Requirement: Verification Runs Need No Caller-Supplied Agent Directory

A run of `npm run check`, `npm test` or `npx vitest run` SHALL leave the operator's pi agent directory as it found it, and a bare run SHALL be safe in any environment.

#### Scenario: A bare run writes nothing into the operator's agent directory

- **WHEN** `env -u PI_CODING_AGENT_DIR HOME=<empty directory> npx vitest run` runs
- **THEN** the run exits 0
- **AND** `<empty directory>/.pi` does not exist afterwards

#### Scenario: A caller's agent directory is left as it was

- **WHEN** `PI_CODING_AGENT_DIR=<populated directory> npm run check` runs
- **THEN** the run exits 0
- **AND** every file under `<populated directory>` holds the bytes it held before the run
```

### 5. Quoted mentions and user-facing guidance

There are no literal `.env` or `dotenv` mentions in the requested files, so there is no such text to quote from `scripts/debug-pi.ts`, `scripts/debug-omlx.ts`, `scripts/smoke-live-omlx.ts`, `test/index.test.ts`, `test/auth-storage.test.ts`, or `AGENTS.md`. The `process.env` expressions listed in answer 3 are not `.env`-file references. None of those files tells users to put values in `.env` or describes the loader. The user-facing “Copy to .env” instruction is in `.env.example`, outside the listed files; the loader itself is named/called in `index.ts:3,10` and implemented in `src/dotenv.ts`.

### 6. Loader location and module re-import

Yes. `index.ts:10` calls `loadDotenvFromExtensionDir(import.meta.url)` at module top level, outside the default-exported function (which begins at line 46). `test/index.test.ts` statically imports the module at line 10. It has no `vi.resetModules` or dynamic `import()` of `index.ts`; tests re-invoke the already-imported function and clear the singleton global.

### 7. What the worker guard covers

It does **not** refuse or report arbitrary test writes into the repository root beside `index.ts`. `worker-setup.ts:27-31` passes only the resolved Pi agent directory, `homedir()`, and overlay path to `escapedPaths`. The guard validates those paths only, not test file writes or the repository root. The `.env`-specific fs mock (`worker-setup.ts:8-20`) masks reads of that one `.env` path; it is not a general repository-write guard.

## Addendum 3 — documentation and dev-script references

Scope: HEAD `c5581d6`, read-only. `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, and directory `docs/` exist at HEAD. A root `CONFIGURATION.md` does not exist; the configuration document is `docs/CONFIGURATION.md`. `docs/` contains `CONFIGURATION.md`, `adr/0001-one-credential-decides-the-omlx-connection.md`, and `architecture/omlx-connections.mermaid`. The matching documentation lines follow verbatim, with repository-relative path and line number. Matches include `.env`, `dotenv`, `direnv`, `OMLX_BASE_URL`, `OMLX_API_KEY`, and development-task/script references (the `mise run ...` tasks).

### README.md

- `README.md:25`: `* `npm run check``
- `README.md:26`: `* `npm run format``
- `README.md:28`: `* `npm run test:watch``
- `README.md:37`: `The default base URL is `http://127.0.0.1:8000/v1`. A saved login decides the base URL and the API key. `OMLX_BASE_URL` and `OMLX_API_KEY` apply only when nothing is saved, and the URL variable does nothing without the key beside it. A keyless server is reached the way step 3 describes, by leaving the key empty; setting `OMLX_BASE_URL` alone is unsupported.`

### CONTRIBUTING.md

- `CONTRIBUTING.md:9`: `mise run verify`
- `CONTRIBUTING.md:12`: `A live OMLX server is needed for `mise run smoke:omlx` and `mise run verify:live`.`
- `CONTRIBUTING.md:14`: `A bare run of `mise run verify`, `npm run check` or `npm test` is safe. The isolation is wired in `vitest.config.ts`, so every route into the suite gets it ([ARCHITECTURE.md](./ARCHITECTURE.md) §8): your cached model list and `~/.omlx` overlay are left alone, and `PI_CODING_AGENT_DIR` in your shell changes nothing about where a run writes.`
- `CONTRIBUTING.md:20`: `- `mise run verify` — Biome, TypeScript type checking, unit tests.`
- `CONTRIBUTING.md:21`: `- `mise run smoke:omlx` — live OMLX probe: reasoning model, non-thinking model, tool-flow request.`
- `CONTRIBUTING.md:22`: `- `mise run verify:live` — typecheck, unit tests, and live smoke (skips Biome; run `mise run verify` first if you want lint coverage).`
- `CONTRIBUTING.md:23`: `- `mise run debug:omlx` — OMLX config, model path, template, log, and cache diagnostics. Pass model names after `--` to narrow, e.g. `mise run debug:omlx -- opus sonnet`.`
- `CONTRIBUTING.md:24`: `- `mise run debug:pi` — Pi home, config, session, log, and cache diagnostics. Pass `install`, `config`, `sessions`, `logs`, or `cache` after `--`.`
- `CONTRIBUTING.md:25`: `- `mise run debug:pi -- timeline <session-id|session-file|iso-time>` — OMLX server events and changed files around a stuck turn. You pass the anchor: a session id, a session file, or an ISO timestamp, with no default. Use `--minutes=N` to set how far past the anchor the window runs (default 3).`
- `CONTRIBUTING.md:29`: `1. Reproduce the stuck turn with `PI_OMLX_DEBUG` set to any non-empty value, `0` included: the extension writes `[pi-omlx] <event> {json}` lines to stderr in the terminal that started Pi, and keeps no log file. A stuck turn shows as a trace that stops after `before_provider_request`. The events are `model_select`, `before_provider_request`, `provider_registered`, `stream_error_normalized`, `stream_simple_entered`, `stream_simple_bypassed` and `stream_throw_normalized`. The latest `mise run smoke:omlx` proof lives in `log/smoke-test/<iso-timestamp>.json`.`
- `CONTRIBUTING.md:30`: `2. Inspect Pi host state: `mise run debug:pi`.`
- `CONTRIBUTING.md:31`: `3. Inspect OMLX config and model files: `mise run debug:omlx`.`
- `CONTRIBUTING.md:32`: `4. Run live smoke: `mise run smoke:omlx`.`
- `CONTRIBUTING.md:45`: `  │   └─ mise run debug:pi`
- `CONTRIBUTING.md:47`: `  │   └─ mise run debug:omlx`
- `CONTRIBUTING.md:49`: `  │   └─ mise run smoke:omlx`
- `CONTRIBUTING.md:51`: `  │   └─ mise run debug:pi -- sessions, then compare model_settings.json and chat_template.jinja`
- `CONTRIBUTING.md:55`: `      └─ check OMLX_BASE_URL is reachable, then mise run debug:omlx`

How-to-run: CONTRIBUTING says run tasks via mise (`:17`) and lists `verify`, `smoke:omlx`, `verify:live`, `debug:omlx`, `debug:pi` tasks (`:20-25`). Setup says `npm install` then `mise run verify` (`:7-10`). It says a live server is required for live smoke/verification (`:12`). No `.env`, dotenv, or direnv line appears in CONTRIBUTING.

### docs/CONFIGURATION.md (there is no root CONFIGURATION.md)

- `docs/CONFIGURATION.md:13`: `A saved login decides the base URL and the API key, for the model list and for chat alike. `OMLX_BASE_URL` and `OMLX_API_KEY` apply only when nothing is saved: CI, a fresh shell, a project you have not logged in to. To use a key in one shell while a login is saved, run `/logout` first.`
- `docs/CONFIGURATION.md:18`: `export OMLX_BASE_URL="http://10.0.0.5:8000/v1"`
- `docs/CONFIGURATION.md:19`: `export OMLX_API_KEY="omlx-..."`
- `docs/CONFIGURATION.md:22`: `` `OMLX_API_KEY` alone uses the default base URL, `http://127.0.0.1:8000/v1`. `OMLX_BASE_URL` alone configures nothing: with no API key and no saved login, the provider stays login-only and no model list is fetched.``
- `docs/CONFIGURATION.md:26`: `Reach a server that needs no API key with `/login`: enter its base URL and leave the key empty. That works whatever `OMLX_API_KEY` is set to in your shell, because the empty key belongs to the saved login rather than to the environment.`
- `docs/CONFIGURATION.md:28`: `A keyless server addressed by `OMLX_BASE_URL` alone, with no login, is unsupported. Pi has nothing stored to authenticate with, treats the provider as not configured, and chat does not work.`

### ARCHITECTURE.md

- `ARCHITECTURE.md:71`: `The suite isolates itself on every run. A global setup in `test/isolation/` creates a per-run root under the system temporary directory, points `HOME` and `PI_CODING_AGENT_DIR` into it, clears the extension's own environment keys, and removes the root when the run ends. A setup file in the same directory keeps a `.env` beside `index.ts` out of the run, and fails the run when the agent directory, the home directory or the overlay path resolves outside the root. A bare run therefore leaves the operator's agent directory and overlay alone.`

No other line in README, CONTRIBUTING, ARCHITECTURE, or docs contains the requested `.env` / `dotenv` / `direnv` / key-name / dev-script terms. In `docs/` the ADR additionally contains key-name matches (quoted for completeness):

- `docs/adr/0001-one-credential-decides-the-omlx-connection.md:15`: `One credential decides the OMLX base URL, the API key and keyless-ness, for the model catalog and for the provider registration alike. It is the stored `omlx` credential when one exists, and `OMLX_BASE_URL` with `OMLX_API_KEY` only when none does.`
- `docs/adr/0001-one-credential-decides-the-omlx-connection.md:17`: `The resolution is the extension's own, in one place under `src/`, because pi's answer is not readable at the moments that matter. It restates pi's order deliberately and carries a comment naming that mirror, to be re-checked when the pi version moves. `OMLX_BASE_URL` alone is not a configuration: with no key and no saved login the provider stays login-only. A keyless server is reached by logging in with an empty key. A registration that omits the key first clears the previous registration, so nothing is inherited.`
- `docs/adr/0001-one-credential-decides-the-omlx-connection.md:25`: `A saved login now outranks the environment, so a key exported in a shell no longer reaches a shell that has a login saved, and `/logout` is how a key is used. The documentation's older promise that `OMLX_API_KEY` overrides a stored login is withdrawn, because it was never true for chat.`

`docs/architecture/omlx-connections.mermaid` has no matching lines. No line in the examined docs mentions `.env`, dotenv, or direnv; the only `.env` wording here is the architecture's statement that tests keep a file beside `index.ts` out of the run.

### package.json scripts

None of the `package.json` scripts invokes `scripts/*.ts`. The scripts are `check`, `format`, `typecheck`, `test`, `test:watch`, and `release`; the package's `scripts` directory is included in lint/check inputs, but there are no npm aliases for these operational helpers. CONTRIBUTING's `mise run` task names are how users run the development scripts; no tracked `mise.toml` exists at repository root at this HEAD.

### Repository status at end

Ran `git -C /Users/joelleibow/Projects/pi-omlx status --short` as directed. Output was:

```text
 M openspec/changes/stop-loading-a-dotenv/research-eleanor.md
?? .pi/
```

I did not edit the repository in this addendum. The modified `research-eleanor.md` entry was already present when checked; therefore status did not meet the brief's expected only-`?? .pi/` condition.
