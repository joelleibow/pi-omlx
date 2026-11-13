# council-matt — pass 1

- Advisor: `council-matt`
- Run: `c6b7e86b-d72c-4d95-bd8a-5e8c2e0ae51d`
- Pass: 1

## Confidence

Level: `medium`. Reason: "The reader evidence is measured, but the overlay derivation, the shutdown test and the spec text were not read by me."

## Recommendation

**1. The four open points.**

- **`savedAt`**: delete it along with `lastRefreshAt`. It is written but never read (Michael §3(d): `catalog.ts:577,605`). The fixtures that set it (`test/index.test.ts:237,252`, `test/catalog.test.ts:645`) are updated to match.
- **Applied-event comparison**: drop it, so the event fires whenever a settings entry matches. Shrinking it to six fields would hand-copy the list of fields the overlay writes into a second place, which breaks "one home for each fact": a field added later and missed in the copy would silently stop the event. The shrunk comparison would also be an untested branch. The pinned test (`catalog.test.ts:473-514`) stays green whether or not the comparison exists (Michael §3(b)), so no test would notice if it were deleted. If the council picks shrink anyway, it needs a new test where an unchanged entry emits nothing.
- **`catalog_local_model_settings_missing`**: delete it, together with both `qwen3.6-8b-documenter` literals, including the `documenter` key in the `catalog_status_loaded` payload. Do not replace it with a generic "missing" event, which would be new mechanism.
- **Stream timeout chain**: delete all of it. All seven test calls pass `undefined` (`stream.test.ts:195…351`). The timeout behaviour and `resolveFirstDeltaTimeoutMs` stay.

**2. Proof.**

- **Pure deletions** have no red-before-green step. Each one is proved three ways, and the design should say so:
  - a whole-tree search over src, test, scripts and index.ts with zero hits, recorded in the task (Joel §1);
  - `tsc` failing on any typed reader once the field leaves `OmlxModel`;
  - every assertion on a surviving field left byte-identical and green.
- **Assertions on deleted fields** are deleted with the field. The fixture in `provider.test.ts:91-111` narrows to `archContextWindow`, `reasoningParser` and `thinkingDefault`. That is a fixture following a deleted fact, not an edited expectation, and the narrowed fixture still fails if `toProviderModel` spreads.
- **The singleton guard is a behaviour change**, so it needs a real red-before-green: a test that loads the extension twice with no shutdown, red at HEAD and green after. The existing test that drives `session_shutdown` and loads again changes its expectation, and the design must name that as the behaviour change.
- **Deleting the bypass test** (`stream.test.ts:184-208`) rests on Chidi's measurement (Q1), not on any test.
- **`/model` parity** is Joel's to observe. He dumps `toProviderConfig(...).models` against his live server and real overlay at `0411d6a` **before step 1**, then again at the end, and runs `diff`. The dump is a one-off run that is not committed.

**3. Order.** The suite stays green after every step. Steps 1–6 are structure only:

- step 0: Joel's baseline dump;
- step 1: move `smoke-model-selection` to `scripts/`;
- step 2: the stale test import/comment;
- step 3: delete `readLastCatalogCache`;
- step 4: the unread state fields and `registerModels`' fifth parameter;
- step 5: the timeout chain;
- step 6: the bypass branch, its test and the comment rewrite.

Steps 7–8 change only debug-trace and cache-file output:

- step 7: the debug events and the comparison;
- step 8: the metadata fields, `settingsSummary`, `summarizeModelSettingsEntry`, `compactObject` and `savedAt`. Step 7 must come first because the comparison reads these fields.

Step 9 is the behaviour change: write the failing load-twice test, then delete the guard. Step 10 is Joel's parity diff.

**4. The draft.**

- **`test-isolation`**: use MODIFIED on the existing requirement, not REMOVED plus ADDED under a new name. The rename changes nothing anyone can observe. "The extension SHALL keep no process-wide load state" claims more than any test proves and puts a product fact in the test-isolation capability. Keep only the load-twice scenario.
- **`package-identity`**: modifying it is justified, because a living spec would otherwise name an artifact that no longer exists. A MODIFIED block must reproduce the living text minus that one noun; I did not check that it does.
- **Field list**: the proposal's "budget and thinking metadata" is vague. The design must list every field once: `description`, `modelAlias`, `taskBudgetTokens`, `maxToolResultTokens`, `thinkingBudgetTokens`, `thinkingBudgetEnabled`, `preserveThinking`, `chatTemplateKwargs`, `forcedCtKwargs`, `isDefault`, `isPinned`, `trustRemoteCode`, `ttlSeconds`, `indexCacheFreq`, `activeProfileName`, `settingsSummary`, `savedAt`.
- **Stream comment**: the `shortcut:` belongs there. Suggested text: `shortcut: relies on pi 1.5.2 per-provider streamSimple dispatch (peer range is "*"), re-check on any pi upgrade`.

**5. Also decide.** Before step 8, the design must confirm that the overlay works out `thinkingDefault` only from the local entry's own `chat_template_kwargs`, and never from a `chatTemplateKwargs` merged with the server's (`catalog.ts:498-512`).

## Challenge Claims

- Shrinking the comparison keeps a hand-copied six-field list that no test would miss if deleted; dropping it is smaller and keeps one home for the field list.
- The test-isolation rename changes nothing anyone can observe, and its 'no process-wide load state' clause claims more than any test proves.
- Deleting the guard is a behaviour change and needs a failing load-twice test first; the other deletions are proved by a recorded grep, tsc and byte-identical surviving assertions.

## Change My Mind

- If an existing test asserts that the applied event is not emitted on an unchanged entry, shrinking keeps proven behaviour and I would accept it.
- If OpenSpec cannot MODIFY a requirement's scenarios without renaming it, REMOVED plus ADDED stands.
- If the overlay does merge server kwargs, step 8 needs a parity test with that fixture before the field goes.

## Evidence

- **Claim:** Every reader of each field and event, which the deletions depend on. **Sources:** michael-orientation.md §2, §3(b)-(g); research-eleanor.md §(1),(2),(4).
- **Claim:** The applied event is pinned by a test that passes whether or not the comparison exists. **Sources:** michael-orientation.md §3(b): 'the pinned test stays green either way'.
- **Claim:** No route sends a non-omlx model into the wrapper on pi 1.5.2, but the peer range is '*' and the bundled build was not grepped. **Sources:** research-chidi.md Q1, residual caveats.
- **Claim:** A second install runs the factory twice and the last one loaded wins; the guard makes the first one win. **Sources:** research-chidi.md Q2 S1/S2; owner-rulings.md 2026-11-12 guard ruling.
- **Claim:** pi only sees the 8-key object that toProviderModel builds. **Sources:** research-chidi.md Q3; michael-orientation.md §3(e),(k).

## Assumptions

- **unverified:** No existing test asserts that the applied event is NOT emitted for an unchanged entry.
- **unverified:** The overlay works out thinkingDefault only from the local entry, so deleting chatTemplateKwargs leaves it unchanged.
- **unverified:** An existing index test drives session_shutdown and then reloads, so its expectation changes with the guard deletion.
- **unverified:** The package-identity MODIFIED text equals the living requirement minus the singleton-key noun.
- **unverified:** Moving the late import in test/index.test.ts:99-101 has no module-initialisation effect (Eleanor flags this).
- **verified:** tsc excess-property checks catch every typed reader of a deleted OmlxModel field.

## Risks

- A user on a pi version older than 1.5.2 that dispatches by api id would have another provider's openai-completions model run through the omlx wrapper once the bypass is gone, and get omlx thinking controls and timeouts applied to it.
- If the overlay merges the server's chatTemplateKwargs, a model whose server status says enable_thinking=true and whose local entry sets other kwargs could change its thinkingDefault, so /model would show a different thinking flag.
- If Joel's baseline dump is not taken at 0411d6a before step 1, the parity diff has nothing trustworthy to compare against.

## Owner Decisions

None blocking. Pinning the pi peer range away from '*' is a possible later change, not this card; I would leave it to the shortcut comment.
