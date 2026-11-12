# Owner rulings

## 2026-11-11 — Startup blocking is a must-fix

From Joel's triage of the 2026-11-11 ponytail audit of pi-omlx, on finding 4 (the extension's factory awaits a live model fetch, so pi's startup waits on it):

> "It's directly impacting user's experience without any indication of doing so. We don't want that sort of yucky in there."

Decided: pi's startup must not wait on the model fetch without the user being told; the card "Stop blocking pi startup on the model fetch" removes it.

## 2026-11-11 — Run this card

After PR #9 merged, Joel: "merge it and onto the next?"

Decided: this card, the next on the pi-omlx board, runs now. The card's acceptance criteria are his request: with cached models, pi's startup is not delayed by an unreachable server; the no-cache case has a deliberate, documented behaviour, and a test covers each case. Out of scope: changing the poll interval or backoff.

## Carried from earlier changes, still binding

From `openspec/changes/archive/2026-11-11-isolate-the-suite-from-the-agent-directory/owner-rulings.md`:

> "#2 is a must address. Tests never mutate operating functionality."

> "I noticed that there is implementation in files like @src/auth-storage.ts that's solely for testing, e.g. `_setAuthPathForTesting`. For me this is a smell and if we're taking this as our own, I don't want those smells. That's gross. Let's address it."
