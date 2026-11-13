# Proposal

## Why

Joel's 2026-11-11 triage put the unused catalog metadata, debug-only code, dead branches and unused pieces into one change, and set its acceptance: each piece goes after a whole-tree grep shows no other reader, `npm run check` stays green, and `/model` shows the same models with the same limits and thinking flags as before (owner-rulings §1). He ran the card on 2026-11-12 (§2). At HEAD `0411d6a` the tree still parses, caches and summarizes catalog fields nothing reads, traces an event that exists for one author's model id, carries a stream branch pi 1.5.2 cannot reach (Chidi Q1), and guards against a second install that Joel decided to let run (§3). The change closes no live collision risk: `toProviderModel` already builds an explicit object, so the extra model attributes Joel quoted never reach pi (Michael §3(k)). The council's settled answers are in `council.md`.

## What Changes

- **Catalog metadata.** The parse, the overlay and the cache stop carrying every field with no production reader: description and alias, the budget and thinking metadata, the pin, default, trust, ttl, index-cache and profile fields, `settingsSummary`, and the cache's `savedAt`. `summarizeModelSettingsEntry` and `compactObject` go with the field that used them. The `chatTemplateKwargs` field goes while both parsers keep their own `enable_thinking` reads, because neither derivation ever reads the field (`council.md` #7). The design carries the field list once. Eleanor §2 measured each field's readers; Michael §2 lists the fields that stay.
- **Catalog debug events.** The `qwen3.6-8b-documenter` literals, `catalog_local_model_settings_missing` and the `documenter` key of `catalog_status_loaded` go, with no generic `missing` event in their place. The applied event keeps one whole-object comparison, `JSON.stringify(next) !== JSON.stringify(model)`, with `entrySummary` out of the payload, and one new test proves that an entry carrying only keys the overlay no longer reads emits no `applied` event (`council.md` #2, #3).
- **Cache.** No version, migration or stripping. A cache written before this change still reads, because the only readers pick fields explicitly, and the next successful fetch overwrites it (Michael §3(d), `council.md` #1).
- **`readLastCatalogCache`.** Deleted. Michael ruled it deferred to this card, and `AGENTS.md:28` and `ARCHITECTURE.md` §9 both say it was kept for a later change.
- **Stream pass-through.** The non-omlx branch goes with `isOmlx`, `stream_simple_bypassed`, its `PROVIDER_KEY` import and its test: pi 1.5.2 dispatches `streamSimple` by `model.provider`, so no model from another provider enters the wrapper (Chidi Q1; Michael §3(h)). The comment above the branch is deleted with it, and the header comment's recursion paragraph is rewritten to the per-provider fact with a `shortcut:` naming pi 1.5.2 and the `"*"` peer range. The jiti subpath note stays (`council.md` #5).
- **Stream timeout chain.** `toProviderConfig`'s fourth parameter, `streamOmlxOpenAICompletions`'s `onTimeout`, `runAttempt`'s `onTimeout`, `OnStreamTimeout` and `StreamTimeoutEvent` are deleted: every caller passes `undefined` (Michael §3(f)). `resolveFirstDeltaTimeoutMs()` stays, because production reads it.
- **Unread state.** `state.modelSettingsPath` goes with the parameter that carries it, and `state.lastRefreshAt` goes with its writes. `state.lastError` stays, because something reads it (Michael §3(g)).
- **Scripts.** `src/smoke-model-selection.ts` moves to `scripts/`, so the package stops shipping a probe that only a script imports (Michael §3(i)).
- **A stale test comment.** The late import at `test/index.test.ts:99-101` moves into the import block and its comment goes: the spec lines it cites do not exist, and ESM hoists static imports, so the placement never had a runtime effect (`council.md` #11).
- **BREAKING: the singleton guard.** The guard in `index.ts`, its `Symbol.for("pi-omlx/loaded")` key and the `session_shutdown` clear are deleted (owner-rulings §3). A second copy of the extension in one process now runs like any other pi extension. Pi merges its `omlx` registration over the first, so the later copy's catalog and handler win, and the process polls twice and can warn twice (Chidi Q2). Joel's setup has one install, so nothing he runs changes (Michael §4). The change arrives red-first: a test loads the extension twice in one process and expects two registrations, red at HEAD and green once the guard goes (`council.md` #8).

Already done, and no task follows from it: `applyStoredCredentialToEnv` is not in the tree (Michael §3(a)).

## Capabilities

### New Capabilities

None. No requirement describes behavior this change adds.

### Modified Capabilities

- `test-isolation`: MODIFIED under the requirement's existing heading, with its text and its scenarios as they are and a load-twice scenario with no shutdown first added beside them. The added scenario is what proves the guard's deletion. The substitution `council.md` #9 asks for cannot be written: the tooling refuses a MODIFIED block that drops a living scenario, and the new heading it would take instead is the option that ruling rejects. `council.md` #9 records the note.
- `package-identity`: MODIFIED. The requirement's second sentence enumerates the artifacts the old-token grep covers, and two of those nouns are gone after this change: `pickerDebug` at HEAD, and the singleton key here. The sentence goes; the grep and its scenarios stay (`council.md` #10).

Read, and left out of the delta:

- `catalog-discovery`: every registered model keeps its identity, its limits and its reasoning flag, and every warning stays. `isDefault` and `isPinned` have no future home, because that spec forbids choosing the session's starting model (Michael §1).
- `diagnostics`: it fixes the predicate and the prefix, not the event set (Michael §1).
- `provider-access`, `credential-resolution`, `verification`, `environment-configuration`: the provider id, the single credential, the check and the environment's source are all untouched (Michael §2).

## Impact

- **Code:** `index.ts`, `src/catalog.ts`, `src/provider.ts`, `src/stream.ts`. `src/smoke-model-selection.ts` moves to `scripts/`.
- **Tests:** an assertion on a deleted field is deleted with the field, an assertion on a surviving field stays byte-identical, and `test/provider.test.ts`'s `OmlxModel` fixture narrows to the surviving OMLX-only fields so it still proves the projection does not spread (Michael §3(c)). The isolation guard and its lists do not move (Michael §2).
- **Proof for each deletion:** a recorded whole-tree search with no hit, `tsc` failing on any typed reader, and the surviving assertions unchanged. The status response's unused members go with their `OmlxModel` fields, because `tsc` does not flag an unused interface member. `npm pack --dry-run` proves the move leaves the tarball (`council.md` #12).
- **`/model` parity:** pi reads exactly the object `toProviderModel` builds, and this change leaves that object's keys alone. The surviving assertions prove it, and one measurement finishes the proof. That measurement is Joel's, marked his in the tasks: the same `toProviderConfig(...).models` dump taken before the first code commit, at a commit whose non-`openspec/` tree equals `0411d6a`, and again at the end (`council.md` #13). It is the acceptance sentence of owner-rulings §1.
- **Documentation:** `AGENTS.md:28`, `CONTRIBUTING.md:43` and `ARCHITECTURE.md`'s mention of `readLastCatalogCache` become false. They belong to Bambadjan's docs pass, which never blocks (Michael §3(l)).
- **Untouched:** everything Michael §2 lists, including `src/config.ts`, `src/auth-storage.ts`, `src/oauth-login.ts`, the cache path and its per-call derivation, `resolveLocalModelSettingsPath`, and the `OMLX_MODEL_SETTINGS_PATH` default parameter.
- **Out of scope:** the restructure Joel plans to lead after these cards (owner-rulings §1), and pinning the pi peer range, which is a packaging change for a later card (`council.md` #6).
