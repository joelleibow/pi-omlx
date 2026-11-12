# Council — matt, pass 1

Run `4f000da8-5a5f-46c9-b7b4-db6fb6735e18`.

## Recommendation

Use four steps, in this order, each with a red proof. (1) STRUCTURE: move the fixtures. Point `auth-storage.test.ts:16`, `index.test.ts:46` and `catalog.test.ts:233,311,467,515` at `inject("isolationRoot")`. Drop the per-test `rmSync` (nothing breaks without it, because mkdtemp names are unique and teardown removes the root), and delete the imports this leaves unused rather than suppressing them (verification Req 2). This goes first so that the cache step's per-test `dir` is already inside the root. (2) STRUCTURE: remove the credential seam. Red proof, a mirror of trap (b): at HEAD, deleting the `PI_CODING_AGENT_DIR` line in `storeUnderAgentDir` stays green because the seam masks it. After the removal, the same deletion must turn the auth tests red. Record that. (3) STRUCTURE: take the export off `EXTENSION_SINGLETON_KEY` and delete the hooks at `index.test.ts:48,54`. Red proof is Michael's measured mutation of `index.ts:131`: 37/37 green while the hooks are in place, 30/37 red once they are gone. (4) BEHAVIOUR: per-call cache path. Write tests first: (a) set B after import (A is `<root>/agent`, per trap (e), with no `vi.resetModules`), write, then assert `existsSync` under B and absence under `<root>/agent`; (b) put a decoy under `<root>/agent`, leave B empty, and assert the read returns nothing. Both should be red at HEAD. Then add one named `catalogCachePath()` that the read and the write both use (one home), add `mkdirSync(dirname(file))` and the `dirname` import, and in the same step change `cacheFixturePath` to `join(dir,"cache","omlx-models.json")`, delete its comment at `:250-254` and delete its `mkdirSync` workaround. That edit is the fixture following the fact (trap c), not an edited expectation. Michael called this step 'structure-only', but the new test goes red→green, so the design should label it a behaviour step under two hats. The mechanism stays as he ruled.

Spec deltas. Keep `catalog-discovery` as drafted; tests 4a and 4b cover its two scenarios. In `test-isolation`: (i) reword the fixture scenario to 'every temporary path a fixture names', because `:515` names a file, not a directory. Its proof is a search showing that `tmpdir()` and `mkdtemp` appear only in `global-setup.ts`. The worker guard never checks fixture paths, so the design must name this `shortcut: enforced by review search only, add to guard if a fixture escapes again`. (ii) Cut 'AND no path outside that agent directory supplies it'. No test asserts it, and step 2's red proof is what shows it. (iii) The 'second load after session_shutdown' scenario describes extension behaviour proven by the mutation in step 3. It can stay, but the design must cite that mutation as its test.

Draft corrections. 'The suite proves the load guard through the production path' overstates it. The suite proves that `session_shutdown` clears the key, not that a second load returns early; Michael's own follow-up says so. The list of stale items should also name the comment at `auth-storage.test.ts:32-35`, the seam imports at `index.test.ts:19-20`, and the `cacheFixturePath` `mkdirSync` workaround.

## Evidence

- Removing the seam and the hooks is green with no other change; the mutation of `index.ts:131` is masked by the hooks and caught without them (michael-orientation.md trap (a), (b))
- Five cache tests break until `cacheFixturePath` follows the per-call path; after that the suite is 121/121 green (michael-orientation.md trap (c))
- The A→B existsSync test is red with the import-time constant and green per-call; the swallowed catch hid a missing import (michael-orientation.md trap (d))
- A is fixed at `<root>/agent` because `worker-setup` imports catalog.ts first (research-chidi.md §4 exp 1; michael-orientation.md trap (e))
- `readStoredCredential` and `getAgentDir` resolve per call with no cache (research-chidi.md §1, §2)
- The worker guard checks only the agent dir, homedir and the overlay, not fixture dirs (research-eleanor.md 'Isolation already provided')
- `catalog.test.ts` fixtures are never removed, and `:515` names a file path (research-eleanor.md 'Temporary directories and cleanup')

## Assumptions

- [unverified] Step 2's red proof (deleting the env line is green at HEAD and red after removal) behaves as described
- [unverified] Read test 4b is red at HEAD because the read uses the captured CACHE_FILE
- [verified] Dropping the per-test rmSync breaks nothing, given unique mkdtemp names and root teardown
- [verified] No other test writes `<root>/agent/auth.json`, so the /login test stays credential-free
- [unverified] The fixture move is green on its own before the seam removal

## Risks

- If the design labels step 4 structure-only, the gate sees a red→green test inside a structure step and flags a two-hats breach.
- If the fixture scenario is left untested, a later test that adds `mkdtempSync(join(tmpdir(),…))` passes the guard and leaks outside the root.
- If the cache step lands before `index.test.ts:46` moves, `cacheFixturePath` writes under a tmpdir outside the root.
- A factory that throws before `pi.on("session_shutdown")` leaves the key set, and later tests return early. Michael accepted this risk.

## Confidence

medium: The cache and singleton steps rest on Michael's measurements; the credential red step and the read-side red are unmeasured.

## Challenge claims

- Michael's 'structure-only' label for the per-call cache step conflicts with its red→green test; it is a behaviour step.
- The proposal's 'suite proves the load guard' overstates it: only the session_shutdown clear is proven.
- No test or guard enforces the 'fixtures under root' requirement as drafted; it needs a named review-search shortcut.

## Owner decisions



## What would change my mind

- A measurement showing step 2's env-line deletion stays green after the seam removal would mean the auth tests do not prove agent-dir resolution, and a direct test would be needed.
- Evidence that the worker guard or teardown already checks fixture paths would remove the need for the shortcut.
- Evidence that the living spec for extension load/shutdown is not test-isolation would move scenario (iii).
