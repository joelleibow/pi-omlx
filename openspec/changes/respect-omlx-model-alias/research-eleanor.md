# Eleanor Research — Respect OMLX Model Alias

## Scope and method

Repository: `/Users/joelleibow/Projects/pi-omlx`, existing project on `main`. The inspected working tree reported `## main...origin/main`; there were untracked `.pi/` and `openspec/changes/respect-omlx-model-alias/` paths at inspection time. Scope is the model catalog discovery/overlay/provider registration flow, living specs, tests, and locally available git evidence. This report records observed behavior, not a design recommendation or workflow disposition. External Pi/OMLX contract questions are left to Chidi.

## Required reads

- Instructions: `AGENTS.md` read. No `CLAUDE.md` was found. `AGENTS.md` identifies `ARCHITECTURE.md`, `docs/adr/`, and the standard check/typecheck/test commands; it also specifies fixture/environment isolation constraints.
- Architecture: `ARCHITECTURE.md` read. It describes a Pi extension with one native provider, Pi-managed catalog storage, catalog metadata overlay and no extension-owned catalog cache.
- ADRs: `docs/adr/` contains and both files were read for titles and summaries:
  - `docs/adr/0001-one-credential-decides-the-omlx-connection.md` — **One credential decides the OMLX connection**; status Superseded. Originally fixed stored-login precedence over environment for URL/key, to keep catalog and chat aimed at one server.
  - `docs/adr/0002-the-credential-resolution-runs-in-pi-hooks.md` — **The credential resolution runs in Pi's hooks**; status Accepted. Credential resolution occurs in Pi `check`/`resolve`; refresh uses the credential Pi supplies.
- Language/build configuration: `package.json`, `tsconfig.json`, and `biome.json` read. TypeScript ESM, Node >=22; scripts include Biome + `tsc --noEmit` + Vitest in `npm run check`; strict TS, ES2022 target, bundler resolution, no emit.
- Change inputs: `plan-context.md` says standalone bug fix, no larger plan/ticket. `owner-rulings.md` records desired behavior as aliases in OMLX being preferred references and the observed failure for `/model`/settings defaults.

## Living specs read

- `openspec/specs/catalog-discovery/spec.md`: refresh hook owns fetch timing; offline restore/network refresh phases; publish through Pi model store; preserve old state on failure; filter models requiring positive context/output limits; extension does not choose session model.
- `openspec/specs/provider-access/spec.md`: provider/credential ID is `omlx`, from `PROVIDER_KEY`.
- `openspec/specs/environment-configuration/spec.md`: extension environment comes from process, not a dotenv file.
- `openspec/specs/diagnostics/spec.md`: `PI_OMLX_DEBUG`, `[pi-omlx]` diagnostics.
- `openspec/specs/test-isolation/spec.md`: tests isolate HOME, Pi agent dir, overlay and caller environment under per-run root.
- `openspec/specs/verification/spec.md`: `npm run check`, aligned Pi dependency, no suppression comments, bare safe verification.
- Also read `openspec/specs/credential-resolution/spec.md` to understand how refresh gets its connection credential. Other living specs present are `native-login` and `package-identity`; they are outside the alias path examined.

## Structure map

- Root entry point: `index.ts`.
- `src/`: `auth-storage.ts`, `catalog.ts`, `config.ts`, `debug.ts`, `login.ts`, `notice.ts`, `overflow.ts`, `pricing.ts`, `provider.ts`, `repeat-stop.ts`, `stream-events.ts`, `stream-writer.ts`, `stream.ts`, `thinking-format.ts`, `thinking.ts`.
- `test/`: suites corresponding to these modules plus `refresh.test.ts`; `test/isolation/` has global setup, worker setup, guard and guard test.
- Specs: `openspec/specs/{catalog-discovery,credential-resolution,diagnostics,environment-configuration,native-login,package-identity,provider-access,test-isolation,verification}/spec.md`.
- Relevant other files: `docs/CONFIGURATION.md`, `scripts/debug-omlx.ts`, `vitest.config.ts`, `AGENTS.md`, `ARCHITECTURE.md`.
- Main path: Pi loads `index.ts` -> `createOmlxProvider()` in `src/provider.ts` -> `refreshOmlxCatalog()` in `src/catalog.ts` -> parse/status or fallback models, apply local settings and defaults, filter, map into Pi models and publish/update Pi's model store/provider list. Requests dispatch through `src/provider.ts` stream handlers; `index.ts` reads the provider's own list for thinking behavior and logs selected model IDs.

## Catalog discovery and name/ID semantics observed in code

### Fetch ordering and fallback

`fetchModels()` in `src/catalog.ts` first GETs `${apiRoot}/models/status` (with `Authorization: Bearer <key>`). A successful response must have a `models` array and is parsed by `parseModelsStatusResponse()`. For any non-abort error—including HTTP, parse/shape error or fetch error—it emits a debug failure event and falls through to `/models`. Abort is rethrown rather than triggering fallback. `/models` must have a `data` array and is parsed by `parseModelsResponse()`; this endpoint path is the fallback for servers without usable status endpoint.

Status parsing deduplicates by `id`, ignores entries without nonempty string `id`, and extracts `display_name`, context/output limits, thinking controls, parser and model type. `/models` also deduplicates on `id`, ignores missing/empty IDs, and currently extracts `max_model_len` as an architectural context ceiling. Neither parser recognizes or uses a model alias in the current source.

### `~/.omlx/model_settings.json` overlay

After either endpoint is parsed, `applyLocalModelSettings()` reads the configured `OMLX_MODEL_SETTINGS_PATH` or defaults to `join(homedir(), '.omlx', 'model_settings.json')`. It expects a root `models` object, then matches settings by exact `byModel[model.id]`. It does not search by `display_name` or `model_alias`.

For a matching entry, fields are applied in this order after endpoint-derived metadata: nonblank `display_name`; `enable_thinking`, or nested `chat_template_kwargs.enable_thinking` only if top-level `enable_thinking` was not boolean; `max_context_window`; `max_tokens`; nonblank `reasoning_parser`; string `model_type_override` lowercased. These model-specific values override status endpoint values for the same fields. An entry with `model_alias` alone does not change the model identity or exposed display name.

If at least one model misses context or max-output limit, `applyApiGlobalDefaultsIfNeeded()` attempts `/admin/api/global-settings` (root strips terminal `/v1`) and fills only missing `sampling.max_context_window` / `sampling.max_tokens`, never overwriting model-specific values. Then `resolveArchContextLimits()` uses `/models`'s `max_model_len` as context fallback and clamps context values above the architecture ceiling. Finally `registrableModels()` retains only positive context and max-token models.

### Pi model mapping and refresh/storage

`toProviderModel()` creates a Pi `Model<'openai-completions'>`:

- `id: m.id` (raw parsed endpoint ID)
- `name: m.displayName ?? m.id`
- `provider: PROVIDER_KEY` (`omlx`), `api: 'openai-completions'`, `baseUrl` from resolved credential
- `reasoning` true only if `thinkingDefault === true`; `input` includes text/image only for `modelType === 'vlm'`
- free cost, positive `contextWindow`/`maxTokens`, compatibility flags and optional thinking format based on reasoning parser.

No `model_alias` / `modelAlias` value is part of `OmlxModel` or the returned Pi model. Thus current exposed selector identity is raw `id`; display label is `display_name`/overlay display name. `id` also remains the request model identifier as far as this extension's model object goes; external SDK wire semantics are Chidi's scope.

Pi invokes `refreshModels`. On offline phase the extension publishes the stored models after filtering to chat/openai-completions types, with no fetch. In network phase it consumes `context.credential`, fetches and maps catalog, then calls `context.publish({persist, update})`; update swaps the provider's in-memory `models`. No extension catalog cache is used. Refresh errors/no registrable models throw without replacing the published list/store.

### Other consumers / diagnostics

- `index.ts`: `model_select` and `before_provider_request` diagnostics use `event.model.id` / `ctx.model.id`; thinking settings find matching model in provider list by ID. Startup notice counts provider models but does not inspect name/alias.
- `src/catalog.ts`: overlay lookup and debug events identify models by `model.id`; no alias reads.
- `src/provider.ts`: model list originates from refresh; `getModels()` exposes it.
- `src/stream.ts` and `src/stream-events.ts`: debug/error/stream event metadata references `model.id`, not alias.
- `scripts/debug-omlx.ts` lists `model_alias` among fields it prints from local settings, but it is a filesystem diagnostic script, not the catalog or registration implementation. It treats settings keys as model names/paths.
- `docs/CONFIGURATION.md` documents overlay fields; current production projection does not include `model_alias`.

## Tests and assumptions

`test/catalog.test.ts` covers ID parsing, deduplication, `display_name` and limits in status responses, limits from `/models`, status-first/fallback behavior, overlay projection and precedence, global defaults/arch limit handling, and mapping display name to Pi `name` while preserving raw `id`.

A full overlay fixture includes `model_alias: "vision"`, but asserts only `displayName`, thinking, limits, parser and type; it does not assert alias recognition. This fixture assumes the settings key `vision-lane` matches raw model `id: "vision-lane"`, while alias is merely a present unused input. Existing tests do not exercise alias as a lookup key, returned model ID/name, `/model` selector, default-model config, collision, blank alias, or request behavior. Existing status parser test does cover `display_name: "Reasoning Model"` and confirms it maps to presentation metadata. `test/refresh.test.ts` and `test/provider.test.ts` exercise refresh/publication/provider behavior; no test found asserts alias semantics.

`docs/adr/0001`/`0002` titles and status/summaries are listed above; no ADR directly addresses aliases.

## Git evidence: alias-related changes

Local object/history evidence available in this clone:

- `cb235bc` — **Map OMLX settings into Pi metadata and improve recovery**. Historical upstream-era commit. Later history shows this included mapping metadata including `model_alias` into the old model structure and corresponding tests; exact full patch was not separately examined here. This is the earlier alias-related code lineage.
- `c1676b2` — **Delete unused catalog metadata, debug code and dead branches (#12)**. Its actual patch removed `modelAlias` from `OmlxModel`, removed `model_alias` from the status response parse and local settings projection, and deleted tests asserting that metadata was projected. The commit message/body states only fields with production readers remained. Present source has that deletion: only `display_name` remains as presentation metadata.
- `e9aba43` — **Adopt pi's native API-key login and catalog lifecycle (#14)**. Its catalog changes replaced extension-owned cache handling with Pi refresh/publish lifecycle, converted catalog model to Pi model, and kept `id` as `id`, `displayName ?? id` as `name`; it did not reintroduce alias mapping. PR #14 is a large native provider/catalog lifecycle change, not an alias fix.

`git log --all --grep` found those alias-named/history candidates; current branches include origin and upstream main. `git log -S'model_alias'` in reachable `upstream/main` and `origin/main` found `cb235bc` and `c1676b2`. The local clone does not establish whether any additional upstream PR/commit outside fetched refs exists. The current checkout's source history contains no model alias handling. The exact upstream PR identity/patch for `cb235bc` was not independently verified beyond its commit subject and search history.

## Unknowns and residual research boundaries

- External OMLX behavior remains unverified here: whether `/v1/models` changes `id` to alias, whether status has an alias field, alias collision/blank semantics, accepted request model values, and `model_settings.json` canonical key semantics. Chidi is assigned these external facts.
- Pi model picker/default-setting resolution and SDK request serialization are not inspected beyond the extension's Pi model object construction; consult Chidi for host/SDK behavior.
- Git evidence is limited to commit objects and refs fetched into this clone; no live GitHub PR review/API was performed. In particular, no specific PR #12/#14 alias-specific change exists in the inspected patches; #12 removed alias metadata, #14 introduced the current lifecycle.
