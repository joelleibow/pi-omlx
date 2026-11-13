# Council pass 2: neil (council-neil, run 8ce0b0c2-ca22-4691-8d30-11312d970455)

## C1: owner-decision

Evidence does not settle whether first-start silent fallback belongs in a TUI warning or docs; Ruling A reopened prior notice rulings without deciding this product behavior. Position M's shared-state objection does not hold once C3 uses readOmlxCredential(): session_start reads ctx.modelRegistry.hasConfiguredAuth(PROVIDER_KEY) and provider.getModels().length === 0 with zero hook state. Caveat: /reload runs only an unawaited offline refresh (model-runtime.js:650) and no network fetch, so any cold-store message must point to /model rather than promising a background fetch, and /reload vs session_start ordering is unmeasured. I still pick Position N (~3 stateless lines) because every upgrader leaving cache/omlx-models.json and every chezmoi-seeded/env first start hits an empty models-store.json once.

Sources: owner-rulings.md (Rulings A, B); proposal.md (Open Question 1); research-chidi.md Q7; Addendum ebf305b8 Q2, Q4; research-eleanor.md (External chezmoi seed)

## C2: reject

Reject probing with fetchModels in login() (keep Position N). First, throwing in login() aborts before Models.login persists (PAI/models.js:375-405), making specs/native-login/spec.md Scenario "A failed refresh keeps the credential" practically unreachable. Second, today's login fetched only for a false pre-1.5.2 premise (src/oauth-login.ts:4-13), and proposal.md explicitly removes it under Ruling A; changing test/oauth-login.test.ts's failed-fetch expectation is an intentional behavior change that the design should name. Third, probing in login() duplicates placeholder-key resolution outside resolve() (a second resolution path against ADR 0001) and doubles HTTP plus ~/.omlx/model_settings.json I/O on every login just to discard the first result. Fourth, typos or bad keys are not silent: completeProviderAuthentication immediately runs refreshModels (interactive-mode.js:5269-5285), which throws and shows pi's failure warning right away, and re-running /login omlx overwrites the entry.

Sources: specs/native-login/spec.md (The Login Leaves The Catalog To Pi); proposal.md (What Changes, Impact); michael-orientation.md (traps ii, vi); research-chidi.md Q2, Q5; Addendum ebf305b8 Q2, Q3; research-eleanor.md (Tests; Addendum 0932ab2f)

## C3: accept

Accept Position M. src/auth-storage.ts (PROVIDER_KEY and readOmlxCredential) already exists and is covered by test/auth-storage.test.ts, preserves openspec/specs/provider-access/spec.md (src/auth-storage.ts:4) with no extra spec delta, and keeps Provider stateless with respect to UI notices. The documents do not prove Position N's premise: PAI/models.js:180-216 runs offline refreshModels before checking auth in source reading, but PAI/models.d.ts:163-168 states "static, unknown, and unconfigured providers are skipped", and Chidi never executed the stale-oauth path. Checking readOmlxCredential()?.type === "oauth" in session_start (never for auth resolution) avoids that unverified internal behavior; keeping Position N would require Chidi to run a scratch native Provider (no auth.oauth) against an oauth-typed auth.json entry and measure offline refreshModels firing before session_start.

Sources: research-eleanor.md (Current credential path item 3, Tests); proposal.md (Impact); research-chidi.md Q5, Q6 (PAI/models.d.ts:163-168); Addendum ebf305b8 Q1 (PAI/models.js:180-216); michael-the-architect.md (The design gate PL4)

## C4: accept

Accept. toProviderModel maps OmlxModel.thinkingDefault === true 1:1 onto Model.reasoning, and applyOmlxThinkingControls treats false, null, and undefined identically by disabling thinking (test/provider.test.ts, test/thinking.test.ts). Because models-store.json stores Model[] rather than OmlxModel[] and pi -p runs only offline restore, reading reasoning from provider.getModels() keeps a single model list and preserves thinking controls on offline-restored sessions.

Sources: research-eleanor.md Addendum 0932ab2f; research-chidi.md Addendum ebf305b8 Q1, Q2, Q4

## Recommendation changed: True

Moved to Position M on C3: calling existing readOmlxCredential()?.type === "oauth" in session_start reuses tested code in src/auth-storage.ts, keeps PROVIDER_KEY at src/auth-storage.ts:4 without a provider-access spec delta, eliminates mutable state between refreshModels and session_start, and avoids relying on unmeasured PAI/models.js offline-phase ordering that contradicts PAI/models.d.ts:163-168. All other pass-1 recommendations stand.

## Out-of-scope findings

None
