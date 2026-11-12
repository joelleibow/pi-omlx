# Design

## Context

The change deletes code; it adds almost nothing. `proposal.md` says why and which pieces. This document says what each deletion touches, in what order, and what proves it.

What the tree holds at HEAD (Eleanor's map):

- `index.ts` is the factory. It registers the provider, reads and writes the catalog cache, polls on a timer, keeps a small `state`, wires the catalog's `onDebug` to `src/debug.ts`, holds the singleton guard, and applies the stored credential.
- `src/catalog.ts` parses the server's status document, applies the `~/.omlx/model_settings.json` overlay, derives the thinking default, emits the catalog debug events and reads and writes the cache file.
- `src/provider.ts` projects an `OmlxModel` into the object pi registers, carries the fourth `onStreamTimeout` parameter, and enforces the positive-limit rule.
- `src/stream.ts` wraps `openaiCompletionsApi().streamSimple` for the `omlx` provider, decides which models to pass through, and carries two comments about pi's dispatch.
- `src/smoke-model-selection.ts` is a live probe that only `scripts/smoke-live-omlx.ts` imports, and `package.json` ships all of `src`.
- `test/` drives the extension through a fake pi and reaches Pi's state through a per-test agent directory. `test/isolation/` holds the guard that keeps a run off the operator's machine.

What binds the design:

- **Joel.** Each listed piece goes after a whole-tree grep shows no other reader; `npm run check` stays green; `/model` shows the same models with the same limits and thinking flags; the restructure he plans is out of scope (owner-rulings §1). The guard, its key and the `session_shutdown` clear are deleted (owner-rulings §3). Tests never mutate operating functionality, and production code carries no export or branch that exists only for a test (carried rulings). Documentation never blocks a feature.
- **The living specs.** `provider-access`, `credential-resolution`, `diagnostics`, `catalog-discovery`, `test-isolation`, `verification`, `package-identity` and `environment-configuration` fence what stays, as Michael §1 reads them.
- **Michael's fence.** `src/config.ts`, `src/auth-storage.ts`, `src/oauth-login.ts`; the catalog cache path and its per-call derivation; `resolveLocalModelSettingsPath` and its `homedir()` default; the `OMLX_MODEL_SETTINGS_PATH` default parameter; every `OmlxModel` field with a production reader; the `thinkingDefault` derivation from the raw `enable_thinking` reads; the `onDebug` plumbing and `fetchAndRegister`'s adapter; `provider_registered` and its `source`; the poll interval and backoff; the `test/isolation/` lists; and no Markdown in the implementation diff other than `tasks.md` (Michael §2).
- **The council.** Every ruling in `council.md` is Michael's, and this design applies them rather than re-deciding them.

The baseline is Michael's measurement of the untouched tree at `0411d6a` in a scratch copy: `npm run check` green. His measurements of pi 1.5.2 (`model-runtime.js`, `provider-composer.js`, `compat.js`, the bundle) and Chidi's live run are the external facts this design relies on.

## Goals / Non-Goals

**Goals:**

- Delete the catalog metadata, debug items, dead branches and unused pieces the proposal names, leaving every field with a reader and every event with a trace.
- Prove each deletion by the method Michael ruled: a recorded whole-tree search with no hit, the compiler failing on any typed reader, and surviving assertions left byte-identical.
- Arrive red-first where behaviour changes, which is two places: the guard's deletion and the applied event's meaning once the metadata fields are gone.
- Keep the registration object identical, so `/model` parity is a measurement rather than a hope.
- Leave the repository's records true: the two delta specs, and the Markdown the docs pass owns.

**Non-Goals:**

- Pinning the pi peer range. Michael ruled it a packaging change for a later card (council.md #6).
- Any cache version, migration or key stripping (Michael §3(d); council.md #1).
- A generic replacement for `catalog_local_model_settings_missing`, or any other new event (council.md #3).
- A snapshot test for `/model` parity. It would be a second home for Joel's fixture and could not see his server (Michael §3(e)).
- Any edit to `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md` or other Markdown in the implementation diff. Those go to the docs pass (Michael §3(l)).
- The restructure Joel plans to lead (owner-rulings §1).

## Decisions

**1. The field set.** The design carries the list once; the parsers, the cache and the traces lose exactly these from `OmlxModel`: `description`, `modelAlias`, `taskBudgetTokens`, `maxToolResultTokens`, `thinkingBudgetTokens`, `thinkingBudgetEnabled`, `preserveThinking`, `chatTemplateKwargs`, `forcedCtKwargs`, `isDefault`, `isPinned`, `trustRemoteCode`, `ttlSeconds`, `indexCacheFreq`, `activeProfileName`, `settingsSummary`. The cache envelope also loses `savedAt`. What stays is the set with a production reader: `id`, `displayName`, `thinkingDefault`, `modelType`, `reasoningParser`, `contextWindow`, `maxTokens`, `archContextWindow` (Michael §2; Eleanor §2 measured each reader; council.md #1 for `savedAt`).

The deleted set has no production reader, and two of them cannot gain one: `isDefault` and `isPinned` would only ever choose a starting model, which `catalog-discovery` forbids (Michael §1). The alternative, keeping a field "for later", fails the deletion test: nothing reads it, and the card exists to remove that.

**2. Interface members follow their fields.** Deleting an `OmlxModel` field does not make the compiler flag the type the parser reads, because neither `tsc` nor Biome reports an unused interface property. The snake_case members of `OmlxModelsStatusResponse` that feed the deleted fields go in the same task, and the grep is their proof (council.md #12). The alternative, leaving them, leaves a type describing a document shape nothing consumes.

**3. `chatTemplateKwargs` is write-only.** Both parsers keep their `const chatTemplateKwargs = asRecord(entry.chat_template_kwargs)` and their `enable_thinking` read, which is what produces `thinkingDefault`; only the writes to the model field go. Neither derivation reads `model.chatTemplateKwargs`, so the field is write-only and no merged fixture needs a parity test (council.md #7). The alternative Neil raised, treating the field as an input, would have needed a merge that does not exist.

**4. The applied event keeps one whole-object comparison, and one new test.** The comparison becomes `JSON.stringify(next) !== JSON.stringify(model)`, and `entrySummary` leaves the payload. `summarizeModelSettingsEntry` has two callers: the `entrySummary` detail this step removes, and `next.settingsSummary = summarizeModelSettingsEntry(entry)` at `src/catalog.ts:563`. That helper and `compactObject` therefore stay until step 8, where they go with `settingsSummary` and that write; deleting them with the payload detail would not compile. One test is added: a model whose overlay entry carries only keys the overlay no longer reads emits no `catalog_local_model_settings_applied` event. It fires when something makes the overlay announce a change for an entry that changes nothing the extension reads, which is what an unconditional emit would do. This beats both advisors' answers. A hand-copied list of surviving fields is a second home for the overlay's field set, and a field added later and missed there would silently stop the event (Matt's point). Firing on any matched entry would make `applied` mean "considered", which is not what `CONTRIBUTING.md` says it means (Neil's point). It also removes the comparison's dependency on the field list, so the one line needs no edit when the fields go (council.md #2).

**5. The model-specific debug items go, and nothing replaces them.** `catalog_local_model_settings_missing`, both `qwen3.6-8b-documenter` literals and the `documenter` key of `catalog_status_loaded` are deleted. The alternative, a generic missing-entry event, is new mechanism on a deletion card, and nothing asserts the payload key today (council.md #3).

**6. The non-omlx branch goes, and both of its comments with it.** `isOmlx`, the branch, `stream_simple_bypassed`, the `PROVIDER_KEY` import, the test at `test/stream.test.ts:184-208` and the `NON_OMLX_MODEL` fixture at `test/stream.test.ts:120` that only that test reads are deleted, because no route on pi 1.5.2 sends a non-`omlx` model into the wrapper: pi resolves the provider by `model.provider` before any stream call, and the extension never registers into the shared api-id registry (Chidi Q1; Michael §3(h), council.md #6). The header comment `src/stream.ts:10-23` rests on the same stale premise, so its recursion paragraph is rewritten to the per-provider fact, with this line:

```
shortcut: relies on pi 1.5.2 dispatching streamSimple per provider (model-runtime.js
prepareRequest, provider-composer.js streamWith); peer range is "*", re-check on a pi upgrade
```

The direct `openAICompletionsApi().streamSimple` call stays: it reaches the concrete implementation without pi's dispatch and is cheaper (council.md #5). The jiti subpath note stays, because it is about module resolution, not dispatch. The alternative, keeping the branch for older pi versions, is what the `"*"` peer range would demand and what Michael ruled out of this card: the shortcut comment is the record, and the pin is a later packaging change (council.md #6).

**7. The timeout chain is fixed as a class.** `toProviderConfig`'s fourth parameter, `streamOmlxOpenAICompletions`'s `onTimeout`, `runAttempt`'s `onTimeout`, `OnStreamTimeout` and `StreamTimeoutEvent` all go, and every stream test call that passes `undefined` drops that argument. `resolveFirstDeltaTimeoutMs()` and the first-delta timeout stay, because production reads them. The alternative, deleting only the parameter, would leave the rest of the chain with no non-`undefined` caller (Michael §3(f), council.md #4).

**8. Unread state goes, the read field stays.** `state.modelSettingsPath` goes with `registerModels`' fifth parameter and its call-site pass, and `state.lastRefreshAt` goes with its writes. `state.lastError` stays, because something reads it (Michael §3(g)). The local `modelSettingsPath` argument that reaches the overlay fetch is a different binding and stays (Eleanor §4).

**9. The script moves to `scripts/`, and packaging proves it.** `src/smoke-model-selection.ts` becomes `scripts/smoke-model-selection.ts`, and `scripts/smoke-live-omlx.ts:6` imports it from there. `tsconfig.json` and Biome already cover `scripts/`, so the file stays under the check, and `package.json` `files` stops shipping a probe no package consumer can use. `npm pack --dry-run` is the proof (Michael §3(i), council.md #12).

**10. The late test import is hoisted and its comment deleted.** `test/index.test.ts:99-101`'s import moves into the import block and the comment goes. ESM hoists static imports, so the position never had a runtime effect, and the spec lines the comment cites do not exist (council.md #11). The alternative Neil allowed, keeping the placement if it were order-dependent, does not apply.

**11. The guard goes behind a red-first test.** A new test loads the extension twice in one process with no `session_shutdown` between the loads and asserts two registrations. It fires when a load registers nothing, which is the skip the guard used to perform. It is red at HEAD because the second call returns early, and green once three things are gone: the early-return guard, the `Symbol.for("pi-omlx/loaded")` key constant, and the `delete globalState[EXTENSION_SINGLETON_KEY]` line. The `session_shutdown` handler stays. `index.ts:128-131` sets `state.stopped = true` and then deletes the key, and the first line is what `catalog-discovery`'s requirement that a session's end stop the poll's own fallback relies on, so the handler keeps it. Joel's ruling is the "why" (owner-rulings §3); the test is the "how do we know" (council.md #8).

**12. Old caches stay readable, and nothing strips them.** `readCatalogCacheFile` checks only `Array.isArray(data.models)`, so a cache written before this change loads with its extra keys as untyped properties, and the only readers pick fields explicitly. The next successful fetch overwrites it. The alternatives, a cache version or a stripping pass, are mechanism nobody asked for and would need their own tests (Michael §3(d), council.md #1).

**13. How the tests change.** An assertion on a deleted field is deleted with the field. Every assertion on a surviving field stays byte-identical. `test/provider.test.ts`'s `OmlxModel` fixture narrows to the surviving OMLX-only fields, `archContextWindow`, `reasoningParser` and `thinkingDefault`, so it still proves `toProviderModel` does not spread its input; that is a fixture following a deleted fact, not an edited expectation. Cache fixtures drop `savedAt`. The stream tests that pass `undefined` drop that argument. The bypass test is deleted with the branch, because the behaviour it asserts cannot occur on the pinned pi. Two tests are added: the load-twice test and the non-emission test (Michael §3(c), council.md #8, #12).

**14. The proof method for a deletion.** A deletion has no synthetic symbol-absence test: a test named for a symbol that no longer exists proves nothing. Its proof is three things. The whole-tree search over `index.ts`, `src`, `test` and `scripts` comes back with no hit, recorded in the task. Where the deletion crosses a type boundary, deleting the declaration first makes the compiler name every remaining reader, and those sites are the work. And the suite stays green with the surviving assertions untouched (council.md #12). This gives an honest red hat to each structural deletion: the failing check is a hit in the search, or a compile error that names a reader still to fix.

**15. The delta specs.** `test-isolation` is MODIFIED under its existing heading: the requirement text and all of its scenarios stay, and the load-twice scenario is added beside the shutdown one. That last part deviates from the letter of council.md #9, which asked for a replacement; the validator refuses a MODIFIED block that omits a living scenario, and refuses a requirement present in both ADDED and REMOVED under the same heading, so the only way to drop the scenario is the new heading that ruling rejects. Michael's evidence that the kept scenario still passes is what makes keeping it safe (council.md #9's note). `package-identity` is MODIFIED with its second sentence gone, because that sentence enumerates artifacts the old-token grep covers and two of them no longer exist (council.md #10). It asks for no code: the grep it states is the check, and deleting the singleton key can only make it pass more easily. No other capability changes (proposal.md, `council.md`).

## Steps

Each step is one behaviour and ends with `npm run check` green, per Joel's two-hats rule: make the change easy, then make the easy change. Structure comes first, then output, then the one behaviour change, then Joel's measurement. A step's red hat is the search or the compile error that would have to be answered before the deletion can land; a pure deletion with no type boundary has no test of its own.

**Step 0 — Joel's baseline, before any code commit.** Dump `toProviderConfig(...).models` as JSON against his live server and his real `~/.omlx/model_settings.json`, from a commit whose non-`openspec/` tree equals `0411d6a` (the current HEAD `6b9a861` qualifies). The dump is a one-off and is not committed. Red: the dump is the reference the last step compares against, and without it there is nothing to compare to. Green: the file exists and is stored outside the repository (council.md #13). This step is Joel's.

**Step 1 — Move the smoke script.** `git mv src/smoke-model-selection.ts scripts/`, and change the import in `scripts/smoke-live-omlx.ts:6`. Red: `npm pack --dry-run` at HEAD lists `src/smoke-model-selection.ts` among shipped files; that is the state the step removes. Green: the same command lists the file under no shipped path, `tsc` and Biome still cover it, and the suite is green.

**Step 2 — Hoist the late test import.** Move the import at `test/index.test.ts:99-101` into the import block and delete the comment. Red: `rg ':72|:76' openspec/specs` returns nothing, so the comment's premise is already false. Green: `npm run check` green with Biome's organizer accepting the placement.

**Step 3 — Delete `readLastCatalogCache`.** Red: the whole-tree search for the symbol returns only its own definition. Green: the export is gone, the suite green, and `AGENTS.md:28` and `ARCHITECTURE.md` §9 are recorded for the docs pass.

**Step 4 — Delete the timeout chain.** Remove `StreamTimeoutEvent`, `OnStreamTimeout`, `streamOmlxOpenAICompletions`'s `onTimeout`, `runAttempt`'s `onTimeout` and `toProviderConfig`'s fourth parameter. Red: the compiler names every call site that still passes the argument. Green: those call sites drop the argument, the imports that lose their last use are removed, `resolveFirstDeltaTimeoutMs()` still has its caller, and the suite is green.

**Step 5 — Delete the unread state.** Remove `state.modelSettingsPath` and `state.lastRefreshAt` from the state type. Red: the compiler names the writes to the removed fields, and removing `registerModels`' fifth parameter names the call site that still passes it. Green: the writes and that argument are gone, `state.lastError` still has its reader, and the suite is green.

**Step 6 — Delete the non-omlx branch and rewrite the header comment.** Remove the branch, `isOmlx`, the `stream_simple_bypassed` emit, the `PROVIDER_KEY` import, `test/stream.test.ts:184-208` and the `NON_OMLX_MODEL` fixture at `test/stream.test.ts:120`. Replace the recursion paragraph in `src/stream.ts:10-23` with the per-provider fact and the `shortcut:` line above; keep the direct `openAICompletionsApi().streamSimple` call and the jiti note. Red: the search for `isOmlx`, `stream_simple_bypassed`, the branch's model test and `NON_OMLX_MODEL` returns only the sites being deleted; there is no failing test, because the branch cannot be entered (Chidi Q1). Green: the suite green without the bypass test, and the search comes back empty.

**Step 7 — The applied event.** Replace the field-by-field comparison with `JSON.stringify(next) !== JSON.stringify(model)`, and drop the `entrySummary` detail from the payload. Leave `summarizeModelSettingsEntry` and `compactObject` where they are: the helper's other caller, the `settingsSummary` write at `src/catalog.ts:563`, survives this step. Red: the search for `entrySummary` returns one hit, the payload construction at `src/catalog.ts:483`, which is the reader the deletion removes; the event's `details` type is `Record<string, unknown>` and names no key. The comparison swap itself changes no observable behaviour, since Michael measured both variants green at HEAD (council.md #2). Green: that hit is gone, the pinned kind-sequence test in `test/catalog.test.ts` stays green, and the compiler is clean.

**Step 8 — Delete the metadata fields and their helpers.** Remove the fields of decision 1 from `OmlxModel`, the writes in both parsers, the `settingsSummary` write at `src/catalog.ts:563`, the now-readerless `summarizeModelSettingsEntry` and `compactObject`, the cache envelope's `savedAt`, and the response members of decision 2. Write the non-emission test first, with the overlay entry carrying a pin or a ttl so the fixture reads like the settings a user writes. Red: the test fails before the step for any key it carries, because `settingsSummary` is written on every matched entry, so the model always differs and `applied` fires. Green: with the fields and that write gone, an entry carrying only unread keys changes nothing, the event stops, the search for `summarizeModelSettingsEntry` and `compactObject` comes back empty, the deleted fields' assertions are deleted with them, the provider fixture narrows, and every surviving assertion is byte-identical and green.

**Step 9 — Delete the guard.** Write the load-twice test first. Red: it fails at HEAD because the second factory call returns early (council.md #8). Green: the early-return guard, the `EXTENSION_SINGLETON_KEY` constant and the `delete globalState[EXTENSION_SINGLETON_KEY]` line are gone, the `state.stopped = true` the same handler sets stays, the test passes, and the suite is green with no other expectation changed.

**Step 10 — Joel's parity diff and `/model` check.** Run the dump again at the end, `diff` it against step 0's file, expect an empty diff, and look at `/model`. Red: a non-empty diff or a changed limit or thinking flag is a finding against this change, and it goes back before archive. Green: empty diff, same models, same limits, same thinking flags (Michael §3(e), council.md #13). This step is Joel's.

## What The Implementation Gate Checks

Michael's implementation gate reads the diff against these, and the design says what it will find:

- **Contract adherence.** Every hunk maps to a step above and to a task; the two added tests are the only additions, and the two delta specs the only new spec files. Anything else, a helper kept "just in case" or a file the proposal does not name, is outside a task.
- **No new mechanism.** The change adds no runtime guard, branch, export, option or event. The applied event keeps its name and its meaning; two events are deleted with their behaviour; nothing replaces them. If the diff grows a replacement event or a cache version, the design was not followed.
- **Making it pass.** No edited expectation. The test edits are the ones decision 13 names: assertions deleted with their fields, the provider fixture narrowed to surviving fields, the cache fixtures' `savedAt` dropped, the stream calls' arguments dropped, and the bypass test deleted with its branch. The suite being green after a step proves the step, not the test.
- **The two new tests earn their place.** The load-twice test is red at HEAD and green after step 9. The non-emission test is red before step 8 and green after, and it fails if someone later deletes the whole-object comparison.
- **Mechanical.** `npm run check` (Biome, `tsc`, the suite) passes, run by the gate itself. The suppression search from Derek's standards over the whole diff returns nothing. No Markdown file other than `tasks.md` is in the diff, and no `.env`, credential or scratch path is committed.
- **Shape.** No compatibility shim, no re-export, no consumer left without a producer: every deleted symbol loses its last caller in the same task or an earlier one, which the compiler checks. The summary helpers are the case to look at, since their two callers go in different tasks.
- **Observability and errors.** No logging level changes and no renamed event. The two deleted events are the ones whose only reader was the code being deleted, and `CONTRIBUTING.md`'s list is the docs pass's correction, which never blocks.
- **Fix the class.** The timeout chain is fixed as a chain, the two stale stream comments as a pair, the metadata fields with their response members, the stream test arguments as a set. A single instance fixed in one place and left in its sibling is a finding.
- **The whole-tree search.** Each deletion task records the search it ran and its empty result, because that search is Joel's acceptance sentence (owner-rulings §1; council.md #12).

## Risks / Trade-offs

- **A pi that dispatches by api id.** The peer range is `"*"`, so a pre-1.5.2 or future pi could route another provider's `openai-completions` model into this wrapper once the branch is gone, and it would get the omlx thinking controls and timeouts. → The `shortcut:` line names the assumption and the version to re-check; pinning the range is a later card (council.md #6). Michael measured the shipped bundle as carrying the same per-provider guard, so the risk is older or future pi, not today's.
- **A model-specific debug trace disappears for whoever relies on it.** `catalog_local_model_settings_missing` and the `documenter` payload key existed for one model id. → They are deleted with the id, and `CONTRIBUTING.md`'s list loses them in the docs pass.
- **The non-emission test must be seen red before step 8.** Its red comes from `settingsSummary`, which is written on every matched entry, so before step 8 the test fails whatever key it carries; after step 8 it fails if the whole-object comparison is deleted. The pin and ttl in its entry are there to read like a real settings file, not because the key decides the test. → Step 8 writes the test first and records the failure, so a writer who adds it after the deletion has a test that cannot fail and the task is not done.
- **Old caches.** A cache written before this change carries extra keys. → They ride along as untyped properties and the next successful fetch overwrites them; no reader picks them (decision 12).
- **The parity measurement depends on Joel's baseline.** Without step 0 there is nothing trustworthy to diff against. → Step 0 is marked his and comes before the first code commit; the diff is a task for him, and its absence is visible as a missing task when the implementation gate reads `tasks.md`.
- **The kept `test-isolation` scenario.** The delta keeps the shutdown scenario the ruling asked to replace. → Michael's own evidence has it passing without the guard (every wiring test shuts down and the next one loads), and the note under `council.md` #9 records the deviation for him to accept or overrule at PL4.
- **A second install now runs twice.** A global plus a project-local copy registers `omlx` twice, polls twice and can warn twice. → Joel chose this (owner-rulings §3); it is the visible symptom of a configuration mistake his setup does not have (Michael §4).

## Migration Plan

No deployment and no data migration. There is no cache version change, no config key change and no stored state to convert: an old cache keeps loading and is overwritten on the next fetch, and a stored credential, the `OMLX_*` variables and the overlay path behave exactly as before.

The order of landing is the one the steps set: every code task lands behind a green `npm run check`, the branch is complete after step 9, then step 10's parity diff and `/model` check run on the branch before archive. Rollback is `git revert` of the change: nothing in it writes durable state, so a revert restores the previous behaviour except that a cache written in between keeps the smaller shape, which the old code reads as absent optional fields.

Two records follow the code and do not gate it: the docs pass below, and the archive, which merges the two delta specs.

## The Docs Pass

After the implementation gate, and never before it, the change's own documentation. The files the change makes false, all named in Michael §3(l):

- `AGENTS.md`: the trap line that says `readLastCatalogCache` is kept for a later change.
- `CONTRIBUTING.md`: the event list, which names `stream_simple_bypassed` and `catalog_local_model_settings_missing`, and the `applied` event's description if it mentions the entry summary.
- `ARCHITECTURE.md`: the mention of `readLastCatalogCache`, and anything else that describes the pass-through branch or the singleton guard.

Each corrected sentence goes to the record that owns it: a command, convention or trap to `AGENTS.md`; a contribution or verification convention to `CONTRIBUTING.md`; how the system is shaped today to `ARCHITECTURE.md`; and a choice between alternatives, if any survives the deletions, to an ADR. This change adds no ADR, because it makes no structural choice: the applied-event comparison is a one-line detail inside an existing event. Every other Markdown file in the repository is checked for a copy of a corrected sentence, since the list of false documents came from one reading and another file may quote it.

## Open Questions

None. The one unknown the council could not close, whether to pin the pi peer range, Michael ruled out of this card and it is recorded as a later change (council.md #6); it does not change these specs, this approach or the tasks.
