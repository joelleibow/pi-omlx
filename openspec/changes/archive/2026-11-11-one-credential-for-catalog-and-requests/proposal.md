# Proposal

## Why

The extension and pi can pick different credentials for one provider. The catalog fetch prefers `OMLX_API_KEY` when it is set and falls back to the saved `/login` credential when it is not (`research-eleanor`: `src/config.ts:16-26`, `:29-36`), while pi sends chat requests with the stored credential whenever one exists (`research-chidi`: pi-ai `auth/resolve.js:24-38`). An exported key therefore splits the two across servers or keys, and chat breaks. Joel ruled the split a must-fix and then ruled which side wins (`owner-rulings.md`).

## What Changes

- **One rule in one place.** A single pure resolution takes the stored credential and the environment as arguments and replaces `loadConfig` (`src/config.ts:16-26`), `resolveConfiguredApiKey` (`:29-36`) and `hasOmlxTarget` (`:43-47`) (`research-eleanor`). Startup and the poll read the store and the environment and pass them in. The login callback passes the credential the user just typed in as the stored one, which removes the stale-state read at login without a hook (`index.ts:138-154`; `research-chidi`: `models.js:382-386`; Michael trap f). Its order mirrors pi's (`research-chidi`: a stored `omlx` credential, else the configured key, else nothing), and keyless-ness is derived from an empty key rather than stored as a second field.
- **A saved credential owns both halves.** Once an `omlx` credential is stored, `OMLX_BASE_URL` and `OMLX_API_KEY` change neither the URL nor the key for the catalog or for requests. The variables apply only when nothing is stored (Joel, "A saved login always wins").
- **Presence decides, not usability.** A stored oauth credential with an empty `access` is keyless at its own URL. A stored `api_key` with an empty key is not configured, and the environment does not fill it in. A stored `api_key` with no base URL takes `DEFAULT_OMLX_BASE_URL` with its own key (`research-chidi` §1; council.md item 3; Joel, "A saved login always wins").
- **The read is unfiltered.** `loadOmlxCredential` (`src/auth-storage.ts:20-39`) maps an empty `api_key` and an access-less oauth to `undefined`, so a resolution built on it would fall back to the environment, the opposite of pi (`research-chidi`: `resolve.js:33`, `provider-composer.js:286-291`; council.md item 3). The resolution reads the stored credential raw under `PROVIDER_KEY`, the one home the living `provider-access` spec fixes.
- **BREAKING: the documented environment override is withdrawn.** `docs/CONFIGURATION.md:21-24` promises that `OMLX_API_KEY` "can also override the stored `/login` key". That was never true for chat (`research-chidi`), and Joel withdrew it. A one-shell override now means `/logout` first. The docs pass corrects the file.
- **A keyless registration unregisters first.** `pi.registerProvider` merges defined values and skips undefined ones (`model-runtime.js:674-686`), so a keyless registration that omits `apiKey` inherits a previous keyed registration's `$OMLX_API_KEY`; after a logout, pi then resolves the environment key and sends it to the keyless server's URL (Michael's ruling 1, measured in pi 1.5.2's `ModelRuntime`; Michael trap e). The extension calls `unregisterProvider` before every keyless `registerProvider`.
- **The trace names the source.** The existing `provider_registered` line (`index.ts:185-190`) gains one `source` value, `stored` or `environment`, returned by the resolution and never carrying the key (Michael's ruling 2). The predicate and the `[pi-omlx]` prefix stay as the living `diagnostics` spec fixes them.
- **A base URL alone is not configured.** With `OMLX_BASE_URL` set and nothing stored, the extension makes no catalog fetch and registers the login-only provider (council.md item 4). Joel left that case out of scope; the docs name it unsupported and send a keyless server to `/login` with an empty key.
- **Three test expectations change.** `test/config.test.ts:86-92` and `:104-110` are replaced along with the functions they test, and `:116-118` (an environment base URL alone counts as a target) inverts with the rule (`research-eleanor` Addendum 1 §2; `council.md`, Accepted).

**Deliberately not in this change:**

- Making env-only keyless work (Joel, "Env-only keyless is out of scope").
- Removing `_setAuthPathForTesting` and the other test seams: that is another card (Joel, "Test-only seams are a smell"). New tests take the `PI_CODING_AGENT_DIR` route (Michael trap i).
- A `refreshModels` or `modifyModels` hook to have pi hand the credential over. pi fires no login or logout event (`research-chidi` §4), and adding the hook changes pi's composition (Michael trap f).
- Overwriting the key inside the `streamSimple` wrapper (Michael trap j).
- The `expires` field missing from Joel's dotfiles credential template (Michael trap d). That is his repository's defect.
- Deleting `readLastCatalogCache` (`src/catalog.ts:581-583`), which has no callers. It is named for a later change.

## Capabilities

### New Capabilities

- `credential-resolution`: which credential decides the base URL, the key and keyless-ness, that the catalog and the registered provider take them from the same one, that a keyless registration clears the previous one, and which source the trace reports.

### Modified Capabilities

None. `provider-access` fixes the provider id and the key credentials are stored under (`openspec/specs/provider-access/spec.md`), and this change leaves both alone: the new read goes through `PROVIDER_KEY` exactly as the living spec requires. The behavior that is new belongs in a capability of its own.

## Impact

### Code

- `src/config.ts:16-60`: `loadConfig`, `resolveConfiguredApiKey` and `hasOmlxTarget` become one pure resolution. `applyStoredCredentialToEnv` (`:51-60`) is deleted with its four tests (`test/config.test.ts:129-161`).
- `src/auth-storage.ts:20-39`: gains the unfiltered read under `PROVIDER_KEY` that the resolution consumes.
- `index.ts`: `registerModels` (`:157-185`), `refreshProvider` (`:247-260`) and the login callback (`:138-154`) call the resolution; the models registration path calls `unregisterProvider` before a keyless `registerProvider`; `provider_registered` (`:185-190`) gains `source`.
- `src/provider.ts:21-46`: `toProviderConfig`'s `keyless` input comes from the resolution's empty key.
- `src/catalog.ts`: unchanged. The catalog cache stays keyed by `apiRoot` (`:575-578`).

### Consequences

- **Logout mid-session.** pi fires no logout event (`research-chidi` §4), so the extension's configuration and registration stand for up to the ten-minute poll interval (`index.ts:92-122`). With the unregister in place a keyless registration carries no key for pi to inherit, so a request after logout fails as provider-not-configured instead of sending the environment key to the keyless server (Michael's ruling 1 evidence). The next poll finds no target and registers the login-only provider (Michael trap g).
- **A URL that moves costs one cache miss.** The catalog cache is keyed by `apiRoot` with strict equality (`src/catalog.ts:575-578`), so a user whose chosen URL changes sees a cache miss at startup and a login-only provider until the fetch lands about two seconds later (Michael trap h). Nothing moves for a user whose stored URL is still the chosen one, Joel among them: his cache records `http://localhost:8000/v1`, his stored URL, and no environment override is in effect in his running pi, so his own break is latent (Michael trap a, measured from his real cache).
- **The CI user is unchanged.** With nothing stored, pi's own resolution already reads `$OMLX_API_KEY` (`research-chidi` §5), so keeping the variables as the no-credential fallback keeps CI and ephemeral shells working (Michael trap c).
- **A stored `api_key` with no base URL moves to the default server.** That setup never worked: today it registers keyless at `OMLX_BASE_URL`, and pi rejects a stored `api_key` under a keyless registration (`research-chidi` §1, §5; Eleanor's matrix; Matt pass 2 N5). Nothing is taken away.
- **Every keyless poll costs two extra cache-only refreshes,** 0.16 ms against 0.28 ms per poll in Michael's measurement, with the provider's status and availability unchanged (Michael's ruling 1).
- **The rule is a copy of pi's.** The extension cannot ask pi which credential pi will use: `ExtensionAPI` has no `modelRegistry`, and the first `ctx` arrives at `session_start`, after the startup fetch has run (Michael §4). The order is therefore restated in this repository, and it drifts when pi changes it: "a stored credential owns the provider" is a 1.5.x rule (`research-chidi`: `resolve.js:5-8`). One `shortcut:` comment naming `resolveProviderAuth` and one test per matrix cell are what hold it.

### Tests

The resolution is tested on plain objects, one case per matrix cell. Wiring tests take `PI_CODING_AGENT_DIR` and write `<dir>/auth.json`, because `readStoredCredential` resolves `getAgentDir()` per call (Michael trap i), and no test writes the operator's real agent directory (Joel, "Tests never mutate operating functionality"; `openspec/specs/verification/spec.md`). One test under `PI_OMLX_DEBUG` asserts the `source` value for a stored case and an environment case, in the style `test/debug.test.ts` already uses. One test gives the extension a fake `pi` and records that `unregisterProvider` runs before a keyless `registerProvider`, starting from a keyed registration (Michael's ruling 1). The four `applyStoredCredentialToEnv` tests go with the function; the existing seam call sites stay for the seam card.

### Documentation (the docs pass)

`docs/CONFIGURATION.md:21-24` loses the override promise and gains the supported order. `README.md:37` and `docs/CONFIGURATION.md:13-18` each state the base URL without stating precedence (`research-eleanor`), and each must say that `OMLX_BASE_URL` alone does nothing: the variable needs `OMLX_API_KEY` or a login. The `verification` spec's second scenario cites `test/index.test.ts:72,76`, which goes stale if that file changes above line 72 (Michael §1).

## Questions, Answered

The eight questions this proposal left open are settled; the arguments are in `council.md`.

1. **Shape of the resolution.** One pure function returning the base URL, the key, whether the provider is configured, and the source; keyless derived from the empty key.
2. **The mirrored copy of pi's order.** Accepted, with one `shortcut:` comment naming pi-ai's `resolveProviderAuth` and one test per matrix cell.
3. **The login-time credential.** Passed into the resolution as the stored credential, so neither the store nor the environment is read there.
4. **Keyless across a re-registration.** `unregisterProvider` before every keyless registration (Michael's ruling 1).
5. **The env-only keyless path.** Not configured: no catalog fetch, login-only registration.
6. **The inverted tests.** Replaced by resolver tests on plain objects; wiring through `PI_CODING_AGENT_DIR`; the seam call sites stay.
7. **The dead exports.** `applyStoredCredentialToEnv` goes with its tests; `readLastCatalogCache` waits for a later change.
8. **A trace line for the source.** One `source` field, two constants, on the existing `provider_registered` line (Michael's ruling 2).
