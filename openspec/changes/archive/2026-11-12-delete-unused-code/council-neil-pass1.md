# council-neil — pass 1

- Advisor: `council-neil`
- Run: `d358f552-9a8d-4cc6-9a12-a251359c8c38`
- Pass: 1

## Confidence

Level: `high`. Reason: "Reader counts at HEAD 0411d6a, pi 1.5.2 dispatch/dual-load mechanics, and Joel's singleton-guard ruling are all directly measured or settled in the brief's records."

## Recommendation

1. Four open points. (a) Delete savedAt (src/catalog.ts:577,605) alongside state.lastRefreshAt and drop it from the 3 cache fixtures; old caches still load via Array.isArray(data.models) with no migration. (b) Shrink the catalog_local_model_settings_applied check (src/catalog.ts:452-474) to the 6 surviving overlay-mutable fields (thinkingDefault, contextWindow, maxTokens, displayName, reasoningParser, modelType) and drop entrySummary; dropping the check would emit "applied" when ~/.omlx/model_settings.json has only server keys (is_pinned, ttl_seconds). (c) Delete catalog_local_model_settings_missing and both "qwen3.6-8b-documenter" sites (dropping documenter from catalog_status_loaded). (d) Delete the full onStreamTimeout chain (toProviderConfig 4th param, streamOmlxOpenAICompletions/runAttempt onTimeout, OnStreamTimeout, StreamTimeoutEvent, and 7 trailing undefined args in test/stream.test.ts), keeping resolveFirstDeltaTimeoutMs().

2. Proof. Prove each removal with whole-tree rg zero hits, npm run check, and npm pack --dry-run (smoke-model-selection absent from tarball). Red-before-green applies only where runtime behavior changes: write a failing test calling the extension factory twice in one process without session_shutdown and asserting two registrations, then delete the guard. Pure deletions add no synthetic symbol-absence tests. Delete test/stream.test.ts:184-208 and dead-field/summary assertions (test/catalog.test.ts:138-157,290-300,378-468); narrow test/provider.test.ts:91-111 to surviving OMLX-only fields (archContextWindow, reasoningParser, thinkingDefault), cache fixtures (savedAt), and 7 stream.test.ts call arities; keep all surviving assertions byte-identical. /model parity (marked Joel's task): diff toProviderConfig(...).models JSON against Joel's live server + ~/.omlx/model_settings.json before/after (empty diff) plus his /model check; add no snapshot fixture.

3. Step order (two hats, check green after each). Structure: (1) git mv src/smoke-model-selection.ts to scripts/ and update scripts/smoke-live-omlx.ts:6; (2) hoist import and delete stale comment at test/index.test.ts:99-101; (3) delete readLastCatalogCache, unread state.modelSettingsPath (+ registerModels 5th param) and state.lastRefreshAt, and the onStreamTimeout chain. Behavior/surface: (4) delete savedAt + 3 fixture keys; (5) delete the 16 dead OmlxModel fields (including settingsSummary), summarizeModelSettingsEntry, compactObject, documenter/missing debug items, and shrink applied-event diff (keeping local chat_template_kwargs.enable_thinking -> thinkingDefault); (6) delete non-omlx stream branch/event/test and rewrite stream.ts comments; (7) red-green singleton-guard deletion; (8) Joel's live parity check.

4 & 5. Draft & design fixes. proposal.md misses savedAt, misses card item (6) (test/index.test.ts:99-101), and rewrites only stream.ts:190-195 while leaving stale stream.ts:10-23 (delete :190-195 with the branch; rewrite :10-23 with `shortcut: assumes pi dispatches streamSimple per provider (verified on pi 1.5.2; peer range "*"), re-check model-runtime/provider-composer on pi upgrades`). Design must explicitly enumerate the 8 surviving vs 16 deleted OmlxModel fields, fence local chat_template_kwargs.enable_thinking -> thinkingDefault, and name documenter/entrySummary payload removals. In specs/: package-identity should drop the whole non-normative second sentence (which still names dead pickerDebug); test-isolation uses REMOVED+ADDED only because it renames the heading to mix filesystem isolation with product load state—keep the original heading via MODIFIED (and place dual-load registration in provider-access, or keep one MODIFIED block).

## Challenge Claims

- savedAt (src/catalog.ts:577,605) must go with state.lastRefreshAt with zero cache migration, because readCatalogCacheFile checks only Array.isArray(data.models) and keeping savedAt leaves a written-never-read sibling.
- applyLocalModelSettings (src/catalog.ts:452-474) should shrink its diff check to the 6 surviving overlay-mutable fields rather than firing unconditionally, preventing false applied events on OMLX-only settings like is_pinned or ttl_seconds.
- Pure deletions take rg zero-hit + tsc + untouched surviving assertions rather than synthetic symbol-absence tests; only singleton-guard removal takes a red-before-green behavioral test (two loads in one process register twice).

## Change My Mind

- A grep hit showing a production or external reader of savedAt, readLastCatalogCache, or StreamTimeoutEvent.
- Evidence that pi 1.5.2 dist/bundle registers extension streamSimple handlers into a shared per-API-id registry.
- Evidence that test/index.test.ts:1-98 mutates process/env state before importing the module at line 99.

## Evidence

- **Claim:** savedAt and state.lastRefreshAt/modelSettingsPath are written and never read; readCatalogCacheFile checks only Array.isArray(data.models). **Sources:** michael-orientation.md §3(d), §3(g); research-eleanor.md §2, §4.
- **Claim:** catalog_local_model_settings_applied is live via index.ts:331, while catalog_local_model_settings_missing and settingsSummary/summarizeModelSettingsEntry/compactObject have no behavioral reader. **Sources:** michael-orientation.md §3(b); research-eleanor.md §1, §2.
- **Claim:** Every caller of toProviderConfig/streamOmlxOpenAICompletions passes undefined for onStreamTimeout/onTimeout. **Sources:** michael-orientation.md §3(f); research-eleanor.md §4.
- **Claim:** pi 1.5.2 dispatches streamSimple by model.provider (model-runtime.js:459-460, provider-composer.js:378-379); non-omlx models never enter the wrapper. **Sources:** research-chidi.md Q1; michael-orientation.md §3(h).
- **Claim:** Both src/stream.ts:10-23 and src/stream.ts:190-195 rest on the obsolete shared-api-id dispatch premise, while package.json peer range is "*". **Sources:** michael-orientation.md §3(h); research-chidi.md Q1.
- **Claim:** Joel deleted the singleton guard, key, and session_shutdown clear, and set whole-tree grep + npm run check + /model parity as acceptance. **Sources:** owner-rulings.md §1, §3.

## Assumptions

- **verified:** pi 1.5.2 dispatches streamSimple strictly by model.provider and toProviderModel emits a fixed 8-key projection.
- **verified:** savedAt, state.lastRefreshAt, state.modelSettingsPath, readLastCatalogCache, and non-undefined onStreamTimeout have zero production readers at HEAD 0411d6a.
- **verified:** Joel ruled the singleton guard, Symbol.for("pi-omlx/loaded"), and session_shutdown clear deleted.
- **unverified:** test/index.test.ts:1-101 has no module-init side effect requiring the late import (if order-dependent, delete only the stale comment and keep import placement).
- **unverified:** test/catalog.test.ts:473-516 asserts event sequence rather than documenter or entrySummary keys (if asserted, delete only those two dead key checks).
- **unverified:** pi 1.5.2 dist/bundle matches dist/core on registerApiProvider absence (Chidi's live pi -p run empirically confirmed non-omlx bypass; still delete branch).
- **unverified:** Living package-identity and test-isolation specs match the proposal's summaries (pick MODIFIED over REMOVED+ADDED if heading stays unchanged).

## Risks

- Dropping the catalog_local_model_settings_applied field check causes a ~/.omlx/model_settings.json entry containing only server keys (e.g., is_pinned, ttl_seconds) to emit false applied events with identical before/after payloads on every poll.
- Deleting raw chat_template_kwargs.enable_thinking parsing alongside OmlxModel.chatTemplateKwargs sets thinkingDefault to undefined for template-configured models, flipping /model reasoning to false and skipping before_provider_request thinking controls.
- Rewriting only src/stream.ts:190-195 (as in proposal.md) leaves src/stream.ts:10-23 falsely stating recursion through a shared API-id registry.
- Because package.json sets peer dependency "*", running on a pre-1.5.2 or future pi version with shared API-id dispatch would route non-omlx openai-completions models through OMLX timeout/retry logic (bounded by the stream.ts shortcut comment).

## Owner Decisions

None.
