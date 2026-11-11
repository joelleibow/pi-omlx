# Council — matt, pass 3

Run `2457ea78-3750-45d2-9822-6c38b3b1cdc3`.

## Responses

- **Q1** — refine. The other advisor's question exposes a hole in my pass-2 argument. The TS2339 compile-time guard only works for a fourth member without `reasoning` and `compat`. If pi adds, say, `type: "x"` carrying both fields, the negative form compiles and treats it as chat at runtime, which is the wrong result Q1 names. So the evidence that moved me in pass 2 only covered one of the two cases. The positive form also matches pi's own rule: an omitted `type` is normalized to `"chat"` (types.d.ts:1530). From the declaration, `type` is undefined only on the chat member, because image and classifier both require their `type`, and "chat" appears only there. So the positive form should narrow, but no one has compiled it. Michael compiled and mutation-tested only the negative form. Refinement: the design takes the positive form, and the gate shows `tsc` at 0 errors with it plus the same `thinkingDefault` mutation still failing the test. If it fails to narrow, use the negative form; it is measured and correct on all of today's inputs. On today's inputs both forms behave identically, because `toProviderModel` omits `type`, so the choice only matters if pi adds a member. (research-chidi.md §4.2 (chat `type?: "chat"`, image `type: "image"`, classifier `type: "classifier"`, types.d.ts:1530-1559); research-chidi.md §4.3 (narrowing derived, not executed); michael-orientation.md trap (b) (only the negative-form helper was compiled and mutation-tested; toProviderModel omits type))
- **Q2** — refine. I accept dropping workflow words. This is a living spec that outlives the change, and 'gate' is a term from Marbleization's process, not from this repository. The spec's current Purpose doesn't use one; only my pass-1 note called the `npm ls` scenario 'gate evidence', so that wording must not get into the spec. I reject 'broadly'. A Purpose that open admits checks nobody specified, and Joel's smallest-change rule says no scope for later. The real defect is that the Purpose says 'what `npm run check` must prove', but the `npm ls` scenario is not part of that script. Refinement: the Purpose lists its three subjects by name: the repository's `check` script passing, the single installed pi-ai matching the one pi-coding-agent pins, and the agent directory a verification run may touch. The `npm ls` scenario keeps its command in its own WHEN clause, as it already does. (specs/verification/spec.md Purpose and the 'one pi-ai' scenario; research-eleanor.md 'Check command and HEAD verification' (the check script has three segments, none is npm ls))

## Recommendation changed

Yes: On Q1 I go back to the positive form. My pass-2 TS2339 argument does not cover a fourth member that carries `reasoning` or `compat`. Michael's measurement covers only the negative form, so the positive form is conditional on a `tsc` run at the gate. On Q2 the Purpose lists its subjects by name rather than saying 'broadly'.

## Out of scope findings

None
