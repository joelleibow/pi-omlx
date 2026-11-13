# Proposal

## Why

`/login omlx` reaches pi through the OAuth path and keeps the oMLX API key as an OAuth credential — `{type: "oauth", access: <key>, refresh: "", expires: Number.MAX_SAFE_INTEGER, baseUrl}` (`research-eleanor.md`, "Current credential path", item 1) — while pi 1.5.2's built-in llama.cpp provider logs into the same kind of server through a native API-key login (`research-chidi.md` Q1). Two things are broken at HEAD on pi 1.5.2: chat on a keyless login throws `No API key for provider: omlx` before any request (`michael-orientation.md` trap iii, measured), and the login fetches the catalog itself because pi was believed to refresh before the credential is stored, which is false on 1.5.2 (`michael-orientation.md` trap ii; `research-chidi.md` Q2). Joel ruled the change: make the authentication work the way pi 1.5.2 intends, and take pi's catalog lifecycle with it (`owner-rulings.md`, 2026-11-12, decisions A, B and C).

## What Changes

**The login becomes pi's native API-key login.**

- The extension registers a complete pi-ai `Provider` with `auth.apiKey.{login, check, resolve}` and no `auth.oauth`, instead of the legacy `registerProvider(name, config)` form (`research-chidi.md` Q1; `michael-orientation.md` trap i). `src/provider.ts`'s `toProviderConfig`, with its `apiKey: "$OMLX_API_KEY"` and `authHeader`, goes with the legacy form.
- `/login omlx` prompts for a base URL and an optional key, and returns an `api_key` credential: the URL as provider-scoped environment, the key when one was entered (`research-chidi.md` Q1, Q2, Q4).
- **The login validates before it saves.** It fetches the catalog once with the credential it is about to return, discards the result, publishes nothing, and fails with the cause, so an unreachable server, a wrong key or a catalog with no usable model stores nothing (ruling C2 in `owner-rulings.md`; `council.md` C2).
- **BREAKING — the stored credential's shape.** The `omlx` entry becomes `{type: "api_key", key?, env: {OMLX_BASE_URL}}` in place of today's `{type: "oauth", access, refresh, expires, baseUrl}` (`research-eleanor.md`, "Current credential path", item 1; `research-chidi.md` Q1, Q4).
- **BREAKING — an existing OAuth-shaped login stops resolving.** pi treats a stored `oauth` entry for a provider with no OAuth handler as not configured, with no fallback to the environment or to the provider's `resolve` (`research-chidi.md` Q5). Ruling B takes the clean break: no compatibility reader, no rewrite, `/logout` then `/login`, and the new login overwrites the entry. Joel's own login and the entry his chezmoi template seeds are that shape (`research-eleanor.md`, "External chezmoi seed"); the template is his to change.
- **BREAKING — the keyless wire changes.** A login with no key sends a placeholder bearer on the catalog request and on chat, replacing the empty key that throws today and the absent header `openspec/specs/credential-resolution/spec.md` promises today (ruling C; `research-chidi.md` Q4; addendum `8e4d016f`: with `skip_api_key_verification` on, oMLX ignores any bearer on `/v1/models`, `/v1/models/status` and `/v1/chat/completions`).

**The catalog becomes pi's.**

- **BREAKING — the extension's catalog cache is no longer written or read.** `cache/omlx-models.json` goes; pi's model store (`models-store.json` under pi's agent directory, keyed `omlx`) replaces it (`research-eleanor.md` addendum `0932ab2f`; `research-chidi.md` addendum `ebf305b8` Q1).
- `refreshModels` replaces the ten-minute poll, the 2 s→60 s backoff, and the catalog fetch and registration the login performs before it returns (`research-eleanor.md`, "Current credential path", item 1, and addendum `0932ab2f`; ruling A). pi calls the hook at a session's start (an offline phase, awaited), after a login, when `/model` opens, and at RPC startup, and never on a timer (`research-chidi.md` addendum `ebf305b8` Q2). A change on the server therefore reaches a session at one of those triggers and not before (ruling A).
- The three notice rulings from `2026-11-12-stop-blocking-startup-on-the-model-fetch` are reopened (ruling A). Their replacement is one startup warning, in two forms at most one at a time (ruling C1 in `owner-rulings.md`; `specs/catalog-discovery/spec.md`).

**Unchanged.**

- Which credential wins: a saved login always wins, `OMLX_BASE_URL` and `OMLX_API_KEY` apply only when nothing is stored, and env-only keyless stays unsupported (`docs/adr/0001-one-credential-decides-the-omlx-connection.md`; `owner-rulings.md`, carried rulings). The resolution moves into the hooks pi calls, and it SHALL NOT merge environment variables into a stored credential the way llama's `credential?.key ?? ctx.env(...) ?? "local"` does (`michael-orientation.md` §2).
- Provider id `omlx`, and `PROVIDER_KEY` as its one home (`openspec/specs/provider-access/spec.md`).
- The stream wrapper's timeout, retry and event normalization, the thinking controls, and the model-metadata overlay (`OMLX_MODEL_SETTINGS_PATH`, `~/.omlx/model_settings.json`) (`research-eleanor.md` addendum `0932ab2f`).
- The isolation contract: fixtures reach pi's state through `PI_CODING_AGENT_DIR`, no `tmpdir` outside `test/isolation/global-setup.ts`, no suppressions (`AGENTS.md`; `openspec/specs/test-isolation/spec.md`).

## Capabilities

### New Capabilities

- `native-login`: how `/login` reaches the extension, what it asks for, and what pi stores — a native API-key login on a complete provider.

### Modified Capabilities

- `credential-resolution`: the resolution moves into pi's `check` and `resolve`; the legacy registration fields and the poll go; a keyless login sends a placeholder bearer; an OAuth-shaped entry resolves as not configured.
- `catalog-discovery`: pi's `refreshModels` and model store replace the extension's fetch, poll, cache and notices.
- `test-isolation`: fixtures reach pi's model store through the agent directory instead of the extension's catalog cache.

## Impact

- **Code**: `index.ts` (registration, login wiring, poll and notice removal), `src/oauth-login.ts` (the login becomes `auth.apiKey.login`), `src/config.ts` (the resolution moves into `resolve`, and its `shortcut:` mirror of pi-ai's order goes — `michael-orientation.md` trap vi), `src/auth-storage.ts` stays; `readOmlxCredential`'s one remaining caller is the `session_start` warning (D9 in `design.md`), `src/catalog.ts` (`fetchModels` runs under `refreshModels`), `src/provider.ts` (`toProviderConfig` goes), `src/notice.ts` (reduced to the one startup warning ruling C1 settles), `src/debug.ts` (the `provider_registered` source line moves to a hook pi calls, because the factory has no credential access — `research-chidi.md` Q7). `src/stream.ts` keeps its logic and becomes the provider's `stream` and `streamSimple` (`research-chidi.md` Q6).
- **Tests**: the fake pi must accept a `Provider` and drive `auth.apiKey.login`, `resolve`, `check` and `refreshModels` with an `AuthContext` (`michael-orientation.md` trap viii; `research-eleanor.md`, "Tests and how fixtures reach credentials"). `test/config.test.ts`, `test/auth-storage.test.ts` and `test/oauth-login.test.ts` fix the OAuth record shape and change or go with it; the poll, backoff and notice tests in `test/index.test.ts` and `test/notice.test.ts` go with the code they test (`research-eleanor.md` addendum `0932ab2f`). `CALLER_ENV_KEYS` needs no new key unless the design adds one (`test/isolation/global-setup.ts`).
- **Docs**: `docs/CONFIGURATION.md` promises an `oauth`-typed record and a working keyless login, and `README.md` and `ARCHITECTURE.md` describe the poll, the cache and the login's fetch; all of those become false (`research-eleanor.md`, "Docs"; `michael-orientation.md` trap ix). `AGENTS.md`'s trap about the `shortcut:` mirror in `src/config.ts` goes with the mirror. ADR 0001's two measured premises — "pi's answer is not readable at the moments that matter" and "the extension's resolution is a copy of pi's" — change, and its "keyless provider registrations unregister first" consequence no longer applies to a native provider; the docs pass writes the successor ADR rather than editing an accepted one.
- **Users**: a saved OAuth-shaped login, Joel's included, stops working until `/logout` then `/login` (ruling B).
- **Not this change**: `pi auth login` and `pi auth check` never load extensions, so they cannot see `omlx` at all; the change does not try to change that, and the docs must not promise them (`research-chidi.md` Q3). Env-only keyless stays unsupported, on Michael's recommendation to keep it out of this change and record that its premise changed (`michael-orientation.md` §4 D). The chezmoi template is Joel's, in his dotfiles (ruling B). `openspec/specs/provider-access/spec.md` names `src/auth-storage.ts:4` as `PROVIDER_KEY`'s home; if that module goes, the pointer needs a delta the design should raise.

## Questions And Their Answers

The four questions this proposal put to the council are answered. None is left for the design to settle.

1. **Which notices survive ruling A's reopening?** Joel ruled: two startup warnings, never both at once — ruling B's `/logout` then `/login` remedy for a stored OAuth-shaped entry, and otherwise, when `omlx` is configured and pi holds no `omlx` models, a warning that names the fallback and points at `/model` (ruling C1 in `owner-rulings.md`, 2026-11-12; `council.md` C1).
2. **Does a failed `refreshModels` throw, so pi records and shows it, or publish nothing silently?** It throws. The council converged on this, and the reason is what pi does with it: a throw lands in `ModelsRefreshResult.errors` and reaches the `/model` and post-login messages, while an early return shows the user nothing (`council.md`, Accepted & Rejected Feedback; `research-chidi.md` addendum `ebf305b8` Q3).
3. **Does the login validate the base URL before returning, as llama's does?** Joel ruled that it does: the login fetches the catalog once, discards the result, applies the same registrable-model rule as `refreshModels`, and fails with the cause, storing nothing (ruling C2 in `owner-rulings.md`; `council.md` C2).
4. **What remains of the "login-only" registration and its message?** The registration goes: there is one provider, and its catalog is empty until the first refresh. Ruling B's message survives as the first of the two startup warnings ruling C1 settles (`council.md`, Synthesis & Recommendation; `specs/catalog-discovery/spec.md`).
