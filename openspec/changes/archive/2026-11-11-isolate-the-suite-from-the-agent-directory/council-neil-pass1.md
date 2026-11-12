# Council — neil, pass 1

Run `3c473afd-d376-4ea1-a21a-ee0be19b9982`.

## Recommendation

Settle the isolation on Vitest `globalSetup` + `setupFiles` (drop `test.env` `mkdtemp` and OQ 2's Node `--permission` `execArgv`, which adds warnings and breaks nothing when deleted).

1. **Mechanism (OQ 1, 3–5, 10):** `globalSetup.setup()` creates `mkdtempSync(join(realpathSync(tmpdir()), "pi-omlx-test-"))`, unconditionally assigns `HOME = root`, `PI_CODING_AGENT_DIR = join(root, "agent")`, and `OMLX_MODEL_SETTINGS_PATH = join(root, ".omlx", "model_settings.json")` (both needed: `HOME` covers default fallback; `OMLX_MODEL_SETTINGS_PATH` overrides caller ambient env), deletes ambient `OMLX_API_KEY`, `OMLX_BASE_URL`, `OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS`, and `PI_OMLX_DEBUG`, provides `root` via `project.provide`, and removes `root` idempotently in `teardown()` and `process.once("exit")` (covering pass, fail, `SIGINT`, `SIGTERM`; document `SIGKILL` via `shortcut:`). Prove Req 2 via child `vitest run` fixtures printing `process.env.HOME`.
2. **`.env` beside `index.ts` (OQ 6):** Env pre-assignment alone fails because `OMLX_API_KEY` and `PI_OMLX_DEBUG` have no value that both blocks `src/dotenv.ts:33` and stays falsy. Neutralize `<repoRoot>/.env` in `setupFiles` at the `node:fs` boundary (returning absent/`ENOENT` for that path only).
3. **Guard (OQ 7):** Run in `setupFiles` inside workers, calling a pure helper asserting `isolationRoot` is under `realpathSync(tmpdir())` and `getAgentDir()`, `os.homedir()`, and `resolveLocalModelSettingsPath(process.env.OMLX_MODEL_SETTINGS_PATH)` resolve inside it via `path.relative`, throwing with every escaped path.
4. **Cache path & leaks (OQ 8–9):** Replacing `CACHE_FILE` with one per-call `catalogCachePath()` helper used by read, `mkdirSync`, and write in `src/catalog.ts:567-603` fixes a real split-brain defect ("one home for each fact"), not test-only code. Leave `test/catalog.test.ts` `tmpdir()` leaks out of this card unless a spec requirement is added.
5. **Pre-design edits to `proposal.md` and `specs/test-isolation/spec.md`:** (a) State `<repo>/.env` is blocked from mutating env rather than "resolved under the isolation root", scope "operator's files" to the three surfaces, and drop `test/` fixture moves from Impact; (b) delete Req 1 Scenario 3 (`.omlx` non-write passes today without this change); (c) expand Req 1 Scenario 4 (`.env`) to include `OMLX_API_KEY`/`OMLX_BASE_URL` and caller `OMLX_MODEL_SETTINGS_PATH`; (d) add a scenario for per-call `PI_CODING_AGENT_DIR` cache writes so `src/catalog.ts` passes PL4 spec alignment; (e) replace Req 3 Scenario 2 (no Vitest 5.1.0 pool leaves `homedir()` at operator home when `globalSetup` sets `HOME`) with an escaped-path / sibling-prefix guard scenario. Keep `specs/verification/spec.md` as drafted.

## Evidence

- globalSetup setting process.env before workers spawn reaches import-time constants and updates os.homedir() across forks, threads, vmThreads, vmForks, and --no-isolate, whereas test.env misses os.homedir() in threads and lacks a 0-test teardown hook. (research-chidi.md F1, F3, F8, F9a, F9b, F9d, F12)
- src/dotenv.ts:33 merges when env[key] is undefined or '', while OMLX_API_KEY (src/config.ts:60-61) and PI_OMLX_DEBUG (src/debug.ts:15) treat whitespace as truthy; .env.example:3-4 prescribes OMLX_BASE_URL and OMLX_API_KEY. (research-eleanor.md Addendum 1)
- src/catalog.ts:567 captures CACHE_FILE at import while writeCatalogCache (:598) mkdirs per-call getAgentDir(), disagreeing when PI_CODING_AGENT_DIR changes; bare un-isolated runs already create no .omlx directory. (research-eleanor.md Bare-run measurement & Addendum 1)
- Joel ruled ~/.omlx and <repo>/.env into scope while forbidding test-only production code; Michael's PL4 gate rejects unbacked production changes and tests that stay green when behavior is deleted. (owner-rulings.md §§1-5; michael-the-architect.md PL4)

## Assumptions

- [verified] Vitest 5.1.0 workers inherit main-process process.env mutations made in globalSetup.setup() across all four pools and --no-isolate (research-chidi.md F3, F8, F12).
- [verified] src/dotenv.ts:33 overwrites undefined and empty-string env keys while src/config.ts:60-61 and src/debug.ts:15 treat any non-empty string, including whitespace, as truthy (research-eleanor.md Addendum 1).
- [unverified] vi.mock('node:fs') in a Vitest 5.1.0 setupFiles module intercepts ESM fs reads inside src/dotenv.ts without breaking other fs callers.
- [unverified] Surrounding prose on michael-orientation.md:26 (trap c) dropped during tool read because of inline JSON; summary in proposal.md and owner-rulings.md matches it.
- [unverified] Vitest exit code when globalSetup throws, interactive watch-mode Ctrl-C cleanup, and os.tmpdir() behavior if TMPDIR is unset were not re-measured.

## Risks

- If .env isolation relies only on env pre-assignment, <repo>/.env setting OMLX_API_KEY either overwrites ''/undefined (src/dotenv.ts:33) or forces a non-empty value that activates env credentials in test/index.test.ts:46 (src/config.ts:60-61).
- If the guard uses String.startsWith(isolationRoot) instead of path.relative, a sibling path like /tmp/pi-omlx-test-abc-leak falsely passes for root /tmp/pi-omlx-test-abc.
- If src/catalog.ts changes without a backing scenario in specs/test-isolation/spec.md, PL4 blocks the design for unrequested production scope.

## Confidence

high: All path derivations, Vitest 5.1.0 worker mechanics, and every extension env reader are verified in Chidi's and Eleanor's reports (including Addendum 1); only ESM node:fs mocking in setupFiles awaits a quick check.

## Challenge claims

1. Static process.env pre-assignment cannot isolate <repo>/.env: src/dotenv.ts:33 overwrites undefined and '', while any non-empty string activates OMLX_API_KEY and PI_OMLX_DEBUG.
2. test-isolation Requirement 1 Scenario 3 (writing nothing to ~/.omlx) already passes un-isolated today and fails the deletion test; Requirement 3 Scenario 2 is unreachable in Vitest 5.1.0 under globalSetup.
3. Deriving the catalog cache path per call fixes a production split-brain bug in src/catalog.ts:567,598, so it needs a backing delta-spec scenario to pass PL4 alignment.

## Owner decisions

None

## What would change my mind

- A Vitest 5.1.0 measurement showing vi.mock('node:fs') in setupFiles cannot intercept src/dotenv.ts ESM imports would move me to a Vite load/transform hook or pre-import snapshot/restore in setupFiles.
- A measurement showing a Vitest 5.1.0 pool ignores main-process HOME set in globalSetup would justify keeping the pool-specific wording in Requirement 3 Scenario 2.
