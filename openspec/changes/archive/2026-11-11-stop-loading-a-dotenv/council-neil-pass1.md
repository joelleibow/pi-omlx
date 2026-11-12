# Council — neil, pass 1

Run `a842a335-c250-4e96-9e75-c3a37f84fa96`.

## Recommendation

1. **Direnv guidance & `.gitignore` (Q1):** Have the docs pass point contributors running `scripts/smoke-live-omlx.ts` and `scripts/debug-omlx.ts` to an untracked `.envrc` in the clone (`export OMLX_BASE_URL=...`, `export OMLX_API_KEY=...`, `direnv allow`), with no `.envrc.example` added. Add `.envrc` beside `.env` in `.gitignore` (1 line) in Derek's diff: without it, neither `.gitignore` nor git's global excludes protects `OMLX_API_KEY` from `git add`. Leave `.npmignore` untouched (`package.json` `files` already excludes root dotfiles).

2. **Proving `environment-configuration` without test seams or repo mutation (Q2):**
   - Do **not** test via `test/index.test.ts`'s static import (`line 10`): `index.ts:10` ran the loader at module load, so writing `.env` inside `it()` and calling `extension(pi)` stays green if a top-level loader returns. Do **not** write `<repo>/.env` + `vi.resetModules()`: `worker-setup.ts` does not guard repo-root writes, so that clobbers any leftover operator `<repo>/.env` and races across workers.
   - Instead, add a test in `test/index.test.ts` that creates a temp dir (cleaned up in `finally`), copies `index.ts` and `src/` into it (so `import.meta.url` resolves inside the temp dir), symlinks `<repo>/node_modules`, writes `<tempDir>/.env` (`OMLX_BASE_URL`, `OMLX_API_KEY`, `OMLX_DOTENV_SENTINEL=1`), `chdir`s into `tempDir` (catching both `import.meta.url` and `cwd` loaders), and loads `<tempDir>/index.ts` fresh—via dynamic `import(fileUrl)` in-process if Vitest 5.1.0 transforms out-of-root TS (pick 1), or `execFileSync` with `tsx` if not (pick 2). Assert both: `process.env.OMLX_DOTENV_SENTINEL === undefined` (red on top-level `process.env` loaders) and `await default(fakePi)` makes zero catalog fetches and registers the login-only provider (red even if a loader reads `.env` without mutating `process.env`). Drop `"the resolution reports not configured and"` from Scenario 1 in `specs/environment-configuration/spec.md` so the spec asserts only observable entry-point behavior.

3. **Draft errors & misses (Q3):**
   - `proposal.md` claims the suite drops to `11 and 93`; adding `environment-configuration` test(s) invalidates `93` and violates PL4's rule against live counts over moving sets.
   - `proposal.md` says `.env` `"reached every pi session started in the clone"`; `import.meta.url` actually reached **every** pi session loading the clone regardless of `cwd` (direnv is what scopes to launches under the clone).
   - `proposal.md` names `.env`/script guidance in `CONTRIBUTING.md`, `CONFIGURATION.md`, and `README.md` as made false, yet none matched Chidi's `.env`/`dotenv` grep and no `mise.toml` exists—verify existing doc files before fixing docs-pass targets in `design.md`.

4. **Other design points (Q4):** Keep the settled `REMOVED` + `ADDED` delta in `specs/test-isolation/spec.md`; sort merged imports in `index.ts` for Biome; strip `vi.mock("node:fs")` and its now-unused imports in `test/isolation/worker-setup.ts`; drop `.env.example` from `test/isolation/global-setup.ts:12-13`.

## Evidence

- index.ts:10 executes loadDotenvFromExtensionDir(import.meta.url) at module top level, and test/index.test.ts:10 statically imports ../index.ts once in-process with no vi.resetModules or subprocesses. (research-eleanor.md Addendum 2 §1, §6)
- worker-setup.ts:8-20 mocks node:fs existsSync only for repo .env, while worker-setup.ts:27-35 checks escapedPaths only on getAgentDir(), homedir(), and overlay path—not repo-root writes. (research-eleanor.md Addendum 2 §2, §7)
- At HEAD, .gitignore ignores node_modules/, .env, and *.tgz (not .envrc), Joel has no global git ignore for .envrc, and package.json files excludes root dotfiles from npm pack. (research-eleanor.md Addendum 1; research-chidi.md Addendum 1; michael-orientation.md Traps)
- Chidi's repo-wide grep for .env/dotenv did not match README.md, CONTRIBUTING.md, or CONFIGURATION.md; Eleanor found .env.example was the sole env usage hint and no mise.toml exists at HEAD. (research-chidi.md §3; research-eleanor.md Test isolation / scripts & Addendum 2 §3)
- Removing src/dotenv.ts and test/dotenv.test.ts drops 2 tests (95 to 93) before any new environment-configuration tests are added, and deleting index.ts:3,10 triggers Biome organizeImports until formatted. (michael-orientation.md What is settled & Traps; research-eleanor.md Addendum 1)

## Assumptions

- [unverified] Vitest 5.1.0 transforms a dynamic import(file://...) of a temp-copied index.ts + src/ outside the repo root when node_modules is symlinked; if true pick in-process import() in test/index.test.ts, if false pick execFileSync with tsx in that temp dir.
- [unverified] CONTRIBUTING.md, CONFIGURATION.md, and README.md exist at HEAD with the script/.env text proposal.md attributes to them; pending Eleanor's check, pick pointing direnv guidance only at existing repo docs and real package.json script commands (not mise).
- [verified] index.ts runs loadDotenvFromExtensionDir(import.meta.url) at module top level (line 10) while test/index.test.ts statically imports ../index.ts once at line 10 without vi.resetModules or subprocesses.
- [verified] test/isolation/worker-setup.ts's escapedPaths guard checks only getAgentDir(), homedir(), and the overlay path, not writes into the repository root.
- [verified] package.json files (["index.ts","src","README.md","LICENSE"]) excludes root .env and .envrc from npm pack regardless of .npmignore or .gitignore, while .gitignore lacks .envrc and Joel's machine has no global .envrc git ignore.
- [verified] openspec 1.14.3 --strict rejects dropping a scenario via MODIFIED and accepts REMOVED + ADDED under the new requirement name in specs/test-isolation/spec.md.

## Risks

- If contributors follow direnv guidance to create <clone>/.envrc containing OMLX_API_KEY without .envrc in .gitignore, git add . stages the secret for commit because neither .gitignore nor global git excludes ignores .envrc.
- If test/index.test.ts writes a fixture .env beside index.ts in the live repository root, running npm test overwrites or deletes an operator's existing <repo>/.env and leaks fixture env vars into parallel Vitest workers importing ../index.ts.
- If test/index.test.ts only calls the statically imported extension(pi) after writing a .env inside an it() block, restoring loadDotenvFromExtensionDir(import.meta.url) at index.ts top level leaves the test green because module top-level code already executed before it() ran.

## Confidence

high: Codebase structure, import timing, isolation guards, npm pack behavior, and OpenSpec validation are all measured at HEAD c5581d6; only the Vitest out-of-root import mechanics and exact existing Markdown filenames await Pass 2 confirmation.

## Challenge claims

- A test in test/index.test.ts that writes .env inside it() and calls the statically imported extension(pi) stays green even if index.ts:10's top-level .env loader returns, failing Joel's red-when-broken rule.
- Writing a test fixture to <repo>/.env with vi.resetModules() risks clobbering an operator's real <repo>/.env and races across Vitest workers; the test must stage a temp copy of index.ts + src/ instead.
- proposal.md asserts three unsupported facts: a final 93-test count (invalidated once environment-configuration gets tests), that .env only affected pi sessions started in the clone (it affected all sessions via import.meta.url), and unverified .env guidance in CONTRIBUTING.md/CONFIGURATION.md/README.md.

## Owner decisions



## What would change my mind

- A measurement showing Vitest 5.1.0 rejects dynamic import() of TypeScript files under os.tmpdir() would move me from in-process dynamic import() to a tsx subprocess in the staged temp directory.
- Evidence from Eleanor that CONTRIBUTING.md and CONFIGURATION.md exist at HEAD and contain .env guidance would withdraw my objection to proposal.md's docs-pass file list.
- A ruling from Joel preferring shell-level or parent-directory direnv config without a clone .envrc would remove the need to add .envrc to .gitignore.
