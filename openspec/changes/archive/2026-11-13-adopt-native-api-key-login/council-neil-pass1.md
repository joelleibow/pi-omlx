# Council pass 1: neil (council-neil, run b29e6f33-87b1-4bfe-ab21-cbbb2f165f5f)

## Recommendation

Register one plain native Provider (id: PROVIDER_KEY, like llama/provider.js) in index.ts. Delete toProviderConfig, src/auth-storage.ts (move PROVIDER_KEY to src/config.ts with a provider-access spec delta), cache/omlx-models.json, the poll/backoff, registerLoginOnlyProvider, and state.lastError. Back auth.apiKey.check (side-effect-free) and resolve (emits provider_registered trace) with one pure helper in src/config.ts: when credential is present, never read ctx.env, normalize credential.env?.OMLX_BASE_URL || DEFAULT_OMLX_BASE_URL, and use credential.key || KEYLESS_PLACEHOLDER; when credential is undefined, require OMLX_API_KEY. Return OMLX_BASE_URL inside AuthResult.env so refreshModels gets the resolved URL without re-resolving. Forward context.signal to fetchModels, delegate Provider.stream via @earendil-works/pi-ai/compat and streamSimple via streamOmlxOpenAICompletions, and read model.reasoning from provider.getModels() in before_provider_request so offline-restored sessions keep thinking controls.

Q1 (Notices): Keep only two synchronous ctx.ui.notify(..., "warning") checks in session_start, with zero ctx.ui reference inside Provider: (a) stale oauth credential, and (b) configured omlx (ctx.modelRegistry.hasConfiguredAuth) with getModels().length === 0 (explains silent fallback and points to /model). Delete the rest of src/notice.ts; let pi render /login and /model errors.
Q2 (refreshModels failure): Throw on fetch error or zero registrable models so pi preserves models-store.json and surfaces /login and /model warnings.
Q3 (Login validation): Do not probe the server in login(); validate URL syntax via normalizeBaseUrl only so credentials save when oMLX is offline (one fetch, matching specs/native-login/spec.md).
Q4 (Login-only & Ruling B): Delete registerLoginOnlyProvider and unseen state.lastError; record context.credential?.type === "oauth" during offline refreshModels and show Ruling B's /logout then /login warning in session_start.

## Evidence

- registerLoginOnlyProvider exists only for legacy ProviderConfig; state.lastError (index.ts:262-265) is never shown in UI—only read by the OAuth callback (index.ts:186). Native getModels() starts as []. (research-eleanor.md Addendum 5477bf8a §1; research-chidi.md Q6, Addendum ebf305b8 Q4)
- PAI/models.js:180-216 runs offline refreshModels with the raw stored credential of any type (awaited at agent-session-services.js:111 before session_start) before skipping unconfigured providers in the network phase. (research-chidi.md Q5, Addendum ebf305b8 Q1, Q4)
- Network refreshModels receives synthesized {type:"api_key", key: result.auth.apiKey, env: result.env} without result.auth.baseUrl, requiring OMLX_BASE_URL in result.env. (research-chidi.md Q2 (PAI/models.js:251-258), Addendum ebf305b8 Q1)
- Throwing in refreshModels preserves models-store.json, populates ModelsRefreshResult.errors for /login and /model warnings, and is discarded at startup; RefreshModelsContext has no caller field and captured ctx invalidates on /new. (research-chidi.md Q7, Addendum ebf305b8 Q1-Q3; specs/native-login/spec.md)
- toProviderModel maps thinkingDefault === true 1:1 to Model.reasoning, while pi -p runs only offline restore of Model[] from models-store.json. (research-eleanor.md Addendum 0932ab2f; research-chidi.md Addendum ebf305b8 Q2, Q4)

## Assumptions

- [verified] pi persists auth.apiKey.login's credential before running post-login refresh (research-chidi.md Q2, Q3).
- [verified] oMLX v0.7.3/v0.8.0rc1 ignores any bearer when api_key is None or skip_api_key_verification is on over loopback (research-chidi.md Addendum 8e4d016f).
- [verified] pi -p against a stored catalog runs only offline refreshModels and reaches Provider.streamSimple (research-chidi.md Addendum ebf305b8 Q4).
- [unverified] refreshModels offline phase receives raw credential.type === "oauth" before session_start (traced at PAI/models.js:190-196 and agent-session-services.js:111; not run end-to-end).
- [unverified] Interactive TUI /model, post-login warnings, and before_provider_request via streamSimple onPayload behave as read in pi 1.5.2 source (not driven in TUI).
- [unverified] The operator's installed oMLX version matches v0.7.3/v0.8.0rc1 auth behavior on live HTTP traffic (no live server probed).

## Risks

- Literal API key in /login containing $ or leading !: AuthStorage.read runs resolveConfigValue on api_key records (auth-storage.js:376-381), expanding $VAR (e.g. to "") and causing 401 unlike legacy oauth.access.
- Keyless login against oMLX with main key set and allow_unauthenticated_inference: true (not skip_api_key_verification): /v1/models/status and /admin/api/global-settings return 401 (omlx/server.py:3976), so fallback /v1/models entries without maxTokens in ~/.omlx/model_settings.json fail isRegistrableModel and yield zero models.
- Stored api_key record with key: "": nullish coalescing (credential.key ?? placeholder) forwards "", making getClientApiKey throw No API key for provider: omlx; resolve must treat "" as keyless.

## Confidence

high: Platform hooks, models-store semantics, oMLX auth branches, and current notice/login code are traced to exact source lines, with offline/RPC refresh measured.

## Challenge claims

- Startup notices belong solely in session_start (stale-oauth + cold-store configured start), keeping Provider and refreshModels free of ctx.ui state and ctx invalidation bugs.
- refreshModels must throw on network failure or zero registrable models, and auth.apiKey.login must do synchronous URL normalization with no network probe.
- before_provider_request must read reasoning from provider.getModels() rather than a network-only OmlxModel[] list so offline-restored sessions (pi -p) keep thinking controls.

## Owner decisions

- Startup notice scope after Ruling A (Q1): warn in session_start on both stale oauth credentials (Ruling B) and cold-store configured starts (hasConfiguredAuth && getModels().length === 0), or warn only on stale oauth. I pick both (~6 lines): it explains pi's silent model fallback on first start while keeping warm-store starts silent.

## What would change my mind

- A live pi 1.5.2 run showing PAI/models.js skips offline refreshModels when stored credential.type === "oauth" would falsify offline stale-oauth detection.
- Evidence that RefreshModelsContext identifies the refresh caller without double-warning on /login or /model would reopen post-fetch startup-only failure notices.
- Evidence that before_provider_request needs an OmlxModel field beyond boolean reasoning would require reading overlay metadata during offline restore.
