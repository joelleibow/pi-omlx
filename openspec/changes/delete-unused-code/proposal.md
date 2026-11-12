# Proposal

## Why

Joel's 2026-11-11 triage put the unused catalog metadata, debug-only code, dead branches and unused pieces into one change, and set its acceptance: each piece goes after a whole-tree grep shows no other reader, `npm run check` stays green, and `/model` shows the same models with the same limits and thinking flags as before (owner-rulings §1). He ran the card on 2026-11-12 (§2). At HEAD `0411d6a` the tree still parses, caches and summarizes catalog fields nothing reads, traces an event that exists for one author's model id, carries a stream branch pi 1.5.2 cannot reach (Chidi Q1), and guards against a second install that Joel decided to let run (§3). The change closes no live collision risk: `toProviderModel` already builds an explicit object, so the extra model attributes Joel quoted never reach pi (Michael §3(k)).

## What Changes

- **Catalog metadata.** The parse, the overlay and the cache stop carrying every field with no production reader: description and alias, the budget and thinking metadata, the pin, default, trust, ttl, index-cache and profile fields, and `settingsSummary`. `summarizeModelSettingsEntry` and `compactObject` go with the field that used them. The design carries the item list and what each deletion pulls. Eleanor §2 measured each field's readers; Michael §2 lists the fields that stay.
- **Catalog debug events.** The event set narrows to what has a live trace. The `qwen3.6-8b-documenter` literals and `catalog_local_model_settings_missing` go, and the applied event's change comparison shrinks to the surviving fields (Michael §3(b)). Whether the comparison shrinks or the event fires on any matched entry is the council's to settle; Michael leans shrink.
- **Cache.** No version, migration or stripping. A cache written before this change still reads, because the only readers pick fields explicitly, and the next successful fetch overwrites it (Michael §3(d)).
- **`readLastCatalogCache`.** Deleted. Michael ruled it deferred to this card, and `AGENTS.md:28` and `ARCHITECTURE.md` §9 both say it was kept for a later change.
- **Stream pass-through.** The non-omlx branch goes with `isOmlx`, `stream_simple_bypassed`, its `PROVIDER_KEY` import and its test: pi 1.5.2 dispatches `streamSimple` by `model.provider`, so no model from another provider enters the wrapper (Chidi Q1; Michael §3(h)). The comment above the branch is rewritten to that per-provider fact, with a `shortcut:` naming the pi version to re-check.
- **Stream timeout chain.** `toProviderConfig`'s fourth parameter, `streamOmlxOpenAICompletions`'s `onTimeout`, `runAttempt`'s `onTimeout`, `OnStreamTimeout` and `StreamTimeoutEvent` are deleted: every caller passes `undefined` (Michael §3(f)). `resolveFirstDeltaTimeoutMs()` stays, because production reads it.
- **Unread state.** `state.modelSettingsPath` goes with the parameter that carries it, and `state.lastRefreshAt` goes with its writes. `state.lastError` stays, because something reads it (Michael §3(g)).
- **Scripts.** `src/smoke-model-selection.ts` moves to `scripts/`, so the package stops shipping a probe that only a script imports (Michael §3(i)).
- **BREAKING: the singleton guard.** The guard in `index.ts`, its `Symbol.for("pi-omlx/loaded")` key and the `session_shutdown` clear are deleted (owner-rulings §3). A second copy of the extension in one process now runs like any other pi extension. Pi merges its `omlx` registration over the first, so the later copy's catalog and handler win, and the process polls twice and can warn twice (Chidi Q2). Joel's setup has one install, so nothing he runs changes (Michael §4).

Already done, and no task follows from it: `applyStoredCredentialToEnv` is not in the tree (Michael §3(a)).

## Capabilities

### New Capabilities

None. No requirement describes behavior this change adds.

### Modified Capabilities

- `test-isolation`: the fixture requirement's scenario about a second load after `session_shutdown` describes the guard's cleared key, so the requirement is removed and added again under a new name. The other scenarios carry over word for word, and a load-twice scenario takes the replaced one's place.
- `package-identity`: the old-token requirement names "the singleton key in `index.ts`" among the artifacts its grep covers. The key is deleted, so the name goes. The grep and its scenarios stay as they are.

Read, and left out of the delta:

- `catalog-discovery`: every registered model keeps its identity, its limits and its reasoning flag, and every warning stays. `isDefault` and `isPinned` have no future home, because that spec forbids choosing the session's starting model (Michael §1).
- `diagnostics`: it fixes the predicate and the prefix, not the event set (Michael §1).
- `provider-access`, `credential-resolution`, `verification`, `environment-configuration`: the provider id, the single credential, the check and the environment's source are all untouched (Michael §2).

## Impact

- **Code:** `index.ts`, `src/catalog.ts`, `src/provider.ts`, `src/stream.ts`. `src/smoke-model-selection.ts` moves to `scripts/`.
- **Tests:** an assertion on a deleted field is deleted with the field, an assertion on a surviving field stays byte-identical, and `test/provider.test.ts`'s `OmlxModel` fixture narrows to the surviving OMLX-only fields so it still proves the projection does not spread (Michael §3(c)). The isolation guard and its lists do not move (Michael §2).
- **`/model` parity:** pi reads exactly the object `toProviderModel` builds, and this change leaves that object's keys alone. The surviving assertions prove it, and one measurement finishes the proof. That measurement is Joel's: the same `toProviderConfig(...).models` dump against his live server, before and after (Michael §3(e)). It is the acceptance sentence of owner-rulings §1.
- **Documentation:** `AGENTS.md:28`, `CONTRIBUTING.md:43` and `ARCHITECTURE.md`'s mention of `readLastCatalogCache` become false. They belong to Bambadjan's docs pass, which never blocks (Michael §3(l)).
- **Untouched:** everything Michael §2 lists, including `src/config.ts`, `src/auth-storage.ts`, `src/oauth-login.ts`, the cache path and its per-call derivation, `resolveLocalModelSettingsPath`, and the `OMLX_MODEL_SETTINGS_PATH` default parameter.
- **Out of scope:** the restructure Joel plans to lead after these cards (owner-rulings §1).
