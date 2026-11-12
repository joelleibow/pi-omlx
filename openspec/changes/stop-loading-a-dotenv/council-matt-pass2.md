# Council — matt, pass 2

Run `153016be-6ae0-4bfe-8c6c-9a43977717f2`.

## Responses

### C1 — refine

I take the other advisor's point. My single `process.env` assertion stays green if a loader reads the `.env` straight into config without writing `process.env`, and the acceptance criterion ('Nothing in the extension reads a file to set environment variables') is meant to catch exactly that. So: one scenario with two THEN lines. (a) `process.env` lacks the key. (b) The copy's default export, run against a fake pi with no credential stored, makes zero catalog fetches and registers the login-only provider. Drop 'the resolution reports not configured', because it is internal and repeats credential-resolution. The fixture `.env` must set `OMLX_API_KEY` (and `OMLX_BASE_URL`), so a loader that comes back would turn the outcome into 'configured, fetches'. A key the extension never reads would leave (b) green. `CALLER_ENV_KEYS` clears both keys first, so the 'before' state is absent (Chidi Add.3, 'before' empty). Unverified: Chidi measured only the import and `process.env`, not driving the copy's default export against a fake pi.

Sources: research-chidi.md Addendum 3 answers 1-2; michael-orientation.md decision 1 (acceptance criteria); research-eleanor.md Addendum 2 §1 (fake pi, driveExtension)

### C2 — refine

Keep the requirement's wording. It restates the card's acceptance criterion, and narrowing it to fit the test would quietly drop scope Joel approved. The test proves the realistic regression: a loader resolved from the entry module's directory. What is left (any other file, a cwd-relative read) is caught when Michael searches the implementation diff, and the design says so. The test gets the comment Joel's standard 8 requires: `shortcut: proves only a .env beside the entry module, not cwd or other files; upgrade if a config-file reader is proposed`.

Sources: michael-orientation.md decision 1; Joel's standard 8

### C3 — refine

Import in-process. It is measured to load the copy through vite, and unlike tsx it needs no copied `package.json` and no child process (Chidi Add.3, answers 1 and 4). Put the copy in `mkdtempSync(join(inject('isolationRoot'), 'extension-copy-'))`. Global teardown then removes it even after a crash (Eleanor Add.2 §2, teardown rm -r), and nothing touches the clone, which meets 'Tests never mutate operating functionality'. Do not `chdir`. Nothing the change removes depends on cwd, since the loader resolves from `import.meta.url`. `chdir` would change process-wide state for the hypothetical loader C2's shortcut already names, and whether it works under vitest 5.1's default pool is unverified. Home: a new `test/environment-configuration.test.ts`, named after the capability. `test/index.test.ts` statically imports the repo's `index.ts` (Eleanor Add.2 §1), and a separate file gets its own worker state. A small inline fake pi is a second copy of that code, not the third that would warrant extracting it. Cleanup: `afterEach` deletes each key the fixture sets from `process.env` (they persist otherwise, Chidi Add.3) and clears the singleton global, as `test/index.test.ts:35-45` does. Red step: the test is red at HEAD with the loader present whether or not the mock is in place, because the mock hides only `<repo>/.env` (Chidi Add.3 answer 5). That withdraws my pass-1 ordering constraint. The order is now: test red with the loader, delete the loader, test green.

Sources: research-chidi.md Addendum 3; research-eleanor.md Addendum 2 §1, §2, §7; owner-rulings.md (carried §1)

### C4 — accept

All three points hold. (1) Remove the totals, which the new test makes stale. State only what moves: `test/dotenv.test.ts` and its 2 tests go, and the new file is added (one fact, one place). (2) The text should say 'loads the clone', because `index.ts:10` resolves from `import.meta.url` (Eleanor Add.2 §6). (3) Eleanor Add.3 finds no `.env` text in README, CONTRIBUTING or `docs/CONFIGURATION.md`. The docs pass therefore makes two edits. It corrects `ARCHITECTURE.md:71`, which says the setup file keeps the `.env` out. And it adds the direnv guidance in one place, CONTRIBUTING.md, beside the script tasks at lines 12 and 20-25: an untracked `.envrc` in the clone exporting `OMLX_BASE_URL`/`OMLX_API_KEY`, then `direnv allow`. `docs/CONFIGURATION.md:18-19` already shows `export` for pi users and needs nothing.

Sources: research-eleanor.md Addendum 2 §6, Addendum 3; research-chidi.md §3 (direnv allow)

### C5 — accept

It still holds. The docs pass lands inside this change before archive, and per C4 its guidance tells contributors to create an `.envrc` in the clone. Without the line, that file and the key it holds can be committed, since no global excludes cover it (Michael, Traps). `.gitignore` is not Markdown, so the line belongs in Derek's diff, and it is harmless if it lands before the guidance. The design must name the line and the guidance together so they cannot drift apart. If the design instead points direnv guidance somewhere outside the clone, the line goes.

Sources: michael-orientation.md Traps; research-chidi.md §3

## Recommendation changed

true: Three changes, each from new evidence. (1) C1: I accepted the entry-point assertion, because my pass-1 test would stay green on a loader that reads the file into config without writing `process.env`. (2) C3: Chidi's Addendum 3 shows the PR #8 mock does not hide the copy's `.env`, so I withdrew my 'remove the mock first' ordering. It also settles in-process over tsx and puts the copy under the isolation root. (3) C4: Eleanor's Addendum 3 shows the docs carry no `.env` text, so the direnv guidance goes only into CONTRIBUTING and the docs pass corrects only ARCHITECTURE.md:71. The REMOVED+ADDED point from pass 1 is withdrawn as settled.

## Out of scope

- CONTRIBUTING.md:9-32 tells people to run `mise run ...` tasks, but no `mise.toml` exists at HEAD (Eleanor Add.3), so those instructions are already broken. This is a possible later card, outside this one.
