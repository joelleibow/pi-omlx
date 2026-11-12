# Council — neil, pass 2

Run `485837b4-1eb7-4f4e-8bd6-5931affd3405`.

## Responses

- **M1** — accept. Both predicates narrow ProviderModelConfig's three discriminated variants (type?: "chat", type: "image", type: "classifier") and admit toProviderModel's omitted type (normalized to "chat"). At equal size, m.type === undefined || m.type === "chat" states the domain rule positively and throws loudly at runtime if a future pi version adds a fourth type literal, whereas the negative form would let that non-chat entry pass through. (research-chidi.md §4.2-4.3 (EXT/types.d.ts:1530, 1549-1561); michael-orientation.md trap b)
- **M2** — reject. Wrapping EMPTY_CONTEXT once at test/stream.test.ts:111 is right (covering :123), but claiming :111 ONLY and leaving context at :298 unchanged fails tsc --noEmit. research-eleanor.md Addendum 1 (:67-76) shows test/stream.test.ts:307-313 passes :298's local context variable (typed Context, holding priorAssistant) directly to streamOmlxOpenAICompletions(OMLX_MODEL, context, ...). Once src/stream.ts:185 types that parameter as TranscriptContext, an unnormalized Context at :298 fails with TS2741 (michael-orientation.md trap c). Both :111 and :298 must call normalizeContext. (research-eleanor.md:33 & Addendum 1 (:67-76); michael-orientation.md trap c)
- **M3** — refine. Accept replacing "installed from the committed lockfile" with "after npm ci" in Req 1's WHEN clauses: npm ci is the runnable command that installs from package-lock.json and catches manifest-lockfile drift even pre-commit. Refine the second half: package.json:15 confirms npm run check does not run npm ls, but living capability specs under openspec/specs/ should not carry workflow jargon like "gate evidence". Instead, narrow specs/verification/spec.md's Purpose ("Defines what npm run check must prove...") so it covers repository verification checks broadly; Scenario 2's WHEN npm ls @earendil-works/pi-ai --all runs already names its standalone command, matching package-identity's standalone greps. (specs/verification/spec.md Purpose & Req 1; research-eleanor.md Check command and HEAD verification (package.json:14-17); proposal.md:48)
- **M4** — accept. Moving "this change adds no new cast or any" out of specs/verification/spec.md into design.md as a diff check avoids contradicting the six pre-existing casts (src/stream.ts:125,208 and four as unknown as in test/) while catching a concrete failure mode: copying test/provider.test.ts:94's as unknown as Record<string, unknown> onto :49-72 would pass both npm run check and Req 2's comment grep without that diff check. (michael-orientation.md trap b; proposal.md What This Change Does Not Do & Risks; michael-the-architect.md The design gate (PL4) & The implementation gate)

## Recommendation changed

Yes: Moved chatModel's guard to the positive predicate m.type === undefined || m.type === "chat" (M1: EXT/types.d.ts:1530, 1549-1561 gives equal compile cost while rejecting any future fourth model type at runtime); adopted "after npm ci" in Req 1's WHEN clauses and narrowed specs/verification/spec.md's Purpose instead of adding "gate evidence" process prose (M3: package.json:15); and placed "no new cast or any in this diff" in design.md as a diff-scoped gate check (M4: michael-orientation.md trap b). Held firm that both test/stream.test.ts:111 and :298 must call normalizeContext (M2 refuted by research-eleanor.md Addendum 1 :67-76).

## Out of scope findings

None
