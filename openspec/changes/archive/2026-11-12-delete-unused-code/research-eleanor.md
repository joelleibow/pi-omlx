# Eleanor research — delete-unused-code

## Scope and baseline

Repository: `/Users/joelleibow/Projects/pi-omlx`, HEAD `0411d6a44217e272138b58ac6739aad3a81e45eb`. Scope: whole tracked tree (`index.ts`, `src/`, `test/`, `scripts/`, docs/specs and package metadata); the requested feature is the six-item dead-code audit in the brief. Read `AGENTS.md`, `ARCHITECTURE.md`, the binding owner rulings, `package.json`, and the sole ADR (title/summary below). No `CLAUDE.md` found. Baseline bare `npm run check`: passed (Biome 39 files, tsc, 12 test files/123 tests).

`git status --short` before report writing showed `?? .pi/` and `?? openspec/changes/delete-unused-code/` only. (This destination itself is inside the latter untracked directory.)

## Required project context

- `AGENTS.md`: `npm run check` is the gate; documents test isolation and explicitly says `src/catalog.ts:readLastCatalogCache` has no callers but is deliberately kept for a later change.
- `ARCHITECTURE.md`: entry point registers provider, polls catalog, wires stream wrapper; `src/` has catalog/provider/stream; tests in `test/`; docs and decisions in `docs/adr/`; specs in `openspec/specs/`. Cache stores fetched model list; overlay contributes display names, limits and thinking budgets. `/model` model identity/limits/thinking flow through provider conversion.
- `openspec/changes/delete-unused-code/owner-rulings.md`: accepted card is to remove unused catalog metadata/debug/dead branches after whole-tree reader check, preserve `/model` models, limits and thinking flags, pass `npm run check`; restructure is out of scope.
- ADR inventory: `docs/adr/0001-one-credential-decides-the-omlx-connection.md` — **One credential decides the OMLX connection** (Accepted). Summary: catalog and registration use one resolution; stored credential wins, environment is fallback, keyless registration clears inherited config. It does not address the candidate removals.
- `package.json`: ESM, Node >=22; scripts `check` = Biome + tsc + vitest; package `files` includes `index.ts`, `src`, README and LICENSE, not tests/scripts. Extension entry is `index.ts`.

## Actual map / entry points

Directories: `.pi/`, `docs/` (including `docs/adr/`, `docs/architecture/`), `openspec/` (`specs/`, `changes/`, `changes/archive/`), `scripts/`, `src/`, `test/` (`test/isolation/`). Relevant files: `index.ts`, `src/catalog.ts`, `src/provider.ts`, `src/stream.ts`, `src/smoke-model-selection.ts`, `scripts/smoke-live-omlx.ts`, `test/catalog.test.ts`, `test/provider.test.ts`, `test/stream.test.ts`, `test/index.test.ts`, `AGENTS.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `package.json`, living specs under `openspec/specs/`.

Entry points: `index.ts` is the extension entry; `scripts/smoke-live-omlx.ts` is a standalone live probe; `npm run check` covers source/tests/scripts but not execution of live probe. Feature path: catalog parsing and local overlay (`src/catalog.ts`) -> cache and registration (`index.ts`) -> provider model projection (`src/provider.ts`) -> stream wrapper (`src/stream.ts`); diagnostics are sent from catalog `onDebug` callback in `index.ts` to `src/debug.ts`.

## Findings by card item

Line references below are HEAD line numbers (`rg -n`/numbered source inspection). Whole-tree searches covered source, tests, scripts, package metadata, docs and living specs.

### (1) Catalog debug/events/helpers and hardcoded model checks

`index.ts:323-335` calls `fetchModels` with production `onDebug: event => omlxDebug(event.kind, event.details)`: catalog debug events are live when debug tracing is enabled (not unused). The catalog invokes it at these sites/payload shapes (`src/catalog.ts`):

- `198-205 catalog_status_loaded`: `{apiRoot, count, documenter: matching model object or undefined}`.
- `227-233 catalog_status_failed`: `{apiRoot, error}`.
- `244-247 catalog_models_loaded`: `{apiRoot, count}`.
- `400-407 catalog_local_settings_considered`: `{apiRoot, path, explicitPath, exists}`.
- `417-420 catalog_local_settings_read_failed`: `{path}`.
- `426-429 catalog_local_settings_invalid`: `{path, reason: "models object missing"}`.
- `437-441 catalog_local_model_settings_missing`: `{path, modelId}` only for `qwen3.6-8b-documenter` missing an entry.
- `476-487 catalog_local_model_settings_applied`: `{path, modelId, before, after, entrySummary}`.
- `295-300 catalog_global_settings_loaded`: `{apiRoot, defaults}`; `302-309 catalog_global_settings_failed`: `{apiRoot, error}`.

`applyLocalModelSettings` comparison at `src/catalog.ts:452-474` exists only to decide whether to emit the `..._applied` payload; it does not change the returned `next` or decide application. It compares all projected fields, including metadata and summary. `summarizeModelSettingsEntry` (`619-698`) and `compactObject` (`700-716`) are only used to construct that event's `entrySummary`; `settingsSummary` is assigned at line 563 and otherwise retained in the model object but is not consumed in production behavior, except the change comparison/event and tests. The two author-specific checks are: `fetchModels` event `documenter` lookup at 207, and missing-entry debug event at 437. No other `qwen3.6-8b-documenter` matches appeared beyond tests/fixture search results; they affect event content only. `test/catalog.test.ts:473-516` tests event names/order, including local-settings event presence; its assertions are debug-event coverage that removal would drop. Tests also assert `settingsSummary` output at 295 and 401 onward; deleting it entails deleting/changing those expectations. `CONTRIBUTING.md:43` documents the debug event list, including catalog events and local-settings events, so removals would stale that list. Living diagnostics spec (`openspec/specs/diagnostics/spec.md`) specifies tracing generally, not these catalog event names.

### (2) Parsed/cached metadata

Server parse site: `src/catalog.ts:97-174` (`parseModelsStatusResponse`). Overlay parse site: `src/catalog.ts:493-565` (`applyModelSettingsEntry`). The `OmlxModel` shape is at lines 7-33. Cache serializes the full filtered `OmlxModel[]` directly as `{apiRoot, models, savedAt}` at `src/catalog.ts:573-584`; `readCatalogCache` parses JSON and returns `data.models` without field validation (586-606). `index.ts:318-330` reads a cache, and `index.ts:349-355` writes only registrable live models. Thus existing caches can include all current optional model fields; extra properties in old cached JSON survive parsing and are tolerated by current consumers because access is selective/object-based. No schema/version migration is performed.

Field use classification (both parse pathways where available):

- `description`: parsed server 119-120 / local 502-503; not used in registration or production except debug event data, cache persistence and tests. `modelAlias`: 121-122 / 504-505, same.
- `taskBudgetTokens`: server status parser does not set it; local 522-523; not read by production, only debug summary/event/cache; tests include it.
- `maxToolResultTokens`: 139 / 524-525; no production reads; appears in summary/event/cache/tests.
- `thinkingBudgetTokens`: 141 / 526-527; no production reads; summary/event/cache/tests.
- `thinkingBudgetEnabled`: 143 / 528-529; no production reads; summary/event/cache/tests.
- `preserveThinking`: 145-147 / 532-536; no production reads; summary/event/cache/tests.
- `chatTemplateKwargs`: 126-127 / 498-512; beyond deriving `thinkingDefault`, it is included in summary/event/cache only; `preserve_thinking` also derives `preserveThinking`, itself unused outside summary/event/cache.
- `forcedCtKwargs`: 149-151 / 539-541; no production reads; summary/event/cache/tests.
- `isDefault`, `isPinned`, `trustRemoteCode`, `ttlSeconds`, `indexCacheFreq`, `activeProfileName`: parser at 153-170, overlay at 543-560; only summary/event/cache/tests, no production reads.

`thinkingDefault` is read in `index.ts:120-127` for active request thinking controls and in `src/provider.ts:59` to set registered model `reasoning`; preserve it. `contextWindow`, `maxTokens`, `displayName`, `modelType`, `archContextWindow`, and `reasoningParser` are independently used (provider projection or limit resolution); do not conflate these with the requested metadata. `src/provider.ts:53-69` projects id, name (`displayName ?? id`), reasoning, input type, cost, limits and compatibility; it does not spread `OmlxModel`, confirming the listed extra properties are not passed to `registerProvider`. The provider test at `test/provider.test.ts:91-112` explicitly checks selected OMLX-only fields are absent from registered model config. Slimming parser/cache means newly written cache lacks removed fields; old cache with extras still reads, though extras remain present in returned object unless explicitly stripped.

### (3) Non-OMLX stream pass-through

`src/stream.ts:183-220` contains the non-OMLX branch: it logs entry/bypass and delegates to imported concrete stream implementation. It is exercised by stream tests; the broad search locates all direct calls in `test/stream.test.ts:195-359`. This is live code if the installed Pi dispatcher can route other OpenAI-compatible providers to the wrapper; the brief's claim about Pi 1.5.2 dispatch behavior is external Pi behavior and is not verified by this repository reconnaissance. Do not infer branch deadness from repo-only searches. Removing it removes test coverage of pass-through and risks affecting providers sharing this API id. `CONTRIBUTING.md:43` names `stream_simple_bypassed`; stream code logs it at `src/stream.ts:198-202`.

### (4) Small pieces

- `readLastCatalogCache`: exported at `src/catalog.ts:586`; no callers anywhere in tree; explicitly reserved in `AGENTS.md:28` and `ARCHITECTURE.md` §9. It is deliberate future-facing code, not accidentally unreferenced. No test call found.
- `applyStoredCredentialToEnv`: brief identifies test-only. Search results did not appear under its literal in capped initial search; exact whole-tree follow-up is needed before deleting. `test/index.test.ts` is the likely test location; disposition remains unverified at this evidence level.
- `toProviderConfig` `onStreamTimeout`: parameter `src/provider.ts:21-25`, forwarded into stream handler lines 35-42. `index.ts:219-227` always passes `undefined`; provider tests call it without callback. The parameter is a supported internal hook in the stream code; no production callback caller exists.
- `state.lastRefreshAt` and `state.modelSettingsPath`: declared/initialized `index.ts:43-44,61-62`, written `232-233,284-285`; whole-tree match shows no reads. `modelSettingsPath` local argument separately goes to the overlay fetch and must not be mistaken for the unused state property.
- `src/smoke-model-selection.ts`: imported by `scripts/smoke-live-omlx.ts` (line 6); no production import. It is script-only, but it is inside `src` and package `files` includes all `src`, so ships. The script uses `scripts/` but is excluded by package `files`.

### (5) Singleton guard

`index.ts:29-30,52-54,96` uses global symbol guard, returns on duplicate, and deletes on session shutdown. This is production behavior, but repo has no test of duplicate extension installation found by search. Whether project-local plus global install triggers duplicate load and what Pi does in that case is a host-runtime question; unmeasured/unverified here. Removal would remove idempotence protection and has no direct test loss because none was found.

### (6) Stale test comment/import

`test/index.test.ts:99-101` is cited by the card. The current comment and import should be checked against numbered lines before editing; no cleanup performed. This is test-only; deleting a stale comment itself removes no behavior/test assertion. The late import may be justified by module initialization/test environment constraints, so do not remove it on line-number-history alone.

## Living docs/specs mentioning the targets

`CONTRIBUTING.md:43` lists stream/catalog diagnostics and is the concrete doc requiring synchronization if event kinds disappear. `AGENTS.md:28` and `ARCHITECTURE.md` §9 explicitly preserve `readLastCatalogCache`. `openspec/specs/diagnostics/spec.md` describes debug enablement/prefix and does not enumerate catalog events. Other living specs found by targeted search do not mention the candidate metadata/functions. No edit to specs/docs is implied by this research.

## Questions / residual uncertainties

1. Pi 1.5.2's API-id dispatch and duplicate-extension behavior are not established by repository evidence; requested external verification belongs to Chidi/Conductor, not this report.
2. Exact `applyStoredCredentialToEnv` usage and exact stale comment/import lines need focused confirmation before decisions; this report does not claim an absence from all matches on those two points.
3. Acceptance's interactive `/model` parity cannot be proven by `npm run check`; baseline establishes only repository checks. No modifications were made to source or config.
