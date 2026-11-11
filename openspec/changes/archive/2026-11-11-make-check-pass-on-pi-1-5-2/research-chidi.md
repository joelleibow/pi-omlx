# Research Report — Chidi

Abbreviations. `PI` = `/Users/joelleibow/.local/share/fnm/node-versions/v26.8.1/installation/lib/node_modules/@earendil-works/pi-coding-agent` (1.5.2). `AI` = `PI/node_modules/@earendil-works/pi-ai` (1.5.2). `EXT` = `PI/dist/core/extensions`. Everything is from the installed copy unless marked **[online]**.

## Question and Scope

What pi 1.5.2's packages give an extension's types and runtime, for `make-check-pass-on-pi-1-5-2`: (1) the pi-ai version pi runs with and what docs say an extension declares; (2) `TranscriptContext`; (3) `openAICompletionsApi().streamSimple` and related types; (4) `ProviderConfig`/`ProviderModelConfig`; (5) release notes. No design is recommended. The repo's own code is Eleanor's.

## Sources / Files Examined

- `PI/package.json`, `AI/package.json`, `AI/README.md`
- `PI/docs/packages.md`, `PI/docs/extensions.md`, `PI/docs/custom-provider.md`
- `EXT/loader.js`, `EXT/virtual-modules.js`, `EXT/pi-ai-extension-view.{js,d.ts}`, `EXT/types.d.ts`
- `AI/dist/{types,compat,index,models}.d.ts`, `AI/dist/utils/transcript.d.ts`, `AI/dist/utils/event-stream.d.ts`, `AI/dist/api/openai-completions.lazy.{js,d.ts}`, `AI/dist/compat.js`
- `PI/examples/extensions/custom-provider-{anthropic,gitlab-duo}/*.ts`
- `PI/CHANGELOG.md`
- **[online]** `https://raw.githubusercontent.com/earendil-works/pi/main/packages/ai/CHANGELOG.md`. pi-ai ships no CHANGELOG in its installed package (`AI/` holds only `dist`, `package.json`, `README.md`).
- Repo install state (read only): `node_modules/@earendil-works/pi-ai/package.json`, `node_modules/@earendil-works/pi-coding-agent/{package.json,node_modules/@earendil-works/pi-ai/package.json}`, `package-lock.json`.

## Findings

### 1. Which pi-ai pi 1.5.2 runs with

1. pi-coding-agent 1.5.2 depends on `@earendil-works/pi-ai` at the exact version `1.5.2` (`PI/package.json:45`). It lists the other pi packages at `1.5.2` too (`:44-49`). `AI/package.json:3` is `1.5.2`, installed nested under `PI/node_modules`. There is no `bundleDependencies` key (grep found none). The npm tarball is not bundled; the `build` script (`PI/package.json:33`) runs `build-coding-agent-bundle.mjs`, so a bundled distribution exists.
2. pi maps extension imports of pi-ai to its own copy, so an extension's own pi-ai is not used for these specifiers.
   - Node `dist` mode: `getAliases()` (`EXT/loader.js:37-89`) maps `@earendil-works/pi-ai` **and** `@earendil-works/pi-ai/compat` to `EXT/pi-ai-extension-view.js` (`:61`, `:70`, `:73`). It maps `/models`, `/oauth` and `/providers/all` to pi's workspace or import-resolved `dist` files (`:62-72`). The `@mariozechner/*` names map the same way (`:77-81`).
   - The extension view re-exports `@earendil-works/pi-ai/compat` plus TypeBox's `Type` and a `StringEnum` (`EXT/pi-ai-extension-view.js`, `.d.ts`). The loader comment (`loader.js:57-60`) calls compat a "strict superset" of the core entry.
   - Binary and embedded mode uses `virtualModules`: `virtual-modules.js:27-30` maps `@earendil-works/pi-ai` and `/compat` to `bundledPiAiExtensionView`, and `/models`, `/oauth` to the bundled modules. TypeScript source-runtime mode also uses `virtualModules` (`loader.js:480-485`).
   - Subpaths that are not listed (for example `/api/*`, `/utils/*`, `/providers/*` other than `providers/all`, `/lazy-oauth`) have no alias or virtual-module entry in either file. Whether jiti prefix-matches them was not tested. See Gaps.
3. `docs/extensions.md:160-166` lists the host-provided packages: `pi-ai`, `pi-ai/compat|models|oauth|providers/all`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`, `typebox`. It states "Pi maps these imports to its own copies, so extensions share Pi's classes and registries" (`:164`).
4. What the docs say to declare:
   - `docs/packages.md:112`: declare host-provided packages in `peerDependencies` with a `"*"` range and do not bundle them.
   - `docs/packages.md:114`: do not list them in `dependencies`. "A physical copy can bypass Pi's extension module mapping in compiled ESM and create duplicate classes, registries, and initialization work." Pi reports an extension warning when it detects this.
   - `docs/extensions.md:170`: for `pi install`ed packages, runtime deps must be in `dependencies`; `devDependencies` are not installed.
   - Neither `docs/packages.md` nor `docs/extensions.md` prescribes a `devDependencies` range for pi packages (grep for `devDep` found only `extensions.md:170`). The examples' `with-deps/package.json` was checked and has no pi entries. The docs do not say anything about matching devDependency versions to the installed pi.
5. **Installed state in this repo, relevant to type resolution:**
   - top-level `node_modules/@earendil-works/pi-ai` is **0.80.10**.
   - `node_modules/@earendil-works/pi-coding-agent` is **1.5.2**, with its own nested `node_modules/@earendil-works/pi-ai` **1.5.2** (`package-lock.json:1054-1056`).
   - `pi-agent-core` also has a nested 1.5.2 pi-ai (`package-lock.json:771-773`).
   - pi-coding-agent's `EXT/types.d.ts:11` imports `TranscriptContext` from `"@earendil-works/pi-ai"`, which resolves to the nested 1.5.2.
   - The repo's own `@earendil-works/pi-ai` imports resolve to the top-level 0.80.10, which has no `TranscriptContext` or `normalizeContext` (grep of its `dist`: no match; its `Context` has `systemPrompt`, `types.d.ts:332-333`).
   - At runtime pi substitutes its own 1.5.2 copy (finding 2). At type-check time the repo sees two pi-ai versions.

### 2. `TranscriptContext`

1. Declaration, `AI/dist/types.d.ts:565-575`:
   ```ts
   declare const transcriptContextBrand: unique symbol;
   export type TranscriptContext = {
       messages: Message[];
       readonly [transcriptContextBrand]: true;
   };
   ```
   The brand is a non-exported `unique symbol` property typed `true`. The doc comment (`:566-570`) says "Only `normalizeContext()` produces this type, so a raw `Context` cannot reach provider code by accident". `Context` is `{ systemPrompt?, messages, tools? }` (`:560-564`).
2. Producer: `normalizeContext(context: Context): TranscriptContext` (`AI/dist/utils/transcript.d.ts:13`, "the only entry point that produces a TranscriptContext"). `transcript.d.ts:2` re-exports the `TranscriptContext` type. Other functions in that file take a `TranscriptContext` and return one: `collapseSystemMessages` (`:39`), `resolveTranscript` (`:41`). They do not accept a plain `Context`.
3. Export surface: root `AI/dist/index.d.ts:33` has `export * from "./utils/transcript.ts"`, so `normalizeContext` and `TranscriptContext` are on the root entry. `AI/dist/compat.d.ts:26` has `export * from "./index.ts"`, so they are on `/compat` too. Extensions get both via the extension view. `AI/dist/types.d.ts` and `index.d.ts:23` (`export * from "./types.ts"`) also export the `TranscriptContext` type.
4. `AI/README.md:1415-1421` shows direct calls to an API module: "Direct calls bypass provider auth and context normalization — pass `apiKey` explicitly and wrap the context in `normalizeContext()`", then `stream(claudeModel, normalizeContext(context), …)` with `normalizeContext` imported from the root.
5. Public entry points take `Context` and normalize internally: `compat.js:171,187` (`streamSimple` calls `normalizeContext`), `models.js:466,477`; `README.md:1626`.
6. How pi's own code types a `streamSimple` that receives one and delegates:
   - `ProviderConfig.streamSimple?: (model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions) => AssistantMessageEventStream` (`EXT/types.d.ts:1478`). Its doc comment (`:1469-1477`) says to read the prompt and tools from `getCurrentSystemPrompt(context.messages)` and `getCurrentTools(context.messages)`.
   - `examples/extensions/custom-provider-gitlab-duo/index.ts`: imports `TranscriptContext`, `anthropicMessagesApi`, `openAIResponsesApi`, `Model`, `SimpleStreamOptions` from `@earendil-works/pi-ai/compat` (`:14-24`). Its `streamGitLabDuo(model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions)` (`:307-311`) passes `context` unchanged to `anthropicMessagesApi().streamSimple(...)` (`:329-338`) and `openAIResponsesApi().streamSimple(...)` (`:340-344`). It casts the model: `modelWithBaseUrl as Model<"anthropic-messages">` / `Model<"openai-responses">` (`:331-334`, `:341`). It forwards events with `for await (const event of innerStream) stream.push(event); stream.end();` (a few lines after `:344`).
   - `examples/extensions/custom-provider-anthropic/index.ts`: imports `type TranscriptContext` from `@earendil-works/pi-ai` (root, `:47-48`) and declares `streamCustomAnthropic(model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions)` (`:339-342`). It is registered as `streamSimple: streamCustomAnthropic` (`:611`).
   - `docs/custom-provider.md:178`: "The stream receives a normalized `TranscriptContext`…".
7. How a test builds one: neither docs nor examples show a test constructing a `TranscriptContext` directly. The documented route is `normalizeContext(context)` (README `:1418-1421`). Pi's example test `examples/extensions/custom-provider-gitlab-duo/test.ts:11` instead builds a plain `Context` and calls compat's `streamSimple(model, context, …)` (`:66`), which normalizes internally. The brand is not exported, so an object literal `{ messages }` does not satisfy the type; a cast is the only other route. No doc was found that sanctions the cast.

### 3. `openAICompletionsApi` and the stream functions (pi-ai 1.5.2)

1. `AI/dist/api/openai-completions.lazy.d.ts:2`: `export declare const openAICompletionsApi: () => ProviderStreams;`. Its runtime body is `lazyApi(() => import("./openai-completions.js"))` (`.js:2`). `compat.d.ts:19` re-exports it, so it is on `/compat` (and the extension view). It is the same factory-style as `anthropicMessagesApi`/`openAIResponsesApi` used in the gitlab-duo example.
2. The module itself is typed more narrowly: `AI/dist/api/openai-completions.d.ts:23-24` declares `stream: StreamFunction<"openai-completions", OpenAICompletionsOptions>` and `streamSimple: StreamFunction<"openai-completions", SimpleStreamOptions>`, i.e. `(model: Model<"openai-completions">, context: TranscriptContext, options?: SimpleStreamOptions)`. The factory `openAICompletionsApi()` returns `ProviderStreams` (`types.d.ts:205-210`):
   ```ts
   stream(model: Model<Api>, context: TranscriptContext, options?: StreamOptions): AssistantMessageEventStream;
   streamSimple(model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions): AssistantMessageEventStream;
   fetchDeferred?(...); cancelDeferred?(...);
   ```
   So `openAICompletionsApi().streamSimple` takes `Model<Api>`, `TranscriptContext`, `SimpleStreamOptions` and returns `AssistantMessageEventStream`. The factory's return type is the untyped dispatch shape; the doc comment (`types.d.ts:196-204`) says per-API option typing "lives on the implementation modules themselves".
3. `StreamFunction<TApi, TOptions>` = `(model: Model<TApi>, context: TranscriptContext, options?: TOptions) => AssistantMessageEventStream` (`types.d.ts:251`).
4. `SimpleStreamOptions extends StreamOptions` adds `toolChoice?`, `reasoning?: ThinkingLevel`, `deferred?`, `thinkingBudgets?` (`types.d.ts:240-249`).
5. `Model<TApi extends Api> extends BaseModel<TApi>` (`types.d.ts:660`): `type?: "chat"`, `reasoning: boolean`, `contextWindow`, `maxTokens`, `thinkingLevelMap?`, `promptCache?`, `samplingParams?`, and `compat?` as a conditional on `TApi` (`TApi extends "openai-completions" ? OpenAICompletionsCompat : … : never`). `Api = KnownApi | (string & {})` (`:21`), so the conditional distributes over the known literals and yields a union of the compat types plus `never` for unknown strings.
6. `AssistantMessageEventStream`: `class extends EventStream<AssistantMessageEvent, AssistantMessage>` with `push(event)` and `end(result?)` (`AI/dist/utils/event-stream.d.ts:22-26`). `createAssistantMessageEventStream()` is the factory "for use in extensions" (end of `event-stream.d.ts`). Both come out of root/compat via `index.d.ts:25`.
7. The global `streamSimple` (compat) takes `Context`, not `TranscriptContext` (`compat.d.ts:65`). Compat's own `ApiStreamSimpleFunction` takes `TranscriptContext` (`:40`). `docs/extensions.md:1224` says to use `ctx.modelRegistry.streamSimple` rather than compat streaming functions, "which cannot see extension provider registrations".

### 4. `ProviderConfig` and `ProviderModelConfig` (pi-coding-agent 1.5.2, `EXT/types.d.ts`)

1. `ProviderConfig` (`:1459`): `name?`, `baseUrl?`, `apiKey?`, `api?: Api`, `streamSimple?` (`:1478`), `images?`, `classifiers?`, `headers?`, `authHeader?`, `models?: ProviderModelConfig[]` (`:1488`), `refreshModels?(): Promise<ProviderModelConfig[]>` (`:1493`), `oauth?`.
2. `ProviderModelConfig` is a three-member union, discriminated on `type` (`:1561`):
   `ProviderChatModelConfig | ProviderImageModelConfig | ProviderClassifierModelConfig`.
   - `ProviderChatModelConfig` (`:1531-1547`): `type?: "chat"` (optional, "Omitted `type` is normalized to `"chat"`", `:1530`), `api?: Api`, `reasoning: boolean`, `thinkingLevelMap?`, `promptCache?`, `contextWindow`, `maxTokens`, `samplingParams?: Record<string, unknown>`, `compat?: Model<Api>["compat"]`.
   - `ProviderImageModelConfig` (`:1549-1553`): `type: "image"`, `api?: ImageApi`, `output`.
   - `ProviderClassifierModelConfig` (`:1555-1559`): `type: "classifier"`, `api?: ClassifierApi`, `contextWindow`.
   - Shared base `ProviderModelConfigBase` (`:1512`, not exported): `id`, `name`, `api?: string`, `baseUrl?`, `input`, `inputLimits?`, `cost`, `headers?`.
   - The image and classifier members have no `reasoning` and the classifier has no `compat` (so reading `reasoning` or `compat` on the bare union does not type-check; `reasoning` exists only on the chat member, `compat` on chat only).
3. Narrowing (derived from the declaration, not executed): the chat member's `type` is optional, so a reader narrows with `m.type === undefined || m.type === "chat"`, or `m.type !== "image" && m.type !== "classifier"`; after either, `m.reasoning` and `m.compat` are available. A bare `m.type === "chat"` would drop models with `type` omitted at runtime. `isModelType(model: AnyModel, type)` (`AI/dist/utils/model-operations.d.ts:5`) is pi-ai's runtime narrowing helper for `AnyModel`; its doc says it handles "legacy chat models without `type`". It takes `AnyModel`, not `ProviderModelConfig`, so applying it to a config entry was not verified. `Model`'s own comment (`types.d.ts:661-664`) says to narrow with `isModelType()` "instead of comparing `type` directly". `docs/custom-provider.md:91` shows an `type: "image"` model entry.
4. `docs/extensions.md:2084-2096` (registerProvider option list) was read for the `streamSimple` bullet: "Custom streaming implementation for non-standard APIs."

### 5. Release notes

- **pi-coding-agent CHANGELOG** (`PI/CHANGELOG.md`):
  - `[0.86.0] - 2026-09-19`, Breaking Changes (`:849-851`): "Changed inherited pi-ai provider stream inputs from `Context` to normalized `TranscriptContext` values. Custom providers must read system prompts and tool declarations from `context.messages` with `getCurrentSystemPrompt()` and `getCurrentTools()`." This lands **after** the repo's `^0.80.9`/0.80.10 pin and **before** 1.0.0.
  - `[0.80.0] - 2026-06-23` (`:1852-1858`): the pi-ai global API (`stream`, `complete`, `registerApiProvider`, `getModel`…) moved off the root to `@earendil-works/pi-ai/compat`. "Extensions are not affected at runtime: the extension loader resolves the pi-ai root to the compat entrypoint (a strict superset)… Extension sources that typecheck against pi-ai's published types should switch those imports to `@earendil-works/pi-ai/compat`." It also says "The compat entrypoint and the loader alias will be removed in a future release with a migration guide."
  - `[1.5.0]` Breaking Changes (`:143`; the extension-view note is at `:162`): pi-ai's root no longer re-exports TypeBox; pi's extension view keeps `Type`, `Static`, `TSchema` for extensions (`:162`).
  - Model-config union: `[0.99.0] - 2026-09-29` (heading `:676`, entry `:699`) "Extension model lists can include discriminated chat, image, and classifier entries with operation implementations; when supplied, they replace the provider catalog across every operation." `:700` notes classifier support was added to `ModelRuntime`. `[1.0.0]` (`:572`) also covers image generation and classifier models (`:578`, `:588`, `:684`, `:696`). `:265` says extension classifier models accept `compat`. No entry in the changelog calls the union a breaking change for extensions that read `reasoning`/`compat` from `ProviderModelConfig`.
  - `:2535` (an older 0.x entry): `thinkingLevelMap` replaces `compat.reasoningEffortMap` in `registerProvider()` model definitions.
- **pi-ai CHANGELOG [online]** (`packages/ai/CHANGELOG.md` on `main`, fetched via raw GitHub):
  - `[0.86.0] - 2026-09-19`, Breaking Changes: "Changed provider-facing `ProviderStreams` and `StreamFunction` inputs from `Context` to normalized `TranscriptContext` values. System prompts and tool declarations now live in transcript system messages; custom providers must read them with `getCurrentSystemPrompt()` and `getCurrentTools()`. See [System Messages](README.md#system-messages)."
  - `[0.80.0] - 2026-06-23`: "The root entrypoint (`@earendil-works/pi-ai`) is now core-only and side-effect free. The old global API moved to the temporary `@earendil-works/pi-ai/compat` entrypoint, a strict superset of the root… it will be removed in a future release." Restoring legacy per-API aliases on compat is in `[0.80.2]`.
  - `[1.5.0]`: root no longer re-exports TypeBox. `[1.5.1]`: `openai-completions` omits `"tools": []` when none are sent; `compat.requiresToolsWithToolHistory` re-enables it. `[1.5.2]`: Anthropic OAuth version fix only.
  - Search of the whole fetched text for `normalizeContext` found no match (only the first 30k characters of the file were rendered; the search ran over the stored full text).

## Assumptions, Differences, and Unknowns

- **Differences from the brief's wording:**
  - The brief says the repo's pi-ai is `^0.80.9` (0.80.10 installed). In the repo that is a second, older pi-ai next to pi-coding-agent's nested 1.5.2 (Finding 1.5). pi's runtime substitutes its own copy; tsc does not.
  - pi's docs prescribe `peerDependencies: "*"` for host packages and say nothing about devDependency ranges.
  - The README for pi-ai documents `normalizeContext` from the **root**, which exists in 1.5.2; 0.80.10 does not have it.
- **Gaps and unverified:**
  - Whether jiti prefix-matches unlisted pi-ai subpaths (`/api/*`, `/utils/*`) to pi's copy was not tested; only `/compat`, `/models`, `/oauth`, `/providers/all` and the root have explicit entries.
  - No tsc run was done; the narrowing expression in 4.3 is derived from declarations. `isModelType` on a `ProviderModelConfig` was not checked.
  - pi-ai's CHANGELOG was read online (not installed); the installed pi-ai package has none. Only the head of it (to 1.2.0) was rendered in full; 0.86.0 and 0.80.0 entries came from text search.
  - `[1.0.0]` changelog sections were grepped by keyword, not read end to end.

## Addendum 1 — isModelType on ProviderModelConfig

**No.** `isModelType` does not accept a `ProviderModelConfig`, so it cannot narrow one.

Declaration (pi-ai 1.5.2, `dist/utils/model-operations.d.ts:5`):
`export declare function isModelType<TType extends ModelType>(model: AnyModel, type: TType): model is ModelTypeMap[TType];`
`AnyModel = ModelTypeMap[ModelType]` (`dist/types.d.ts:706`), i.e. `Model<Api> | ImageModel<ImageApi> | ClassifierModel<ClassifierApi>`. Those are catalog models: they require `provider`, `api` and similar fields that config entries lack.

Test, in `.pi/marbleization/make-check-pass-on-pi-1-5-2/scratch` (pi-ai 1.5.2 installed), file deleted afterwards:
```ts
import { isModelType } from "@earendil-works/pi-ai/models";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
export const f = (m: ProviderModelConfig) => isModelType(m, "chat");
```
`npx tsc --noEmit --strict --ignoreConfig --module esnext --moduleResolution bundler --target es2022 --skipLibCheck --types node addendum1.ts` exited 1:
```
addendum1.ts(3,58): error TS2345: Argument of type 'ProviderModelConfig' is not assignable to parameter of type 'AnyModel'.
  Type 'ProviderChatModelConfig' is not assignable to type 'AnyModel'.
    Property 'provider' is missing in type 'ProviderChatModelConfig' but required in type 'Model<Api>'.
```
This corrects the hedge in my report (Finding 4.3). Narrowing a config entry has to use `type` directly. That narrowing was not compiled.
