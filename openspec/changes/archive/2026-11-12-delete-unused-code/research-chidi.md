# Research (Chidi): pi 1.5.2 facts for `delete-unused-code`

Facts only, no design. Repo HEAD `0411d6a`. Pi under test: `@earendil-works/pi-coding-agent` 1.5.2 (`pi --version` = 1.5.2; bundled `@earendil-works/pi-ai` 1.5.2). PI_DIR below = `/Users/joelleibow/.local/share/fnm/node-versions/v26.8.1/installation/lib/node_modules/@earendil-works/pi-coding-agent`.

## Q1. Does pi 1.5.2 dispatch `streamSimple` per provider?

**Yes.** Documented path, read in source:

1. Every request goes through `ModelRuntime.streamSimple(model, ctx, options)` (`PI_DIR/dist/core/model-runtime.js:504-529`). `prepareRequest` (line ~460) does `this.models.getProvider(model.provider)` and throws `Unknown provider` if absent. It then calls `prepared.provider.streamSimple(...)` (line 528). The lookup key is `model.provider` alone.
2. That provider object is built by `composeModelProvider` (`dist/core/provider-composer.js:349-435`). Its `streamWith` (lines 377-392) calls the extension's `streamSimple` only when `extension?.streamSimple && model.api === extension.api` (line 378). Otherwise it falls to the built-in provider (`base`) or to the global `getApiProvider(model.api)`. Both branches work on that provider's own models.
3. `registerProvider` (`model-runtime.js:672-690`) only stores the config in `extensionProviders` and recomposes provider `<id>`. Pi 1.5.2's `dist` (non-bundle) contains no call to `registerApiProvider`/`unregisterApiProviders`: `grep -rn "registerApiProvider" dist --include=*.js` outside `bundle/` returned nothing in the coding-agent code. An extension's `streamSimple` therefore is NOT installed into the shared per-api-id registry. The comment at `src/stream.ts:190-195` ("Pi dispatches stream handlers by api id, not provider ... replaces the shared entry") does not describe 1.5.2.
4. Docs agree: `PI_DIR/docs/extensions.md:1224` says `pi-ai/compat` streaming functions "cannot see extension provider registrations".

**Every route into the extension's `streamSimple` in 1.5.2** (all of them end at `provider.streamSimple` of the provider named by `model.provider`):
- `sdk.js:271` agent-loop `streamFn` → `modelRuntime.streamSimple(model, …)`.
- `ModelRegistry.streamSimple` / `ctx.modelRegistry.streamSimple` (`model-registry.js:74`) → `runtime.streamSimple`; also `completeSimple`.
- `cache-warmer.js:183` → `this.models.streamSimple(run.model, …)`.
- Virtual models (`model-runtime.js:510-523`): the route's chosen physical model is re-dispatched via `this.streamSimple(route.model, …)`, again by that model's own `provider`. `virtual-models.js:121` wraps the provider's `streamSimple` and returns `unroutedStream` for virtual models.
- Inside provider `omlx`, `streamWith` sends to the extension handler any model whose `api === "openai-completions"`. That includes `models.json` entries the user adds under provider `omlx`, because `applyModelsJson` merges them in (`provider-composer.js:177-185`). Those still have `provider === "omlx"`.

**Experiment (scratch, `HOME` and `PI_CODING_AGENT_DIR` set to scratch dirs):** a test extension registers provider `omlx` with `api:"openai-completions"` and a logging `streamSimple`. `models.json` in the scratch agent dir defines a second provider `other` (`api:"openai-completions"`, `baseUrl` `http://127.0.0.1:1/v1`, model `other-model`).
- `pi -p hi --model other/other-model` → "Connection error.: bad port"; `stream.log` was never created (extension handler not called).
- `pi -p hi --model omlx/model-A` → `streamSimple copy=A model=omlx/model-A` logged.

So no route sends a non-`omlx` model to the extension. The only way would be a third party calling the extension's function object directly.

Residual caveats:
- Peer dependency is `"*"` (`package.json`), so older pi builds are not covered by this evidence. Only 1.5.2 was read; I did not read pi's changelog or source for earlier versions, so I cannot say which version changed from by-api to by-provider dispatch.
- The bundled build (`dist/bundle/`) was not grepped for `registerApiProvider`. The installed `pi` binary's entry was not traced to say whether it runs `dist/*.js` or the bundle.

## Q2. Dual install

**Loading behaviour (read, then measured):**
- Packages are deduped by identity in `PackageManager.dedupePackages` (`dist/core/package-manager.js:1537-1556`). Identity (`getPackageIdentity`, 1517-1531): `npm:<name>`, `git:<host>/<path>` (ref ignored), or `local:<comparison key of the resolved path>`. Project beats user for the same identity. Different identities both load.
- Standalone extension discovery (`.pi/extensions/`, `<agentDir>/extensions/`) is deduped only by resolved path (`loader.js:676-685`).
- A project-scope package is read only after project trust (`docs/packages.md:21-23`; `package-manager.js:1568`). My scratch agent `settings.json` needed `"defaultProjectTrust":"always"`; without it the project package silently did not load.
- Pi has "extension conflict" diagnostics (`resource-loader.js:602`, `detectExtensionConflicts` at 989) for tools, commands and flags. Nothing there checks provider ids.

**Measurement** (scratch dirs under `.pi/marbleization/delete-unused-code/scratch-chidi/`; two copies of a package named `dualtest`, `extA` registering model `model-A` and `extB` registering `model-B`, both calling `pi.registerProvider("omlx", {api:"openai-completions", streamSimple, models:[...]})`; each factory appends a line to a log; run `pi --list-models omlx` with `PI_OFFLINE=1`):

| # | Setup | Factory runs | Result |
|---|---|---|---|
| S1 | global package `extB` + project package `extA` (different dirs), no guard | **2** (B first, then A), same pid 37250 | one `omlx` provider, only `model-A` listed (last registration wins). No error, no warning in output. |
| S2 | same as S1, with a `Symbol.for(...)` guard like `index.ts:52-54` | 2 factory calls; 2nd saw `guardSet=true` and returned | only `model-B` listed (first, global, wins). |
| S3 | same dir in both global and project settings | **1** | deduped (same `local:` identity). |
| S4 | project package = symlink to `extA`, global = real `extA` | **1** | symlink deduped (real path comparison). |
| S5 | project `.pi/extensions/loc/index.ts` copy + global package `extB` | **2** | `model-A` listed (project extension ran last). |
| S6 | S1 layout; `pi -p hi --model omlx/model-A` | — | the call reached copy A's `streamSimple` only (`stream.log`: `streamSimple copy=A model=omlx/model-A`). Copy B's handler was replaced. |

**Does `registerProvider("omlx")` twice collide?** No error. `ModelRuntime.registerProvider` (`model-runtime.js:672-690`) merges the new config over the previous one: "Re-registration merges defined values over the previous registration and preserves undefined ones" (line 679-684). The second call replaces `models` and `streamSimple` wholesale (both defined), so the last factory's catalog and handler win. Any key the second call leaves `undefined` keeps the first call's value.

**What the user sees:** no diagnostic in `--list-models` output; the `omlx` models are the last loaded copy's. I did not test the interactive TUI (`/model`, startup notices) with two copies.

**Related, not asked:** `index.ts:129-132` deletes the guard key on `session_shutdown`. Pi emits `session_shutdown` before a reload/new/resume/fork and then reloads and rebinds extensions (`docs/extensions.md` ~393, 512, 529), so in those cases the factory re-runs with the guard cleared. Whether the guard also fires when a *second* pi runtime (e.g. SDK use) shares the same process was not tested. The guard state is a `globalThis` Symbol, so it is shared across the two module copies, which S2 confirmed (each package copy loaded as its own module, yet `guardSet=true` was visible).

**Not tested:** `git:` or `npm:` sources (needs network install/clone; would dedupe by `git:host/path` / `npm:name` per code), and two different pi processes (not a "same process" case).

## Q3. Which fields does pi 1.5.2 read from a registered model?

**Provider-level** (`ProviderConfigInput`, `provider-composer.d.ts:49-60`; docs `extensions.md:2084-2096`): `name`, `baseUrl`, `apiKey`, `api`, `streamSimple`, `images`, `classifiers`, `headers`, `authHeader`, `oauth`, `models`, `refreshModels`. `streamSimple` requires `api` (`provider-composer.js:343-345`). `apiKey` is read by `composeApiKeyAuth`; `authHeader:true` without a resolved key throws (`withConfiguredAuth`, line 219-220). If neither an API-key nor oauth method results, composition throws (line 374-375). Repo passes (`src/provider.ts:27-43`): `baseUrl`, `api`, `authHeader`, `streamSimple`, `models`, `apiKey` (when not keyless); `index.ts` adds `oauth`.

**Model-level, as typed** (`ProviderChatModelConfig`, `d.ts:15-36`): required `id`, `name`, `input`, `cost`, `reasoning`, `contextWindow`, `maxTokens`; optional `api`, `baseUrl`, `headers`, `inputLimits`, `thinkingLevelMap`, `promptCache`, `samplingParams`, `samplingParamsByThinkingLevel`, `compat`, `type`.

**What the code does with a definition** (`extensionModelFromDefinition`, `provider-composer.js:132-149`): returns `{ ...definition, api, provider: providerId, baseUrl, headers: undefined }`. The whole definition object is spread onto the Model, so any extra key (typed or not) lands on the model object; pi does not filter. The extension's `toProviderModel` (`src/provider.ts:60-76`) builds a fresh 8-key object (`id, name, reasoning, input, cost, contextWindow, maxTokens, compat`); the unread catalog metadata (`description`, `isPinned`, and so on) lives on `OmlxModel` and is not forwarded. That matches Joel's concern at `owner-rulings.md` (extra attributes) only if such keys were added to `toProviderModel`; today none are.

**Missing required fields throw**: no `api` (line 135-138), no `baseUrl` (line 140-141). `modelFromJson` checks `contextWindow`/`maxTokens > 0` only for `models.json` definitions (lines 91-96). The extension's own `requirePositive` (`src/provider.ts:46-58`) is separate from pi.

**Fields the openai-completions adapter actually reads** (`PI_DIR/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js`, grep of `model.*` / `compat.*`): `model.id`, `provider`, `api`, `baseUrl`, `headers`, `input`, `maxTokens`, `reasoning`, `thinkingLevelMap`, `compat`. `compat.*` keys seen: `thinkingFormat` (11 reads), `supportsReasoningEffort`, `supportsDeveloperRole`, `maxTokensField`, `supportsLongCacheRetention`, `supportsUsageInStreaming`, `supportsStore`, `supportsStrictMode`, `requiresToolResultName`, `requiresAssistantAfterToolResult`, `requiresThinkingAsText`, `requiresReasoningContentOnAssistantMessages`, `requiresNonNullAssistantContent`, `requiresToolsWithToolHistory`, `supportsFinishReason`, `supportsMidConvoSystemMessages`, `supportsMidConvoToolAdditions`, `supportsOpenAIGrammarTools`, `supportsThinkingTokenBudget`, `thinkingTokenBudgetField`, `cacheControlFormat`, `sendSessionAffinityHeaders`, `sessionAffinityFormat`, `promptCacheKeyMode`, `chatTemplateKwargs`, `chatTemplateArgs`, `openRouterRouting`, `vercelGatewayRouting`, `vllmPriority`, `zaiToolStream`.
- Note: pi reads **`compat.chatTemplateKwargs`** and **`compat.chatTemplateArgs`**; `mergeCompat` (line 16-22) also deep-merges both. The card's metadata name `chatTemplateKwargs` is a field on the extension's `OmlxModel`, not a key the extension sends in `compat` (`src/provider.ts:70-72` sends `thinkingFormat` only).
- `/model` / `--list-models` columns (context, max-out, thinking, images) come from `contextWindow`, `maxTokens`, `reasoning`, `input` containing `"image"` (observed in scratch output: `1K 100 no no` for `contextWindow:1000, maxTokens:100, reasoning:false, input:["text"]`). I did not enumerate pi's every other reader of `Model` (footer, compaction, cost display) beyond these and the composer.

## Sources
- `PI_DIR/dist/core/provider-composer.js` (493 lines), `model-runtime.js`, `virtual-models.js`, `cache-warmer.js`, `sdk.js`, `model-registry.js`, `package-manager.js`, `resource-loader.js`, `extensions/loader.js`.
- `PI_DIR/dist/core/provider-composer.d.ts`, `dist/core/extensions/types.d.ts`.
- `PI_DIR/docs/extensions.md`, `docs/custom-provider.md`, `docs/packages.md`.
- `PI_DIR/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js`.
- Repo: `index.ts:30-54,129-132,211-266`, `src/provider.ts`, `src/stream.ts:185-215`.
- Experiments: scratch dir `.pi/marbleization/delete-unused-code/scratch-chidi/` (`extA`, `extB`, `extA2`, `extAlink`, `agent`, `home`, `proj`, `log`).

## Git status (end of run)
```
?? .pi/
?? openspec/changes/delete-unused-code/
```
