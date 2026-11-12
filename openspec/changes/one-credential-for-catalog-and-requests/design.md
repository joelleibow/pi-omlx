# Design

## Context

The extension reads the OMLX base URL and key in three places that disagree with each other and with pi: `loadConfig` (`src/config.ts:16-26`), `resolveConfiguredApiKey` (`:29-36`) and `hasOmlxTarget` (`:43-47`) (`research-eleanor`). pi resolves the same provider its own way, from the stored credential first and only then from a configured key (`research-chidi`: pi-ai `auth/resolve.js:24-38`). The split, its cost and the rulings that settle it are in `proposal.md`; what binds this design is `council.md` and Joel's rulings.

Four constraints shape the mechanism:

- pi exposes no way for an extension to ask which credential it will use. `ExtensionAPI`, which the factory and the poll hold, has no `modelRegistry`; the first `ctx` arrives at `session_start`, after the startup fetch has run (Michael §4). The order therefore has to be restated here, and `council.md` accepts that as the mechanism.
- The stored `omlx` credential is readable synchronously through `readStoredCredential` (exported from the package root, `research-chidi` §3), and the agent directory it resolves is `PI_CODING_AGENT_DIR` at call time (Michael trap i), which is what lets the wiring tests run without the test seam.
- `pi.registerProvider` merges defined values and skips undefined ones (`model-runtime.js:674-686`), so an omitted `apiKey` inherits the previous registration's (`research-chidi` Addendum 1, Michael trap e).
- The `/login` callback fetches and registers before pi stores the credential (`index.ts:138-154`; `research-chidi`: `models.js:382-386`), so at that moment the credential exists only as the values the user typed.

## Goals / Non-Goals

**Goals:**

- One credential decides the base URL and the key for the catalog fetch and for the registration, in one function with one home.
- Keyless-ness belongs to the credential: an empty key in the resolution, never an environment variable read at fetch or registration time.
- A keyless registration carries nothing inherited from a keyed one.
- Under `PI_OMLX_DEBUG`, the line that records the registration says which side the resolution took.
- The readers this replaces are gone, so no second copy of the rule survives the change.

**Non-Goals:**

- Making env-only keyless work (Joel, "Env-only keyless is out of scope").
- Removing `_setAuthPathForTesting` and the other test seams (Joel, "Test-only seams are a smell": another card).
- A `refreshModels` or `modifyModels` hook, so pi hands the credential over.
- Overwriting the key inside `streamSimple` (Michael trap j).
- The `expires` field missing from Joel's dotfiles credential template (Michael trap d).
- Deleting `readLastCatalogCache` (`src/catalog.ts:581-583`), which `council.md` leaves for a later change.

## Decisions

### 1. One pure resolver, `resolveOmlxCredential(stored, env)`, in `src/config.ts`

**Decision.** A pure function in `src/config.ts` takes the stored credential (or `undefined`) and the two environment variables, and returns a discriminated union:

- `{ configured: true, apiRoot, apiKey, source }`, where `source` is `"stored"` or `"environment"`;
- `{ configured: false }`.

`apiRoot` is normalized to `/v1` with the existing helper. There is no `keyless` member; keyless is `apiKey === ""`, computed at the one place that needs it (decision 3). The home stays `src/config.ts` because `DEFAULT_OMLX_BASE_URL`, the `/v1` normalization and the `OMLX_API_KEY` name already live there and the resolver derives from all three.

**The matrix it implements.** Today's four stored shapes against four environment states collapse to five rows, because a stored credential owns both halves and the environment matters in exactly one:

| Stored `omlx` credential | `OMLX_API_KEY` | Resolution |
|---|---|---|
| none | unset | not configured |
| none | set | configured: `OMLX_BASE_URL` or `DEFAULT_OMLX_BASE_URL`, the environment key, source `environment` |
| oauth | any | configured: the credential's `baseUrl` or `DEFAULT_OMLX_BASE_URL`, its `access` (may be empty), source `stored` |
| `api_key`, non-empty key | any | configured: its `baseUrl` or `DEFAULT_OMLX_BASE_URL`, its key, source `stored` |
| `api_key`, empty key | any | not configured |

`OMLX_BASE_URL` decides a URL only in the one row where nothing is stored and the environment supplies the key. That is the rule Joel set, and it is why the stored-but-unusable rows do not fall back to the environment.

**A base URL on the record is the record's own.** An `api_key` record may carry a `baseUrl`: this extension's earlier `saveOmlxCredential` wrote `{type:"api_key", key, baseUrl}` (`git show c2caf89:src/auth-storage.ts:34-35`), and that shape works end to end today, because `loadOmlxCredential` maps the stored URL through and pi resolves the stored `api_key`. Row 4 reads the record's URL the way row 3 does, so no working setup moves to the default server.

**Guards.** The not-configured branch is the guard against a mixed credential. It fires on three conditions: nothing is stored and `OMLX_API_KEY` is unset; a stored `api_key` carries an empty key; a stored record has a `type` that is neither `oauth` nor `api_key`. It refuses to yield a URL or a key at all, so no caller can fetch with half a credential. The keyless branch in decision 4 is the guard against inheritance, described there.

**A blank URL counts as absent.** A stored `baseUrl` that is empty or whitespace, and an `OMLX_BASE_URL` that is whitespace (an empty one is already falsy and reads as unset), fall to `DEFAULT_OMLX_BASE_URL` before normalization. The resolver therefore never throws `normalizeBaseUrl`'s `OMLX_BASE_URL is empty`, and no message names the environment for a stored record's URL. The resolver is total: every input produces a resolution, and no caller wraps it in a catch.

**Branch order and the mirror.** The function's order is the table read from the inside out: a stored oauth credential; a stored `api_key` with a key; a stored `api_key` without one; a present record of another type, which is not configured; then the environment key, which fires only when `stored === undefined`; then not configured. A present record never falls through to the environment, which is the invariant `council.md` draws from pi (`resolve.js:33`). pi's own `AuthStorage.load` rejects an unrecognized record, so that branch is reachable only by a hand edit that also stops pi, and the rule simply does not contain the hole. One comment marks the copy, exactly once, above the function:

```
// shortcut: mirrors pi-ai resolveProviderAuth (pi 1.5.2, auth/resolve.js:24-38); re-check on a pi upgrade
```

**Alternatives considered.**

- *Return `{apiRoot, apiKey} | undefined`.* Loses: `undefined` cannot carry the source, so the trace would re-derive it, and the not-configured branch would be an unnamed state every caller tests for anyway.
- *Carry `keyless` in the return.* Loses: it is derived from the key, and a second member gives the same fact two homes (council.md item 1, Matt pass 1).
- *A new `src/credential.ts`.* Loses: it would duplicate or move `DEFAULT_OMLX_BASE_URL` and the normalization, and the point of the change is one home.
- *Ask pi.* Impossible: `ExtensionAPI` has no `modelRegistry` (Michael §4).

### 2. The read: one unfiltered read under `PROVIDER_KEY`, and `loadOmlxCredential` goes

**Decision.** `src/auth-storage.ts` gains one read of the raw stored credential for `PROVIDER_KEY`, returning pi's stored-credential record or `undefined`. The resolver consumes it and does the mapping itself. `loadOmlxCredential` (`:20-39`) is deleted with its tests.

**Why.** `loadOmlxCredential` maps an empty `api_key` and an access-less oauth to `undefined` (`research-eleanor`), which would send the resolution to the environment for a credential pi refuses to use (`research-chidi`: `resolve.js:33`, `provider-composer.js:286-291`, `models.js:274-277`). Filtering is the bug; presence is the rule. The read carries rows 4 and 5 of decision 1's matrix, and the access-less oauth case of row 3, which the filtered read cannot.

Deleting the old function adds no scope: once decision 3 rewires its callers, nothing calls it, and a dead export would be a second mapping of one record.

**Alternatives considered.**

- *Keep `loadOmlxCredential` as a thin wrapper over the new read.* Loses: two mappings of one record is two answers to "what is stored", and after this change nothing calls it. Its tests move to the new read, which is a replacement, not an edit.
- *Read `auth.json` directly in the resolver.* Loses: `PROVIDER_KEY` is the one home for the id (living `provider-access`), and the resolver is pure.

### 3. The callers, and the one place `keyless` is computed

**Decision.** Every caller resolves once and passes the result down; none of them reads the store or the environment again.

| Caller | Today | After |
|---|---|---|
| Startup registration, `registerCachedOrSetupModels` (`index.ts:220-243`) | `loadConfig()` plus `resolveConfiguredApiKey()`, inside `tryLoadConfig` (`:124-130`), which swallows a throw | one `resolveOmlxCredential(readStored(), env)`; the resolver is total, so there is nothing to catch and `tryLoadConfig` goes; not configured → the login-only provider; configured → the cached registration through `registerModels` |
| `registerModels` (`index.ts:157-185`) | computes `keyless = !explicitApiKey && !resolveConfiguredApiKey()` | takes the resolution; `const keyless = resolution.apiKey === ""`, computed here and nowhere else |
| Poll (`index.ts:92-122`) | re-runs `refreshProvider` | unchanged mechanics; `refreshProvider` does the resolving |
| `refreshProvider` (`index.ts:247-260`) | `loadConfig()` and `resolveConfiguredApiKey()`, then a target test | one resolution; not configured → its not-configured return; configured → `fetchAndRegister(resolution)` |
| `fetchAndRegister` (`index.ts:268-304`) | `(config, apiKey)` | `(resolution)` from the configured branch: `fetchModels(resolution.apiRoot, resolution.apiKey)`, then cache and register through `registerModels` |
| Login callback, `buildOmlxOauth` (`index.ts:138-154`, `src/oauth-login.ts:32-62`) | passed `explicitApiKey`, and `registerModels` re-reads ambient state | builds `{type:"oauth", access: typedKey, baseUrl: typedUrl}` and passes it as the stored credential, then `fetchAndRegister(resolution)` |

The login callback's pass-through is what removes trap (f): the values the user typed are the stored credential for that one call, so neither the store nor the environment is consulted. The credential the callback returns is what pi persists (`research-chidi` §4); the spec asserts that return value, not pi's storage.

**Alternatives considered.**

- *Let `fetchAndRegister` keep its `(config, apiKey)` pair.* Loses: the pair is the split in miniature, and a caller can still hand it a mixed URL and key.
- *Give the resolver an `explicitKey` parameter for the login.* Loses: it becomes a third input shape for logging only, and the login already has the credential it wants resolved.

### 4. Registration: `unregisterProvider` before every keyless registration

**Decision.** In `registerModels`, the one place that registers the models config, `pi.unregisterProvider(PROVIDER_KEY)` runs whenever `keyless` is true, immediately before `pi.registerProvider`. The trigger is the registration shape, never remembered keyed-ness. `registerLoginOnlyProvider` (`index.ts:212-218`) keeps its own unconditional unregister; it registers a different shape and already clears the provider.

**Why.** Without it, a keyless registration inherits a prior `apiKey:"$OMLX_API_KEY"`, and after a `/logout` inside the poll window pi resolves the environment key and sends it to the keyless server's URL (Michael's ruling 1, measured: `prepareRequest` returned `{baseUrl:S, apiKey:"secret-D"}` on the merged registration). With it, that request fails as provider-not-configured. It also closes Michael's side finding: a stale `apiKey` otherwise keeps pi's "Use an API key" prompt alive and labels a keyless login as `environment`.

**Alternatives considered.**

- *Unregister only on a keyed-to-keyless transition* (Neil pass 2 M1). Rejected by Michael: it needs a new `State` field mirroring pi's `extensionProviders`, and the costs it avoids measure as immaterial (0.16 ms against 0.28 ms per poll).
- *A shared helper wrapping both registration sites.* Loses: one line at two sites with different conditions is not a fact with two homes, and the helper would add a noun for it.

### 5. The trace: one `source` field on `provider_registered`

**Decision.** The `provider_registered` line (`index.ts:185-190`) gains `source: resolution.source`, and nothing else. It never carries the key, and it is emitted only where the models config is registered, so the login-only registration emits nothing. Two named constants, no `login` value, no new event.

**Why.** Michael's ruling 2: the resolver is the one decision this change introduces, so it logs its outcome; `redact` (`src/debug.ts:3-10`) only rewrites `apiKey=...` inside string values, so a key passed as an object member would be emitted verbatim, which is exactly why the constant is the safe record. The predicate and the `[pi-omlx]` prefix stay as the living `diagnostics` spec fixes them.

**Alternatives considered.** No field (Matt pass 3 Q2), rejected by Michael: the deletion test is for constraints a change adds, and this is the observability the gate requires. A new event, rejected as mechanism nobody asked for.

### 6. What is deleted, as a behaviour change or a replacement

| Deleted | Kind | What carries the behaviour after |
|---|---|---|
| `loadConfig` (`src/config.ts:16-26`) | behaviour change: the environment stops overriding a saved login | resolver row 3 of the matrix; `test/config.test.ts:86-92` replaced |
| `resolveConfiguredApiKey` (`:29-36`) | behaviour change: same, for the key | resolver rows 3 to 5; `:104-110` replaced |
| `hasOmlxTarget` (`:43-47`) | behaviour change: `OMLX_BASE_URL` alone stops being a target, so no fetch | the first row: nothing stored and no environment key is not configured, whatever the URL says; `:116-118` replaced |
| `applyStoredCredentialToEnv` (`:51-60`) | no behaviour: no production caller | nothing; its four tests (`:129-161`) go with it |
| `loadOmlxCredential` (`src/auth-storage.ts:20-39`) | replacement: the unfiltered read plus rule 2 | its tests move to the new read |
| `tryLoadConfig` (`index.ts:124-130`) | replacement: the resolver is total, so its catch has nothing to swallow | the not-configured branch and the login-only registration; the `source` trace stays for the configured path |

`tryLoadConfig` recorded nothing: it swallowed the throw and returned `undefined`. The loud failure today is elsewhere, `refreshProvider`'s uncaught `loadConfig()` (`index.ts:252`), which rejects the factory's `await refreshProvider` at startup and lands in `startPolling`'s catch (`:69-70`) as `state.lastError` in the poll. Both go with the total resolver.

The four behaviour changes this change makes visible, for the report and the docs pass: a saved credential beats both variables; `OMLX_BASE_URL` alone no longer fetches; a stored `api_key` with no URL now uses the default URL with its stored key; and a `/login` with an empty key registers keyless even while `OMLX_API_KEY` is set. One behaviour is preserved on purpose and named here because it is easy to lose: a legacy `api_key` record that carries its own `baseUrl` keeps that URL.

No old test is edited. Each one is deleted with its subject, and the new tests pin the new rule. That also keeps Joel's test-seam ruling: no new test calls `_setAuthPathForTesting`, and the existing call sites in `test/auth-storage.test.ts` and `test/index.test.ts` stay for the other card.

### 7. Tests, and how each fails when its behaviour is deleted

**Resolver, on plain objects, in `test/config.test.ts`.** One test per cell of the sixteen Eleanor measured (four stored shapes against four environment states), plus the empty-`api_key` row with `OMLX_API_KEY` set, the one input where the wrong answer differs from the right one. The fixtures are chosen so no branch can be deleted without changing an expected value: the stored URL is `http://127.0.0.1:9400/v1`, the environment URL `http://10.0.0.5:8000/v1`, and neither is `DEFAULT_OMLX_BASE_URL`; the stored key is `stored-key` and the environment key `env-key`. Delete the stored-first branch and the stored-plus-environment cells' URL assertions fail; delete the empty-key branch and the empty-`api_key` test's `configured: false` fails; delete the record's-URL branch in row 4 and Eleanor's `api_key`-with-URL cells fail, because they assert that record's URL against a default that differs from it.

**The read, in `test/auth-storage.test.ts`.** `PI_CODING_AGENT_DIR` points at a temporary directory holding an `auth.json` (`readStoredCredential` resolves the directory at call time, Michael trap i), with no seam in the new test. It fails if the read filters an empty `api_key` or an access-less oauth.

**Wiring, in `test/index.test.ts`,** with the same `PI_CODING_AGENT_DIR` route:

- startup with a stored credential and both variables set: the fetch URL and Authorization are the stored credential's, and the registration carries its `baseUrl`, `apiKey:"$OMLX_API_KEY"` and `authHeader:true`;
- a legacy `api_key` record carrying its own `baseUrl` while `OMLX_BASE_URL` names another server: the fetch goes to the record's URL with the record's key, and the registration carries that `baseUrl`, which is the shape decision 1's row 4 reads the record's URL for;
- a stored oauth credential with an empty `access` and `OMLX_API_KEY` set: no Authorization on the fetch, and the registration omits `apiKey` with `authHeader:false`;
- the login callback with an empty key while `OMLX_API_KEY` is set: the returned credential carries the prompted URL and an empty key, the fetch carries no Authorization, and the registration is keyless;
- the poll re-registration with both variables set: the stored URL and key again.

Each fails at its own assertion if the caller goes back to reading ambient state, because the stored and environment values differ by construction.

**The unregister order,** with a fake `pi` that records calls: after a keyed registration, a keyless registration records `unregisterProvider("omlx")` before `registerProvider`, and the recorded keyless config has no `apiKey`. Delete the unregister call and the ordering assertion fails; that is the only place in this repository the leak can be pinned (`council.md`, Michael's ruling 1).

**The trace, driving the extension and not `omlxDebug` directly.** A test in `test/debug.test.ts`'s style calls `omlxDebug` itself, so a test shaped that way would pass on its own argument and stay green when `index.ts` stops passing `source`. This one runs the factory with a fake `pi`, stubs `PI_OMLX_DEBUG`, spies `process.stderr.write`, and captures the `provider_registered` line the extension emits: one stored case (`PI_CODING_AGENT_DIR` holding an `auth.json`) and one environment case (nothing stored, `OMLX_API_KEY` set). It asserts the line's `source` and that neither key appears in it. Delete `source:` from the `provider_registered` call in `index.ts` and the assertion fails. `omlxDebug` reads the environment at call time (`src/debug.ts:15`), so the stub needs no module reset.

### 8. Order of work, one hat at a time

Each step changes either behaviour or structure, never both (one hat at a time, as the build rules state it; Joel's principle behind it is to make the change easy, then make the easy change). Every step ends with the whole suite green under `PI_CODING_AGENT_DIR=<scratch>`.

1. **Ground.** Branch `one-credential-for-catalog-and-requests`, and a baseline `PI_CODING_AGENT_DIR=<scratch> npm run check`. Check: exit 0, and the run's own summary recorded, so step 6 compares against it rather than against a number written here.
2. **[structure] The read.** Add the unfiltered read under `PROVIDER_KEY` in `src/auth-storage.ts`, with its test. Check: the new test fails first, then passes; every existing test passes unedited.
3. **[structure] The resolver.** Add `resolveOmlxCredential` and its return type with the `shortcut:` comment and the cell tests. It has no caller yet, so this step ships with step 4 in one task. Check: a red per cell, then greens; the suite green.
4. **[behaviour] The registration, fetch and login path, in one step.** `registerModels` takes the resolution and computes `keyless` in one place; `fetchAndRegister` takes the resolution instead of `(config, apiKey)`; `refreshProvider` and `registerCachedOrSetupModels` resolve once, and `registerModels` unregisters before a keyless registration and logs `source`. Every call site of both changed signatures moves here, because `registerModels` has two callers (`index.ts:242`, `:302`) and `fetchAndRegister` two (`:142`, `:258`), and a signature change split across steps leaves the tree failing to type-check in between. The second `fetchAndRegister` caller is the login callback inside `buildOmlxOauth`, which builds the resolution from the typed URL and key; with `keyless` computed in `registerModels`, that move is the whole login behaviour change, because an empty typed key with `OMLX_API_KEY` set goes from keyed to keyless. Check: `PI_CODING_AGENT_DIR=<scratch> npm run check` green for tsc, and each test decision 7 assigns to this path, red then green, one at a time.
5. **[structure] The deletions.** `loadConfig`, `resolveConfiguredApiKey`, `hasOmlxTarget`, `applyStoredCredentialToEnv`, `loadOmlxCredential`, `tryLoadConfig`, their tests, and the imports they leave behind. Check: every remaining test passes unedited; no unused export remains.
6. **The gate check.** `PI_CODING_AGENT_DIR=<scratch> npm run check` exits 0, and the living `verification` spec's cache check by content: `<scratch>/cache/omlx-models.json` holds the suite's fixture `apiRoot` with a `savedAt` no earlier than the run started, and `~/.pi/agent/cache/omlx-models.json` holds no fixture `apiRoot` or model id.

Steps 2 and 5 are structure; 4 is the behaviour step; 3 is structure that only lands with 4. Step 4 changes two contracts and all four of their call sites at once, and it takes decision 7's tests one at a time, so each behaviour change still gets its own red.

### 9. Documentation, for the docs pass after the implementation gate

- `docs/CONFIGURATION.md:21-24` loses the sentence that `OMLX_API_KEY` "can also override the stored `/login` key", and gains the supported order: a saved login decides both, and a one-shell override means `/logout` first.
- `README.md:37` and `docs/CONFIGURATION.md:13-18` say `OMLX_BASE_URL` picks a different server; each must add that the variable alone does nothing without `OMLX_API_KEY` or a login.
- The env-only keyless case is named unsupported, with `/login` and an empty key as the route (Joel, "Env-only keyless is out of scope").
- `CONTRIBUTING.md:55` mentions `OMLX_BASE_URL` only as debugging advice; it stays true and is left alone.
- `hasOmlxTarget`'s keyless claim lives in its own docstring, so it dies with the function in step 5 and is not a docs-pass item.
- The living `verification` spec's second scenario cites `test/index.test.ts:72,76`; if the wiring tests change that file above line 72, the citation is corrected in the same pass (Michael §1).

## Risks / Trade-offs

- **The rule is a copy of pi's.** The extension cannot read pi's answer, so it restates `resolveProviderAuth` (Michael §4). → One `shortcut:` comment naming the mirror, one test per cell, and a re-check on every pi version bump; the comment is the reminder, the cell tests are the alarm.
- **Deleting the unregister brings back a credential leak, silently.** → The fake-`pi` ordering test fails if the call is removed, and Michael's measured symptom (`secret-D` sent to the keyless server's URL after logout) is written here so the failure can be recognized.
- **Unregister plus register inside `oauth.login` runs two unqueued refreshes alongside pi's login sync.** `research-chidi` Addendum 1 (a) did not trace whether that can raise `CredentialSynchronizationError`; Michael measured 160 of 160 logins with zero errors. → The ordering test pins the sequence; if the race is real it surfaces as that error in a login's stderr, and the fallback is to move the swap out of the callback, which needs a design change rather than a patch.
- **Every keyless poll now costs two extra cache-only refreshes,** 0.16 ms against 0.28 ms in Michael's measurement, with status and availability unchanged. → Accepted by his ruling; the numbers are here so a future slowdown can be compared against them.
- **A blank URL no longer fails loudly.** `refreshProvider`'s uncaught `loadConfig()` throw (`index.ts:252`) is gone: at startup the factory's `await refreshProvider` no longer rejects, and the poll no longer records `state.lastError` through `startPolling`'s catch (`:69-70`). → Accepted: a blank URL carries no instruction, the not-configured branch and the `source` trace are the remaining signals, and the docs pass states the default.
- **A stored `api_key` with an empty key is reachable only by a hand-edited `auth.json`.** → The resolver treats a present credential as present regardless, the fifth matrix row pins it, and no user path depends on it.
- **A stored `api_key` with no URL silently uses the default server.** → It never worked before (pi rejects a stored `api_key` under a keyless registration, `research-chidi` §1, §5), so the design takes nothing away; the docs pass states the rule.
- **The suite's fixtures must copy the no-`expires` credential shape.** Joel's real credential has no `expires` and `pi --no-refresh` rejects it (Michael trap d) — his repository's defect, not this change's, but it is the shape every fixture should keep.

## Migration Plan

Nothing persisted changes: this repository writes no credentials, so there is no data migration and no rollback path to design beyond reverting the release.

- **Release:** the published extension version carries the new rule. A user whose saved login was previously overridden by an exported key gets the saved login for both halves; the docs pass says `/logout` is the way to use a key in one shell.
- **A user with a legacy `api_key` record that carries its own `baseUrl`:** nothing moves. The record's URL is honoured exactly as it is today, and pi resolves the stored `api_key` as it does now.
- **A user with a stored `api_key` and a remote `OMLX_BASE_URL` but no stored URL:** that setup never produced a working chat, so it moves to the default server with nothing lost.
- **Rollback:** revert the version. No credential, cache or configuration state is written by the change, so a revert restores the old precedence with no cleanup.

## Open Questions

None. Every unknown these decisions touch is either settled by a ruling in `council.md` or named above as a risk with its mitigation; nothing deferrable remains that would change the specs, the approach or the task breakdown.
