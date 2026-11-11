# Research Report

## Question and Scope

Investigate why `npm run check` fails at HEAD `c4d51ff275cb2c46a08a5b68c4b35f5f86fabc7c`, map usages of the specified pi-ai/provider types and stream tests, identify dependency/config state, and measure a scratch-only `@earendil-works/pi-ai` bump to `^1.5.2`. Repository root: `/Users/joelleibow/Projects/pi-omlx`; scoped to `src/`, `index.ts`, `test/`, `scripts/`, package/lock/config, and requested scratch comparison. No source/config edits were made in the repository.

## Sources / Files Examined

- `openspec/changes/make-check-pass-on-pi-1-5-2/owner-rulings.md` (whole file): must make check pass; selected card's proposed implementation is not a binding technical prescription.
- `package.json` (whole file), `tsconfig.json` (whole file), `package-lock.json` (top-level metadata and npm resolution output).
- `src/stream.ts`, `src/provider.ts`, `test/provider.test.ts`, `test/stream.test.ts`, `index.ts`.
- Commands: `npx tsc --noEmit`; `npx biome check *.ts *.json src test scripts`; `PI_CODING_AGENT_DIR=/Users/joelleibow/Projects/pi-omlx/.pi/marbleization/make-check-pass-on-pi-1-5-2/agent-dir npx vitest run`; `npm ls @earendil-works/pi-ai --all`; scratch equivalents after package bump; `openspec instructions research --change make-check-pass-on-pi-1-5-2 --json`.
- `git status --short --branch`, `git rev-parse HEAD`, directory/file inventory.

## Findings

### HEAD typecheck failures

At the reported HEAD, `npx tsc --noEmit` emits ten diagnostics:

1. `src/provider.ts:35` TS2322: `streamSimple` callback's return stream is incompatible because `AssistantMessageEventStream` is imported from root pi-ai 0.80.10 but expected from nested pi-ai 1.5.2 under pi-agent-core; nested class has an incompatible `#private` member.
2. `src/provider.ts:37` TS2345: model passed to stream function comes from pi-agent-core's pi-ai 1.5.2, but stream function expects root pi-ai 0.80.10 `Model<Api>`; its `compat` union differs (nested includes `MistralConversationsCompat`).
3. `test/provider.test.ts:49-52` TS2339 (four errors): `ProviderModelConfig` is a union including `ProviderClassifierModelConfig`, which lacks `reasoning`.
4. `test/provider.test.ts:53,60,66,72` TS2339 (four errors): same union's classifier variant lacks `compat`.

These form two causes: duplicate/incompatible versions of pi-ai in provider stream typing (2 errors), and test assertions reading model-only fields without narrowing the `ProviderModelConfig` union (8 errors).

### Type use and test inputs

- `src/stream.ts:1-10,23,31` imports pi-ai `Api`, `AssistantMessageEvent`, `AssistantMessageEventStream`, `Context`, `Model`, `SimpleStreamOptions`, plus `openAICompletionsApi`; captures `openAICompletionsApi().streamSimple` at module scope. Its internal stream attempt and public wrapper use Model/Context/options/stream types (`src/stream.ts:85-94,124-127,183-189,207-214`). Under 1.5.2, uses of `Context` at calls to concrete `streamSimple` become two branded-context errors (`src/stream.ts:126,209`).
- `src/repeat-stop.ts:3-5,60-62` uses `Context`; `src/stream-writer.ts:3-6,14-16` uses `AssistantMessageEventStream` and `Model`; `src/stream-events.ts:4-6,31-45` uses event and Model types.
- `src/provider.ts:1-4,21-44,60` uses `ProviderConfig` and `ProviderModelConfig`; callback delegates model/context/options to the stream wrapper at lines 35-42, and `toProviderModel` returns `ProviderModelConfig` at line 60.
- `test/stream.test.ts:3-8` imports event stream, `Context`, `Model`, options; controlled mock records model/context/options (`:12-24`), creates an async mock stream cast to `AssistantMessageEventStream` (`:48-80`), defines `OMLX_MODEL` (`:93-105`) and `EMPTY_CONTEXT: Context = { messages: [] }` (`:111`). Thus scratch's brand errors are from supplying that structurally-created `Context` to new `TranscriptContext` arguments, at source calls rather than test compilation.
- `test/provider.test.ts:3` calls `toProviderConfig`; cases supply empty models and four ordinary model records with contextWindow/maxTokens, varying thinking defaults/parser (`:12-42`), then read model `reasoning` and `compat` (`:49-72`). Those property reads need type narrowing/casting at test boundary; production `toProviderModel` constructs these fields (`src/provider.ts:60-80`).
- `index.ts` imports `ExtensionAPI` from pi-coding-agent (`index.ts:1`), not the queried pi-ai symbols directly.
- Search scope: `scripts/` had no usages of the queried type names; package values below are covered separately. `openAICompletionsApi` is imported/called only in `src/stream.ts:23,31` and mocked in `test/stream.test.ts:40-44`.

### Dependency and TypeScript configuration

`package.json:19-36`: peer dependencies are `@earendil-works/pi-ai: "*"` and `@earendil-works/pi-coding-agent: "*"`; dev dependencies include pi-ai `^0.80.9`, pi-coding-agent `^1.5.2`, and latest Biome, Node types, tsx, TypeScript, Vitest. Lockfile root records the same at `package-lock.json:7-25`; installed `npm ls` resolves root pi-ai 0.80.10 while pi-coding-agent 1.5.2 and pi-agent-core 1.5.2 each resolve pi-ai 1.5.2 (two copies, root plus nested path).

`tsconfig.json:2-15`: target ES2022, ESNext/bundler, DOM+ES2022 libs, `strict: true`, `skipLibCheck: true`, no emit, Node types; includes root TS, `src/**/*.ts`, `test/**/*.ts`, `scripts/**/*.ts`. It does not skip application/test source checking.

### Scratch bump measurement

Scratch was created with `git archive HEAD` under `.pi/marbleization/make-check-pass-on-pi-1-5-2/scratch/`; there only, set dev dependency to `^1.5.2` and ran `npm install`. Scratch npm tree dedupes all copies at pi-ai 1.5.2.

- `npx tsc --noEmit`: nine errors remain. The two duplicate-version provider errors disappear. Two new `src/stream.ts` TS2741 errors occur at lines 126 and 209: `Context` lacks required `[transcriptContextBrand]` for `TranscriptContext`. The eight provider test errors persist unchanged.
- Biome passes: `Checked 35 files ... No fixes applied.`
- Vitest passes: 11 files, 84 tests.
- The scratch tsc, biome, and vitest were all run with cwd at scratch. Vitest's `PI_CODING_AGENT_DIR` was set to the specified external agent-dir path.

### Check command and HEAD verification

`package.json:14-17` defines `check` as `biome check *.ts *.json src test scripts && tsc --noEmit && vitest run`. At HEAD, Biome passes (`Checked 35 files ... No fixes applied`) and isolated Vitest passes (11 files / 84 tests). Therefore the observed `npm run check` failure is in its `tsc` segment; npm command as a whole was deliberately not run because the brief forbade bare `npm run check` (its vitest would use the real default agent dir). TypeScript separately fails with the ten diagnostics enumerated above.

## Assumptions, Differences, and Unknowns

- No `CLAUDE.md`, `AGENTS.md`, or `ARCHITECTURE.md` was found in the repository; no ADR directory/material was found in the active change or top-level openspec material. The change's owner rulings were read. No feature implementation trace was requested beyond the type-check failure path.
- The lockfile was not edited by the scratch experiment in the original repository; scratch lock reflects the install with the bumped range.
- The asked “every use” inventory is scoped to the requested `src/`, `index.ts`, `test/`, and `scripts/` search. Findings enumerate direct matches relevant to the named types; broad substring `Model` generates unrelated project-domain model hits.
- `npm run check` itself was not executed to honor the explicit safety rule; its exact script was read, and each of its components was independently run with the required isolated Vitest directory.
- Unknown: whether the final intended fix should import/use `TranscriptContext` or adapt a test/context construction helper, and exact desired narrowing style for provider test assertions. These are implementation choices for follow-up; Chidi is researching upstream pi 1.5.2 API types/docs.

## Addendum 1 — callers of repeat-stop.ts

No test under `test/` imports or calls `src/repeat-stop.ts` (`isRepeatStop` or another export) directly. `test/stream.test.ts:307-313` indirectly exercises repeat-stop behavior by passing `context` to `streamOmlxOpenAICompletions`:

```ts
const stream = streamOmlxOpenAICompletions(
	OMLX_MODEL,
	context,
	undefined,
	5_000,
	undefined,
);
```

That `context` is constructed at `test/stream.test.ts:298` as `const context: Context = { messages: [priorAssistant] };` where `priorAssistant` is an assistant message with matching thinking content. The production wrapper calls `isRepeatStop(event, context)` in `src/stream.ts:143`.