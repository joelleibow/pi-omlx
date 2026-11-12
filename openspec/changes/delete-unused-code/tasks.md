# Tasks

One task per deletion, one commit per task, in the order the design's steps set (design.md "Steps"). Structure first, then the output the change narrows, then the one behaviour change, then Joel's measurement.

Two rules shape every line below.

- **Two hats.** A structure task changes the shape of the code and names the search or the compiler as its red evidence. A behaviour task names a test that fails before it and passes after. The two never share a task.
- **A pure deletion has no test of its own.** Its proof is the reader search coming back with nothing still reading the symbol, the compiler naming any typed reader the deletion leaves behind, and the suite staying green with the surviving assertions byte-identical (council.md #12). Each such task says so instead of inventing a symbol-absence test.

Every task is committed separately. A task that checks the shape of its diff measures it from its own parent commit, `git diff --stat HEAD~1 -- …` at the moment that task's commit is made, and names the paths that task alone may touch. The whole implementation diff is measured from the last planning commit, the commit that lands this file; that base belongs to the implementation gate's view, not to these tasks. No task adds a use case, an adapter or an entry point, so no task adds logging or error handling; the deleted debug events go with their emitters. Markdown documentation is not a task: the docs pass writes it after the implementation gate (design.md "The Docs Pass").

## 1. Before The Code

- [x] 1.1 (Joel's) Capture the `/model` parity baseline before any code commit, from the audited tree. Verify: `/tmp/omlx-parity/before.json` holds the models array and `/tmp/omlx-parity/before-list.txt` holds the model list.

  Exact commands. The copies and the dump only read his two directories; everything the dump writes, including the catalog cache the extension writes under the copied agent directory, lands in `/tmp/omlx-parity/`.

  ```
  cd /Users/joelleibow/Projects/pi-omlx
  git diff --stat 0411d6a HEAD -- . ':!openspec'    # expected: prints nothing
  mkdir -p /tmp/omlx-parity/agent
  cp ~/.pi/agent/auth.json /tmp/omlx-parity/agent/auth.json     # if it is absent, skip and let OMLX_API_KEY supply the key
  cp ~/.omlx/model_settings.json /tmp/omlx-parity/model_settings.json
  PI_CODING_AGENT_DIR=/tmp/omlx-parity/agent \
  OMLX_MODEL_SETTINGS_PATH=/tmp/omlx-parity/model_settings.json \
  node /tmp/omlx-parity/dump.ts > /tmp/omlx-parity/before.json
  pi --list-models omlx > /tmp/omlx-parity/before-list.txt
  ```

  The last command is a normal pi start, unlike the dump: it loads the extension from his settings, so the factory runs, the poll may fire and the catalog cache under his agent directory may be refreshed. That is the extension's ordinary behaviour on any start, not a test writing operator state. Its output is the reference 6.1 diffs.

  The dump script is a one-off the implementer prepares before this task and does not commit. It imports only from this repository's `src/`, resolves the credential the way the extension does, fetches the catalog from the resolved base URL, and prints `JSON.stringify(toProviderConfig(...).models, null, 2)` to stdout. It calls `toProviderConfig` with the arguments that survive this change, so the same file runs before and after task 3.2 removes the timeout parameter. If `node` refuses the `.ts` file, run it through `npx tsx` and keep the same output. If `git diff --stat` prints anything, the base moved and this task stops until Conductor says the tree still matches `0411d6a`.

  - Red evidence: none. This task takes the reference the last task compares against; without it there is nothing to diff (council.md #13).
  - Boundary cases: none.
  - Traces to: design step 0, decision 13.

  - Joel, 2026-11-12, at the planning head `29468cb` (no code change since `0411d6a`), with the dump run as `node_modules/.bin/tsx /tmp/omlx-parity/dump.ts` (Derek: bare `node` does not run it): "dump ok"; `/tmp/omlx-parity/before.json` 3117 bytes, `/tmp/omlx-parity/before-list.txt` 1023 bytes.

## 2. Structure: The Move And The Stale Import

- [x] 2.1 Move `src/smoke-model-selection.ts` to `scripts/smoke-model-selection.ts` and update the import at `scripts/smoke-live-omlx.ts:6`. Verify: `npm run check` green and `npm pack --dry-run` lists no `smoke-model-selection` path under `src/`.

  - Red evidence: `npm pack --dry-run` before the move lists `src/smoke-model-selection.ts` among the shipped files, which is the state the task removes.
  - Green evidence: the same command's listing holds no `smoke-model-selection` path under `src/`, and the moved file still type-checks and lints because `tsconfig.json` and Biome cover `scripts/`.
  - Boundary cases: none.
  - Traces to: design step 1, decision 9; Michael §3(i).

- [x] 2.2 Move the import at `test/index.test.ts:99-101` into the import block and delete the comment above it. Verify: `npm run check` green, with Biome's organizer accepting the placement.

  - Red evidence: `rg -n ':72|:76' openspec/specs` returns no match, so the lines the comment cites do not exist and the comment's premise is already false (council.md #11).
  - Green evidence: the import appears once, in the block; `test/index.test.ts` green.
  - Boundary cases: none. ESM hoists static imports, so the position never had a runtime effect.
  - Traces to: design step 2, decision 10.

## 3. Structure: The Unread Exports, Chains And Branch

- [x] 3.1 Delete `readLastCatalogCache` from `src/catalog.ts`. Verify: `npm run check` green.

  - Red evidence: `rg -n 'readLastCatalogCache' index.ts src test scripts` returns only hits naming the symbol's own definition and export; no hit is a call. That empty caller set is what lets it go (Michael §1).
  - Green evidence: the search returns no match at all; the suite green.
  - Boundary cases: none.
  - Traces to: design step 3; council.md #12.

- [x] 3.2 Delete the stream timeout chain: `StreamTimeoutEvent`, `OnStreamTimeout`, `streamOmlxOpenAICompletions`'s `onTimeout`, `runAttempt`'s `onTimeout` and `toProviderConfig`'s fourth parameter. Verify: `npm run check` green.

  - Red evidence: removing the parameter first makes `npm run typecheck` fail at every call site that still passes an argument (TypeScript's expected-argument error names each). That list is the work.
  - Green evidence: every call site drops the argument, including the stream tests that pass `undefined`; the type imports that lose their last use are removed; `resolveFirstDeltaTimeoutMs()` still has a caller outside its own definition; the search for the five names returns no match.
  - Boundary cases: a call site that already passed nothing compiles unchanged once the parameter is gone; the first-delta timeout behaviour is untouched.
  - Traces to: design step 4, decision 7; Michael §3(f).

- [x] 3.3 Delete `state.modelSettingsPath` and `state.lastRefreshAt`, `registerModels`' fifth parameter and the argument that feeds it. Verify: `npm run check` green.

  - Red evidence: removing the two fields from the state type makes `npm run typecheck` fail on the writes to them; removing the fifth parameter makes it fail at `registerModels`' call site.
  - Green evidence: both writes and the argument are gone, and `rg -n 'lastRefreshAt|modelSettingsPath' index.ts src test` leaves every hit as the ordinary local path variable and the argument that feed the overlay fetch, never a `state.` field. `state.lastError` still has its reader.
  - Boundary cases: the local `modelSettingsPath` binding, the `OMLX_MODEL_SETTINGS_PATH` default parameter and `resolveLocalModelSettingsPath` stay, because they are not state (Michael §2).
  - Traces to: design step 5, decision 8; Michael §3(g).

- [x] 3.4 Delete the non-omlx branch from `src/stream.ts` with `isOmlx`, the `stream_simple_bypassed` emit, the `PROVIDER_KEY` import, the test at `test/stream.test.ts:184-208` and the `NON_OMLX_MODEL` fixture at `test/stream.test.ts:120` only that test reads. Rewrite the recursion paragraph of the header comment to the per-provider fact with the `shortcut:` line, and delete the branch's own comment. Verify: `npm run check` green and both searches empty.

  - Red evidence: `rg -n 'isOmlx|stream_simple_bypassed|NON_OMLX_MODEL' index.ts src test scripts` returns only the sites being deleted, so nothing else reads them. No failing test exists, because the branch cannot be entered on pi 1.5.2 (Chidi Q1, and Michael measured the shipped bundle's dispatch).
  - Green evidence: the same search returns no match; the suite green without the bypass test; the pinned stream tests for `omlx` models stay green, which is the boundary that still matters.
  - Boundary cases: an `omlx` model still reaches the concrete `openAICompletionsApi().streamSimple` through the direct call, and the jiti subpath note stays, because it is about module resolution, not dispatch.
  - Traces to: design step 6, decision 6; council.md #5, #6.

## 4. Output: The Trace And The Cache File

- [x] 4.1 Replace the field-by-field change comparison in `applyLocalModelSettings` with `JSON.stringify(next) !== JSON.stringify(model)` and drop the `entrySummary` detail from the `catalog_local_model_settings_applied` payload. Leave `summarizeModelSettingsEntry` and `compactObject` in place: `next.settingsSummary = summarizeModelSettingsEntry(entry)` still calls the helper. Verify: `npm run check` green.

  - Red evidence: `rg -n 'entrySummary' index.ts src test scripts` returns one hit, the payload construction at `src/catalog.ts:483`; that is the reader this task removes. The comparison swap itself changes nothing observable, which Michael measured.
  - Green evidence: the search returns no match; the pinned kind-sequence test in `test/catalog.test.ts`, which asserts `catalog_status_loaded`, then `catalog_local_settings_considered`, then `catalog_local_model_settings_applied`, stays green; the compiler clean.
  - Boundary cases: an entry that changes a field the extension reads still emits `applied`; the pinned test's fixture is the case.
  - Traces to: design step 7, decision 4; council.md #2.

- [x] 4.2 Delete the metadata fields and their helpers, with the non-emission test written first. Verify: the new test red before the fields go, green after; `npm run check` green.

  Remove from `OmlxModel`: `description`, `modelAlias`, `taskBudgetTokens`, `maxToolResultTokens`, `thinkingBudgetTokens`, `thinkingBudgetEnabled`, `preserveThinking`, `chatTemplateKwargs`, `forcedCtKwargs`, `isDefault`, `isPinned`, `trustRemoteCode`, `ttlSeconds`, `indexCacheFreq`, `activeProfileName`, `settingsSummary`. Remove their writes in both parsers, the `settingsSummary` write at `src/catalog.ts:563`, the now-readerless `summarizeModelSettingsEntry` and `compactObject`, the cache envelope's `savedAt`, and the `OmlxModelsStatusResponse` members that fed the deleted fields: `description`, `model_alias`, `max_tool_result_tokens`, `thinking_budget_tokens`, `thinking_budget_enabled`, `preserve_thinking`, `forced_ct_kwargs`, `is_default`, `is_pinned`, `pinned`, `trust_remote_code`, `ttl_seconds`, `index_cache_freq`, `active_profile_name`. The members the parsers still read stay: `id`, `display_name`, `max_context_window`, `max_tokens`, `thinking_default`, `enable_thinking`, `chat_template_kwargs`, `reasoning_parser`, `model_type`, `engine_type`, `model_type_override`. Write the new test first: a model whose overlay entry carries only a key the overlay no longer reads, with a pin or a ttl in the fixture so it reads like a real settings file, emits no `catalog_local_model_settings_applied` event.

  - Red evidence: the new test fails before this task, and for any key it carries, because `settingsSummary` is written on every matched entry, so the model always differs and `applied` fires.
  - Green evidence: with the fields and that write gone, the entry changes nothing and the event stops; the search for `summarizeModelSettingsEntry` and `compactObject` returns no match; `rg -n 'savedAt' src test` returns no match; `rg -n 'model_alias|max_tool_result_tokens|thinking_budget_|preserve_thinking|forced_ct_kwargs|is_default|is_pinned|pinned|trust_remote_code|ttl_seconds|index_cache_freq|active_profile_name|description' src/catalog.ts` returns no match, which is the only proof the interface members get, since neither tool reports an unused one; the deleted fields' assertions are deleted with them; `test/provider.test.ts`'s `OmlxModel` fixture narrows to `archContextWindow`, `reasoningParser` and `thinkingDefault`; every assertion on a surviving field is byte-identical.
  - How it is shown catching a mistake: after green, comment out the `JSON.stringify` comparison line and run the new test. It must fail. Restore the line.
  - Boundary cases: an entry that changes a read field still emits `applied` (the pinned test's fixture); an entry the overlay never matched emits nothing (unchanged).
  - Shape check: `git diff --stat HEAD~1` at this task's commit names only `src/catalog.ts`, `test/catalog.test.ts`, `test/provider.test.ts` and `test/index.test.ts`, the last for the `savedAt` fixture.
  - Traces to: design step 8, decisions 1, 2, 3, 4, 13; council.md #1, #2, #7, #12.

## 5. Behaviour: The Singleton Guard

- [x] 5.1 (a) Write a test that loads the extension twice in one process with no `session_shutdown` between the loads and asserts two registrations; (b) delete the early-return guard, the `EXTENSION_SINGLETON_KEY` constant and the `delete globalState[EXTENSION_SINGLETON_KEY]` line, leaving `state.stopped = true` in the handler. Verify: the test red at HEAD and green after; `npm run check` green.

  - Red evidence: the test fails before the deletion because the second factory call returns early (`index.ts:52-53` at HEAD); record the failure line.
  - Green evidence: the test passes; `rg -n 'EXTENSION_SINGLETON_KEY|pi-omlx/loaded' index.ts src test scripts` returns no match; every other test's expectation is unchanged.
  - How it is shown catching a mistake: after green, restore the early return in a local edit and run the new test. It must fail. Remove the restored line.
  - Boundary cases: a load after `session_shutdown` still registers, which the kept `test-isolation` scenario states and the wiring tests already drive, since each shuts down in `finally` and the next one loads. The second load's lifecycle inside the fake pi is the other boundary: `fakePi().on` stores one handler per event, so the second load overwrites the first load's `session_shutdown` handler and shutting down stops only the second instance. The test therefore runs inside `driveExtension`, where both loads share the fake timers and the fake fetch, and the first instance's poll is inert once `vi.useRealTimers()` runs; the task does not try to capture per-load handlers, and it does not assert on the first instance's stop.
  - Shape check: `git diff --stat HEAD~1` at this task's commit names only `index.ts` and `test/index.test.ts`.
  - Traces to: design step 9, decision 11; `specs/test-isolation` (the added scenario); owner-rulings §3; council.md #8.

- [ ] 5.2 Clear the old-token grep's one surviving hit and confirm the grep passes. Verify: `git grep -ni picker -- ':!*.md' ':!openspec'` prints nothing and exits 1, which is `package-identity`'s requirement.

  - Red evidence: at HEAD the grep prints `test/index.test.ts:634`, a comment reading "registered for the picker", and exits 0. That hit predates this change, added by PR #10, so the living requirement is already violated. The hit is in a test file, not Markdown, so the docs pass does not own it.
  - Green evidence: the comment is reworded to "registered for pi's model list", and the grep prints nothing and exits 1. No assertion and no behaviour changes.
  - Boundary cases: none. Michael's alternative, dropping this task and recording the violation for a follow-up, was set aside because this change modifies this very requirement and re-validates it.
  - Traces to: `specs/package-identity` (the modified requirement); design decision 15; Michael's round-1 finding on this task.

## 6. After The Code

- [ ] 6.1 (Joel's) Diff the post-change dump and the model list against the baselines. Verify: both diffs print nothing, so the models, their limits and their thinking flags are the same.

  Exact commands. The dump reads the copies and writes under `/tmp/omlx-parity/`; the list command is a normal pi start, as in 1.1:

  ```
  cd /Users/joelleibow/Projects/pi-omlx
  PI_CODING_AGENT_DIR=/tmp/omlx-parity/agent \
  OMLX_MODEL_SETTINGS_PATH=/tmp/omlx-parity/model_settings.json \
  node /tmp/omlx-parity/dump.ts > /tmp/omlx-parity/after.json
  diff /tmp/omlx-parity/before.json /tmp/omlx-parity/after.json   # expected: prints nothing
  pi --list-models omlx > /tmp/omlx-parity/after-list.txt
  diff /tmp/omlx-parity/before-list.txt /tmp/omlx-parity/after-list.txt   # expected: prints nothing
  ```

  The list command loads the extension as a normal pi start does, so it may refresh the catalog cache in his agent directory; that is the extension's ordinary behaviour, not a test writing operator state. Its output carries the models, their context and max-out numbers, and their thinking flags, which are the `/model` list the acceptance sentence names, and the diff against 1.1's copy is what proves they did not move.

  - Red evidence: a non-empty `diff`, or a model, limit or thinking flag that moved, is a finding against this change and it goes back before archive.
  - Green evidence: both diffs empty, so the same models with the same limits and thinking flags (Michael §3(e); council.md #13).
  - Boundary cases: none.
  - Traces to: design step 10, decision 13; owner-rulings §1's acceptance sentence.

Two steps follow this list and are neither tasks nor code: the docs pass, which corrects the Markdown this change makes false, and only then the archive, which merges the two delta specs.
