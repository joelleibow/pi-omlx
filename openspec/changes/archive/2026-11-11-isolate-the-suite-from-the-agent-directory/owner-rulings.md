# Owner rulings

## 2026-11-11 — Tests never mutate operating functionality

From Joel's triage of the 2026-11-11 ponytail audit of pi-omlx, on finding 2 (`npm test` overwrote the live `~/.pi/agent/cache/omlx-models.json` with its fixture):

> "#2 is a must address. Tests never mutate operating functionality."

Decided: the suite must not write to, or read from, the operator's real pi agent directory, whatever environment it is run in.

## 2026-11-11 — Test-only seams are a smell

From the same triage, on his item 6:

> "I noticed that there is implementation in files like @src/auth-storage.ts that's solely for testing, e.g. `_setAuthPathForTesting`. For me this is a smell and if we're taking this as our own, I don't want those smells. That's gross. Let's address it."

Decided: removing the seams is its own board card. This change adds no production code that exists only for tests.

## 2026-11-11 — Run the next card

After PR #7, Joel: "do it!  you should have  enough context window to take down the next card, as  well"

Decided: this card, the next on the pi-omlx board, runs now.

## 2026-11-11 — The ~/.omlx overlay is in scope

Asked whether this card also isolates the suite from the operator's real `~/.omlx/model_settings.json` (Michael measured 10 of 16 wiring tests failing when the overlay holds an entry for the fixture model), Joel chose "Include it (Recommended)", described as: "The suite also gets its own empty HOME, so tests can't read your real ~/.omlx/model_settings.json. Michael measured 10 of 16 wiring tests failing when your overlay has an entry for the fixture model. It's set in the same place as PI_CODING_AGENT_DIR, so no new mechanism."

Decided: the suite isolates itself from the operator's `~/.omlx` overlay as well as from the pi agent directory.

## 2026-11-11 — The .env read is isolated here too

Asked whether to handle the `.env` beside `index.ts` here or leave it to the card that deletes the loader, Joel chose "Isolate it here too", described as: "Neutralize the .env read during tests in this change too, ahead of that card deleting it."

Decided: this change also keeps a `.env` beside `index.ts` from reaching the suite. Deleting the loader stays on its own card.
