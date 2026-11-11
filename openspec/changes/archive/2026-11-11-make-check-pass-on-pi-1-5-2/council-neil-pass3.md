# Council — neil, pass 3

Run `9856d54e-fb71-4c04-9430-66559117c4a1`.

## Responses

- **P1** — accept. Two pieces of inspected evidence decide this over the positive form. First, michael-orientation.md trap b compiled the negative guard and verified a mutation at src/provider.ts:61 still fails the test, whereas research-chidi.md (§4.3, Gaps, Addendum 1) records that m.type === undefined || m.type === "chat" was never compiled. Second, ProviderChatModelConfig is unexported from pi-coding-agent (michael-orientation.md trap b), so chatModel's return type must be inferred, and test/provider.test.ts:12-42 passes fixed chat inputs (research-eleanor.md:34): if pi adds a fourth union variant without reasoning or compat, a positive guard narrows it out at compile time and never sees it at runtime, whereas the negative guard keeps it in the inferred return union and fails tsc --noEmit with TS2339 on :49-72. (michael-orientation.md trap b; research-chidi.md §4.2-4.3, Gaps & Addendum 1; research-eleanor.md:34)
- **P2** — accept. Matches our Pass 2 M3 refinement: package.json:15 runs biome, tsc, and vitest (not npm ls or git grep), so narrowing specs/verification/spec.md's Purpose to repository verification checks broadly removes the false claim that npm run check proves every scenario without introducing workflow jargon ("gate evidence") into a living capability spec, while Scenario 2's WHEN npm ls @earendil-works/pi-ai --all runs names its standalone command directly. (specs/verification/spec.md Purpose & Req 1; research-eleanor.md Check command and HEAD verification (package.json:14-17); proposal.md:48)

## Recommendation changed

Yes: Moved chatModel's predicate back to the negative form (throwing when m.type === "image" || m.type === "classifier", or guarding m.type !== "image" && m.type !== "classifier") on two verified facts: (1) michael-orientation.md trap b compiled and mutation-tested the negative helper against src/provider.ts:61, whereas research-chidi.md (§4.3, Gaps, Addendum 1) confirms the positive form was never compiled; and (2) because ProviderChatModelConfig is unexported (michael-orientation.md trap b), chatModel's return type is inferred, and test/provider.test.ts:12-42 uses fixed chat fixtures (research-eleanor.md:34)—so an upstream fourth union member would never trigger the positive form's runtime throw, whereas the negative form leaves it in the inferred union and fails tsc --noEmit with TS2339 at :49-72.

## Out of scope findings

None
