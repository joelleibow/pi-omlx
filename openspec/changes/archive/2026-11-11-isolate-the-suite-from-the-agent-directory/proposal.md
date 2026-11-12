# Proposal

## Why

Joel ruled on 2026-11-11: "Tests never mutate operating functionality" (`owner-rulings.md`). The suite must not write to or read from the operator's real pi agent directory, whatever environment it runs in. Today it does, and what the repository offers instead is a convention: the commands in `AGENTS.md` carry `PI_CODING_AGENT_DIR=<scratch directory>`, `CONTRIBUTING.md` asks for it in prose, and `openspec/specs/verification/spec.md` Requirement 3 makes that prefix the isolation.

The convention does not hold. Three measurements, all from a scratch copy of the repository:

- A bare `npx vitest run` passed 11 files and 88 tests and left `$HOME/.pi/agent/cache/omlx-models.json` holding the suite's fixture `apiRoot` (Eleanor, bare-run measurement). `src/catalog.ts:567` computes `CACHE_FILE` at import while the cache directory is computed per call, so a test that sets the variable isolates the `auth.json` read and the `mkdir`, not the write (Michael, trap a).
- `~/.omlx/model_settings.json` is reached through `homedir()` (`src/catalog.ts:610`), a path `PI_CODING_AGENT_DIR` cannot reach. With an entry for the fixture model in the operator's overlay, 10 of 16 wiring tests fail (Michael, trap c).
- The `.env` beside `index.ts` merges into `process.env` at import (`index.ts:10`, `src/dotenv.ts:33`). A `.env` naming a poisoned overlay fails the suite: 4 tests in Michael's first measurement, 10 of 88 in the one his ruling rests on (trap d; ruling 1).

Joel ruled the overlay and the `.env` read into this card (`owner-rulings.md`). Discipline is not a guard, and "whatever environment it is run in" asks for one.

## What Changes

- **The suite isolates itself on every run.** A per-run root under the system temporary directory holds pi's agent directory and the operator's home for the run. The suite assigns both before any test file imports, overriding a value the caller supplies, and clears the extension's own environment keys a caller may have exported.
- **The `.env` beside `index.ts` is stopped at the file system.** The setup file makes the loader see no `.env` there, so a repository `.env` cannot reach the run's environment.
- **A guard fails the run when the isolation escapes.** Before any test runs, the suite checks that pi's agent directory, `homedir()` and the overlay path resolve under the root, and names the path that escaped when one does not.
- **The isolation root is removed when the run ends**, whether the tests passed or failed. A run interrupted by a signal leaks its root; the code records that as a shortcut and no scenario covers it.
- **No production change.** The catalog cache path stays as it is. Unifying its two derivations belongs to the seam card, because nothing this card requires breaks without it (`owner-rulings.md` §2; Michael's ruling 2).
- **The `verification` spec drops the prefix.** Requirement 3 is withdrawn and replaced by the bare-run measurement, and Requirement 1's scenario WHEN clause loses `PI_CODING_AGENT_DIR=<scratch directory>`.
- **A new `test-isolation` capability** owns the isolation, its removal and the guard.
- **Docs, in the pass after Michael approves the implementation:** `AGENTS.md`'s command table and trap, `CONTRIBUTING.md`'s setup paragraph, and `ARCHITECTURE.md` §8 stop telling contributors to set the variable.

Deliberately not in this change: removing `_setAuthPathForTesting` and the other seams (its own card, `owner-rulings.md`); deleting the `.env` loader (its own card); `scripts/`, which talk to a live server on purpose; Node's permission model, which nobody has run the suite under (Chidi F14); the temporary directories `test/catalog.test.ts` never removes (Michael, trap f); and the catalog cache path (Michael's ruling 2).

## Capabilities

### New Capabilities

- `test-isolation`: what every run of the suite isolates itself from, when the isolation root goes away, and the guard that fails a run when the isolation escapes.

### Modified Capabilities

- `verification`: Requirement 3 is withdrawn and replaced, because its premise and its only scenario are what this change makes false. Requirement 1's scenario WHEN clause loses the prefix.

## Impact

- `vitest.config.ts`, a global setup module and a setup file, per the mechanism `council.md` settles.
- `openspec/specs/verification/spec.md` through this change's delta. `AGENTS.md`, `CONTRIBUTING.md` and `ARCHITECTURE.md` §8 in the docs pass.
- No production file changes: the card's production diff is zero.
- No dependency, API or package change.

## Open Questions

None. The council settled the mechanism, the guard, the `.env` route, the cache path and signal cleanup; `council.md` holds those answers and Michael's rulings.
