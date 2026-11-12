# Research Report

## Question and Scope

Map every extension-side source/consumer of OMLX base URL and credential, derive catalog-fetch and registered-provider values for four stored credential forms × four environment states, identify existing precedence tests/docs, and record HEAD check baseline. Scope: `/Users/joelleibow/Projects/pi-omlx` at branch/commit stated in brief. Credential-selection behavior inside Pi's request machinery is explicitly Chidi's research, not inferred here.

## Sources / Files Examined

`openspec/changes/one-credential-for-catalog-and-requests/owner-rulings.md`; `src/config.ts`, `src/auth-storage.ts`, `src/oauth-login.ts`, `src/provider.ts`, `src/catalog.ts`, `index.ts`; `test/config.test.ts`, `test/index.test.ts`; `README.md`, `docs/CONFIGURATION.md`, `CONTRIBUTING.md`, `package.json`; OpenSpec research instructions. No root `AGENTS.md`, `CLAUDE.md`, or `ARCHITECTURE.md` found. ADR files were not found. The change dir contains owner-rulings but no ADR.

## Findings

### Readers and path

- `loadOmlxCredential` reads Pi's stored provider credential via `readStoredCredential("omlx", ...)`; `api_key` with nonempty key maps to `{baseUrl, apiKey:key}`, OAuth with access or base URL maps to `{baseUrl, apiKey:access ?? ""}`; otherwise undefined. (src/auth-storage.ts:20-39)
- `loadConfig(env)` reads the stored credential and chooses the URL with branches: `env.OMLX_BASE_URL ? env.OMLX_BASE_URL : env.OMLX_API_KEY ? DEFAULT_OMLX_BASE_URL : (stored?.baseUrl ?? DEFAULT_OMLX_BASE_URL)`, then normalizes `/v1`. API key env-var name is always `OMLX_API_KEY`. (src/config.ts:16-26)
- `resolveConfiguredApiKey(env)` branches: `if (env.OMLX_API_KEY) return env.OMLX_API_KEY; if (env.OMLX_BASE_URL) return undefined; return loadOmlxCredential()?.apiKey`. Thus partial env overrides do not mix with the opposite stored field. (src/config.ts:29-36)
- `hasOmlxTarget` returns true for either env variable, else for stored apiKey or baseUrl. (src/config.ts:43-47)
- `applyStoredCredentialToEnv` is legacy: if either env field exists return false; else require stored apiKey, then populate both URL (stored or default) and key. (src/config.ts:51-60)
- `buildOmlxOauth` attaches `/login` callbacks and uses explicit prompted URL/key to fetch/register before returning. (index.ts:138-154; src/oauth-login.ts:32-62). Login persists OAuth `{access: apiKey, refresh:"", expires:Number.MAX_SAFE_INTEGER, baseUrl}`; key can be empty. (src/oauth-login.ts:18, 41-62)
- `registerModels` computes `keyless = !explicitApiKey && !resolveConfiguredApiKey()`, then registers `toProviderConfig(config.apiRoot, config.apiKeyEnvVar,...,{keyless})`. (index.ts:157-185)
- `registerCachedOrSetupModels` loads config, checks configured state, and registers same config with cached models (no explicit key); absent usable cache it registers login-only provider. (index.ts:220-243)
- `refreshProvider` obtains `loadConfig()` and `resolveConfiguredApiKey()`; if neither key nor target exists, returns not-configured; otherwise passes key or empty string into `fetchAndRegister`. (index.ts:247-260)
- Polling re-runs refresh every ten minutes after success; failure retries with backoff (2s to 60s), registering cache/setup provider on unsuccessful refresh. (index.ts:92-122)
- `fetchAndRegister` calls `fetchModels(config.apiRoot, apiKey)` then caches/ registers fetched models; failures or models lacking positive limits prevent registration. (index.ts:268-304)
- `fetchModels` sends same supplied key to `/models/status`, fallback `/models`, and any global settings request. Empty key omits Authorization; nonempty key is `Bearer <key>`. (src/catalog.ts:181-269, 306-375)
- `toProviderConfig` sets provider `baseUrl=apiRoot`, `authHeader=!keyless`, and when not keyless `apiKey="$<apiKeyEnvVar>"`; keyless omits `apiKey`. (src/provider.ts:21-46). What key Pi resolves from this registration for actual chat is Pi-side: see `research-chidi.md`.

### Matrix

Notation: D=`http://127.0.0.1:8000/v1`; S=stored URL; E=environment `OMLX_BASE_URL` normalized; K=stored key/access; X=`OMLX_API_KEY`; `—` means no API key/undefined or omitted auth as indicated. Each row cell is `catalog fetch URL/key; registered baseUrl / apiKey / authHeader`. Values derive from `loadConfig`, `resolveConfiguredApiKey`, `refreshProvider`, `registerModels` and `toProviderConfig` above. Environment variables are treated as nonempty when designated present. OAuth keyless has `K=""`.

| Stored | Env none | Env X only | Env E only | Env E + X |
|---|---|---|---|---|
| none | D/—; D / omitted / false* | D/X; D / $OMLX_API_KEY / true | E/—; E / omitted / false | E/X; E / $OMLX_API_KEY / true |
| OAuth key K, URL S | S/K; S / $OMLX_API_KEY / true | D/X; D / $OMLX_API_KEY / true | E/—; E / omitted / false | E/X; E / $OMLX_API_KEY / true |
| OAuth keyless, URL S | S/empty; S / omitted / false | D/X; D / $OMLX_API_KEY / true | E/—; E / omitted / false | E/X; E / $OMLX_API_KEY / true |
| api_key K, URL S | S/K; S / $OMLX_API_KEY / true | D/X; D / $OMLX_API_KEY / true | E/—; E / omitted / false | E/X; E / $OMLX_API_KEY / true |

*With no stored/env credential, normal refresh does not fetch; default URL and keyless provider values describe registration only if live registration path is called. For any stored credential with URL/keyless URL, configured target permits refresh. For a stored api_key without URL, URL defaults to D. For OAuth keyless, omission of fetch auth header follows `fetchModels` empty-key behavior. During interactive login, `explicitApiKey` is passed, so nonempty key yields true/$OMLX_API_KEY; explicit empty key yields false/omitted regardless of environment, because the keyless calculation is short-circuited only by explicit nonempty value and then checks configured key resolution—note that this latter behavior can be influenced by ambient env and warrants confirmation if empty login occurs while an env key exists. The normal matrix above describes startup/poll, not this transient login call. Pi's actual chat key resolution is Chidi's scope.

Code-derived, not runtime-confirmed: no scratch-copy matrix harness was run. The safe baseline check below passed; existing tests directly cover selected branches.

### Tests and setup

- `test/config.test.ts:86-92`, title **“loadConfig does not mix env API key with stored base URL”**: stores api_key credential, invokes `loadConfig({OMLX_API_KEY:"shell-k"})`, expects default URL. This also differs from brief's quoted title “does not mix env base URL with stored key”; actual title is as quoted here.
- `test/config.test.ts:104-110`, title **“resolveConfiguredApiKey does not mix env base URL with stored key”**: stored credential + `OMLX_BASE_URL`, expects undefined. This is the test of that behavior; exact requested title **“does not mix env API key with stored base URL”** is the first test at 86-92.
- The tests named/titled above write credentials to temp auth JSON via `_setAuthPathForTesting` in setup (`test/config.test.ts:56-67`), not `PI_CODING_AGENT_DIR`. `test/auth-storage.test.ts:20-26` and `test/index.test.ts:35-44` similarly use `_setAuthPathForTesting`; index test's login test asserts catalog Authorization, URL, registered authHeader and apiKey (`test/index.test.ts:47-96`). No evidence that these targeted tests use `PI_CODING_AGENT_DIR`.

### Documentation precedence statements

- README gives default URL and says set `OMLX_BASE_URL` for a different server; it states no saved-login-versus-env precedence. (README.md:37)
- CONFIGURATION says `OMLX_API_KEY` “can also override the stored `/login` key” for CI/ephemeral/per-project overrides. (docs/CONFIGURATION.md:21-24)
- Other credential-related statements: built-in login writes base URL/key as oauth credential (docs/CONFIGURATION.md:7), and base URL can be set for non-default server (README.md:37; docs/CONFIGURATION.md:13-18); these do not explicitly state precedence.
- CONTRIBUTING has no saved-login/environment precedence statement found; its OMLX_BASE_URL mention is only a debugging instruction (CONTRIBUTING.md:55).

### Baseline

Ran exactly `PI_CODING_AGENT_DIR=/Users/joelleibow/Projects/pi-omlx/.pi/marbleization/one-credential-for-catalog-and-requests/agent-dir npm run check` at HEAD. Passed: Biome checked 35 files, `tsc --noEmit` passed, Vitest 11 files / 84 tests passed.

## Assumptions, Differences, and Unknowns

- Brief's requested quoted test names do not exactly match current titles; actual titles and equivalent assertions are recorded above.
- Runtime matrix confirmation via scratch copy was not completed; matrix is code-derived. Exact behavior of Pi's request credential resolution awaits Chidi (`research-chidi.md`).
- The interactive empty-key login with ambient `OMLX_API_KEY` may register an authenticated config due to `registerModels` keyless computation; impact on Pi request credential is unknown and belongs in reconciliation.
- No root instruction, architecture, or ADR material was found. No external documentation was consulted. Report only; no source/config changes made.

## Addendum 1 — login-only registration, env-only tests, diagnostics

1. `registerLoginOnlyProvider` first calls `pi.unregisterProvider(PROVIDER)`, then re-registers `omlx` with name and OAuth callbacks only (no models/config); invoked when no usable cached catalog is available (`index.ts:212-218,230-240`). The `/login` URL prompt does not read `loadConfig` or `OMLX_BASE_URL`: `createLoginOmlx` prompts with fixed placeholder `http://localhost:8000`, normalizes entered text, then asks for key (`src/oauth-login.ts:32-52`).

2. OMLX_BASE_URL-only target test: `hasOmlxTarget is true with an env base URL but no key (keyless)` (`test/config.test.ts:116-118`). No test specifically asserts refresh with only OMLX_BASE_URL. Tests calling `applyStoredCredentialToEnv`: `returns false when no stored creds` (`test/config.test.ts:129-134`); `populates env when stored creds exist` (`:136-142`); `yields to explicit env pair` (`:144-153`); `does not mix partial env with stored creds` (`:155-161`). No test under `test/` calls `readLastCatalogCache`; the function is only declared/exported at `src/catalog.ts:581-583`.

3. `src/debug.ts:1-27` gates stderr tracing on truthiness of `PI_OMLX_DEBUG`, redacts matching credential-like text in string values and truncates them to 500 chars, then writes `[pi-omlx]`. Events/call sites: `model_select` and `before_provider_request` (`index.ts:73-91`); `provider_registered` (`index.ts:185-190`); `stream_error_normalized` (`src/stream.ts:155-160`); `stream_simple_entered` / `stream_simple_bypassed` (`src/stream.ts:196-208`); `stream_throw_normalized` (`src/stream.ts:266-271`). `openspec/specs/diagnostics/spec.md:7-22` requires the existing PI_OMLX_DEBUG predicate unchanged, no PI_OMLX_PICKER_DEBUG or `[pi-omlx-picker]`, and `[pi-omlx]` prefix; scenarios cover unset, empty-string predicate behavior and `0` behavior.