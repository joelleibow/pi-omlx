# Council Synthesis

## Question and Scope

Joel ruled that `npm run check` must pass, that this card goes next, and that no test run writes to his real agent directory (`owner-rulings.md` §1–§3). The design question is the mechanism. How does `PI_CODING_AGENT_DIR=<scratch directory> npm run check` get to exit 0 on pi 1.5.2 with no suppression, cast or `any` standing in for a fix? The same question has a second half: what the new `verification` capability should require, so that every clause in it can be proved by a command.

The boundaries are this change's own. Grouping `@earendil-works/*` in `.github/dependabot.yml` is out, removal of pi-ai's compat entry is out, and test isolation by default belongs to another card (`proposal.md`, "What This Change Does Not Do"; `michael-orientation.md` §1, traps a and e). Under consideration: the proposal's four open questions of mechanism, and the five clauses of `specs/verification/spec.md` that the advisors tested against those questions.

Inputs: `research-chidi.md` with Addendum 1 (pi 1.5.2's own types: `TranscriptContext`, `ProviderModelConfig`, `isModelType`), `research-eleanor.md` with Addendum 1 (where the ten errors sit, and who calls `src/repeat-stop.ts`), `michael-orientation.md` (traps a to e, and the scratch runs he measured), `proposal.md`, `specs/verification/spec.md`.

The council ran three passes and left six reports in this directory. Neither advisor read the repository. Both said so under Assumptions and worked from the two research reports and Michael's measurements (`council-neil-pass1.md`, Assumptions; `council-matt-pass1.md`, Assumptions).

## Perspectives & Trade-offs

The advisors agreed on six points, with the evidence named in each report:

- **Caret, not an exact pin, for the pi-ai devDependency.** `^1.5.2`, matching `pi-coding-agent@^1.5.2`. An exact pin on pi-ai alone does not stop drift, because pi-coding-agent pins pi-ai exactly: move pi-coding-agent to 1.5.3 and it pins pi-ai 1.5.3, and the split is back (`council-neil-pass1.md` Q1; `council-matt-pass1.md` Q1, restated in pass 3).
- **`isModelType()` cannot narrow a config entry.** A `ProviderModelConfig` is not assignable to `AnyModel`, which requires `provider` (Chidi Addendum 1, TS2345; `council-neil-pass1.md` Q2; `council-matt-pass1.md` Q2).
- **Every context the stream test hands the wrapper goes through `normalizeContext`.** That is the `EMPTY_CONTEXT` constant at `:111` and the repeat-stop fixture's `context` at `:298`. Matt's pass-1 claim that `:111` alone would do was withdrawn in pass 2: Eleanor's Addendum 1 (`:67-76`) shows `:298`'s `Context` reaching the wrapper directly, which is TS2741 once the parameter is branded (`council-neil-pass2.md` M2; `council-matt-pass2.md` N3).
- **The mocks in `test/stream.test.ts` keep `Context`, and `src/repeat-stop.ts` keeps `Context`.** A `TranscriptContext` assigns to a `Context`, nothing under `test/` calls repeat-stop directly, and tsc's zero errors confirm the list (`council-neil-pass1.md` Q3–Q4; `council-matt-pass1.md` Q3–Q4; `research-eleanor.md`, Addendum 1).
- **Requirement 2's second sentence has to go.** It forbids handing a cast value to a pi function, and `proposal.md` keeps exactly that at `src/stream.ts:125,208`; no command proves it either (`council-neil-pass1.md`, challenge 1; `council-matt-pass1.md`, finding 1).
- **Requirement 3's "A run starts outside the agent directory" scenario has to go.** It describes what an operator does, and nothing in the repository can run it. The mtime scenario already asserts the observable outcome, once it covers a cache file that is absent before the run (`council-neil-pass1.md`, spec edits; `council-matt-pass1.md`, finding 2). Requirement 1's WHEN clauses say `npm ci`, the spec stops quoting the `check` script, and the `npm ls` scenario keeps its own command.

Two disputes the passes left open:

**The `chatModel(m)` predicate.** Neil argued for the negative form in pass 1 and again in pass 3: a helper that throws when `m.type === "image" || m.type === "classifier"`. It is the only form measured, and because `ProviderChatModelConfig` is unexported the helper's return type is inferred, so a future fourth member without `reasoning` or `compat` stays in the inferred union and reds `tsc` at the field reads, while the positive form's runtime throw never fires on the fixed chat fixtures the test supplies (`council-neil-pass1.md` Q2; `council-neil-pass3.md` P1). Matt argued for the positive form, `m.type === undefined || m.type === "chat"`, in pass 1 and again in pass 3: it states pi's own rule, that an omitted `type` is normalized to `"chat"` (`types.d.ts:1530`), and the negative form lets a fourth member that does carry `reasoning` and `compat` through as chat; he made it conditional on a `tsc` run at the gate, with the negative form as fallback (`council-matt-pass1.md` Q2; `council-matt-pass3.md` Q1). Passes 2 and 3 moved both advisors across the line and back, each time on the other's hypothetical, and they ended split.

**The Purpose line.** Neil wanted it widened to "repository verification checks broadly", because the current sentence says what `npm run check` must prove while the `npm ls` scenario is not part of that script (`council-neil-pass2.md` M3; `council-neil-pass3.md` P2). Matt wanted the three subjects named instead: "broadly" admits checks nobody specified, which is scope for a later change, and the only defect is that one scenario sits outside the script (`council-matt-pass3.md` Q2). Both agreed that workflow words, "gate" and "gate evidence" among them, stay out of a living spec.

Both advisors flagged the same unverified thing. Michael's baseline counted `@ts-ignore`, `@ts-expect-error` and `biome-ignore` but not `@ts-nocheck`, so if a tracked file already carries one, the widened pattern is red the day it lands (`council-matt-pass2.md` N1). The run that proves Requirement 1 records the grep at HEAD.

## Synthesis & Recommendation

Take the seven points below, each traceable to a research finding or to a run Michael measured.

1. `package.json`: the `@earendil-works/pi-ai` devDependency moves to `^1.5.2`, matching pi-coding-agent's caret.
2. `test/provider.test.ts`: one throwing helper, `chatModel(m)`, that throws unless `m.type === undefined || m.type === "chat"` and returns the chat member. The eight field reads go through it, and `isModelType()` stays out.
3. `test/stream.test.ts`: `EMPTY_CONTEXT = normalizeContext({ messages: [] })`, and `normalizeContext` around the repeat-stop fixture's context too. The mocks keep `Context`. `src/repeat-stop.ts` keeps `Context`.
4. `specs/verification/spec.md` Requirement 1 names the `check` script in `package.json` without copying it. Its WHEN clauses say `npm ci`, and the `npm ls` scenario keeps its own command.
5. Requirement 2 keeps the suppression grep and adds `@ts-nocheck` to the pattern. Its cast sentence goes, and "this change adds no new cast or `any`" becomes a check on the diff in `design.md`.
6. Requirement 3 keeps one scenario, the cache file's modification time, and covers a file that was absent before the run and is still absent after.
7. The Purpose names its three subjects.

This shape keeps every clause of the spec runnable. The one rule no command proves moves onto the diff, where a reader can check it. The two structural questions stay where the measurements left them, instead of retyping code that nothing requires to move.

## Accepted & Rejected Feedback

Accepted:

- Neil, pass 1: the caret; the helper over inline guards; `normalizeContext` for both fixtures; `Context` in the mocks and in repeat-stop; the copied script out; `@ts-nocheck` in the pattern; Requirement 3's second scenario out; Requirement 2's cast sentence out.
- Matt, pass 1: `npm ci` in the WHEN clauses; the absent-file branch on the mtime scenario; the no-new-cast rule moved to the diff check.
- Neil pass 2 M2 and Matt pass 2 N3: both fixture contexts get `normalizeContext`, and Matt's "`:111` only" claim is withdrawn.
- Matt pass 2 N1 and N2: `@ts-nocheck` joins the pattern; the script is named rather than copied, and "each of its three parts SHALL pass" goes with the copy, because the script joins its parts with `&&` and the exit-0 scenario already covers all three.
- Neil pass 2 M4: "this change adds no new cast or `any`" belongs to `design.md` as a check on the diff, not to a living requirement.
- Matt pass 3 Q2: no workflow words in the spec, which both advisors ended up holding.

Rejected:

- Neil's negative-form predicate, from passes 1 and 3. Michael's ruling below decides it.
- Neil's "repository verification checks broadly" Purpose, from passes 2 and 3. The living specs' convention and Matt's objection decide it, in Michael's ruling below.
- Matt's pass-1 "`:111` only" normalization claim, which Matt withdrew in pass 2.
- Matt's pass-2 switch to the negative form, which Matt withdrew in pass 3 because his argument had covered only a fourth member without `reasoning` and `compat`.
- Neil's pass-1 ground that the negative form was "the only form measured". Measurement alone stopped deciding the question once Matt named a case it fails, which is why the dispute went to Michael (`council-matt-pass3.md` Q1).

## Michael's Rulings

### The `chatModel(m)` predicate

**Ruling:** the positive form. `chatModel(m)` throws unless `m.type === undefined || m.type === "chat"`, and returns `m` narrowed to the chat member.

**What decided it:** Matt's condition was met, because the form compiles and narrows, and Neil's remaining argument does not survive what the test is for. The test's subject is `toProviderModel` (`src/provider.ts:60-73`), which emits no `type` and can only produce the chat member, so neither form's runtime throw fires today or after any pi change. The forms differ only in how the helper reacts to a member this repository never produces. The negative form enumerates the complement of "chat" as of pi 1.5.2, a list over a set pi owns and can move: a bare fourth member then reds `tsc` on an unrelated upstream addition, which is churn, and a rich fourth member passes silently as chat, which is the wrong answer. The positive form names the one member the test wants, in the words of pi's own declaration, and is right in both cases.

**Evidence:** measured in a throwaway copy of the scratch with the stream edits applied. With the positive predicate, `npx tsc --noEmit` exits 0, `test/provider.test.ts` passes 4/4, and a `thinkingDefault` mutation at `src/provider.ts:61` still fails the test. A standalone probe over the union plus a hypothetical fourth member: the negative form reds `tsc` with a bare fourth member and compiles with a rich one, while the positive form compiles with both and returns the chat member only. `ProviderChatModelConfig` is not re-exported from `pi-coding-agent/dist/index.d.ts:8`, so the inferred return type is the only route. `types.d.ts:1530-1531` is the only union member whose `type` is optional.

### The Purpose line of `specs/verification/spec.md`

**Ruling:** Matt's form. The Purpose names its three subjects: the `check` script passing, one installed `@earendil-works/pi-ai` at the version `pi-coding-agent` pins, and the agent directory a verification run may touch.

**What decided it:** the three living specs open by naming their concrete subjects, and none uses an open-ended qualifier. "Broadly" is scope nobody asked for written into a living spec: it lets a later change file any check under this capability without a requirement that names it, and it tells a reader six months away nothing about what is here. Three subjects for three requirements is the one-sentence index every other living spec in this repository already carries. Workflow words stay out, as both advisors agreed.

**Evidence:** `openspec/specs/provider-access/spec.md:4`, `openspec/specs/package-identity/spec.md:4` and `openspec/specs/diagnostics/spec.md:4` each open with "Defines <the concrete subjects>". `package.json:15` shows the `check` script's three segments, and none of them runs `npm ls` or `git grep`, which is the defect that forced the edit.

## Owner Decisions Required

None. Michael marked no dispute for Joel, and neither advisor raised one. The proposal's fifth open question, dependabot grouping, needs no ruling either: the conductor's scope statement settles it, and `proposal.md`'s "What This Change Does Not Do" carries the decision.
