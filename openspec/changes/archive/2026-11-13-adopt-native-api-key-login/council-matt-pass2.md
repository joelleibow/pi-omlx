# Council pass 2: matt (council-matt, run f414b51c-d62b-4c48-abae-7028b10eb21b)

## C1: owner-decision

My pick has changed from Position M to Position N, with one condition. In pass 1 I said a notice needs state shared between the hook and the session events. That was wrong. pi awaits the offline restore before the session exists (ebf305b8 Q4), and pi picks the starting model from that same offline state. So a `session_start` check that reads the provider's own `getModels()` sees exactly the empty list that caused the silent fallback. It needs no stored ctx and no flag. The 'configured' half comes from `ctx.modelRegistry.hasConfiguredAuth('omlx')`, which is called from the live ctx of that same event, so nothing goes stale (Q7). The condition: show the notice only when the provider is configured and the list is empty. That keeps an unconfigured user quiet, as today's `catalogNotice` does for `not_configured` (eleanor 5477bf8a). The evidence makes the notice cheap and accurate, but it does not decide whether to show it. Ruling A reopened the earlier notice rulings, so this is still Joel's call. His archived reason for the notice, 'you can end up on another provider's model with nothing saying why', describes exactly this case. Unverified: whether `ctx.ui.notify` writes to stderr in `-p` or json mode. The test should assert that it does not.

Sources: research-chidi.md addendum ebf305b8 Q4; research-chidi.md Q7; research-eleanor.md addendum 5477bf8a; research-eleanor.md archived startup-change rulings; owner-rulings.md A

## C2: reject

I keep Position M. Today's login rejects a failed fetch and stores nothing, and a test covers it (`loginOmlx rejects when the catalog fetch fails, without storing credentials`). No ruling removes that behaviour. pi's reference implementation, llama's `login`, also validates by listing models (Q1), and Joel asked for 'the way pi 1.5.2 intends'. Validating does not conflict with the native-login spec: the request publishes nothing, which is what 'The Login Leaves The Catalog To Pi' forbids. If the login saves while oMLX is offline, a mistyped URL is stored. `check` then reports it configured, and every start falls back silently. Saving while offline would be a new product behaviour. Joel could choose it, but only if the design names it as a behaviour change.

Sources: research-eleanor.md Tests (test/oauth-login.test.ts); research-chidi.md Q1; specs/native-login/spec.md 'The Login Leaves The Catalog To Pi'

## C3: reject

The documents do not settle whether the offline phase runs for a provider pi treats as not configured. Two passages conflict. ebf305b8 Q1 step 2 and Q5 say the offline phase receives the raw stored credential of any type. Q6 quotes `models.d.ts:163-168`: 'unconfigured providers are skipped'. Q5 itself says its trace is 'not all paths run end-to-end'. Position N rests on that unproven premise, and it also needs a flag shared between the hook and `session_start`. Position M rests on verified facts. `readStoredCredential` follows `PI_CODING_AGENT_DIR`, as the auth-storage fixtures show, and it only checks the type, which is not a second resolution. So keep `src/auth-storage.ts` and `PROVIDER_KEY` where they are, and no `provider-access` delta is needed. To settle Position N, Chidi would run a scratch native provider with a stored `oauth` entry and a `check` that returns undefined, run `--list-models`, and log whether the offline `refreshModels` is called and with what `credential.type`.

Sources: research-chidi.md addendum ebf305b8 Q1; research-chidi.md Q5, Q6; research-eleanor.md Tests (test/auth-storage.test.ts)

## C4: refine

I accept the cause: a network-only catalog is empty after an offline restore, so `pi -p` with a stored model would lose its thinking controls. The refinement: read from the one in-memory list that `getModels()` serves, looked up by model id, and use `model.reasoning` as the thinking default. That is equivalent to today's rule. `toProviderModel` sets `reasoning` only when `thinking_default` is explicitly true, and the thinking controls disable thinking when the default is false, missing or null. The store keeps only plain pi model fields, so it cannot carry OMLX-only `thinkingDefault`. The test drives an offline restore of a stored model and asserts that thinking is disabled when `reasoning` is false.

Sources: research-eleanor.md addendum 0932ab2f (src/provider.ts, src/thinking.ts, test/provider.test.ts, test/thinking.test.ts); research-chidi.md addendum ebf305b8 Q1, Q4

## Recommendation changed: True

On C1 my pick moves to the configured-but-empty warning at `session_start`. The evidence that moved it: the offline restore is awaited before the session exists (ebf305b8 Q4), and `hasConfiguredAuth` can be read from the live ctx (Q7). Together they remove the shared, stale state I objected to in pass 1. C2, C3 and C4 are unchanged in substance, with C4 refined.

## Out-of-scope findings

- In `-p` mode, `ctx.ui.notify` writing to stderr is unverified for both notices. Today's spec promised nothing extra in a run with no UI.
