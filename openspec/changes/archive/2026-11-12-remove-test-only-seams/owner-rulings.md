# Owner rulings

## 2026-11-11 — Test-only seams are a smell

From Joel's triage of the 2026-11-11 ponytail audit of pi-omlx, his item 6:

> "I noticed that there is implementation in files like @src/auth-storage.ts that's solely for testing, e.g. `_setAuthPathForTesting`. For me this is a smell and if we're taking this as our own, I don't want those smells. That's gross. Let's address it."

Decided: production code carries no export or branch that exists only to serve tests. The card "Remove test-only seams from production code" removes them. Its acceptance criteria are his request: no production export or branch exists only to serve tests, and the tests that used a seam still prove the same behaviour, isolated through a temporary agent directory. Out of scope: parameters like `env = process.env` that production callers could legitimately pass.

## 2026-11-11 — Run this card

After PR #10 merged, Janet asked "Shall I open the seam card?" Joel: "yeah. lets get these done"

Decided: this card runs now.

## Carried from earlier changes, still binding

From `openspec/changes/archive/2026-11-11-isolate-the-suite-from-the-agent-directory/owner-rulings.md`:

> "#2 is a must address. Tests never mutate operating functionality."

The per-call cache path was moved onto this card by Michael's ruling on that change (its `council.md`, Michael's rulings), and the `tmpdir()` fixtures by his Validate verdict on `stop-loading-a-dotenv`; both are recorded on the board card.
