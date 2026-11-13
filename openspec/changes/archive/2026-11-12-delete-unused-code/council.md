# Council Synthesis

One pass ran. Neil's report is `council-neil-pass1.md` (run `d358f552-9a8d-4cc6-9a12-a251359c8c38`); Matt's is `council-matt-pass1.md` (run `c6b7e86b-d72c-4d95-bd8a-5e8c2e0ae51d`). Michael ruled on every dispute the pass left open; those rulings are his and are recorded below as his.

## Question and Scope

Should this change delete the unused catalog metadata, debug code, dead branches and unused pieces, and where does each deletion stop? The council read `proposal.md`, `specs/test-isolation` and `specs/package-identity`, `research-chidi.md`, `research-eleanor.md` and `michael-orientation.md`.

The boundaries were Joel's, not the council's to move. Each piece goes only after a whole-tree grep shows no other reader; `npm run check` stays green; `/model` shows the same models with the same limits and thinking flags; the restructure he plans to lead is out of scope (owner-rulings §1). Michael's §2 fence held throughout: `src/config.ts`, `src/auth-storage.ts`, `src/oauth-login.ts`, the catalog cache path and its per-call derivation, `resolveLocalModelSettingsPath`, the `OMLX_MODEL_SETTINGS_PATH` default parameter, and every field with a production reader stay untouched.

The council was not asked about the singleton guard. Joel ruled it, its key and the `session_shutdown` clear deleted (owner-rulings §3), and the only open question was how the suite proves the behaviour that replaces the skip.

## Perspectives & Trade-offs

Both advisors agreed on most of the card, and each agreement was over evidence the other shared:

- `savedAt` is the same written-never-read class as `state.lastRefreshAt` and goes with it, with no cache migration, because `readCatalogCacheFile` checks only `Array.isArray(data.models)`.
- `catalog_local_model_settings_missing` and both `qwen3.6-8b-documenter` literals go, with no generic replacement event. A replacement is new mechanism on a deletion card.
- The whole `onStreamTimeout` chain goes, including the seven trailing `undefined` arguments in `test/stream.test.ts`, and `resolveFirstDeltaTimeoutMs()` stays.
- Pure deletions are proved by a recorded whole-tree search, `tsc` failing on any typed reader, and surviving assertions left byte-identical. Only the guard deletion earns a red-before-green test.
- `/model` parity is Joel's observation, taken as a `toProviderConfig(...).models` dump before and after, with nothing committed.
- The `provider.test.ts` fixture narrows to the surviving OMLX-only fields because it follows a deleted fact, and it still fails if `toProviderModel` spreads.

They split on three things:

- **The applied event's change comparison.** Neil would shrink the comparison to the six surviving overlay-mutable fields, on the ground that dropping it makes an overlay entry holding only keys the overlay no longer reads emit a false `applied` event on every poll. Matt would drop the comparison, on the ground that a hand-copied six-field list is a second home for the overlay's field set, and that the pinned test stays green whether the comparison exists or not, so nothing would miss it.
- **The `test-isolation` delta.** Both wanted MODIFIED under the existing heading. Matt also wanted the new `SHALL keep no process-wide load state` sentence dropped: it claims more than any test proves, and it puts a product fact in a test capability. Neil wanted the dual-load registration to land in `provider-access` instead.
- **The stream comment.** The proposal rewrote only the comment above the branch. Neil pointed out that `src/stream.ts:10-23` rests on the same stale shared-api-id premise and would stay false.

Two of their assumptions did real work and turned out to matter: whether any test asserts the applied event is *not* emitted, and whether an existing test's expectation changes when the guard goes. Matt marked both unverified; Michael measured both.

## Synthesis & Recommendation

Delete exactly the pieces the proposal names, prove each one by the method the advisors agreed on, and settle the three open mechanisms this way:

- The applied event keeps one whole-object comparison, `JSON.stringify(next) !== JSON.stringify(model)`, with `entrySummary` removed from the payload, and one new test proves that an overlay entry carrying only keys the overlay no longer reads emits no `applied` event.
- The `test-isolation` requirement keeps its heading, its text and its scenarios, and gains one: a load twice with no shutdown first. No new requirement and no new SHALL sentence. The tooling refuses to drop a living scenario from a MODIFIED block, so the substitution ruling 9 asks for arrives as an addition; the note under ruling 9 records that.
- Both stream comments change: the branch's comment goes with the branch, and the header comment is rewritten to the per-provider fact with a `shortcut:` naming pi 1.5.2.

The shape of the change therefore stays what the proposal proposed: deletions, with one comparison replaced and one test added, and no new mechanism beyond the test that makes the comparison killable.

## Accepted & Rejected Feedback

Adopted:

- Both advisors on `savedAt`, the missing event, the timeout chain, the proof method and the `/model` parity arrangement (rulings 1, 3, 4, 12, 13).
- Neil on the stream comments, including the `shortcut:` on the header (ruling 5).
- Neil on dropping the whole second sentence of the `package-identity` requirement rather than one noun (ruling 10).
- Neil and Matt on MODIFIED for `test-isolation`, and Matt on dropping the new SHALL sentence (ruling 9).
- Neil on `npm pack --dry-run` as the proof for the `smoke-model-selection` move (ruling 12).
- Matt on the baseline dump being taken before the first code commit (ruling 13).
- Matt on one deletion per task for the task list (ruling 14).

Set aside:

- Neil's shrink to six fields. It creates the second home Matt named, and the new non-emission test gives the one-line comparison the proof the small list would have needed anyway (ruling 2).
- Matt's drop-the-comparison. The event is named `applied`, and `CONTRIBUTING.md` describes it that way; emitting on any matched entry would change what it means (ruling 2).
- Matt's claim that an existing `session_shutdown` test changes its expectation. No test drives a reload: 38 `driveExtension` call sites shut down in `finally`, and the next test loads again, which keeps passing without the guard (ruling 8).
- Neil's placement of the dual-load requirement in `provider-access`. No requirement is added; the product decision lives in owner-rulings §3 and the proposal's BREAKING bullet, and the scenario is the test-side proof this capability already carries (ruling 9).
- Matt's suggestion to pin the peer range. Michael ruled it a packaging change for a later card, decided by owner-rulings §1's scope (ruling 6).
- Neil's fallback of keeping the late import where it stands if it were order-dependent. ESM hoists static imports, so the placement never had a runtime effect, and Michael measured that (ruling 11).
- Matt's merged-kwargs parity test. No merge exists: both parsers read the raw entry, and the `chatTemplateKwargs` field is write-only, so the source settles it (ruling 7).
- The framing both advisors shared, that the comparison had to be shrunk or dropped. Michael ruled a third answer (ruling 2).

## Michael's Rulings

**1. `savedAt` — settled.** It goes with `lastRefreshAt` as the same written-never-read class. The fixtures at `test/index.test.ts:237,252` and `test/catalog.test.ts:645` drop the key, and there is no cache version, migration or stripping. Decided by owner-rulings §1, Michael's §3(d) and the deletion test. His evidence: `rg savedAt` finds only the writer at `catalog.ts:605`, the type at `:577` and three fixtures, and `readCatalogCacheFile` checks only `Array.isArray(data.models)`. The design must list it, because the proposal omitted it.

**2. The applied event's comparison — settled, neither advisor's answer.** Keep one whole-object comparison, `JSON.stringify(next) !== JSON.stringify(model)`, with `entrySummary` out of the payload, and add one test: a model whose overlay entry carries only keys the overlay no longer reads emits no `applied` event. Decided by the evidence, since both variants are indistinguishable to the suite; by one-fact-one-place, which rules out the copied list; and by the event's documented meaning, which rules out unconditional emission. His evidence: in the scratch copy at HEAD, replacing the 24-line comparison with the one line left tsc clean and 123/123 green, and deleting the comparison entirely also left 123/123 green; `rg applied test/catalog.test.ts` finds only the kind-sequence assertion at `:509-513`, so no test asserts non-emission. He ran the replacement, not the test. It also removes the ordering dependency between the event task and the field task.

**3. `catalog_local_model_settings_missing`, both `qwen3.6-8b-documenter` literals and the `documenter` payload key — settled.** All three go, and no generic `missing` event replaces them. Decided by owner-rulings §1 and Michael §3(b). His evidence: `rg 'qwen3.6-8b-documenter|catalog_local_model_settings_missing'` outside `src/catalog.ts` returns zero hits in `index.ts`, `test` and `scripts`; `test/catalog.test.ts:473-514` asserts the event kinds only, never the `documenter` key or `entrySummary`.

**4. The stream timeout chain — settled.** The whole chain goes, the seven test calls drop one argument, and `resolveFirstDeltaTimeoutMs()` with the first-delta timeout stays. Decided by owner-rulings §1 and Michael §3(f)'s fix-the-class. His evidence: `rg onStreamTimeout|StreamTimeoutEvent|onTimeout` outside `src/stream.ts` finds only `src/provider.ts:9,25,41`; `index.ts:220` passes `undefined`; every one of the seven calls in `test/stream.test.ts` passes `undefined`.

**5. The stream comments — settled for Neil.** `:190-195` is deleted with the branch. `:10-23` is rewritten: the direct `openAICompletionsApi().streamSimple` call stays, the recursion paragraph becomes the per-provider fact with a `shortcut` naming pi 1.5.2, `model-runtime.js` and `provider-composer.js` and the `"*"` peer range. The jiti subpath note at `:20-23` is about module resolution, not dispatch, and stays unless Chidi shows it false. Decided by pi 1.5.2's source. His evidence: `pi-ai/dist/compat.js:186-196` resolves through the pi-ai api registry, and pi-omlx never calls `registerApiProvider`, so the wrapper sits only inside the composed `omlx` provider and a compat call cannot recurse into it on 1.5.2.

**6. The pass-through branch and the `"*"` peer range — settled.** The branch goes, the shortcut names the dependency, and the peer range is not this card's. The bundle question is closed: the shipped bundle carries the same dispatch. Decided by owner-rulings §1's scope and by measurement. His evidence: `package.json` `bin` is `dist/bundle/cli.js`, and `rg 'model.api===extension.api' dist/bundle/` hits `chunks/chunk-MMDXLZVS.js`, the same guard as `dist/core/provider-composer.js:378`.

**7. `chatTemplateKwargs` and the local `thinkingDefault` derivation — settled by source.** Both parsers keep their `enable_thinking` reads; only the `chatTemplateKwargs` writes go. No merged-fixture parity test is needed because no merge exists. Decided by source at HEAD and Michael §2. His evidence: `catalog.ts:124-134` reads `asRecord(entry.chat_template_kwargs)` from the server entry, `catalog.ts:440-456` reads it from the local entry, and neither reads `model.chatTemplateKwargs`, so the field is write-only.

**8. Proof for the guard deletion — settled.** The load-twice test is written first, red at HEAD because the second call returns early, green after the guard, key and shutdown clear go. Matt's claim that an existing test's expectation changes is false. Decided by owner-rulings §3 and Joel's principle that a test proves the behaviour it names. His evidence: `rg '^test\(' test/index.test.ts | rg -i 'again|second|twice|reload'` finds no dedicated reload test, all 38 `driveExtension` call sites shut down in `finally`, and `index.ts:52-53` returns early on a second call with nothing exercising it.

**9. The `test-isolation` delta — settled.** MODIFIED under the existing heading `Fixtures Reach Pi's State Through The Agent Directory And Stay Under The Root`. The requirement text is unchanged, the second-load-after-`session_shutdown` scenario is replaced by the load-twice-without-shutdown scenario, and no SHALL sentence and no `provider-access` requirement are added. The product decision lives in owner-rulings §3 and the proposal; the scenario is its test-side proof. Decided by the convention this repository's archive uses, by Joel's rule that a spec states what a test proves, and by one-fact-one-place. His evidence: the archived `isolate-the-suite` change uses MODIFIED with its heading unchanged and the text reproduced, and the living requirement text matches the draft minus the new sentence.

Note (Bambadjan, writing the delta): the tooling refuses half of that ruling. `openspec validate --strict` rejects a MODIFIED block that omits a scenario the living spec still has, and it also rejects a requirement present in both ADDED and REMOVED, so the same heading cannot carry a replaced scenario either. The options left were a new heading, which this ruling rejects, or keeping the shutdown scenario. The delta keeps it word for word and adds the load-twice scenario beside it. Heading, unchanged requirement text and the absent SHALL sentence are as ruled; the replacement is expressed as an addition, and Michael's evidence that the kept scenario still passes is what makes that safe.

**10. The `package-identity` delta — settled for Neil.** MODIFIED, dropping the whole second sentence. It is an enumeration, not a requirement; two of its nouns no longer exist after this change; the scenarios carry the check. Decided by fix-the-class. His evidence: `rg pickerDebug` outside `openspec/` returns zero hits at HEAD, and the draft text equals the living text apart from the removed clause.

**11. The late import and stale comment — settled.** Move the import into the import block and delete the comment. ESM hoists static imports, so the placement never had a runtime effect, and the comment's spec-line citations no longer exist. The proposal omits this card item and the design must carry it. His evidence: `rg ':72|:76' openspec/specs` returns nothing; in the scratch copy, moving `DEFAULT_OMLX_BASE_URL` into the block passed Biome's organizer and `test/index.test.ts` 37/37.

**12. How pure deletions are proved — settled, with one addition.** A recorded whole-tree search with zero hits, `tsc` failing on any typed reader, and surviving assertions byte-identical; no synthetic symbol-absence tests; `npm pack --dry-run` for the move. The addition is that `tsc` does not flag unused interface members, so the `OmlxModelsStatusResponse` fields go with their `OmlxModel` fields and the grep is their proof. Decided by owner-rulings §1's acceptance sentence and Michael §3(c). His evidence: `npm pack --dry-run` at HEAD lists `src/smoke-model-selection.ts`; `tsconfig.json` and Biome both cover `scripts/`; neither tool reports an unused interface property.

**13. `/model` parity — settled.** It is Joel's task and is marked his at PL7. The baseline is taken before the first code commit of this change, at any commit whose non-`openspec/` tree equals `0411d6a`, which includes the current HEAD `6b9a861`; the dump is a one-off and is not committed, and no snapshot fixture is added. Decided by owner-rulings §1's acceptance sentence. His evidence: `git diff --stat 0411d6a HEAD -- . ':!openspec'` is empty, and `toProviderModel` builds exactly eight keys.

**14. Step order — settled for Matt's granularity.** One deletion per task, because PL7 holds each task to one behaviour. Order is free except four constraints: the move and the test-import fix come first as pure structure; the comparison and `entrySummary` removal come before or with `settingsSummary`, `summarizeModelSettingsEntry` and `compactObject`, because the payload calls the function; the guard's red-green test is the last code task; Joel's baseline dump comes before the first code commit and his diff after the last. The whole-object comparison removes the dependency between the event task and the field task. Decided by PL7 and by the code's own dependency. His evidence: `catalog.ts:466-468` has the payload calling `summarizeModelSettingsEntry`, and after the one line no event code refers to a deleted field.

## Owner Decisions Required

None. Every dispute the pass left open was settled by a decision in play or by a measurement, and the one question that is Joel's — whether a second copy of the extension in one process is skipped or runs — he ruled on 2026-11-12 and the conductor recorded in `owner-rulings.md` §3. Matt's peer-range question is not a decision for him now: Michael ruled it a packaging change for a later card, decided by owner-rulings §1's scope.
