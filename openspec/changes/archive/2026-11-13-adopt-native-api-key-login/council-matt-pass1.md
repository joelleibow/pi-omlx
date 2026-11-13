# Council pass 1: matt (council-matt, run f7999361-e6fe-4234-b690-5315d30545a9)

## Recommendation

**1. Notices.** Delete the extension's own catalog notices: the poll and fail/late warnings in `src/notice.ts` and its held-notice state. Keep one message, the ruling-B remedy (see 4). Every case where the extension could add a notice depends on a refresh it cannot observe. There is no hook or event for a refresh pi runs (`research-chidi.md` ebf305b8 Q3). The fallback on a first start with an empty store happens before any network phase in every mode (Q4), so no notice could prevent it. It can only explain it afterwards, and that needs shared state between `refreshModels` and a `ctx` captured in `session_start`, which goes stale on reload (Q7). The window is also narrow: once any refresh succeeds the store persists, and a `/login` refreshes straight away and shows pi's own warning if it fails (Q2, Q3). The docs should say that a first start with nothing in the store can land on another provider's model. This is Joel's call (see ownerDecisions).

**2. A failed `refreshModels` throws.** In the network phase, let `fetchModels` errors propagate. A 200 response with no model that has a positive `contextWindow` and `maxTokens` also throws a specific error and publishes nothing. That keeps today's "nothing registrable is a failure" rule (`research-eleanor.md` addendum, `fetchAndRegister`). A throw lands in `ModelsRefreshResult.errors` and shows on `/model` and after a login. Returning early shows nothing (Q3), which breaks Joel's standard 5 (strict and loud). The offline phase never throws: it restores `context.stored?.models ?? []` through `publish({update})`. Contract this depends on: `resolve` must return `env: {OMLX_BASE_URL: <resolved URL>}` and `auth.baseUrl`. The network phase receives only the synthesised `{key, env}` (Q2), so without that env the hook has no URL unless it resolves a second time, which the spec forbids.

**3. The login validates.** Keep a validation request at login: reuse `fetchModels`, discard the result, send the same placeholder bearer when keyless, and use `interaction.signal`. This is today's tested behaviour: "loginOmlx rejects when the catalog fetch fails, without storing credentials" (`research-eleanor.md`, `test/oauth-login.test.ts`). Dropping it would change behaviour, and nothing in the rulings asks for that. Without it, a mistyped URL or a wrong key gets stored. `check` then reports the provider configured with no models, and each later start falls back silently. llama validates the same way (Q1).

**4. The login-only registration goes.** Register the native provider once, at factory time. `getModels()` returns `[]` until the first refresh, so the login-only registration, the `unregisterProvider` dance and `toProviderConfig` all go. For ruling B's message, use a `session_start` handler with the existing read-only `readStoredCredential(PROVIDER_KEY)`: if the stored `type === "oauth"`, `ctx.ui.notify` one named constant that says `/logout` then `/login`. pi offers no other way to read the raw entry: the `check`/`resolve` inputs are typed `api_key`, and the registry exposes no raw read (Q5, Q7). This is a type check only, not a second resolution.

**Smells to name in the design:**
- The placeholder bearer gets one named constant, shared by `resolve` and the login validation.
- `resolve` must use `credential.key || PLACEHOLDER`, not `??`, so a stored `key: ""` (handwritten or seeded) does not reach the client's `No API key` throw (Q2 note; `michael-orientation.md` trap iii).
- `resolve` reads env only when `credential` is undefined (§2).

## Evidence

- pi shows nothing for a startup or RPC refresh failure, but does show one on /model and after a login; returning early shows nothing anywhere (research-chidi.md addendum ebf305b8 Q3)
- The model is chosen from offline state before any network refresh, so an empty store falls back silently (research-chidi.md addendum ebf305b8 Q4 (measured))
- The network-phase hook receives only the resolved {key, env} (research-chidi.md Q2; addendum ebf305b8 Q1 (measured))
- Today's login rejects when the fetch fails and stores nothing (research-eleanor.md, Tests (test/oauth-login.test.ts))
- check and resolve never see an oauth entry, and the registry has no raw-credential read (research-chidi.md Q5, Q7)
- `??` keeps an empty-string key, and an empty key throws before any request is sent (research-chidi.md Q2 note, Q4; michael-orientation.md trap iii)

## Assumptions

- [unverified] The existing readStoredCredential reads the auth.json that pi's agent directory resolves to
- [unverified] ctx.ui.notify in print or json mode writes nothing to stderr
- [unverified] The offline phase runs for a provider whose check returns undefined (Q5 says it does; the d.ts line quoted in Q6 says unconfigured providers are skipped)
- [verified] An error thrown in the network phase lands in errors rather than being swallowed
- [verified] oMLX ignores the bearer when verification is skipped

## Risks

- Nothing is stored and OMLX_BASE_URL now names a different server. pi's store is keyed by omlx, not by URL, so the offline phase restores the old server's models. Requests then go to the new URL with model IDs that may not exist there until the network refresh replaces them. This is a known limit; name it as a shortcut.
- A key that starts with `$` or `!` passes the login validation, which uses the literal key, then pi reinterprets it at read time and requests fail (Q2; trap vii).
- Validation plus pi's post-login refresh fetches the catalog twice. On a slow server this doubles the time the login dialog waits.

## Confidence

medium: Points 2 and 3 rest on measured or tested facts. Point 4 depends on how an unverified reader resolves its path and how the UI behaves when there is no session UI.

## Challenge claims

- An extension notice cannot prevent the first-start fallback. It could only explain it afterwards, through ctx state that goes stale on reload (ebf305b8 Q4; Q7).
- Dropping the login validation is a behaviour change to a tested contract, not a simplification (oauth-login.test.ts).
- resolve must put the resolved base URL in env, or refreshModels has to resolve a second time (Q2).

## Owner decisions

- Notice set: I'd pick no extension notice except the ruling-B remedy, with the docs explaining the first-start fallback. The alternative is one session-start notice after a failed startup refresh, which needs state shared between the hook and the session events. Joel's 2026-11-12 notice ruling is reopened, not replaced.

## What would change my mind

- If Chidi shows that the /model or post-login message includes the thrown error's text, throwing also carries the remedy, and the session_start reader is not needed.
- If Eleanor shows readStoredCredential has no consumer to keep and cannot reach pi's auth.json path, detect the old login in offline-phase refreshModels instead, provided the offline phase runs for an unconfigured provider.
- If Joel rules that a login must succeed while the server is down, drop the validation.
