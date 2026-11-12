# Council — neil, pass 1

Run `f908e551-ef11-4c7f-98ba-0c25f0d7df86`.

## Recommendation

Settle Q1–Q8 around one pure resolver and trim host-runtime clauses from specs/credential-resolution/spec.md:
- Q1 & Q3 (Resolver): Replace loadConfig, resolveConfiguredApiKey, and hasOmlxTarget (src/config.ts) with one pure function returning { configured: false, apiRoot } or { configured: true, source, apiRoot, apiKey, keyless: apiKey === "", apiKeyEnvVar }. Startup/poll callers pass loadOmlxCredential() + process.env; oauth.login builds the same shape directly from prompted { baseUrl, apiKey } so fetchAndRegister/registerModels never read ambient state.
- Q2 (Mirror): Mirror pi 1.5.2 resolveProviderAuth (stored -> non-empty OMLX_API_KEY -> unconfigured) with shortcut: mirrors pi-ai resolveProviderAuth (1.5.2); re-verify on pi bumps. Avoid importing unexported pi-ai internals.
- Q4 (Re-register): Call pi.unregisterProvider("omlx") before pi.registerProvider when keyless is true, clearing prior apiKey merges with zero extra refreshes on keyed polls.
- Q5 (Env-only keyless): Return configured: false on OMLX_BASE_URL alone (skip /models fetch; register login-only provider). Name inverting test/config.test.ts:86-92, :104-110, and :116-118 as behavior changes in proposal.md.
- Q6 & Q7 (Tests & dead code): Unit-test the pure resolver directly; use PI_CODING_AGENT_DIR for new auth.json tests; leave untouched _setAuthPathForTesting sites in auth-storage.test.ts/index.test.ts for the seam card. Delete applyStoredCredentialToEnv + its 4 tests (test/config.test.ts:129-161); leave src/catalog.ts's readLastCatalogCache out of scope.
- Q8 (Trace): Add credentialSource ("stored"|"env"|"login") to provider_registered (index.ts:185-190); add no new event.
- Spec edits: Delete chat-request clauses (Scenarios 1.4, 3.1) and auth.json persistence (Scenario 3.2). Fold duplicate Scenario 2.1 into 1.1 (adding apiKey/authHeader) and 3.2 into 2.2 (asserting oauth.login return + cleared apiKey); rewrite Requirement 3/Scenario 3.1 to assert no catalog fetch and login-only registration.

## Evidence

- Pi 1.5.2 resolves stored oauth, then stored api_key, then $OMLX_API_KEY without env fallback or reading credential.baseUrl; ExtensionAPI has no modelRegistry. (research-chidi.md §1-3 (AI/auth/resolve.js:24-38, provider-composer.js:213, types.d.ts:245); owner-rulings.md (§1, §5, §6))
- Bare registerProvider keeps omitted apiKey; synchronous unregisterProvider + registerProvider clears the merge and preserves model selection. (research-chidi.md Addendum 1 (model-runtime.js:672-697, agent-session.js:2832-2836); research-eleanor.md Addendum 1 (index.ts:212-218))
- /login uses a fixed placeholder URL; only test/config.test.ts:116-118 tests OMLX_BASE_URL-only; applyStoredCredentialToEnv has 4 tests (:129-161) and no production callers; provider_registered already logs under [pi-omlx]. (research-eleanor.md Addendum 1 (src/oauth-login.ts:32-52, test/config.test.ts:116-161, index.ts:185-190, openspec/specs/diagnostics/spec.md:7-22))

## Assumptions

- [verified] Pi 1.5.2 shadows env whenever a stored credential exists and marks OMLX_BASE_URL-only unconfigured.
- [verified] readStoredCredential evaluates PI_CODING_AGENT_DIR per call, enabling seam-free auth.json tests.
- [unverified] Unqueued void refresh() calls from unregisterProvider+registerProvider inside oauth.login do not trigger CredentialSynchronizationError at runtime.
- [unverified] End-to-end ModelRuntime chat execution was not run; hand-edited empty api_key records in auth.json are outside normal /login flows.

## Risks

- During an empty-key /login, calling unregisterProvider + registerProvider inside oauth.login fires two unqueued void refresh() calls concurrently with post-login synchronizeCredentialState, which could raise a transient CredentialSynchronizationError.
- If auth.json is hand-edited to {type:"api_key", key:""} while OMLX_API_KEY is set, loadOmlxCredential returns undefined so the extension fetches the catalog with OMLX_API_KEY while pi rejects chat as unconfigured.
- Editing test/index.test.ts above line 72 shifts line numbers cited by openspec/specs/verification/spec.md (:72,76), leaving the living spec citation stale.

## Confidence

high: Precedence, re-registration merge clearing, test call sites, and diagnostics contracts are verified in pi 1.5.2 dist and repo research; only concurrent login-refresh runtime behavior is unverified.

## Challenge claims

1. Scenarios 1.4 and 3.1 assert pi chat-request behavior and Scenario 3.2 asserts auth.json persistence, which extension boundary tests cannot prove without testing the host library (violating PL7).
2. Requirement 3/Scenario 3.1 requires an unauthenticated /models fetch when only OMLX_BASE_URL is set, preserving dead network polling for a provider pi 1.5.2 refuses to use.
3. Scenario 2.1 duplicates Scenario 1.1's stored-credential contract, violating PL4's one-fact-one-place rule.

## Owner decisions

None

## What would change my mind

- Evidence that ExtensionAPI exposes resolved provider auth synchronously before session_start would eliminate mirroring resolveProviderAuth in src/config.ts.
- Reproducing CredentialSynchronizationError when unregisterProvider runs inside keyless oauth.login would require clearing apiKey outside the login callback.
- A product ruling that OMLX_BASE_URL alone must warm the catalog cache despite broken chat would retain the env-only keyless fetch.
