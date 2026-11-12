# Council — matt, pass 1

Run `7547188e-0ca9-404c-be6d-fd33212efc83`.

## Recommendation

(1) Settle the direnv guidance as an untracked `.envrc` in the clone, and add `.envrc` to `.gitignore` next to `.env` in Derek's diff. direnv looks for `.envrc` in the current and parent directories (Chidi §3). Joel's own pattern is an untracked `.envrc` that holds the secret directly, and no global excludes cover it (Michael, Traps). Remove the line and `export OMLX_API_KEY=…` can be committed. (2) Fold the two `environment-configuration` scenarios into one: 'A .env in the extension's directory sets nothing: WHEN the entry module loads from a directory whose `.env` sets a key the process does not, THEN `process.env` lacks that key.' The current scenario 1 repeats credential-resolution's 'Nothing stored and nothing set registers the login-only provider' (one fact, one place). Prove the scenario with one test in `test/index.test.ts`. It copies `index.ts` and `src/` into the per-run isolation root, links `node_modules`, and writes a `.env` there holding a probe key without a VITE_ prefix (a named constant). It then re-imports the copied `index.ts` and asserts the key is absent. It never writes into the clone, so Joel's ruling 'Tests never mutate operating functionality' holds: pi loads the clone, and a crash leaves nothing next to the live `index.ts`. Order the work so it can fail: remove the `node:fs` mock first (it would hide the probe file), add the test and show it red with the loader still present, then delete the loader and show it green. If the copied tree cannot be imported, the design comes back. It does not fall back to writing into the repo. (3) The design must source or drop the proposal's REMOVED+ADDED rename of the test-isolation requirement. Michael's settled ruling says `## MODIFIED Requirements`, and the 'archive refuses to drop them' quote has no citation. Have Chidi measure `openspec validate --strict` on the MODIFIED form. (4) The requirement bans 'any other file', but the test proves only a `.env` in the extension's directory. The design should mark that gap: `shortcut: proves only a .env in the entry module's directory, upgrade if another config file appears`. (5) The `.env` mentions in `scripts/*.ts`, `test/index.test.ts` and `test/auth-storage.test.ts` (Chidi's grep) are not in the proposal's Impact list. Any of them that sends people to `.env` is code under acceptance criterion 2 and belongs in Derek's diff. Eleanor's addendum is pending.

## Evidence

- No global git exclude covers .envrc; Joel keeps secrets in untracked .envrc files (michael-orientation.md Traps)
- direnv loads .envrc from the current and parent directories and needs `direnv allow` (research-chidi.md §3)
- With the mock removed and the loader present, a poisoned .env makes tests fail (10 failed/85 passed); with the loader deleted, the suite passes 93/93 with or without the mock (michael-orientation.md What is settled)
- Vite's startup env read passes only VITE_* keys (plus VITE_USER_NODE_ENV/BROWSER/BROWSER_ARGS) into the worker's process.env, so an unprefixed probe key cannot turn the test red falsely (research-chidi.md §5)
- The loader runs when index.ts's body is evaluated, so the test must re-import index.ts to observe it (research-eleanor.md Environment read timing; michael-orientation.md Traps (ESM hoisting))
- Scripts and two test files mention .env (research-chidi.md §3 grep list)

## Assumptions

- [unverified] A copied index.ts+src under the tmp isolation root, with node_modules linked, can be imported by vitest 5.1.0
- [unverified] The worker-setup guard allows writes under the isolation root
- [unverified] The loader call in index.ts:10 is at module top level
- [unverified] The scripts' .env mentions include user-facing text pointing at .env
- [unverified] OpenSpec strict validation refuses a MODIFIED block that drops a scenario
- [unverified] The ADDED test-isolation text matches the living requirement word for word apart from the .env clause

## Risks

- A test that writes .env next to the real index.ts while the loader exists means any pi startup in that window reads the probe values; a crash leaves an ignored stray file in Joel's live extension directory
- If the new test is written while the node:fs mock is still present, the mock hides the probe .env, the red step stays green, and the test proves nothing
- If the scripts tell users 'set it in .env' and are left as is, a contributor following that text gets an unconfigured script, and acceptance criterion 2 fails

## Confidence

medium: The .gitignore point and the red-green order rest on measurements in the evidence. Whether a copied tree can be imported, how the guard behaves, and what the script text says are all unverified, and Eleanor's addendum is pending.

## Challenge claims

- The proposal's REMOVED+ADDED rename goes against Michael's settled MODIFIED form without a cited source
- Scenario 1 repeats credential-resolution and should be folded away
- A test that writes into the clone breaks 'Tests never mutate operating functionality'; the test must run on a copy under the isolation root

## Owner decisions



## What would change my mind

- If Eleanor shows the scripts' and tests' .env mentions are only historical comments, point (5) drops
- If Chidi measures that strict validation rejects MODIFIED, I accept the rename
- If the copied tree cannot be imported under vitest, I would ask Michael whether the acceptance criterion can be proven at the implementation gate (a search of the diff) instead of by a test
