# Council — matt, pass 1

Run `4c2ae6e5-483e-4b50-be36-b4ac68a27a89`.

## Recommendation

Answer Q1 and Q3 together with one pure function, resolveCredential(stored, env), that returns {apiRoot, apiKey} or 'not configured'. Keyless is derived as !apiKey, not stored as a second field. The edges (startup, poll, refreshProvider) read the store and the env and pass them in. The login callback passes the credential the user just typed in as `stored`. That removes trap (f) without a new hook, and it replaces loadConfig, resolveConfiguredApiKey and hasOmlxTarget, so each rule has one home.

Q2: accept the mirror of pi's order. Give it one `shortcut: mirrors pi 1.5.x resolveProviderAuth (resolve.js:24-38), re-check on pi upgrade` line, and pin it with a test per matrix cell.

Q4: before adding unregisterProvider, the design must name a case that breaks. With a stored oauth credential, pi takes the oauth branch first, and the boolean `authHeader:false` is a defined value, so it overrides on merge. In that case the stale apiKey looks harmless. That is my reading; I have not run it.

Q5: keep today's env-only behavior. Add no code and correct hasOmlxTarget's docstring.

Q6: the two inverted tests go away with loadConfig and resolveConfiguredApiKey. Their replacements test the pure function with plain objects, so they need no auth.json and no seam. Wiring tests go through PI_CODING_AGENT_DIR. Flag the expectation inversion as a behavior change.

Q7: delete applyStoredCredentialToEnv, since config.ts is being rewritten anyway. Leave readLastCatalogCache: catalog.ts is out of scope, so name it as a later change.

Q8: no trace line. Nothing requires one.

Spec changes before the design is drafted:
(1) Drop 'a chat request carries an empty key instead of failing'. It describes what pi does, and no test here can show it. Replace it with the registration shape pi needs, citing research-chidi §1: no apiKey, authHeader false.
(2) Drop the 'Env-Only Keyless Stays Unsupported' requirement, or cut it to the registration shape. Its 'chat fails as provider-not-configured' line asserts pi's runtime and writes a defect into a requirement. Joel's ruling asked for docs only. The deletion test: removing it breaks nothing.
(3) In 'Nothing stored and nothing set', change 'only a login can configure the provider' to what can be seen: no fetch happens and the login-only provider is registered.
(4) Poll scenario: replace 'uses the same resolution', which is structure, with the poll's fetch and registration using the stored URL and key while both env vars are set.
(5) Empty-key login: the claim to assert is the credential the login callback returns, not 'the stored credential holds'. pi does the storing.
(6) Add the stored-but-unusable case. Today loadOmlxCredential (auth-storage.ts:20-39) maps a stored api_key with an empty key to undefined. The new rule would then fall back to OMLX_API_KEY. pi does the opposite: it treats that credential as not configured and never checks the env (resolve.js:33, composer :286-291). That reopens the split. The resolution must decide from whether a credential is present, not from the filtered result.
(7) Scope 'A stored empty key' to an oauth credential with empty access. That is the case pi resolves to "".

## Evidence

- pi's order: stored oauth, then stored api_key, then configured env. A stored credential shadows env, and a stored credential pi can't use resolves to undefined. (research-chidi §1 resolve.js:24-38, :33; composer :286-291)
- loadOmlxCredential drops an empty api_key and treats it as if nothing were stored. (research-eleanor: src/auth-storage.ts:20-39)
- pi never reads a URL from a credential. The request URL is the registered baseUrl. (research-chidi §2 provider-composer.js:213, model-runtime.js:472)
- Re-registration merges defined values and skips undefined ones. (michael-orientation trap e, model-runtime.js:674-686)
- The login callback fetches and registers before pi stores the credential, and it already has the URL and key the user typed. (research-eleanor index.ts:138-154, oauth-login.ts:32-62; research-chidi models.js:382-386)

## Assumptions

- [unverified] With a stored oauth credential, a stale apiKey left by the merge does not change how pi resolves requests.
- [unverified] pi's 'Use an API key' prompt can store an empty key.
- [unverified] No pi runtime (ModelRuntime) can be imported in tests to prove request-side scenarios here.
- [verified] A stored api_key credential has no baseUrl.

## Risks

- Stored api_key with an empty key, plus OMLX_API_KEY: the catalog would fetch with the env key while pi reports not configured. That is a split, unless the resolution keys on whether a credential is present.
- Stored api_key with no URL, plus OMLX_BASE_URL set to a remote server: under the literal rule the URL is the default, so a working remote setup silently moves to localhost.

## Confidence

medium: The findings rest on cited static reads. The Q4 harmlessness claim and empty api_key reachability are unrun.

## Challenge claims

1. Scenarios asserting what pi does with a chat request can't be proven in this repo and should become registration-shape assertions.
2. The stored-but-unusable credential (empty api_key) reopens the env fallback unless the resolution keys on whether a credential is present.
3. Using unregisterProvider for trap (e) fails the deletion test unless a case that breaks is named.

## Owner decisions

- A stored api_key credential (no baseUrl) plus OMLX_BASE_URL: should the env URL fill in the missing URL, or should the default apply? The ruling is silent. I'd pick env filling the missing URL. The key still comes from the stored credential, so no key split can happen.

## What would change my mind

- Evidence that pi's ModelRuntime can be driven in a test here would let the chat-request scenarios stand.
- A run showing the stale apiKey breaks the stored-oauth keyless case would justify unregisterProvider.
- Evidence that pi never stores an empty api_key would make spec change (6) unnecessary.
