# Research — Pi model resolution and OMLX alias contract

Researcher: Chidi. Scope: documentation / installed-contract facts only. No design proposals.

## Versions examined
- Pi: global install `@earendil-works/pi-coding-agent` **1.6.0** (`/Users/joelleibow/.local/share/fnm/node-versions/v26.8.1/installation/lib/node_modules/@earendil-works/pi-coding-agent/`), plus repo devDependency **1.5.2** (`/Users/joelleibow/Projects/pi-omlx/node_modules/@earendil-works/pi-coding-agent`). `dist/core/model-resolver.js` and `dist/modes/interactive/model-search.js` differ only in unrelated parts (default-model table, removed `restoreModelFromSession`/`resolveModelScope` helpers in 1.6.0); the matching logic is the same in both.
- `@earendil-works/pi-ai` bundled with Pi (`node_modules/@earendil-works/pi-ai/dist/…`).
- OMLX: installed Homebrew **0.8.2** (`/opt/homebrew/Cellar/omlx/0.8.2/libexec/lib/python3.11/site-packages/omlx`), upstream `jundot/omlx` main checkout (`omlx/_version.py` = 0.8.3, commit 1cd5aaa), and the live local server at `localhost:8000` (checked with the local API key; key not recorded here).

## 1. Pi

### 1.1 No alias field exists
- `Model`/`BaseModel` (`pi-ai/dist/types.d.ts`, ~L647-683) has `id`, `name`, `api`, `provider`, `baseUrl`, `input`, `cost`, `headers`, `reasoning`, `contextWindow`, `maxTokens`, `compat`, etc. **No alias property.**
- `ProviderModelConfigBase` (`dist/core/extensions/types.d.ts` L1512-1529): `id` ("Model ID"), `name` ("Display name"), `api`, `baseUrl`, `input`, `inputLimits`, `cost`, `headers`. Chat adds `reasoning`, `thinkingLevelMap`, `promptCache`, `contextWindow`, `maxTokens`, `samplingParams`, `compat`. **No alias property.**
- `docs/models-configuration.md` L33, L65: `name` is "Display name, also matched by --model patterns."

### 1.2 Matching rules (`dist/core/model-resolver.js`)
Exact (`selectReference`, L~107-135): `model.id.toLowerCase() === text.toLowerCase()` (bare id), or `provider/<id>` where the provider prefix is a known provider id (longest match first) and rest equals `model.id` case-insensitively. **`name` is never consulted in the exact path.**
Fuzzy (`fuzzyMatches`, L~137): `model.id.toLowerCase().includes(text) || model.name?.toLowerCase().includes(text)` — substring on id **or name**. Best match: prefer ids ending `-latest` or not ending in `-\d{8}`, then highest `id.localeCompare` (`bestFuzzyMatch`/`isAlias`, L~165-172). Same id on several providers → `ambiguous`.
Thinking suffix: trailing `:level` (`splitThinkingSuffix`) is stripped on lenient/strict modes.

Per entry point:

| Entry point | Code | Matches |
|---|---|---|
| `/model <arg>` | `interactive-mode.js` L2707 → `handleModelCommand` L4491 → `findExactModelMatch` L4513 → `findExactModelReferenceMatch` (`thinkingSuffix:"none", fuzzy:false`) | **Exact id only** (bare or `provider/id`). Searches scoped models if `enabledModels`/`--models` set, else available snapshot; refreshes catalogs (15 s) if not found in cache. On a hit: `session.setModel(model,{persist:false})`, status `Model: ${model.id}`. On a miss: opens selector pre-filled with the search term. |
| `/model` (no arg) selector | `components/model-selector.js` L233-235, `model-search.js` `getModelSelectorSearchText` | `fuzzyFilter` (pi-tui) over `"${provider} ${provider}/${id} ${provider} ${id} ${name}"`. So the **name is searchable** here; the row shows `id`, plus the name if `getDistinctModelName` says it adds words not in the id; detail line shows `Model Name: ${name}`. Selecting yields the `Model` object (id sent later). |
| `settings.json` `defaultProvider`/`defaultModel` | `findInitialModel` (model-resolver.js L~379-414) → `modelRuntime.getModel(defaultProvider, defaultModelId)` → `Models.getModel` = `getModels(provider).find(m => m.id === id)` (`pi-ai/dist/models.js` L121-123) | **Strict case-sensitive `id` equality.** No name, no fuzzy. If not found (or no auth) falls through to step 3: first available model (known-provider defaults, else first available) with no warning from this function. `docs/settings.md` L14: "`defaultModel` – Startup model ID." Per-model thinking level key is `"${defaultProvider}/${defaultModelId}"`. |
| `--model <pattern>` / `--provider` | `resolveCliModel` (L~331-395) → `resolveModelReference({thinkingSuffix:"strict", fuzzy:true})` | Exact id / `provider/id`, then fuzzy id-or-name substring. If nothing matches and a provider is known (via `--provider` or `provider/` prefix), builds a **fallback custom model** (`buildFallbackModel`: clone of provider's default/first model with `id` and `name` = the typed text) with warning `Model "…" not found for provider "…". Using custom model id.` (so an alias typed here would be sent on the wire as-is). Otherwise error `Model "…" not found`. |
| `enabledModels` / `--models` | `resolveModelScopeFromModels` (L~230-295) | Globs (`*?[`) matched with minimatch against `provider/id` and `id` only (not name). Non-glob patterns: `resolveModelReference({thinkingSuffix:"lenient", fuzzy:true})` → exact id then fuzzy id-or-name. No match → warning `No models match pattern "…"`. `docs/cli.md` L74: "accepts exact IDs, fuzzy matches, case-insensitive globs, and optional :<thinking> suffixes." `docs/settings.md` L18: `enabledModels` "Model patterns… same format as --models". |
| Startup with `--models`/`enabledModels` and no CLI model | `buildSessionOptions` (bundle chunk) | Uses the saved default if `getModel(savedProvider, savedModelId)` is in scope, else `scopedModels[0]`. |
| Session model restore | `agent-session.js` L323-345: `getModel(recorded.provider, recorded.modelId)` (1.5.2: `restoreModelFromSession` → `modelRuntime.getModel`) | Exact `id` equality; missing → fallback with message `Could not restore model …`. |

Conclusion for Q1a: **Pi matches `model.id` (exact paths) and, only on fuzzy/search paths, `model.name`. There is no alias field.** `/model <arg>` exact path and `defaultModel` never match `name`.

### 1.3 Provider registration, refresh, and persistence
- `pi.registerProvider(name, config)` → `ModelRegistry.registerProvider` → `ModelRuntime.registerProvider` (`model-runtime.js` L672-690): validates, merges defined fields over any previous registration for that provider, recomposes, updates the snapshot synchronously, and triggers `refresh({allowNetwork:false})`. `unregisterProvider` removes it and restores built-ins. `docs/custom-provider.md`: "Calls made after initial extension loading take effect immediately"; supplying `models` "replaces that provider's models"; `models` on re-registration "replaces all existing models for this provider" (types.d.ts L1488).
- Legacy `ProviderConfig.refreshModels` (types.d.ts L1488-1493; `provider-composer.js` L402-425): "The returned list replaces extension-provided models." In the composer the returned list is installed through `context.publish({ update })` (in-memory). The doc comment mentions `context.publish({ persist: entry })` for a catalog "that should persist across sessions"; the composer code shown does not pass `persist` itself, so a legacy refresh result is live in-memory unless an implementation publishes persistence separately (I did not trace the native-`Provider` persistence path further).
- Persistence store: `FileModelsStore` writes `models-store.json` in the agent dir, keyed by provider id (`models-store.js`). `models.json` is separate user config (reloaded when `/model` opens; `models` entries "add or replace a model with the same ID"; `modelOverrides` keyed by model **ID**, unknown ids ignored — `docs/models.md`, `models-configuration.md` L61).
- Effect of changing `id` vs `name` between refreshes: identity everywhere (`getModel`, `modelsAreEqual` in scope dedupe, session records, per-model thinking-level keys `provider/id`, default-model settings, `modelOverrides`) is the **id**. Changing only `name` leaves every saved reference resolving; changing `id` makes saved `defaultModel`, session-recorded model, `enabledModels` exact entries and `modelOverrides` keys stop resolving (defaults silently fall through to another available model; session restore emits a fallback message; scope patterns emit `no-match`). This is derived from the code paths above, not from an explicit doc statement.

### 1.4 Wire `model` field
- `pi-ai/dist/api/openai-completions.js` L564: `params = { model: model.id, messages, stream: true, … }`; L161 sets assistant output `model: model.id`.
- `pi-ai/dist/api/openai-responses.js` L260: `model: model.id` (request params), L120 output.
- So `model.id` is sent **verbatim**; `name` is never sent. (`docs/custom-provider.md` also notes `options.onPayload` can replace the payload.)

## 2. OMLX alias contract (upstream source, 0.8.2 installed behaves identically for these paths; live-verified on 0.8.2 server)

Sources: `omlx/model_settings.py`, `omlx/server.py`, `omlx/engine_pool.py`, `omlx/admin/routes.py`, README "Per-Model Settings".

| Question | Answer |
|---|---|
| Documented | README: "**Model alias**: set a custom API-visible name. `/v1/models` returns the alias, and requests accept both the alias and directory name." |
| `GET /v1/models` `id` | `server.py` ~L3820-3850: `display_id = model_id; if settings_manager: ms = get_settings(model_id); if ms.model_alias: display_id = ms.model_alias`; emitted as `ModelInfo(id=display_id, owned_by="omlx", model_type, max_model_len)`. **Alias replaces the id when set; raw id (directory name) otherwise.** Raw id is not listed separately. Hidden/helper/unservable models are omitted. Exposed profiles add extra ids `<model>:<profile>` (`<alias>:<profile>` when the base has an alias). Items: `id, object, created, owned_by, model_type, max_model_len` (live). |
| `GET /v1/models/status` | `server.py` ~L3960-4000: each entry's `id` is the **raw** model id (directory name); `model_alias` is added only when the base model has an alias (`if base_ms and base_ms.model_alias and source_model_id == model_id`), i.e. **key absent when unset** (not null) and absent on exposed-profile entries. Also `max_context_window`, `max_tokens`, `reasoning_levels`, `is_favorite`, `is_hidden`, `model_type`, `loaded`, … `display_name` key exists (null in live data). Live sample: `{"id":"Qwen3.6-35B-A3B-4bit","model_alias":"Qwen3.6-4bit","display_name":null,"loaded":true,…}`. |
| `model_settings.json` | `~/.omlx/model_settings.json` = `{"version":2,"models":{ "<raw model id / directory name>": {… "model_alias": "…" …}}}` (`ModelSettingsManager._save`, model_settings.py L985-995; live file confirms). **Keyed by raw id; alias is a field value** (`Optional[str]`, default `None`, L470). |
| Request model accepted | `EnginePool.resolve_model_id` (engine_pool.py ~L2031-2115): order = (1) exact raw id in entries, (2) case-insensitive raw id, (3) active cluster deployment ids, (4) exposed-profile ids, (5) any `ms.model_alias == input` (exact, case-sensitive; first hit in settings iteration), (6) Claude tier aliases, (7) if input contains `/`, strip first segment (provider prefix) and retry 2/5/6. Falls back to returning input unchanged → not-found. **Both alias and raw id accepted.** Used by `/v1/chat/completions`, `/v1/completions`, `/v1/responses` (`get_engine_for_model` → `_pool_resolve_model_id`), `/v1/messages`, embeddings, rerank, etc. Live check: `Qwen3.6-4bit` (alias) and `Qwen3.6-35B-A3B-4bit` (raw) both returned HTTP-OK completions for the same model; `nonexistent-x` → `not_found_error` "Model 'nonexistent-x' not found. Available models: Qwen3.8-pi-MLX-4bit, ThinkingCap-Qwen3.8-MLX-4bit, Qwen3.6-4bit" (error list uses aliases). Response `model` echoes what was sent. |
| Duplicate alias | Prevented on write: `admin/routes.py` L3126-3150 rejects with HTTP 400 `Alias 'X' is already used by model 'Y'`, rejects an alias equal to another model's directory name (`conflicts with model directory name`), and rejects conflicts with exposed-profile ids. Hand-edited `model_settings.json` is not validated by this path; at request time `resolve_model_id` returns the first settings match; `/v1/models` would list both. (Latter two inferred from code.) |
| Blank/null alias | Admin update: `alias.strip()`; empty string → `None`. `None` ⇒ no alias, raw id is displayed (`if ms.model_alias:` falsy check also treats `""` as unset in `/v1/models`, `/v1/models/status`, `resolve_model_id`). |
| Where alias is also used | CLI integrations (`omlx launch codex/copilot`) use `models_status_map[...]["model_alias"] or model_id` as the model name to give clients (`integrations/codex.py` L201, `copilot.py` L53/190; `integrations/base.py` L49, L77; `cli.py` L572 maps both id and alias to status). |

## 3. Differences from likely assumptions
- Pi has **no alias concept**; `name` is display-only plus fuzzy/search matching. `/model <arg>` direct-set and `defaultModel` are id-only, so an alias that exists only as `name` will not resolve there (selector/`--model`/`enabledModels` fuzzy paths do consult `name`).
- OMLX `/v1/models` lists **alias in place of the raw id**; `/v1/models/status` keeps the raw id as `id` and gives the alias separately. A client that builds Pi ids from `/v1/models` already sees aliases; one that builds from `/v1/models/status.id` sees raw ids (which OMLX still accepts on requests). Which source `pi-omlx` uses was not examined here (Eleanor's scope).
- OMLX accepts both alias and raw id on requests, so either value sent on the wire works.
- Pi's `--model` with an unmatched provider-qualified value silently becomes a custom model id (with a warning) rather than erroring.

## 4. Gaps / unverified
- Did not run Pi interactively to confirm UI strings; conclusions are from installed source and docs.
- `persist` behavior for legacy `refreshModels` results was only partially traced (see 1.3).
- OMLX behavior with duplicate aliases in a hand-edited settings file, and `/v1/responses` end-to-end with an alias, were read from code (responses routes through the same `resolve_model_id`) but not exercised live; chat completions were exercised live.
- Installed OMLX is 0.8.2 while upstream main is 0.8.3; alias code paths read in both match, but I did not diff the full trees.
