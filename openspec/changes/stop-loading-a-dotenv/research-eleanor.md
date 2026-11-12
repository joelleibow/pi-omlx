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
