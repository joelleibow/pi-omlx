# Council Synthesis

## Question and Scope

Which credential decides the OMLX base URL and the API key, where that rule lives, and how the catalog fetch and the registered provider stay on one credential so the extension stops disagreeing with pi about the same provider.

Evidence in front of the council: `proposal.md` and its eight questions for the council and design, `specs/credential-resolution/spec.md`, `owner-rulings.md`, `research-chidi.md` and its Addendum 1, `research-eleanor.md` and its Addendum 1, and `michael-orientation.md` with traps (a) to (k). Both advisors worked from those files; neither read the repository, and the codebase and documentation evidence they asked for came back as the two research addenda.

Two advisors, Neil and Matt, three passes each (`council-neil-pass1.md` to `-pass3.md`, `council-matt-pass1.md` to `-pass3.md`). Both numbered their answers against the conductor's eight questions, Q1 to Q8.

Fixed before the council sat, and not reopened: making env-only keyless work is out of scope (Joel, "Env-only keyless is out of scope"); the test seams stay for another card (Joel, "Test-only seams are a smell"); no `refreshModels` or `modifyModels` hook; no key overwrite in the stream wrapper (Michael trap j); the dotfiles `expires` defect belongs to Joel's repository (Michael trap d).

## Perspectives & Trade-offs

Where both advisors ended up agreeing, checked against their last pass:

- **Q1 and Q3, one resolver.** One pure function taking the stored credential and the environment, replacing `loadConfig`, `resolveConfiguredApiKey` and `hasOmlxTarget`. Startup and the poll read the store and the environment and pass them in; the login callback passes the credential the user just typed in as the stored one (Neil pass 1 Q1/Q3, Matt pass 1). Matt refines it: keyless is derived as `!apiKey`, not carried as a second field.
- **Q2, the mirror.** Both accept copying pi 1.5.2's `resolveProviderAuth` order, with one `shortcut:` line naming the mirror and re-checking it on pi upgrades, pinned by a test per matrix cell (Neil pass 1 Q2, Matt pass 1 Q2).
- **Credential presence decides, not the filtered read.** Both reach this independently: `loadOmlxCredential` (`src/auth-storage.ts:20-39`) filters an empty `api_key` and an access-less oauth to `undefined`, which would send the resolver back to the environment, the opposite of pi (`resolve.js:33`, `provider-composer.js:286-291`). The resolver must key on whether a credential is present, read raw through `PROVIDER_KEY` (Neil pass 2 M4, Matt pass 2 N4). Both name the consequence: the proposal's "`src/auth-storage.ts` unchanged" line is wrong.
- **Q5, a base URL alone.** Both end with not-configured, no catalog fetch, login-only registration. Matt withdrew his pass 1 "keep today's behaviour and patch the docstring" (pass 2 N1); Neil rejected the docstring patch in pass 2 M2 because the function is deleted.
- **A stored `api_key` with no base URL takes the default.** Neil rejected filling the URL from `OMLX_BASE_URL` (pass 2 M5); Matt withdrew his pass 1 owner decision for the same reading of Joel's ruling (pass 2 N5). Matt adds the evidence that makes it costless: that setup never worked, because a stored `api_key` under a keyless registration is rejected by pi (`research-chidi` §1, §5; Eleanor's matrix).
- **Q6 and Q7.** Resolver tests on plain objects, wiring tests through `PI_CODING_AGENT_DIR`, existing seam call sites left to the other card; `applyStoredCredentialToEnv` and its four tests (`test/config.test.ts:129-161`) deleted; `readLastCatalogCache` (`src/catalog.ts:581-583`) left to a later change (Neil pass 1 Q6/Q7, Matt pass 1 Q6/Q7).
- **Q4, the unregister, by the end of pass 3.** Both accept `pi.unregisterProvider("omlx")` before a keyless `registerProvider`. Matt's pass 2 rejection ("the stale `apiKey` looks harmless") did not survive his own pass 3 trace of the window after logout.

Two disputes the passes left standing, both sent to Michael:

- **The trigger.** Neil narrows the unregister to the transition from a keyed registration to a keyless one, to dodge two extra cache-only refreshes per keyless poll and an unverified login-sync race (pass 2 M1, pass 3 P1). Matt applies it to every keyless registration: one condition, no new state (pass 3 Q1).
- **The source field.** Neil drops it in pass 2 (M3), then restores it in pass 3 (P2) as two named constants returned by the resolver. Matt accepts one field on the existing event in pass 2 (N3), then drops it in pass 3 (Q2) on the deletion test.

Left unverified by both, and carried forward as such: whether this extension's `streamSimple` wrapper forwards `options.apiKey` (Matt pass 3 Q1; the leak still matters because pi's own request path uses it, `model-runtime.js:487`); whether pi's own flows can ever store an empty `api_key` (Matt pass 1, Neil pass 1 risk 1 names the hand-edited `auth.json` route); and whether unregister plus register inside `oauth.login` can raise `CredentialSynchronizationError` (`research-chidi` Addendum 1 (a) did not trace it). Michael measured the third and it did not reproduce.

## Synthesis & Recommendation

The change is one resolver, one rule, and two behaviours it makes visible. The design inherits this:

1. **One pure resolver** taking the stored credential and the environment, replacing `loadConfig`, `resolveConfiguredApiKey` and `hasOmlxTarget`. The login callback passes its typed credential in as the stored one, which removes trap (f) without a hook (Neil pass 1 Q1/Q3, Matt pass 1). Keyless is derived from an empty key, never stored.
2. **pi's order, mirrored.** Stored credential first, then `OMLX_API_KEY`, then nothing, with one `shortcut:` comment naming pi-ai's `resolveProviderAuth` as the thing being copied and a test per matrix cell (Neil pass 1 Q2, Matt pass 1 Q2).
3. **Presence decides.** A stored oauth credential is configured, keyed by its `access` or keyless when `access` is empty, at its own URL or `DEFAULT_OMLX_BASE_URL`. A stored `api_key` with an empty key is not configured, with no environment fallback. A stored `api_key` with no URL takes `DEFAULT_OMLX_BASE_URL` with its own key, by Joel's ruling. Nothing stored uses `OMLX_API_KEY` if it is set, else not configured (Neil pass 2 M4/M5, Matt pass 2 N4/N5, Joel "A saved login always wins"). The read is the raw stored credential under `PROVIDER_KEY`, one home per the living `provider-access` spec, so `src/auth-storage.ts` gains an unfiltered read and the proposal's "unchanged" line goes.
4. **A base URL alone is not configured.** No catalog fetch, login-only registration (Neil pass 1 Q5, Matt pass 2 N1, Joel "Env-only keyless is out of scope").
5. **Unregister before every keyless registration.** The condition is the registration shape, evaluated where the extension calls `registerProvider` for models; it generalises what `registerLoginOnlyProvider` (`index.ts:212-218`) already does (Michael's ruling 1).
6. **One `source` field**, `stored` or `environment`, returned by the resolver and logged on the existing `provider_registered` line, never carrying the key (Michael's ruling 2).
7. **Tests.** The resolver on plain objects, one case per matrix cell; wiring through `PI_CODING_AGENT_DIR` (`readStoredCredential` resolves `getAgentDir()` per call, Michael trap i); one `PI_OMLX_DEBUG` test for the source constants; one fake-`pi` test that a keyless registration unregisters first. The existing seam call sites stay for the seam card.
8. **Deletions.** `applyStoredCredentialToEnv` and its four tests; `readLastCatalogCache` stays, named for a later change.
9. **Scenarios move to what this repository can prove.** What pi does with a request, and pi storing a credential, leave the spec; the registration, the fetch and the login callback's return value replace them. The duplicated stored-credential scenarios fold into one (Neil pass 1 challenge 1 and spec edits, Matt pass 1 spec changes 1 to 7).

Invariants the design is held to: a credential that is present never falls through to the environment; keyless-ness belongs to the credential; `PROVIDER_KEY` remains the one home for `omlx`; this repository writes no credentials, per the archived rename design; and the mirror is a copy, so one `shortcut:` comment and a per-cell test are what keep it honest.

One behaviour change to name in the docs pass, from Matt's out-of-scope findings: after this change `OMLX_BASE_URL` alone does nothing, so `README.md:37` and `docs/CONFIGURATION.md:13-18` must say the variable needs `OMLX_API_KEY` or a login.

## Accepted & Rejected Feedback

**Accepted.**

- Neil pass 1 Q1/Q3 and Matt pass 1: one resolver, with the login's typed credential passed in as stored.
- Matt pass 1: keyless derived from the key, not stored as a field.
- Both on Q2: the mirror, the single `shortcut:` comment, a test per matrix cell.
- Neil pass 2 M4 and Matt pass 2 N4: the resolver reads the raw credential through `PROVIDER_KEY`; `loadOmlxCredential`'s filtering would reopen the environment fall-through. Accepted with its consequence for the proposal.
- Matt pass 2 N5 and Neil pass 2 M5: a stored `api_key` with no URL keeps the default URL and its own key. Accepted; a scenario pins it.
- Matt pass 2 N1: the citation correction. `test/config.test.ts:86-92` and `:104-110` are replaced along with the functions they test, not inverted in place; only `:116-118` inverts because the rule changes. All three are behaviour changes and get named.
- Both on Q5 after Matt's pass 2: `OMLX_BASE_URL` alone is not configured.
- Both on Q6/Q7: plain-object resolver tests, `PI_CODING_AGENT_DIR` for wiring, seam call sites untouched, `applyStoredCredentialToEnv` deleted with its four tests, `readLastCatalogCache` deferred.
- Matt pass 3 Q1: the traced logout sequence is the case that breaks without the unregister; accepted as the evidence for Q4.
- Matt pass 1 spec changes 1 to 7 and Neil pass 1's spec edits: the spec moves from pi's behaviour to the extension's, and the duplicate stored-credential scenario folds.
- Neil pass 3 P2 in Michael's refined form: the source field, two constants, on the existing event.

**Rejected, or withdrawn by its author.**

- Matt pass 1's owner decision on whether `OMLX_BASE_URL` fills a stored `api_key`'s missing URL: withdrawn by Matt in pass 2 N5 as settled by Joel's ruling, and his own evidence shows the setup never worked.
- Matt pass 1 Q5 ("keep today's env-only behaviour, fix the docstring"): withdrawn in pass 2 N1.
- Matt pass 2 N2 (reject the unregister; the stale `apiKey` looks harmless): reversed by Matt in pass 3 Q1 after tracing logout.
- Neil pass 1 Q8 `credentialSource` with a `login` value: rejected by both. The resolver cannot tell a login from a stored credential, because the login passes its credential in as stored, so a `login` value would be caller-only plumbing.
- Neil pass 2 M1, narrowing the unregister to keyed-to-keyless transitions: rejected by Michael (ruling 1).
- Neil pass 2 M3 and Matt pass 3 Q2, dropping the source field: rejected by Michael (ruling 2).
- Patching `hasOmlxTarget`'s docstring (Matt pass 1 Q5, Neil pass 2 M2): moot. The function is deleted.
- Deleting `readLastCatalogCache`: rejected as scope. `src/catalog.ts` is not this change's.

## Michael's Rulings

**The unregister trigger.** The dispute: Neil's narrowed trigger against Matt's every-keyless-registration. Michael ruled for Matt's form and rejected the narrowing, because narrowing needs a new field in `State` that mirrors pi's own `extensionProviders` entry, one fact in two places, and it would have to be reset wherever `registerLoginOnlyProvider` already unregisters; the two costs it avoids do not matter. What decided it: measurements in pi 1.5.2's real `ModelRuntime`, from the probes under `.pi/marbleization/one-credential-for-catalog-and-requests/scratch/`. A keyed registration followed by a bare keyless one leaves `apiKey:"$OMLX_API_KEY"` with `authHeader:false` and `baseUrl:S`; after `rt.logout("omlx")`, `prepareRequest` returns `{baseUrl:S, apiKey:"secret-D", headers:null}` and the auth status says `{configured:true, source:"environment"}`, while unregistering first throws `Provider is not configured: omlx`. The login-sync race did not reproduce: 160 of 160 logins inside `oauth.login` succeeded with zero `CredentialSynchronizationError`, across prior keyed and prior login-only registrations, with and without the unregister. Steady-state cost is 0.16 ms against 0.28 ms per poll, with the provider's status and availability unchanged at every point he checked. And `State` holds no keyed-ness while `ExtensionAPI` exposes no `getRegisteredProviderConfig`, so the narrowing cannot read what it would need. Design consequence he set: the condition is the registration shape, in the one place that registers models. Test he set: a fake `pi` recording that `unregisterProvider` runs before a keyless `registerProvider` starting from a keyed one, with the pi-side leak reproduced rather than reasoned.

**The source field.** The dispute: Neil's one field with two constants against Matt's deletion-test objection. Michael ruled the field in, in Neil's refined form: the resolver's result carries one `source` member with exactly two constants, `stored` and `environment`, and `provider_registered` logs it; no new event, no `login` value, no third state; one test under `PI_OMLX_DEBUG` asserting the value for one stored and one environment case, written the way `test/debug.test.ts` already does it; and the trace never carries the key. What decided it: his implementation-gate standard that a new decision logs its entry and outcome, applied to the resolver, which is the one decision this change introduces. The living `diagnostics` spec fixes the predicate and the prefix and is silent on fields, so a field on an existing event changes nothing it fixes. Two corrections he made to Neil's record: today's `provider_registered` line logs only `provider`, `models` and `streamSimple`, not `apiRoot` or `keyless`, so the identical-`apiRoot` case is not what the current line shows, though it is still the case that proves `apiRoot` alone would not disambiguate; and `redact` (`src/debug.ts:3-10`) only rewrites `apiKey=...` inside string values, so a key passed as an object member is emitted verbatim, which is why the constant is the only safe way to record the decision. Matt's deletion test is the wrong instrument here: it is for constraints a change adds, and this is the observability the gate requires.

## Owner Decisions Required

None. Joel's rulings settle the rule and the scope: a saved `omlx` credential supplies both the base URL and the key, the environment applies only when nothing is saved, the docs' override promise is withdrawn, and env-only keyless stays unsupported and documented. Matt withdrew his pass 1 owner decision after his own pass 2 evidence showed the ruling's literal reading costs nothing. Michael marked neither of his two disputes `joel`; both are settled, and both turned on pi source and measurements rather than on a product choice. Every other choice in the change is structural, settled by the council's convergence or by those two rulings.
