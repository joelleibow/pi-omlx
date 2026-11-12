# Owner rulings

## 2026-11-11 — The credential split is a must-fix

From Joel's triage of the 2026-11-11 ponytail audit of pi-omlx. The finding he ruled on, as the audit stated it: "Your environment key and your saved login can disagree, and chat breaks. The extension fetches the model list using `OMLX_API_KEY` if it's set, and the login saved by `/login` if it isn't. Pi itself always uses the saved login for chat requests." Joel:

> "#1 is a must address"

Decided: making the model list and chat requests use the same credential is required work.

## 2026-11-11 — Tests never mutate operating functionality

From the same triage, on audit finding 2:

> "#2 is a must address. Tests never mutate operating functionality."

Decided: no test run may write to Joel's real pi agent directory. Every run of the suite, `npm run check` included, sets `PI_CODING_AGENT_DIR` to a scratch directory, as the living `verification` spec requires.

## 2026-11-11 — Test-only seams are a smell

From the same triage, on his own item 6:

> "I noticed that there is implementation in files like @src/auth-storage.ts that's solely for testing, e.g. `_setAuthPathForTesting`. For me this is a smell and if we're taking this as our own, I don't want those smells. That's gross. Let's address it."

Decided: removing the seams is another board card. This change adds no new production code that exists only for tests.

## 2026-11-11 — Run the next card

After PR #6 merged, Joel: "merge it, my friend. Once that's merged let's /skill:conductor-janet through the next card."

Decided: this card, the next on the pi-omlx board, runs now.

## 2026-11-11 — A saved login always wins

Asked whether `OMLX_API_KEY` or `OMLX_BASE_URL` should still change anything once a login is saved, Joel chose "Saved login always wins (Recommended)", described as: "Same rule pi uses for chat. A saved login decides the URL and key for both the model list and chat requests, and the env vars only apply when nothing is saved (CI, a fresh shell). To override in one shell, you /logout first. CONFIGURATION.md's \"OMLX_API_KEY overrides the stored login\" comes out; it was never true for chat."

Decided: a saved `omlx` credential supplies both the base URL and the key for the catalog and for requests. `OMLX_BASE_URL` and `OMLX_API_KEY` apply only when nothing is saved. The docs' override promise is withdrawn.

## 2026-11-11 — Env-only keyless is out of scope

Asked whether a keyless server configured by `OMLX_BASE_URL` alone, with no login, should work, Joel chose "Out of scope; document it (Recommended)", described as: "With only OMLX_BASE_URL set and no login, chat has never worked in pi 1.5.2: pi treats the provider as not configured. The docs say a keyless server uses /login with an empty key, and that env-only case is named as unsupported."

Decided: this change does not make env-only keyless work. The docs direct a keyless server to `/login` with an empty key and name the env-only case as unsupported.
