# Council Synthesis

## Question and Scope

How does the suite isolate itself from the operator's pi state on every run, what fails a run when the isolation escapes, and what does that cost the specifications?

The scope is the three surfaces Joel ruled in: the pi agent directory (`owner-rulings.md` §1), the `~/.omlx` overlay (§4) and the `.env` beside `index.ts` (§5). Out of scope: the test seams, the loader's deletion and `scripts/`, which are other cards, and any production code that exists only for tests (§2).

The advisors worked from `proposal.md`, the two delta specs, `research-chidi.md` and its Addendum 1, `research-eleanor.md` and its Addendum 1, `michael-orientation.md` and `owner-rulings.md`, under the council's rule that they do not read the repository. Three passes each: Neil and Matt, saved as `council-neil-pass{1,2,3}.md` and `council-matt-pass{1,2,3}.md`. Michael ruled the three disputes the passes left open; his rulings are in `michael-council-rulings.md`.

## Perspectives & Trade-offs

Both advisors agreed, from pass 1:

- **`globalSetup` carries the isolation, not `test.env`.** It is the only route where `os.homedir()` is right in every pool (Chidi F3, F12), and it keeps the root's creation and removal in one place (Chidi F9a, F9d).
- **The guard runs in the workers**, from a `setupFiles` entry, against `getAgentDir()`, `os.homedir()` and the overlay path production resolves, and compares with `path.relative` rather than a prefix, because `/tmp/pi-omlx-test-abc-leak` must not pass for a root `/tmp/pi-omlx-test-abc` (Neil pass 1 item 3; Matt pass 1 item 4).
- **No Node permission model** (Chidi F14), and the unremoved `mkdtemp` directories in `test/catalog.test.ts` are a later change (Neil pass 1 items 1 and 4; Matt pass 1 item 7).
- **The `.omlx` no-write scenario is a false green.** Nothing writes there, so it passes with the isolation deleted (Neil pass 1 item 5b; Matt pass 1 item 6).
- **The pool scenario is unreachable.** Under `globalSetup` no pool leaves `homedir()` at the operator's home (Chidi F12), so it cannot be produced (Neil pass 1 item 5e; Matt pass 1 item 6).

Where they disagreed, and how the disagreement moved:

- **`OMLX_MODEL_SETTINGS_PATH`.** Neil assigned it in pass 1; Matt deleted it. Both moved to deletion in pass 2 (Neil M1, Matt N1): with the `.env` stopped, deletion is enough, it keeps `HOME` the one fact that says where the overlay lives, and it keeps the wiring tests on the `homedir()` fallback.
- **The `.env`.** Neil mocked `node:fs` from pass 1; Matt mocked `src/dotenv.ts`. In pass 2 Matt kept the loader mock on one-fact-one-place grounds and Neil answered with the gate; in pass 3 Matt moved to `node:fs` on the gate, and Neil narrowed the question to a rule choice for Michael (Neil P1, Matt Q1).
- **The catalog cache path.** Neil put it in the card; Matt left it out. They crossed twice (Matt N3 in, Neil M3 out; Neil P2 in, Matt Q2 out), so the passes left it to Michael.
- **Signal cleanup.** Matt proposed `process.once("exit")` as the single removal site in pass 2 (N4); Neil rejected it in pass 3 (P3) and Matt abandoned it (Q3). Both ended on teardown plus a shortcut comment.

## Synthesis & Recommendation

The suite isolates itself once per run, in `globalSetup`. `setup()` creates a `mkdtemp` root under `tmpdir()` with the prefix `pi-omlx-test-`, assigns `HOME` and `PI_CODING_AGENT_DIR` under it unconditionally, and deletes the extension's own keys a caller may have exported from one named list: `OMLX_API_KEY`, `OMLX_BASE_URL`, `OMLX_MODEL_SETTINGS_PATH`, `OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS`, `PI_OMLX_DEBUG`. `teardown()` removes the root, and a `shortcut:` comment records that `SIGINT`, `SIGTERM` and `SIGKILL` leak it. A `setupFiles` entry, run in each worker, mocks `node:fs` so the loader sees no `.env` beside `index.ts`, and calls the guard.

The shape follows from three facts. The environment must be in place before `src/catalog.ts` and `index.ts` are imported (Chidi F8), and `globalSetup` is the only mechanism that sets it in the main process before workers spawn, which is what makes `os.homedir()` right in every pool (Chidi F3, F12). The guard is needed because vitest offers no file-system sandbox (Chidi F13) and because the environment reaching workers from `globalSetup` is not in vitest's documentation (Chidi F3): the guard turns an undocumented claim into a measurement on every run. The `.env` is stopped at the file system rather than by assigning values, because the merge fills empty keys as well as unset ones (Eleanor Addendum 1, `src/dotenv.ts:33`), and because the loader is part of the extension `test/index.test.ts` drives through `index.ts:10`.

The card's production diff is zero. Michael's ruling 2 sends the catalog cache path to the seam card: with the root assigned before import, the cache write lands under the root, and no production path changes `PI_CODING_AGENT_DIR` after load, so nothing this card requires breaks without it.

## Accepted & Rejected Feedback

Accepted:

- `globalSetup` and `setupFiles`, and no `test.env` (Neil pass 1 item 1; Matt pass 1 item 1).
- The pure `path.relative` guard, unit-tested at its edges, called from the worker (Matt pass 1 item 4; Neil pass 1 item 3).
- Deleting `OMLX_MODEL_SETTINGS_PATH` instead of assigning it (Neil pass 2 M1; Matt pass 2 N1).
- Teardown as the single removal site, with a shortcut comment and no signal scenario (Neil pass 3 P3; Matt pass 3 Q3; ruled).
- Mocking `node:fs` in the setup file (Matt pass 3 Q1; ruled).
- The `.env` fixture setting `OMLX_MODEL_SETTINGS_PATH` to an overlay with a `real-model` entry (Neil pass 3 P1; ruled).
- Dropping the `.omlx` no-write scenario and replacing the pool scenario with an escaped path (Neil pass 1 item 5; Matt pass 1 item 6).
- The removal scenario naming what a check can observe, a `pi-omlx-test-*` directory left in `tmpdir()` (Matt pass 1 item 6).
- Keeping the caller-directory fact in `verification` only (Matt pass 1 item 6).
- A caller-exported `OMLX_MODEL_SETTINGS_PATH` getting its own scenario (Matt pass 1 item 6).
- The cache path out of this card (Matt pass 3 Q2; ruled).
- No Node permission model, and the catalog temporary-directory leak left to a later change (Neil pass 1 items 1 and 4; Matt pass 1 item 7).

Rejected:

- Assigning `OMLX_MODEL_SETTINGS_PATH` (Neil pass 1 item 1): it gives the overlay path two homes, and the wiring tests would never run the `homedir()` fallback.
- `process.once("exit")` as the removal site (Matt pass 2 N4; Neil pass 1 item 1): it protects nothing a fresh root does not already protect, and a signal test would be timing-fragile (Chidi F9b).
- Mocking `src/dotenv.ts` (Matt pass 2 N2; Neil pass 1 item 2): it mocks the thing under test (Michael's ruling 1).
- The `.env` fixture on `OMLX_BASE_URL` (Matt pass 1 item 6, pass 2 N2): `src/config.ts:61-64` gates the base URL on the key, which the delete list clears, so the scenario stays green with the mock removed (Neil pass 3 P1; Michael's ruling 1).
- The per-call cache path in this card (Neil pass 3 P2; Matt pass 2 N3): nothing this card requires breaks without it (Michael's ruling 2).
- Neil pass 1 item 1's child-run fixtures for the removal requirement: the requirement is observed in `tmpdir()`, not by a child run printing `HOME`.
- Neil pass 1 item 5c's expansion of the `.env` scenario to `OMLX_API_KEY` and `OMLX_BASE_URL`: the delete list clears those keys, so they cannot prove the mock.
- Matt pass 1 item 3's fallback of giving every key a value: Chidi's Addendum 1 measured the mock working in forks and under `--no-isolate`.

## Michael's Rulings

**1. The `.env` is stopped by mocking `node:fs`.** The dispute: Matt mocked `node:fs`, the boundary; Neil mocked `src/dotenv.ts`, which owns the only derivation of `<dirname(index.ts)>/.env`, and asked Michael to choose the rule. His ruling: mock `node:fs` in the setup file. `src/dotenv.ts` is part of the extension `test/index.test.ts` drives through `index.ts:10`, and mocking it is mocking the thing under test, which the implementation gate forbids; the file system is the boundary the loader does I/O through. Requirements he carried: spread `importOriginal()` and override `existsSync` on both the named export and `default` with a plain function; match `path.resolve(String(p))` against the repository's `.env` and leave every other path to the real `existsSync`. On the proving scenario he ruled Neil right and Matt's `OMLX_BASE_URL` key a false green: the fixture must set `OMLX_MODEL_SETTINGS_PATH` to an overlay with a `real-model` entry, which fails 10 of 88 without the mock and passes 88 of 88 with it. What decided it: the gate's "no mocking the thing under test" and Joel's principle that I/O sits at the edges. His own measurement showed both mocks work, so the rule decided, not the evidence.

**2. The catalog cache path is out of this card.** The dispute: Neil brought the per-call derivation in with the dirA→dirB test, because under the fresh root a solo `withEnv` test silently drops its write and a full-file run bleeds one test's cache into later ones; Matt left it to the seam card because nothing this card requires breaks without it. His ruling: out, to the seam card as a structure-only step with the dirA→dirB test. He reproduced Neil's mechanics and found they do not change the deletion arithmetic: both outcomes stay inside the root, the suite is green either way, no production code writes `PI_CODING_AGENT_DIR`, and the only observer that can tell the two derivations apart is a test, which makes it production code whose only consumer is a test, excluded by `owner-rulings.md` §2. He recorded the smell for the seam card and revised his own orientation's trap h lean, which had rested on that card's safety. Consequences he set: the proposal drops its fourth What Changes bullet, the `src/catalog.ts` and `test/` lines from Impact, and open question 8; no cache scenario is added; the card's production diff is zero.

**3. Teardown is the single removal site.** The dispute: teardown plus a shortcut comment (Neil pass 3 P3; Matt pass 3 Q3) against `process.once("exit")` as the single removal site (Matt pass 2 N4, abandoned in pass 3). His ruling: teardown, with a one-line `shortcut:` comment recording that the root leaks on `SIGINT`, `SIGTERM` and `SIGKILL`, and no signal scenario. The deletion test decided it: the exit handler protects nothing the rulings or the spec require, because every run creates a fresh `mkdtemp` root, so a leaked one is never read by a later run, and `tmpdir()` is not operator state under ruling §1. Building it would cost a timing-sensitive subprocess-signal test and risk a race, since vitest's signal handler calls `process.exit()` after a 1 ms timer without awaiting the pool. The removal requirement keeps its two scenarios: a later run does not inherit an earlier root, and a failing run still removes its root.

## Owner Decisions Required

None. Joel settled the scope himself in `owner-rulings.md`: the agent directory in §1, the overlay in §4 and the `.env` read in §5, with §2 forbidding production code that exists only for tests. Michael marked no dispute `joel`, and neither advisor raised an owner decision in any pass; each report's "Owner decisions" section says None.
