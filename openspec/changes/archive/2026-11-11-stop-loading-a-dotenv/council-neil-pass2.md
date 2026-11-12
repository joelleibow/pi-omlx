# Council — neil, pass 2

Run `43f63dd5-3e82-41fb-bda1-4cae2920beec`.

## Responses

### C1 — refine

Fold into one scenario if desired, but keep BOTH assertions: (1) process.env lacks keys set only in .env after module import, and (2) calling default(fakePi) makes zero catalog fetches and registers the login-only provider (dropping "the resolution reports not configured"). Eleanor ("Environment read timing") showed index.ts:214,240 passes an env object into src/config.ts:60,64; a future loader that parses .env into that local env object without mutating process.env would leave a process.env-only check green while configuring OMLX from .env. Calling default(fakePi) on the already-imported copy costs ~4 lines and closes that seam.

Sources: research-eleanor.md Environment read timing & Addendum 2 §1; specs/environment-configuration/spec.md

### C2 — accept

Close the gap with a one-line shortcut: comment on the test (e.g. "shortcut: fixtures only .env beside index.ts; upgrade if another env-file convention enters scope"), and optionally trim the duplicate restatement after the colon in specs/environment-configuration/spec.md without narrowing the rule. Narrowing the requirement to ".env only" would violate the card's acceptance criterion ("Nothing in the extension reads a file to set environment variables"), while a black-box test cannot enumerate unbounded filenames.

Sources: michael-orientation.md Decisions in play §1; specs/environment-configuration/spec.md

### C3 — refine

(1) Use in-process await import(/* @vite-ignore */ pathToFileURL(join(dir, "index.ts")).href); Chidi proved Vite SSR-transforms it without copying package.json or spawning tsx. (2) Use a test-owned mkdtempSync(join(realpathSync(tmpdir()), ...)) removed in finally, matching test/index.test.ts:35-37 and keeping the copy out of HOME/PI_CODING_AGENT_DIR under isolationRoot. (3) Do NOT call process.chdir(): Chidi did not test chdir in-process, worker_threads throws ERR_WORKER_UNSUPPORTED_OPERATION on chdir, and the card scopes to the extension directory (import.meta.url). (4) Put it in test/index.test.ts to reuse its fake pi/fetch harness and singleton cleanup. (5) In try/finally, delete every key written to the temp .env from process.env, clear globalThis[mod.EXTENSION_SINGLETON_KEY], and rmSync the temp dir so a red run never poisons later tests in the worker. (6) Per Chidi Addendum 3 §5, worker-setup.ts's mock masks only <repo>/.env, so the temp-copy test already goes red at HEAD before the mock is removed; its red step is simply running against HEAD's index.ts + src/dotenv.ts before deleting them.

Sources: research-chidi.md Addendum 3; research-eleanor.md Addendum 2 §1, §2, §7

### C4 — accept

All three proposal corrections stand: drop the live "11 and 93" test count (invalidated by adding the new test, violating PL4's moving-count rule), change "every pi session started in the clone" to "every pi session that loads the clone", and fix the docs-pass list. Given Eleanor Addendum 3, the docs pass changes two files: ARCHITECTURE.md:71 (remove the now-false ".env beside index.ts" masking clause) and CONTRIBUTING.md (add untracked .envrc + direnv allow guidance near line 12 for the live smoke/debug tasks, replacing .env.example). README.md and docs/CONFIGURATION.md (no root CONFIGURATION.md exists) never mentioned .env and already document shell exports and /login.

Sources: research-eleanor.md Addendum 3; michael-orientation.md Decisions in play §1 & Traps; michael-the-architect.md Every pass

### C5 — accept

Keep adding .envrc to .gitignore in Derek's diff. Under the pipeline rules, Derek owns non-Markdown files (.gitignore) while Bambadjan's docs pass runs after the implementation gate in this same change and touches only Markdown (CONTRIBUTING.md, ARCHITECTURE.md). Omitting .envrc from Derek's diff would ship CONTRIBUTING.md's .envrc secret instructions with neither repo .gitignore nor global git excludes protecting .envrc from git add. Have design.md trace the .gitignore line to acceptance criterion 2 so PL4/PL7 alignment holds.

Sources: michael-orientation.md Decisions in play §1, §6 & Traps; michael-the-architect.md The design gate (PL4) & The implementation gate; research-eleanor.md Addendum 1 & Addendum 3

## Recommendation changed

true: Moved by Pass 2 addenda on two points: (1) Chidi Addendum 3 proved Vitest 5.1.0 SSR-transforms an out-of-root temp copy via in-process await import(/* @vite-ignore */ fileUrl) and goes red at HEAD even with worker-setup.ts's mock present, so I lock in in-process import() and drop my Pass 1 process.chdir() suggestion (unneeded for import.meta.url and unsafe if Vitest uses worker_threads, where process.chdir throws ERR_WORKER_UNSUPPORTED_OPERATION). (2) Eleanor Addendum 3 proved root CONFIGURATION.md does not exist and neither docs/CONFIGURATION.md, README.md, nor CONTRIBUTING.md mentions .env today, narrowing docs-pass edits to ARCHITECTURE.md:71 (fixing false text) and CONTRIBUTING.md (adding direnv .envrc guidance).

## Out of scope

- CONTRIBUTING.md:9,12,20-25,29-32,45-55 tells contributors to run mise run verify/smoke:omlx/verify:live/debug:omlx/debug:pi, but no mise.toml is tracked at HEAD and package.json defines no scripts for scripts/*.ts (research-eleanor.md Addendum 3); candidate follow-up card.
