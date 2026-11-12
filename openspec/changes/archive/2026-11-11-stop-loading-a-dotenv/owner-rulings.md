# Owner rulings

## 2026-11-11 — Run this card

After PR #8 merged, Janet asked: "Next on the board is **"Stop loading a .env from the extension directory"**. That card also removes the `node:fs` mock #8 added. Shall I open it?" Joel invoked `/skill:conductor-janet` with: "it up, my friend"

Decided: this card, "Stop loading a .env from the extension directory" on the pi-omlx board, runs now. The card itself (finding 3 of the 2026-11-11 ponytail audit, which Joel's triage called must-fix) is his request; its acceptance criteria are its proposal.

## 2026-11-11 — Carried from the archived isolation change

From `openspec/changes/archive/2026-11-11-isolate-the-suite-from-the-agent-directory/owner-rulings.md`, still binding:

> "#2 is a must address. Tests never mutate operating functionality."

> "I noticed that there is implementation in files like @src/auth-storage.ts that's solely for testing, e.g. `_setAuthPathForTesting`. For me this is a smell and if we're taking this as our own, I don't want those smells. That's gross. Let's address it."

On the `.env`, Joel chose "Isolate it here too" for that change, described as neutralizing the read during tests there while the loader's deletion stayed on its own board card, which is this one.
