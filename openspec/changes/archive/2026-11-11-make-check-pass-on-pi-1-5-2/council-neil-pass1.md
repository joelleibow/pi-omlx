# Council — neil, pass 1

Run `f61cfed8-d0b0-4b59-a335-33bb5c29f9be`.

## Recommendation

Settle Open Questions 1–4 with the smallest complete change and prune unprovable clauses from `specs/verification/spec.md` before `design.md`:

1. **OQ1 (`pi-ai` devDependency):** Use `^1.5.2`, matching `pi-coding-agent@^1.5.2` (`429742d`). Exact `1.5.2` next to caret `pi-coding-agent` causes drift under `npm update`; matching carets move together while `tsc` (`src/provider.ts:35,37`) catches splits.
2. **OQ2 (`test/provider.test.ts`):** Extract a 4-line local `chatModel(m: ProviderModelConfig)` helper narrowing via `m.type !== "image" && m.type !== "classifier"` and throwing otherwise. `isModelType` fails `tsc` (TS2345), `ProviderChatModelConfig` is unexported, `toProviderModel` omits `type`, and four models / eight reads meet the third-repeat rule.
3. **OQ3 (`test/stream.test.ts`):** Wrap the two fixture inputs (`:111`, `:298`) in `normalizeContext(...)` from `@earendil-works/pi-ai`. Keep `Context` on the `:12-24` mock (deletion test: `TranscriptContext` assigns to `Context`, and `tsc` checks `src/stream.ts` against pi-ai's real `ProviderStreams`).
4. **OQ4 (`src/repeat-stop.ts`):** Keep `Context` (deletion test: zero errors today; middle logic stays decoupled from provider branding).

**Spec and proposal edits before design:**
- **Req 1:** Keep both scenarios (runnable; catch check failures and version splits), but remove the duplicated `package.json:15` command literal from Req 1 prose (one home per fact).
- **Req 2:** Keep the suppression `git grep` scenario and add `@ts-nocheck` to its regex. Delete sentence 2 (unprovable cast/workflow prose contradicting six kept pre-existing casts).
- **Req 3:** Delete Scenario 2 (`A run starts outside the agent directory`—unprovable caller obligation with no callee guard, failing PL4 Provability and forcing churn on the isolation card). Rewrite Req 3 + Scenario 1 so under `PI_CODING_AGENT_DIR=<scratch>`, `~/.pi/agent/cache/omlx-models.json` is neither created nor modified. Close OQ1–5 and sync Risk notes in `proposal.md`.

## Evidence

- pi-coding-agent@1.5.2 pins pi-ai@1.5.2 and aliases root and /compat; bumping devDep pi-ai to ^1.5.2 dedupes npm ls and leaves 2 stream.ts TS2741 + 8 provider.test.ts TS2339 errors. (research-chidi.md §1.1-1.2, §1.5; research-eleanor.md Scratch bump measurement)
- isModelType rejects ProviderModelConfig with TS2345; ProviderChatModelConfig is unexported and omits type when built by toProviderModel. (research-chidi.md §4.2-4.3 & Addendum 1; michael-orientation.md trap b)
- normalizeContext from root pi-ai builds real TranscriptContext fixtures for test/stream.test.ts:111,298; no test calls src/repeat-stop.ts directly. (research-chidi.md §2.1-2.3; research-eleanor.md:33 & Addendum 1; michael-orientation.md trap c)
- src/catalog.ts:567,596 writes cache/omlx-models.json under getAgentDir(), redirected cleanly when PI_CODING_AGENT_DIR names a scratch dir; six casts pre-exist. (owner-rulings.md §1, §3; michael-orientation.md §1, traps b & d)

## Assumptions

- [verified] pi-coding-agent 1.5.2 pins pi-ai 1.5.2 and substitutes its own pi-ai copy at runtime (research-chidi.md §1.1-1.2).
- [verified] isModelType fails tsc --strict on ProviderModelConfig with TS2345 because provider is missing (Chidi Addendum 1).
- [verified] src/repeat-stop.ts has no direct test callers and compiles cleanly with Context (Eleanor Addendum 1).
- [unverified] Repository source files and tsc/biome/vitest runs were not inspected directly by Neil; relied on Chidi, Eleanor, and Michael's measurements.
- [unverified] Whether jiti prefix-matches unlisted pi-ai subpaths beyond root, /compat, /models, /oauth, and /providers/all (research-chidi.md Gaps; unused here).

## Risks

- Running bare npm run check without PI_CODING_AGENT_DIR overwrites ~/.pi/agent/cache/omlx-models.json via writeCatalogCache (src/catalog.ts:567,596) until the test-isolation card lands.
- Narrowing ProviderModelConfig with m.type === 'chat' rejects toProviderModel entries that omit type, failing test/provider.test.ts at runtime.
- Checking ~/.pi/agent/cache/omlx-models.json mtime without handling prior absence fails with ENOENT on clean hosts.
- Adding // @ts-nocheck to a .ts file silences tsc --noEmit while passing Req 2's grep unless @ts-nocheck joins the pattern.

## Confidence

high: All ten tsc diagnostics, type signatures, narrowing failures, and isolated check runs were measured against pi 1.5.2.

## Challenge claims

1. specs/verification/spec.md Req 2 sentence 2 (forbidding casts and requiring open questions) has no runnable check and contradicts six pre-existing casts kept by proposal.md.
2. specs/verification/spec.md Req 3 Scenario 2 asserts caller-set PI_CODING_AGENT_DIR with zero callee guard in code, failing PL4 Provability on any bare run.
3. proposal.md OQ1 claims an exact pi-ai pin removes drift, whereas exact 1.5.2 alongside pi-coding-agent@^1.5.2 causes drift under npm update.

## Owner decisions

None

## What would change my mind

- Evidence that pi releases pi-ai and pi-coding-agent out of lockstep so matching ^1.5.2 carets split under npm update.
- A runnable command check that distinguishes new type casts from the six pre-existing casts without diff-reading.
