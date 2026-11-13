# Owner rulings

## 2026-11-12 — Run this change: auth the way pi 1.5.2 intends

After Janet reported that pi-omlx logs in through pi's OAuth ("Use a subscription") path and stores the oMLX API key as an OAuth credential, and that pi 1.5.2's built-in llama.cpp provider logs into the same kind of server through a native API-key login, Joel said:

> "Let's /skill:conductor-janet getting auth to work as pi intended in w/ 1.5.2. That's my initial gut reaction."

Decided: a change that makes pi-omlx's authentication work the way pi 1.5.2 intends. What "as pi intended" requires is for the research to establish; the conversation's account of pi's auth surface is unvalidated context, not a ruling.

## 2026-11-12 — Owner decisions from Michael's orientation

Michael's orientation (`michael-orientation.md` §4) marked three questions `owner: joel`. Janet put each to Joel with the options below; his choices are quoted with the option text he picked.

**A. Scope.** Asked "pi's native API-key login only exists on the full Provider registration, which also gives pi a refreshModels hook it calls after login, at startup and when /model opens. How much of that does this change take?", Joel chose "Auth plus pi's whole catalog lifecycle", described as: "refreshModels with pi's model store replaces the poll, the backoff, the extension's cache and most of the notice code. pi never refreshes on a timer, so changes on the server would only show at startup, after login, or when /model opens. Reopens your notice rulings."

Decided: this change adopts pi's catalog lifecycle along with its login. `refreshModels` and pi's model store replace the extension's poll, backoff and catalog cache, and the notice rulings from `2026-11-12-stop-blocking-startup-on-the-model-fetch` are reopened for this change. Server-side changes reach a session at startup, after a login, or when `/model` opens.

**B. Saved OAuth-shaped logins.** Asked "Once omlx no longer declares OAuth, pi treats a saved oauth-type omlx entry as not configured. Your login, and the entry your chezmoi template seeds, is that shape. What happens on upgrade?", Joel chose "Clean break, /logout then /login (Recommended)", described as: "The old entry stops working. The login-only message and the docs say to log out and log in again, and the new login overwrites the entry. Your chezmoi template needs to seed the api_key shape, which is a change in your dotfiles."

Decided: no compatibility reader and no rewrite. An OAuth-shaped `omlx` entry resolves as not configured; the message and the docs name `/logout` then `/login`. The chezmoi template change is Joel's, in his dotfiles.

**C. Keyless on the wire.** Asked "Chat on a keyless login is broken at HEAD on pi 1.5.2 … Which do you want?", Joel chose "Placeholder bearer, if oMLX ignores it (Recommended)", described as: "A login with no key sends a placeholder token on both the catalog and chat, the way pi's llama provider does. The spec's 'no Authorization header' wording changes. If Chidi finds oMLX rejects it, this comes back to you."

Decided: a keyless login sends a placeholder bearer on catalog and chat requests. The condition is met: Chidi's addendum (`research-chidi.md`, run 8e4d016f) reads oMLX v0.7.3 and v0.8.0rc1 source and finds that with `skip_api_key_verification` on, the server ignores any bearer on `/v1/models`, `/v1/models/status` and `/v1/chat/completions`.

## 2026-11-12 — Owner decisions from the council (PL2)

`council.md` listed two owner decisions that Michael marked `joel` (`.pi` run a9ab1329). Janet put each to Joel; his choices are quoted with the option text he picked.

**C1. Startup notices.** Asked "Your notice rulings are reopened. pi shows nothing when its startup refresh fails, and a first start with no stored catalog silently lands on another provider's model. Which warnings does pi-omlx show at startup?", Joel chose "OAuth fix + empty-catalog warning (Recommended)", described as: "Two startup warnings, never both at once: an old OAuth login gets the /logout then /login fix; otherwise, if omlx is set up but pi has no models for it, a warning that you landed on another provider's model, pointing at /model. Every upgrade hits the empty case once, because pi doesn't read the old cache. Both advisors' and Michael's pick."

Decided: at session start the extension shows at most one warning: ruling B's `/logout` then `/login` remedy when the stored `omlx` entry is OAuth-shaped, and otherwise, when `omlx` is configured and pi holds no `omlx` models, a warning that names the fallback and points at `/model`. No other extension notice.

**C2. Login probe.** Asked "Should /login omlx check the server before saving?", Joel chose "Probe and reject (Recommended)", described as: "The login fetches the catalog once, discards it, and fails with the actual cause if the server is down, the key is wrong, or no model is usable. Nothing is stored on failure. The login dialog is the only place pi ever shows you the cause. Today's behaviour, and Michael's pick."

Decided: `/login omlx` fetches the catalog once with the credential it is about to return, applies the same registrable-model rule as `refreshModels`, discards the result and publishes nothing; on failure the login throws with the cause and pi stores nothing.

## Carried from earlier changes, still binding

> "#2 is a must address. Tests never mutate operating functionality." (archived `2026-11-11-isolate-the-suite-from-the-agent-directory/owner-rulings.md`)

> "I noticed that there is implementation in files like @src/auth-storage.ts that's solely for testing, e.g. `_setAuthPathForTesting`. For me this is a smell and if we're taking this as our own, I don't want those smells. That's gross. Let's address it." (archived `2026-11-12-remove-test-only-seams/owner-rulings.md`)

Joel ruled in `2026-11-11-one-credential-for-catalog-and-requests` that a saved login always wins, environment variables apply only when nothing is saved, and env-only keyless stays unsupported; ADR `docs/adr/0001-one-credential-decides-the-omlx-connection.md` records it. That archive's `owner-rulings.md` holds his words.
