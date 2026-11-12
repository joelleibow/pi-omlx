# Council — matt, pass 1

Run `9c607069-9148-478a-bf69-82c6a6ad59ec`.

## Recommendation

1. Isolation goes in `globalSetup` (Q1). Once per run it creates a root with `mkdtemp(tmpdir(), ISOLATION_PREFIX)`. It always sets `PI_CODING_AGENT_DIR=<root>/agent` and `HOME=<root>/home`, even over a value the caller supplied. It deletes the extension's other caller-supplied keys (`OMLX_MODEL_SETTINGS_PATH`, `OMLX_API_KEY`, `OMLX_BASE_URL`, `PI_OMLX_DEBUG`), which live in one named list. Its teardown removes the root. `globalSetup` beats `test.env` because it is the only route where `homedir()` is right in every pool (Chidi F3, F12). Its teardown runs when tests pass or fail (F9a). It keeps the root's create and remove in one place, where `test.env` splits them between the config and a teardown (F9d). The env reaching workers is not in vitest's docs, so the guard checks it on every run.
2. Assign `OMLX_MODEL_SETTINGS_PATH`? No (Q10). `HOME` covers the overlay. Assigning it too would stop the `homedir()` default path from being exercised, and nothing would break without it. Deleting the caller's value is enough.
3. `.env` (Q6). Do not try to beat it key by key. Mocking `loadDotenvFromExtensionDir` in a `setupFiles` entry (mock only, no production code) would stop the file being read at all. Assigning values instead would not work: the merge fills keys that are empty as well as unset (`src/dotenv.ts:32`), so deleting a key does not stop `.env` refilling it. If the setup-file mock does not apply to test files, fall back to giving every key a value (needs Chidi).
4. The guard (Q7). Write it as a pure function `escapedPaths(root, resolved)` that compares with `path.relative`, not a prefix check. Unit-test it at these edges: the root itself, a sibling such as `/tmp/rootX`, a relative path and an empty string. The `setupFiles` entry calls it in the worker with pi's `getAgentDir()`, `os.homedir()` and the overlay path production resolves. It throws and names the path. It must run in the worker, because a check in `globalSetup` reads a main-process stand-in, not what the tests resolve. A throw fails that file's collection and makes the exit non-zero (F13), which is enough. Prove it catches a mistake by deleting the `HOME` assignment once and seeing the named failure.
5. The per-call `CACHE_FILE` (Q8). Leave it out of this card. Once the variable is set run-wide before import, the cache write lands under the root anyway, so no scenario here fails without the change. No production scenario changes `PI_CODING_AGENT_DIR` while the extension is loaded, so for this card the change is test-motivated structure. It belongs on the seam card, as a separate structure-only step (two hats).
6. Spec edits:
- Drop "A bare run writes nothing into the operator's overlay". Nothing ever writes `.omlx`, so it stays green with the isolation deleted.
- Replace "A pool that leaves homedir at the operator's home". Under `globalSetup` no such pool exists (F12), so the scenario cannot be produced. Use "`homedir()` resolves outside the root, so the run fails naming it".
- Change the `.env` scenario to a key the isolation does not otherwise handle (`OMLX_BASE_URL`), so it fails unless the whole read is stopped. Add one scenario: a caller-exported `OMLX_MODEL_SETTINGS_PATH` pointing at a poisoned overlay still gives exit 0.
- The removal scenario needs something a check can observe (Q4): no directory starting with `ISOLATION_PREFIX` is left in `tmpdir()`.
- Test-isolation scenario 1 overlaps verification's "populated directory" scenario. Keep that fact in verification only.
7. Leave out Node's permission model (Q2): nothing breaks without it, and nobody has run the suite under it (F14). Leave out signal cleanup (Q5): every run makes a fresh root, so a leftover only wastes tmp space. Record `shortcut: root leaks on SIGINT/SIGTERM/SIGKILL, add process.once('exit') if the leftovers matter`. The catalog `mkdtemp` leak (Q9) is a later change.

## Evidence

- globalSetup assigning process.env reaches every worker before import, in every pool, and gives the right homedir(); test.env does not fix homedir under threads (research-chidi.md F3, F8, F12)
- Teardown runs after failing runs and not on signals (research-chidi.md F9a, F9b)
- A bare run writes $HOME/.pi/agent/cache today (research-eleanor.md bare-run measurement; michael-orientation.md trap b)
- The .env merge fills keys that are unset or empty (michael-orientation.md trap d, src/dotenv.ts:32)
- No production code that exists only for tests (owner-rulings.md §2)

## Assumptions

- [verified] The vitest pool is forks and nothing in the config sets one
- [unverified] A vi.mock in a setupFiles entry applies to the modules a test file imports
- [unverified] The four OMLX/PI keys plus HOME and PI_CODING_AGENT_DIR are the extension's whole environment surface
- [unverified] The overlay-path resolver in production is exported, so the guard can call it
- [unverified] Moving HOME harms none of the tools the suite runs (the vitest token lands under the root)

## Risks

- If the guard checks with startsWith, a path at /tmp/pi-omlx-isoX passes as inside a root /tmp/pi-omlx-iso and an escape goes unnoticed.
- If the mock does not apply, index.test.ts:46 (which has no withEnv) sees OMLX_BASE_URL from .env and talks to the operator's server.
- An operator who exports OMLX_MODEL_SETTINGS_PATH reaches the suite unless the setup deletes it, and HOME alone does not catch this.

## Confidence

medium: The mechanism is backed by source and Chidi's experiments. Whether the mock applies from a setup file, and whether the key list is the whole surface, are unchecked.

## Challenge claims

1. The per-call CACHE_FILE is required by this card: no scenario here fails without it once the variable is set run-wide before import.
2. The pool-homedir guard scenario is provable: under globalSetup there is no pool that produces it (F12).
3. The overlay no-write scenario proves something: nothing writes .omlx, so it stays green with the isolation deleted.

## Owner decisions

None

## What would change my mind

- Chidi shows that vi.mock in a setupFiles entry does not reach test-file imports. I would then give every key a value and keep the .env scenario on a key that has no value.
- A production scenario that changes PI_CODING_AGENT_DIR after load. The per-call cache path would then belong in this card.
- Eleanor finds env keys beyond the six named. The list would grow, but the mechanism would not change.
