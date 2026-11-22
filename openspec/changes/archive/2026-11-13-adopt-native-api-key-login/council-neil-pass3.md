# Council pass 3: neil (council-neil, run 9a0e1a81-d397-4835-a5fb-894c5633599d)

## C2: owner-decision

Evidence does not settle C2; it reduces to a user-facing contract choice Joel owns: whether /login omlx against an offline, mistyped, or 401 server saves the credential with pi's refresh warning (no probe) or rejects and stores nothing (probe). Arguments (e) and (f) show no ruling decides it: extensions/llama/provider.js:138-155 probes in login() while completeProviderAuthentication (interactive-mode.js:5269-5285) persists first and warns on refresh failure, so "as pi 1.5.2 intends" allows either; specs/native-login/spec.md is this change's unapproved draft (proposal.md Q3 leaves it open), while test/oauth-login.test.ts pins code written for a false pre-1.5.2 premise (trap ii), not a ruling.

I pick no probe: (1) avoids running fetchModels (HTTP plus ~/.omlx/model_settings.json read) twice per login and discarding the first result; (2) keeps apiKey || PLACEHOLDER solely inside resolve() (ADR 0001); (3) lets users save credentials while local oMLX is stopped or has no loaded model, while pi warns immediately after login on typos/401/offline and C1 covers empty-store restarts. If Joel picks probe, specs/native-login/spec.md Scenario "A failed refresh keeps the credential" must change to login rejection so PL4 holds no unreachable scenario.

Sources: owner-rulings.md (2026-11-12; Rulings A, C); proposal.md (Open Question 3); specs/native-login/spec.md (The Login Leaves The Catalog To Pi); michael-orientation.md (traps ii, vi); research-chidi.md Q1, Q2; Addendum ebf305b8 Q2, Q3; research-eleanor.md (Tests; Addendum 0932ab2f)

## Recommendation changed: True

Moved C2 from reject to owner-decision while keeping no-probe as my pick: llama/provider.js:138-155 (f) and existing login rejection in test/oauth-login.test.ts (e) show neither "as pi 1.5.2 intends" nor recorded rulings settle whether an unreachable login saves or rejects, and draft specs/native-login/spec.md is not an owner ruling.

## Out-of-scope findings

None
