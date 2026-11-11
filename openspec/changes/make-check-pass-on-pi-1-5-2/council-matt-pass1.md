# Council — matt, pass 1

Run `0532d97b-6b8c-408d-8206-2dd96a97634e`.

## Recommendation

Settle the open questions as follows. Q1: use a caret, `^1.5.2`. Q2: add one test helper, `chatModel(m)`, that only lets chat entries through (`type === undefined || type === "chat"`) and throws on anything else. Q3: give the existing constant one home, `EMPTY_CONTEXT = normalizeContext({ messages: [] })`, and leave the mocks typed `Context`. Q4: `src/repeat-stop.ts` keeps `Context`.

The spec needs three edits before a design is drafted.

(1) Requirement 2's second sentence must go or be rewritten. It says a value handed to a pi function 'SHALL satisfy that function's declared parameter… rather than silenced with a cast'. The proposal keeps `model as Model<"openai-completions">` at `src/stream.ts:125,208`, which hands a cast value to a pi function, so the requirement is false the day it is adopted. No test can prove the sentence either. Keep the suppression grep, which is runnable and earns its place: without it, `@ts-expect-error` makes the check green. Move 'this change adds no new cast or `any`' into the design as a gate check on the diff, not a living rule.

(2) Delete Requirement 3's scenario 'A run starts outside the agent directory'. It describes what an operator does; nothing in the repo can run it, and the mtime scenario already proves the observable outcome. Give the mtime scenario its missing-file edge: if `~/.pi/agent/cache/omlx-models.json` is absent before the run, it is still absent after.

(3) Say `npm ci` in Requirement 1's WHEN clauses. 'Installed from the committed lockfile' is only runnable as `npm ci`, and Michael's measured run used an `npm install` scratch. Keep the `npm ls` scenario as gate evidence that the cause, the duplicate pi-ai, was fixed rather than masked. It is not enforced by `npm run check`; say so.

Why each answer:

- Q1: an exact pin on pi-ai alone does not stop drift. A pi-coding-agent caret update to 1.5.3 pins pi-ai 1.5.3, and the split comes back. Matching carets plus the lockfile is the correct pair.
- Q2: an inline `if (m.type !== …) { expect(…) }` stays green when the branch is skipped, which breaks Joel's provability rule. A helper that throws fails loudly. The positive predicate also rejects a future fourth type, where the negative form would let it through. Four test sites justify the helper (third-repeat rule).
- Q3: tsc forces only the two wrapper calls, `test/stream.test.ts:123` and `:293`. Retyping the mocks changes structure, not behavior.
- Q4: changing it is structure with no behavior attached.

## Evidence

- The model casts stay in production while Requirement 2 forbids casts on values handed to pi functions (proposal.md 'What This Change Does Not Do' (casts at src/stream.ts:125,208 stay); specs/verification/spec.md Requirement 2; michael-orientation.md trap (b))
- A bare `type === "chat"` drops entries with no `type`, and only the chat member has `reasoning` and `compat` (research-chidi.md §4.2–4.3 (types.d.ts:1530))
- `normalizeContext` is on the root entry and returns a plain `{ messages }`, so the tests need no cast (research-chidi.md §2.2–2.3; michael-orientation.md trap (c) (transcript.js:23-27))
- pi-coding-agent pins pi-ai exactly, so an exact pin on pi-ai alone does not stop drift (research-chidi.md §1.1 (PI/package.json:45); research-eleanor.md 'Dependency and TypeScript configuration')
- The minimal fix gives tsc 0 errors with repeat-stop.ts untouched, and the prefixed check exits 0 (michael-orientation.md trap (c), (d))
- The suite writes the cache under the agent directory it resolves, so the mtime scenario would fail without the prefix (michael-orientation.md §1 (src/catalog.ts:567,596-600); owner-rulings.md §3)

## Assumptions

- [unverified] `type === undefined || type === "chat"` narrows `ProviderModelConfig` to its chat member under tsc
- [unverified] The only test call sites that tsc forces are test/stream.test.ts:123 and :293, both via EMPTY_CONTEXT
- [unverified] `npm ci` from the bumped lockfile reproduces Eleanor's deduped single 1.5.2 tree
- [verified] No tracked non-Markdown file currently matches the suppression grep
- [unverified] isModelType() does not apply to ProviderModelConfig, so it is not recommended

## Risks

- If Requirement 2 keeps its 'no cast' sentence, the living spec is violated by `src/stream.ts:125,208` from the day it is adopted, and a gate held to it would either block or quietly waive it.
- On a machine with no `~/.pi/agent/cache/omlx-models.json`, the mtime scenario cannot be evaluated, so a run that creates the file passes unnoticed unless the absent-stays-absent case is named.
- An inline `if` narrowing guard around the `expect` calls stays green with the assertions deleted when the entry is not chat.
- The `npm ls` scenario is checked once at the gate; a later lockfile change that splits the copies only surfaces if the types differ enough to fail tsc.

## Confidence

medium: The spec findings rest on quoted text and measured runs. The narrowing predicate and the exact test call sites are not confirmed by tsc in the evidence.

## Challenge claims

1. Requirement 2 as written contradicts the proposal's retained casts at src/stream.ts:125,208.
2. The 'run starts outside the agent directory' scenario cannot be proven by any runnable check, and deleting it breaks nothing.
3. An exact pin on pi-ai alone does not remove drift, because pi-coding-agent pins pi-ai exactly.

## Owner decisions

None

## What would change my mind

- A tsc run showing the positive predicate fails to narrow, in which case I would switch to the negative form plus an explicit throw on unknown types.
- Evidence that tsc also forces the mock signatures in test/stream.test.ts to change.
- Joel ruling that existing casts are acceptable under a 'no cast' living rule, for example through a grandfather clause.
