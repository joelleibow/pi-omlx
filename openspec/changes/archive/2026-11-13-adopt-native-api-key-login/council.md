# Council Synthesis

## Question and Scope

**The question.** Does pi-omlx keep its own login and catalog machinery, or adopt pi 1.5.2's native API-key login and the catalog lifecycle that comes with it? The native `Provider` shape couples the two: `auth.apiKey.{login, check, resolve}` is only reachable on a complete `Provider`, and that same object must supply `refreshModels` and `getModels`, which pi calls at a session's start, after a login, when `/model` opens and at RPC startup, and never on a timer (`michael-orientation.md` traps i and ii; ruling A).

**Constraints.** Joel's rulings in `owner-rulings.md` (2026-11-12): decision A takes pi's whole catalog lifecycle along with the login and reopens the three notice rulings from `2026-11-12-stop-blocking-startup-on-the-model-fetch`; decision B makes an OAuth-shaped saved login a clean break with `/logout` then `/login`; decision C sends a placeholder bearer on a keyless login. Carried and still binding: a saved login always wins and the environment applies only when nothing is stored, env-only keyless stays unsupported, tests never mutate operating functionality, no production export or branch that exists only for a test, provider id `omlx` with `PROVIDER_KEY` as its one home, documentation never blocks a feature. ADR `docs/adr/0001-one-credential-decides-the-omlx-connection.md` fixes the credential order and permits moving the resolution into a hook pi calls. The living specs that must survive are `provider-access`, `diagnostics`, `environment-configuration`, `test-isolation` and `verification`.

**Evidence inputs.** `proposal.md` and its four open questions; the delta specs `catalog-discovery`, `credential-resolution`, `native-login` and `test-isolation`; `research-chidi.md` with addenda `ebf305b8` and `8e4d016f`; `research-eleanor.md` with addenda `0932ab2f` and `5477bf8a`; `michael-orientation.md`; and the six council reports, `council-neil-pass{1,2,3}.md` and `council-matt-pass{1,2,3}.md`.

**Out of scope.** `pi auth login` and `pi auth check` never load extensions, so they cannot see `omlx` and this change does not try to change that. Env-only keyless stays unsupported. The chezmoi template is Joel's, in his dotfiles. The stream wrapper's timeout, retry and event normalization, the thinking controls' behaviour and the model-metadata overlay do not move.

## Perspectives & Trade-offs

Across three passes the two advisors converged on everything except two questions, and on those two they ended on the same side of the argument while agreeing the evidence did not decide it.

**Agreed, and carried into the synthesis below.** Register one complete native `Provider`, once, at factory time; `toProviderConfig`, the login-only registration, its `unregisterProvider` dance and `state.lastError` all go (`council-neil-pass1.md` recommendation and Q4; `council-matt-pass1.md` §4). A failed or empty network refresh throws, while the offline phase restores the stored models and never throws (`council-neil-pass1.md` Q2; `council-matt-pass1.md` §2). `resolve` returns the resolved base URL inside the credential's `env` so the refresh needs no second resolution (`council-neil-pass1.md` recommendation; `council-matt-pass1.md` §2). Ruling B's message comes from a `session_start` handler that reads the stored entry's type, never from state shared with the hook (`council-matt-pass1.md` §4, adopted by Neil in `council-neil-pass2.md` C3). The resolution reads the environment only when pi supplies no credential, and keyless-ness is `credential.key || PLACEHOLDER`, never `??` (`council-matt-pass1.md` smells; `council-neil-pass1.md` risks). Thinking controls read `model.reasoning` from the one list `provider.getModels()` serves (`council-matt-pass2.md` C4; `council-neil-pass2.md` C4). The extension's own catalog notices go, because pi exposes no observation point for a refresh it runs (`council-matt-pass1.md` §1; `council-neil-pass1.md` Q1).

**Disputed.**

- **C1, the notice set.** Neil picks ruling B's stale-`oauth` warning plus one `session_start` warning when `omlx` is configured and `getModels()` is empty, pointing at `/model`, in all three passes (`council-neil-pass1.md` owner decisions; `council-neil-pass2.md`, `council-neil-pass3.md` C1). Matt picks the same pair from pass 2 on (`council-matt-pass2.md` C1), reversing his pass-1 position that only ruling B's warning should exist and the first-start fallback should be explained in the docs (`council-matt-pass1.md` owner decisions). What moved Matt was Neil's mechanism: pi awaits the offline restore before the session exists, so a `session_start` check reading the provider's own `getModels()` sees exactly the empty list that caused the fallback, and the live `ctx` keeps the configured half fresh. Matt's pass-1 objection — that a notice could only explain the fallback, and would need state that goes stale — was reduced by that mechanism to the check both advisors then accepted, with the message pointing at `/model` rather than promising a background fetch. Both marked the outcome `owner`.
- **C2, the login probe.** Neil picks no probe in all three passes (`council-neil-pass1.md` Q3, `council-neil-pass2.md` C2, `council-neil-pass3.md` C2). Matt picks a probe in passes 1 and 2 and no probe in pass 3 (`council-matt-pass1.md` §3, `council-matt-pass2.md` C2, `council-matt-pass3.md` C2), moved by the C1 warning plus pi's immediate post-login warning. Both marked the outcome `owner` in pass 3. They split on whether probing is a second resolution path — Matt's pass-3 answer: a probe can call the same pure function `resolve` uses, on the credential it is about to return — and on whether a probe makes the spec's "A failed refresh keeps the credential" scenario unreachable.

## Synthesis & Recommendation

Adopt pi's native login and, with it, pi's catalog lifecycle: one complete `Provider` whose `auth.apiKey` hooks hang off the same object that serves `getModels`, `stream` and `streamSimple`; `refreshModels` as the only place the catalog is fetched, driven by pi's four triggers and never by a timer (ruling A); pi's model store as the only catalog persistence.

The mechanism the council converged on:

1. **Registration.** `registerProvider(provider)`, once, with no `auth.oauth`. `check` is side-effect free; `resolve` is the one credential resolution and returns the base URL in `env` and `auth.baseUrl` alongside the key.
2. **Refresh.** The offline phase publishes `context.stored?.models ?? []` and returns. The network phase calls `fetchModels` with the credential pi hands it and `context.signal`, and throws on a transport error or on a response with no registrable model, so pi records the failure and shows it where pi shows failures.
3. **Login.** `auth.apiKey.login` prompts for a base URL then an optional key, normalizes the URL to end in `/v1`, rejects a blank URL, and returns an `api_key` credential for pi to store. It publishes nothing and registers nothing. Whether it also validates against the server is C2 below.
4. **Notices.** A `session_start` handler shows ruling B's `/logout` then `/login` message when the stored entry is `oauth`-typed, read through `src/auth-storage.ts` as a type check only. Whether it also shows the configured-but-empty warning is C1 below. Everything else in `src/notice.ts` goes.
5. **Records.** `src/config.ts` loses its `shortcut:` mirror of pi-ai's order and `AGENTS.md` loses the trap that describes it; ADR 0001's successor is written in the docs pass, because two of its measured premises change.

The rationale is Joel's ruling A read literally: pi's lifecycle replaces the poll, the backoff, the cache and most of the notice code, and the extension keeps only what pi cannot observe — the state of the stored credential and the shape of a credential pi hands back.

## Accepted & Rejected Feedback

**Adopted.**

- One native provider, registered once; the legacy registration path deleted. `state.lastError` was read only by the OAuth callback and shown to nobody (`council-neil-pass1.md` evidence: `index.ts:262-265`, `:186`), and a native `getModels()` starts empty, so there is no login-only shape to keep.
- A failed or empty network refresh throws. A throw lands in `ModelsRefreshResult.errors` and reaches `/model` and the post-login message; an early return shows the user nothing (`research-chidi.md` addendum `ebf305b8` Q3). "Nothing registrable is a failure" is today's rule (`research-eleanor.md` addendum `0932ab2f`).
- The offline phase restores and never throws. pi awaits it before the session exists (`research-chidi.md` addendum `ebf305b8` Q4, measured).
- `resolve` returns the base URL in `env`. The network hook receives only the synthesised `{key, env}` (`research-chidi.md` Q2; addendum `ebf305b8` Q1), so without it the hook has no URL except by resolving a second time, which the spec forbids.
- Ruling B's detection is a type check on the stored entry through `src/auth-storage.ts`. It reuses tested code (`test/auth-storage.test.ts`), keeps `PROVIDER_KEY` where `openspec/specs/provider-access/spec.md` names it, keeps the provider free of UI state, and does not rest on whether the offline phase runs for a provider whose `check` returns nothing — `PAI/models.d.ts:163-168` says unconfigured providers are skipped while `PAI/models.js:180-216` traces otherwise, and Chidi never ran that path (`council-neil-pass2.md` C3, `council-matt-pass2.md` C3).
- Thinking controls read `model.reasoning` by model id from `provider.getModels()`. The store holds plain pi model fields, so OMLX-only `thinkingDefault` cannot survive an offline restore, and `pi -p` runs only the offline restore (`research-eleanor.md` addendum `0932ab2f`; `research-chidi.md` addendum `ebf305b8` Q4).
- One placeholder constant, and `credential.key || PLACEHOLDER`. `??` forwards `""`, and the client throws `No API key for provider: omlx` before any request (`michael-orientation.md` trap iii; `research-chidi.md` Q2 note). The login's validation, if Joel keeps one, uses the same constant.
- The environment is read only when `credential` is `undefined`. llama's `credential?.key ?? ctx.env(...) ?? "local"` would let `OMLX_API_KEY` reach a saved keyless login, which the ruling and the spec scenario forbid (`michael-orientation.md` §2).
- The extension's own catalog notices go. There is no hook or event for a refresh pi runs (`research-chidi.md` addendum `ebf305b8` Q3).

**Set aside.**

- Detecting the stale OAuth entry inside the offline `refreshModels` through `context.credential.type` (`council-neil-pass1.md` Q4; the alternative in `council-matt-pass1.md` §4). It rests on a phase order no one measured for an unconfigured provider, and it needs a flag shared between the hook and the session event.
- `ctx.modelRegistry.hasConfiguredAuth("omlx")` as the configured predicate (`council-neil-pass2.md`/`-pass3.md` C1; `council-matt-pass2.md`/`-pass3.md` C1). The premise does not run: `hasConfiguredAuth` takes a `Model` and reads `model.provider`, so the string form forwards `undefined` and is always false (`model-registry.js:31-33`; measured in `scratch-michael/has-configured.mjs`). The replacement is recorded under C1.
- Matt's pass-1 objection that a cold-store notice needs shared state that goes stale on reload. He withdrew it in `council-matt-pass2.md`: the offline restore is awaited before the session exists, and the configured half is read from the live `ctx` of the same event.
- Neil's pass-2 argument that a probe opens a second resolution path (`council-neil-pass2.md` C2, point 3). Matt rejected it as stated, and the ruling below agrees: a probe can run on the credential the login is about to return, before pi stores anything.
- Neil's pass-2 claim that a probe makes "A failed refresh keeps the credential" unreachable. The scenario still holds when the server fails between the login and the refresh, and if Joel removes the probe the spec's change is made deliberately rather than as fallout.

## Michael's Rulings

Both disputes the brief put to him came back marked `joel`, so neither is settled on his authority. Both are recorded under Owner Decisions Required with the conditions he attached; whether either becomes a decision at all is Joel's.

What he did rule on is the converged set the brief carried, which he found in conflict with no decision in play:

- **`resolve` reads the environment only when nothing is stored** stands. It satisfies Joel's saved-login-wins ruling and ADR 0001's order, and pi-ai's own resolution is the same rule (`michael-orientation.md` §2).
- **`credential.key || PLACEHOLDER`** stands. Ruling C requires the placeholder; `??` would forward `""` and the client throws before any request.
- **Reading the stored entry's type through `src/auth-storage.ts` is a read, not a write.** ADR 0001 forbids the extension writing `auth.json`; nothing in that ADR forbids reading it, and the read keeps `PROVIDER_KEY` at the module `openspec/specs/provider-access/spec.md` names.

He also retired the advisors' configured predicate by measurement rather than by argument: `ModelRegistry.hasConfiguredAuth` takes a `Model` and reads `model.provider` (`model-registry.js:31-33`), so `hasConfiguredAuth("omlx")` passes `undefined` to the runtime and returns false every time. The correction is recorded once, under C1, because that is where the predicate is used.

## Owner Decisions Required

Two rows remain. Each was tested against `owner-rulings.md`: neither is settled by ruling A, which reopens the earlier notice rulings without replacing them, nor by rulings B and C, nor by any carried ruling.

### C1. Does a start that silently lands on another provider's model warn? — Joel's

**Ruled — Joel chose both warnings** ("OAuth fix + empty-catalog warning"), in `owner-rulings.md`, 2026-11-12 PL2, C1.

**The choice.** Ruling B's stale-`oauth` warning is already decided by ruling B. The question is whether the extension adds one `session_start` warning when `omlx` is configured and its model list is empty, pointing at `/model`, or leaves the first-start fallback to the documentation.

**Both advisors' pick (Neil in all three passes; Matt from pass 2):** show both warnings. Matt's pass-1 alternative, since withdrawn, was ruling B's warning only, with the first-start fallback explained in the docs.

**Michael's recommendation: show the warning**, the advisors' pick. His reasons: every upgrader hits the empty-store case once, because `cache/omlx-models.json` is not pi's store; pi shows nothing for the startup refresh (`interactive-mode.js:866-870` discards the result and its errors, and main.js's RPC path swallows them with `.catch(() => {})`); and the mechanism needs no shared state. It is the same case Joel gave in the archived ruling — "you can end up on another provider's model with nothing saying why."

**Conditions that bind the design if Joel picks it.**

1. **The predicate the advisors wrote does not run.** `ModelRegistry.hasConfiguredAuth` takes a `Model` and reads `model.provider` (`model-registry.js:31-33`), so `ctx.modelRegistry.hasConfiguredAuth("omlx")` passes `undefined` and is always false; measured in `scratch-michael/has-configured.mjs`. The design must use `getProviderAuthStatus("omlx").configured`, or `await ctx.modelRegistry.getProviderAuth("omlx")`, since the handlers are awaited (`runner.js:827`). The test must show the warning firing.
2. **One warning per start.** `getProviderAuthStatus` reports `configured: true, source: "stored"` for any stored entry, the stale `oauth` one included (`model-runtime.js:448-452`; `storedProviders` comes from `credentials.list()` regardless of type, `:209`). On the upgrade case both warnings would therefore fire unless the configured-but-empty check is the `else` of ruling B's check.
3. **Nothing reaches a non-interactive run.** In print and json modes `ctx.ui.notify` is a no-op (`runner.js:132-136`; `print-mode.js:60` binds no `uiContext`), which closes Matt's unverified stderr concern. The test still asserts that nothing is written.

**If Joel picks the docs-only alternative**, the fallback becomes a documented limit rather than a warning, and the `session_start` handler keeps only ruling B's message.

### C2. Does `/login omlx` fail when the server is unreachable? — Joel's

**Ruled — Joel chose probe and reject**, in `owner-rulings.md`, 2026-11-12 PL2, C2.

**The choice.** Either the login normalizes the URL and returns the credential even when oMLX cannot be reached, leaving pi's post-login refresh to warn, or it validates with a catalog fetch, rejects and stores nothing, as today's login does and as `test/oauth-login.test.ts` pins ("loginOmlx rejects when the catalog fetch fails, without storing credentials").

**Both advisors' pick: no probe** — Neil in all three passes, Matt from pass 3 (reversing his passes 1 and 2).

**Michael's recommendation: probe**, against both, for one measured reason their pass-3 reversal rests on. pi never shows the cause of a failed refresh: the post-login warning is the fixed string "Saved API key for omlx, but its model catalog could not be refreshed; using cached models" (`interactive-mode.js:5277-5279`) and `/model` says "Could not refresh omlx; showing cached models." (`model-selector.js:142-143`); neither carries the thrown error. The login dialog is the only place the cause reaches the user: `Failed to save API key for OMLX: <errorMsg>` (`interactive-mode.js:5339-5346`). Without a probe, a mistyped URL, a wrong key, a 401 from a server that requires a key, and a catalog with no registrable models all read the same way — "could not be refreshed; using cached models" with nothing cached — and the only route to the cause is `PI_OMLX_DEBUG`.

**Shape if Joel picks it.** One `fetchModels` call with `interaction.signal` and the shared placeholder, applying the same registrable rule `refreshModels` applies so the two cannot disagree, result discarded, publishing nothing (consistent with "The Login Leaves The Catalog To Pi"). It runs on the credential the login is about to return, before pi stores anything, so it is not a second resolution path. Its costs: one extra request per login, and a login cannot be saved while the server is down, which a later `/login` covers.

**If Joel picks no probe**, the design must name the removal as a behaviour change and change `test/oauth-login.test.ts` deliberately, not as fallout.

### Settled, and therefore not owner decisions

Rulings A, B and C (`owner-rulings.md`, 2026-11-12); the saved-login-wins order and the unsupported env-only keyless shape (carried rulings, ADR 0001); `PROVIDER_KEY`'s home and the provider id `omlx` (`openspec/specs/provider-access/spec.md`); ruling B's message text and remedy. C3 (where the stale-entry detection reads from) and C4 (thinking controls on an offline restore) are converged between the advisors and settled by the measurements above, so they are not Joel's.
