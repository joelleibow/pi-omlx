# Owner rulings

## 2026-11-11 — `npm run check` must pass

From Joel's triage of the 2026-11-11 ponytail audit of pi-omlx, finding 5 (`npm run check` fails: biome and the tests pass, `tsc --noEmit` reports ten errors on pi 1.5.2):

> "#5 is a must address, as well. It's incredibly important that we be able to run tests and see them pass. If they don't then something is wrong and we have no idea what."

Decided: making `npm run check` pass is required work.

## 2026-11-11 — This card goes next

Asked which card goes through Conductor after the rename, Joel chose "Make npm run check pass (Recommended)", the option described as: "Bumps pi-ai to ^1.5.2, switches stream.ts to TranscriptContext, and narrows the provider test's types. Small. After it, every later change's gate is an actual green check instead of 'same failures as main', which is what the rename had to settle for."

Decided: this change runs before the other audit cards. The option's description of the work is a Janet's proposal, not a ruling on how the fix is done.

## 2026-11-11 — Tests never mutate operating functionality

From the same triage, on audit finding 2 (`npm test` overwrote the live `~/.pi/agent/cache/omlx-models.json`):

> "#2 is a must address. Tests never mutate operating functionality."

Decided: no test run may write to Joel's real pi agent directory. Until the board card that isolates the tests lands, every run of the suite, `npm run check` included, sets `PI_CODING_AGENT_DIR` to a scratch directory.
