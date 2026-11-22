# Eleanor Research — `adopt-native-api-key-login`

## Scope and ruling

Repository: `/Users/joelleibow/Projects/pi-omlx`; requested trace: every producer, store reader, resolver, registration, catalog consumer, stream consumer, script, test, living spec, and documentation statement that concerns the `omlx` credential from `/login omlx` through HTTP. I read the run brief in full. The binding ruling in `openspec/changes/adopt-native-api-key-login/owner-rulings.md` is to make authentication work as pi 1.5.2 intends; its explanatory account of pi auth is explicitly unvalidated context, not a ruling. This report maps repository behavior; pi API interpretation is Chidi's parallel research.

## Required project material

- `AGENTS.md`: present and read. It states the extension reads (never writes) `auth.json`; tests should reach stored credentials using an isolated `PI_CODING_AGENT_DIR`, temporary fixture paths rooted in `inject("isolationRoot")`, and caller env-key clearing in `CALLER_ENV_KEYS`.
- `ARCHITECTURE.md`: present and read. It identifies `index.ts` as entry point; credential resolution in `src/`; catalog/cache, provider configuration, OAuth prompts, and stream wrapper as the related components. It documents that login prompts fetch/register before returning, and describes stored auth, environment precedence and keyless behavior.
- ADRs: `docs/adr/0001-one-credential-decides-the-omlx-connection.md` exists, status **Accepted**, read in full. Decision: one stored `omlx` credential determines URL/key; environment applies only if no saved credential; empty-key saved login enables keyless behavior; environment URL alone is unconfigured; keyless provider registrations unregister first. It also records the template/command `api_key` difference: Pi interpolates requests while catalog fetch uses stored value verbatim. This current shape follows the ruling archived at `openspec/changes/archive/2026-11-11-one-credential-for-catalog-and-requests/owner-rulings.md` (“A saved login always wins”; env-only keyless out of scope). The archived `research-eleanor.md` is historical research about a previous implementation and does not describe current code; its obsolete findings should not be treated as current behavior.
- Language/build config: `package.json` read. ESM TypeScript package; Node >=22; pi-ai and pi-coding-agent dependencies are declared `^1.5.2`; scripts include `npm run check` (Biome, tsc, Vitest) and typecheck/test commands.

## Current credential path

1. **Login prompts and result** — `index.ts`'s `buildOmlxOauth` attaches `createLoginOmlx` plus `refreshOmlxToken` and `getOmlxApiKey`. `src/oauth-login.ts` asks base URL then API key (empty allowed), trims the key and normalizes URL to `/v1`; it invokes a callback that calls `fetchAndRegister` with those explicit values before returning. Returned value is `OAuthCredentials`: `{access: apiKey, refresh: "", expires: Number.MAX_SAFE_INTEGER, baseUrl}`. Refresh preserves fields and repairs expiry. `getOmlxApiKey` exposes `access`. The code comments identify this as a custom login using the OAuth callback/credential shape; `src/oauth-login.ts` has no `api_key`-typed result.
2. **Registration attachment / cache startup** — `index.ts` registers provider id `omlx` (`PROVIDER_KEY` from `src/auth-storage.ts`). `buildOmlxOauth` is attached by both `registerModels` and `registerLoginOnlyProvider`. Login-only first unregisters `omlx`, then registers name and OAuth callbacks only. Cached model registration resolves `readOmlxCredential()` with `process.env`, reads cache for resolved URL and registers cached models when valid; otherwise registers login-only. Poll `refreshProvider` independently resolves current credential and calls fetch/register. Login callback passes prompted values directly, before Pi persists the resulting credential.
3. **Store read and resolution** — `src/auth-storage.ts` exports `PROVIDER_KEY = "omlx"`; `readOmlxCredential` calls `readStoredCredential(PROVIDER_KEY)` and returns record fields without filtering. Record interface admits `type`, `baseUrl`, `key`, `access`. `src/config.ts::resolveOmlxCredential` handles `type === "oauth"` using `baseUrl` (default if blank/absent) and `access ?? ""`; `type === "api_key"` requires a truthy `key`, uses it and URL/default; any other present record is unconfigured; only absent record consults `OMLX_API_KEY` and `OMLX_BASE_URL`, and no env key means unconfigured. Thus empty OAuth access is configured/keyless while empty api_key key is unconfigured. URL normalization trims and ensures `/v1`; default is `http://127.0.0.1:8000/v1`. `src/config.ts` explicitly has `shortcut: mirrors pi-ai resolveProviderAuth (pi 1.5.2, auth/resolve.js:24-38); re-check on a pi upgrade`.
4. **Fetch and registration** — `index.ts::fetchAndRegister` passes that resolved `apiRoot` and `apiKey` to `src/catalog.ts::fetchModels`, writes cache on successful registrable response, then registers the same resolved credential. `fetchModels` uses bearer auth only for nonempty key; keyless sends no Authorization header. `src/provider.ts::toProviderConfig(apiRoot, apiKeyEnvVar, models, {keyless})` sets `baseUrl`, protocol `openai-completions`, `authHeader` inverse of keyless and, when keyed, `apiKey: "$OMLX_API_KEY"`; keyless omits apiKey. `registerModels` determines keylessness from `credential.apiKey === ""`; on every keyless registration it calls `pi.unregisterProvider("omlx")` before registering, to avoid inherited registration fields. `OMLX_API_KEY_ENV_VAR` is the provider config env name.
5. **Stream/request path** — `src/stream.ts` does not read the credential or base URL itself. It installs a custom `streamSimple` wrapper that calls pi-ai's OpenAI Completions implementation with model/context/options, timeout, event normalization and retry behavior. Its `shortcut:` comment relies on pi 1.5.2 provider dispatch. Registration's baseUrl and apiKey configuration are the stream's provider/model context; actual resolution of request key is host/pi-ai behavior and not asserted here. The stored `api_key` template/command distinction is noted by the ADR and architecture document.

## Tests and how fixtures reach credentials

All named tests below are in `test/`. Auth/config and wiring tests use the actual Pi agent directory path, not production test-only seams:

- `test/auth-storage.test.ts`: “PROVIDER_KEY is omlx”; “readOmlxCredential returns a stored api_key record with an empty key”; “readOmlxCredential returns a stored oauth record with its baseUrl and access”; “readOmlxCredential returns undefined when no omlx entry is stored”; “readOmlxCredential returns a record of an unknown type as-is”; “readOmlxCredential returns undefined when auth.json does not exist”. Fixture writes `<test dir>/auth.json`, points `PI_CODING_AGENT_DIR` there, and restores it afterward.
- `test/config.test.ts`: “normalizeBaseUrl appends /v1 when missing”; “normalizeBaseUrl keeps /v1 when present”; “normalizeBaseUrl strips trailing slashes”; “normalizeBaseUrl rejects empty string”; “resolveOmlxCredential reports nothing stored as unconfigured”; “resolveOmlxCredential takes both halves from the environment when nothing is stored”; “resolveOmlxCredential reads a stored oauth record's own URL and access”; “resolveOmlxCredential reads a stored api_key record with a key”; “resolveOmlxCredential reports a stored api_key with an empty key as unconfigured”; “resolveOmlxCredential reports a stored record of another type as unconfigured”; “resolveOmlxCredential falls back to the default URL for a blank URL”. These directly call resolver with records/env; integration is exercised in index tests.
- `test/oauth-login.test.ts`: “loginOmlx prompts for base URL then API key and normalizes the URL”; “loginOmlx accepts an empty API key for a keyless server”; “loginOmlx rejects an empty base URL”; “loginOmlx registers the real catalog before returning credentials”; “loginOmlx rejects when the catalog fetch fails, without storing credentials”; “getOmlxApiKey reads the access field”; “loginOmlx credential keeps a finite, future expiry through auth.json”; “refreshOmlxToken keeps the key and repairs a null expiry”.
- `test/provider.test.ts`: “toProviderConfig marks apiKey env var references explicitly”; “toProviderConfig omits apiKey and auth header for keyless servers” (plus model mapping tests).
- `test/catalog.test.ts`: “fetchModels omits the Authorization header for keyless servers” directly asserts empty-key fetch behavior. Remaining catalog tests cover endpoints, cache and metadata rather than credential resolution.
- `test/index.test.ts` is the end-to-end credential path. Relevant tests: “/login with an API key registers authenticated OMLX models”; “a stored credential decides the fetch and the registration”; “a legacy api_key record keeps its own base URL”; “a stored keyless credential registers keyless while the environment key is set”; “a stored api_key with an empty key makes no catalog fetch”; “an environment base URL alone makes no catalog fetch”; “nothing stored and nothing set registers the login-only provider”; “the poll re-fetches with the stored credential while both variables are set”; “a login with an empty key registers keyless while the environment key is set”; “a keyless registration unregisters the keyed one first”; “a steady-state keyless poll unregisters first”; “the provider_registered line names the stored source and carries no key”; “the provider_registered line reports the environment source”; “a login-only registration writes no provider_registered line”; “the environment supplies both halves when nothing is stored”; “a .env beside a copy of index.ts configures nothing”; “a stored credential without a base URL fetches from the default”. Later tests cover startup/cache and catalog polling, not additional credential shapes.
- Test setup: `test/isolation/global-setup.ts` sets `HOME` and `PI_CODING_AGENT_DIR` under fresh `pi-omlx-test-*` root and clears `CALLER_ENV_KEYS`: `OMLX_API_KEY`, `OMLX_BASE_URL`, `OMLX_MODEL_SETTINGS_PATH`, `OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS`, `PI_OMLX_DEBUG`. `test/isolation/worker-setup.ts` uses `inject("isolationRoot")` and guards agent dir, home and overlay path. Index/auth storage fixtures set temporary `PI_CODING_AGENT_DIR` and write credential JSON beneath `inject("isolationRoot")`; the production code has no testing auth path seam. Relevant spec is `openspec/specs/test-isolation/spec.md`, especially “Every Run Isolates Itself From Operator State And Caller Environment” and “Fixtures Reach Pi's State Through The Agent Directory And Stay Under The Root”.

## Scripts

`CONTRIBUTING.md` documents scripts use `process.env` only, not Pi's saved login. `scripts/smoke-live-omlx.ts` takes `OMLX_BASE_URL` (default `http://127.0.0.1:8000/v1`) and `OMLX_API_KEY` (default `local-smoke`) and sends Bearer header. `scripts/debug-omlx.ts` reports URL and whether key is set, not the secret itself. `scripts/debug-pi.ts` does not consume OMLX credential variables; `scripts/smoke-model-selection.ts` selects model names and does not read credentials. No script reads Pi `auth.json`.

## Living specs and requirement names

- `openspec/specs/credential-resolution/spec.md`: “One Credential Decides The Base URL And Key”; “The Catalog And Requests Use The Same Resolution”; “A Keyless Registration Clears The Previous One”; “A Base URL Alone Stays Unconfigured”; “The Trace Names The Credential Source”. It normatively describes stored precedence, keyless, env behavior, and registration shape.
- `openspec/specs/provider-access/spec.md`: “Provider Id Is omlx”; `PROVIDER_KEY` is the credential/provider id.
- `openspec/specs/environment-configuration/spec.md`: “The Environment Is The One The Extension Is Started In”; specifies env comes from process, not a file, and points precedence to credential-resolution.
- `openspec/specs/catalog-discovery/spec.md`: “Startup Never Waits On The Catalog”; “A Session That Starts Without A Catalog Stays As Pi Left It”; “One Warning Per Session When The Catalog Fails Or Lands Late”; “A Fetch That Outlives Its Session Changes Nothing”; “The Cache Follows The Agent Directory”. Startup/fetch requirements reference the resolved credential spec.
- `openspec/specs/test-isolation/spec.md`: four requirements listed above in tests section; details isolated stored-credential fixture paths.

## Docs: statements about login, credential shape and precedence

- `ARCHITECTURE.md` §2 diagram says extension reads and never writes `auth.json`, while Pi resolves requests. §3 says one resolver supplies catalog and registration; login prompts URL/key, fetches/registers before stored, then returns credential Pi keeps. §4 and §7 say store is under Pi agent dir, extension read-only; uninstall does not remove it, `/logout` does; saved credential/environment precedence and template/command `api_key` behavior. §9 repeats mirror and template caveat. Glossary defines saved login and keyless.
- `AGENTS.md` says auth store is read-only to extension, `/login` storage is Pi's job; resolver mirrors pi-ai order and ADR should be read before changing precedence. Test setup/conventions described above.
- `docs/CONFIGURATION.md` says `/login` writes base URL and key as oauth-typed credential under `omlx` in `auth.json`; `/logout` removes. It says saved login decides both URL/key, env vars apply only when none is stored; env key alone defaults URL, URL alone is unconfigured; keyless server is `/login` with empty key and env-only keyless unsupported.
- `README.md` says login is Pi's standard `/login`; quick-start offers `/login omlx`, URL/key prompts, empty key for keyless. It says saved login determines URL/key, env applies only absent a saved login, URL alone unsupported.
- `CONTRIBUTING.md` says scripts use `process.env` alone and do not consult saved login; documents environment setup for smoke/debug.
- Accepted ADR `docs/adr/0001-one-credential-decides-the-omlx-connection.md` is the decision text summarized above.

## External chezmoi seed (requested read)

Read only `/Users/joelleibow/dotfiles/home/dot_pi/private_agent/modify_private_auth.json`; did not read `~/.pi/agent/auth.json`. The template merges existing JSON and inserts `omlx` only if absent. Seeded shape: `{type:"oauth", baseUrl:"http://localhost:8000/v1", access:<1Password OMLX API Key credential>, refresh:"", expires:0}`. It does not set a `key` field. Template comments say OAuth entries are seeded only when missing, with `expires:0`; secret value comes from 1Password. This seed differs in finite expiry from the login flow's `Number.MAX_SAFE_INTEGER`, and its access field is the API key.

## Limits / unknowns

- No attempt was made to inspect Pi's own source or validate host authentication API; that belongs to Chidi. `src/stream.ts` has no direct credential access, so exact request credential resolution remains host behavior.
- The owner ruling records the target broadly (“as pi 1.5.2 intends”); repository research by itself does not interpret the native API surface.
- No tests or shell verification commands were run; this was read-only reconnaissance. No repository files other than the requested output report were written.


---

# Addendum (run 0932ab2f, 2026-11-12): the catalog side

# Eleanor Addendum — Catalog lifecycle reconnaissance

## Scope and ruling

This addendum maps the catalog lifecycle currently present in pi-omlx for `adopt-native-api-key-login`; it does not design the change. Binding change ruling A (in `openspec/changes/adopt-native-api-key-login/owner-rulings.md`) reopens the prior catalog lifecycle and notice rulings: pi-omlx adopts Pi's catalog lifecycle with login, with Pi's `refreshModels` and model store replacing the extension poll/backoff/cache. Pi-side implementation is Chidi's scope.

## Current flow in `index.ts`

- Constants: catalog request timeout `2_000` ms; success poll interval `10 * 60 * 1000` ms; failure backoff starts at `2_000` ms and caps at `60_000` ms.
- Factory creates per-extension `State`: `catalog`, `registered`, `stopped`, `lastError`, `startedLoginOnly`, pending notice/warned bit and UI context. It synchronously calls `registerCachedOrSetupModels`, sets `startedLoginOnly` from configured-but-not-registered, launches `startPolling` without awaiting it, then installs `session_start`, `model_select`, `before_provider_request`, and `session_shutdown` handlers.
- `startPolling` immediately invokes `refreshProvider`, then if the session is active either resets backoff after registered result or re-registers cached/login-only fallback. It calls notice logic after fallback so cached count reflects what remains registered. Success sleeps 10 min; all other results sleep increasing backoff. `session_shutdown` sets `stopped`; the poll checks this after an in-flight refresh and does no fallback/notice after shutdown.
- `refreshProvider` re-resolves the credential each cycle. Unconfigured returns `not_configured` without fetch; otherwise it invokes `fetchAndRegister` and returns resolved URL for notice.
- `fetchAndRegister` resolves local overlay path from `OMLX_MODEL_SETTINGS_PATH`, calls `fetchModels` with resolved URL/key and 2s timeout for poll (login does not pass that timeout), and handles exceptions as failed. After fetch it checks `stopped` before cache writes/registration. It requires at least one model with positive `contextWindow` and `maxTokens`; empty/nonregistrable response is failure with no cache write. Successful filtered models are cached and registered.
- `registerModels` maps `OmlxModel[]` to provider models, updates state catalog/registered and emits `provider_registered` debug event. `registerCachedOrSetupModels` reads cache only for configured credential URL, filters invalid cached models, and otherwise unregisters then registers login-only provider. `isRegistrableModel` checks both limits positive; `registrableCachedModels` returns undefined for no eligible models; `missingLimitModelIds` supplies failure diagnostic count.
- `showOnce` sends at most one UI warning; before UI exists, holds first notice for later `session_start`. Each decision is traced as `shown`, `held`, or `suppressed` using `catalog_notice`. Session start stores UI and emits held notice. `before_provider_request` finds active catalog model by id and passes that model's `thinkingDefault` into thinking controls; `model_select` only traces provider/model/source.

## `src/catalog.ts`: HTTP, overlay, cache and model fields

`OmlxModel` carries `id`, optional `displayName`, `contextWindow`, `maxTokens`, architectural `archContextWindow`, `thinkingDefault`, `reasoningParser`, and `modelType`.

- Preferred endpoint is `<apiRoot>/models/status`, parsed for names, limits, thinking metadata, parser and type; duplicate/missing IDs are dropped. `fetchModels` falls back to `<apiRoot>/models` if status fetch/parse fails (except abort), where response primarily supplies ids and optional `max_model_len` architectural ceiling.
- Requests use provided key as bearer only when nonempty. The fallback path also applies local overlay and attempts global defaults. If any model lacks context/token limit it queries `/admin/api/global-settings` (URL root strips `/v1`) for sampling defaults; failure leaves models as-is unless parent was aborted. Architectural context limit is final fallback and clamp.
- Overlay path is explicit `OMLX_MODEL_SETTINGS_PATH` if truthy, else `~/.omlx/model_settings.json`; it is applied before registration to display name, thinking default (direct `enable_thinking`, then `chat_template_kwargs.enable_thinking`), limits, reasoning parser and model type override. Invalid/missing overlay does not fail catalog; debug events record considered/read-failed/invalid/applied cases.
- Cache path is computed per call as `<getAgentDir()>/cache/omlx-models.json`. Cache JSON stores `{apiRoot, models}`; read only returns models when URL matches. Writes mkdir parent and swallow errors (best effort). It is not a multi-URL collection: each successful write replaces the file, and URL mismatch is treated as no cache.
- `src/provider.ts::toProviderModel` transfers id, display name, reasoning capability, input modalities, costs, context and output limits, compatibility/thinking format. It throws if required context/token limits are absent/nonpositive. `src/thinking.ts` uses state catalog metadata to disable thinking when model default is not true or user level is off. `src/stream.ts` itself reads only model provider/id and context messages for tracing/streaming; catalog metadata reaches it indirectly through provider model conversion. Index's pre-request handler reads catalog thinking default as above.

## Tests and lifecycle coverage

### `test/index.test.ts`

Catalog/lifecycle tests and what they exercise:

- Startup async timing: **“a request that never answers does not delay a session with cached models”**, **“a request that never answers does not delay a session with no cache”**. These assert factory completion independent of pending fetch.
- Late/cache registrations: **“a late catalog registers under omlx and moves no model”**, **“a cached start registers under omlx without choosing a model”**.
- reload behavior: **“a second load in one process registers again with no shutdown first”**.
- Cache write: **“a successful request registers the fetched models and writes the cache”** asserts models/cache data.
- Notices: **“a failed load with cached models warns once with the URL and the count”**; **“a failed load with no cache warns once naming the login-only provider”**; **“a 200 with nothing registrable warns once and writes no cache”**; **“a failure before the session starts warns once it does”**; **“a later success adds no second warning”**; **“a login-only session warns once, however often it starts or fails again”**; **“a late catalog warns once for a session that started login-only”**; **“a warm cache whose catalog arrives normally warns about nothing”**; **“an unconfigured start that later logs in warns about nothing”**.
- Notice trace and UI absence: **“the notice decision traces under PI_OMLX_DEBUG and is silent without it”**; **“a print-mode session with no UI records the warning and writes no stderr”**; **“a json-mode session with no UI records the warning and writes no stderr”**.
- Shutdown/in-flight behavior: **“a fetch that resolves after shutdown leaves the cache alone”**; **“a stale fetch that fails outright writes nothing either”**; **“a fetch that resolves after shutdown registers nothing and warns nobody”**. `driveExtension` triggers `session_shutdown` during cleanup and tests use deferred fake fetches where needed.
- Poll cadence assertions use fake timers: **“the poll re-fetches with the stored credential while both variables are set”** advances `POLL_INTERVAL_MS`; **“a steady-state keyless poll unregisters first”** advances same interval. Backoff advancement is used in notice retries including **“a later success adds no second warning”**, login-only retry tests, and **“an unconfigured start that later logs in warns about nothing”** (advances `BACKOFF_BASE_MS`). The poll behavior is therefore coupled to timer-driven tests.
- Credential-focused neighboring tests in same file also test credential URL/key feed into catalog and registration, but are detailed in the earlier `research-eleanor.md` report.

### `test/catalog.test.ts`

- Parse/limit tests: **“resolveArchContextLimits uses arch ceiling as prio-3 fallback”**, **“resolveArchContextLimits clamps a user value above the arch ceiling”**, **“resolveArchContextLimits keeps a user value within the arch ceiling”**, **“resolveArchContextLimits leaves models without an arch ceiling untouched”**; parse tests **“parseModelsResponse extracts ids from OpenAI shape”**, **“parseModelsResponse drops entries without id”**, **“parseModelsResponse captures max_model_len as archContextWindow”**, **“parseModelsResponse dedupes”**, **“parseModelsResponse throws on missing data array”**, **“parseModelsStatusResponse extracts Pi-supported fields and OMLX-only metadata”**, **“parseModelsStatusResponse omits missing numeric fields”**, **“parseModelsStatusResponse throws on missing models array”**.
- Fetch/overlay tests: **“fetchModels prefers /models/status”**; **“fetchModels omits the Authorization header for keyless servers”**; **“fetchModels applies local OMLX model settings for localhost metadata refinement”**; **“applyLocalModelSettings projects a full model_settings entry onto the fields the extension reads”**; **“fetchModels emits catalog debug events for local settings refinement”**; **“an overlay entry carrying only unread keys emits no applied event”**; **“applyLocalModelSettings honors explicit missing path without changing metadata”**; **“fetchModels falls back to /models when /models/status fails”**; **“fetchModels times out”**.
- Cache tests: **“a cache write after the agent directory changes lands under the new directory”** checks written file content/location; **“a cache read follows the agent directory in force when it runs”** checks read under changed agent directory. Paths derive from `inject("isolationRoot")`; tests set/restore `PI_CODING_AGENT_DIR`.

### `test/notice.test.ts`, `test/provider.test.ts`, `test/thinking.test.ts`

- `notice.test.ts`: **“a failed load with cached models names the URL and the count”**, **“a failed load with one cached model says model, not models”**, **“a failed load with no cache names the login-only provider”**, **“a late catalog names the URL, the login-only start and the way to switch”**, **“a catalog that arrives for a cached start says nothing”**, **“an unconfigured credential says nothing”**, **“a missing URL says nothing”**. Pure notice-string selection tests.
- `provider.test.ts`: **“toProviderConfig marks apiKey env var references explicitly”**, **“toProviderConfig omits apiKey and auth header for keyless servers”**, **“toProviderConfig marks only explicit thinking_default true as reasoning capable”**, **“toProviderConfig maps displayName to Pi name and keeps OMLX-only settings out of provider model”**. Provider model-field effects.
- `thinking.test.ts`: **“applyOmlxThinkingControls disables thinking explicitly”**, **“applyOmlxThinkingControls preserves Pi-computed thinking budget for capable models”**, **“applyOmlxThinkingControls does not manually enable thinking for capable models”**, **“applyOmlxThinkingControls does not invent an xhigh OMLX budget”**, **“applyOmlxThinkingControls disables thinking when model metadata is false”**, **“applyOmlxThinkingControls disables thinking when model metadata is missing or null”**.

## Specs

### `openspec/specs/catalog-discovery/spec.md` (read in full)

1. **Startup Never Waits On The Catalog** — scenarios: **An unresponsive server does not delay a cached start**; **A session with no cache starts login-only**; **The catalog request continues after startup**.
2. **A Session That Starts Without A Catalog Stays As Pi Left It** — scenarios: **A late catalog moves no model**; **The late catalog registers under omlx**.
3. **One Warning Per Session When The Catalog Fails Or Lands Late** — scenarios: **A failed request warns once, naming the URL and the cached models**; **A failure with no cache names the login-only provider**; **A response with nothing registrable counts as a failure**; **A failure before the session starts still warns**; **A later success adds no second warning**; **A late catalog warns when the session started login-only**; **A warm cache warns about nothing**; **An unconfigured credential warns about nothing**; **A run with no session UI writes nothing extra**.
4. **A Fetch That Outlives Its Session Changes Nothing** — scenarios: **A fetch resolving after shutdown registers nothing and caches nothing**; **A fetch resolving after shutdown warns nobody**.
5. **The Cache Follows The Agent Directory** — scenarios: **A write after the agent directory changes lands under the new directory**; **A read follows the agent directory in force when it runs**.

### `openspec/specs/diagnostics/spec.md` (read in full)

**Debug Tracing Answers to PI_OMLX_DEBUG** — scenarios: **Tracing stays off when the variable is unset**; **The empty string keeps today's answer**; **A zero keeps today's answer**; **Emitted lines carry the new prefix**. Current `src/debug.ts` uses `if (!process.env.PI_OMLX_DEBUG) return`, logs `[pi-omlx]`, and redacts matching authorization/api-key/bearer substrings in string fields. Catalog debug events are surfaced from `fetchModels`; notice decision event is `catalog_notice`.

Other specs mentioning relevant lifecycle: `credential-resolution` requirement **The Catalog And Requests Use The Same Resolution** explicitly mentions poll ten-minute cadence; **A Keyless Registration Clears The Previous One** has a steady-state keyless poll scenario. `test-isolation` requirement **Fixtures Reach Pi's State Through The Agent Directory And Stay Under The Root** includes cache fixture path constraints. `environment-configuration` has requirement **The Environment Is The One The Extension Is Started In**, including a catalog fake in scenario. `package-identity` states debug scripts retain session/cache/OMLX diagnostics.

## Scripts and test isolation

No file under `scripts/` calls `fetchModels`, `readCatalogCache` or `writeCatalogCache`, and no script reads `cache/omlx-models.json`. The debug scripts inspect Pi or OMLX diagnostics; smoke script talks directly to OMLX but is not extension catalog discovery.

`test/isolation/global-setup.ts` sets `HOME`, `PI_CODING_AGENT_DIR` to run-root directories, and clears `CALLER_ENV_KEYS = [OMLX_API_KEY, OMLX_BASE_URL, OMLX_MODEL_SETTINGS_PATH, OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS, PI_OMLX_DEBUG]`; catalog-specific guarded values are `OMLX_MODEL_SETTINGS_PATH` and `PI_CODING_AGENT_DIR`/agent cache location. `worker-setup.ts` guard checks `getAgentDir()`, `homedir()`, and `resolveLocalModelSettingsPath(process.env.OMLX_MODEL_SETTINGS_PATH)` beneath isolation root; thus it guards cache directory indirectly via agent dir and overlay path directly. Full relevant `test-isolation` requirements: **The Isolation Root Is Removed When The Run Ends**; **A Guard Fails The Run When The Isolation Escapes**; **Every Run Isolates Itself From Operator State And Caller Environment**; **Fixtures Reach Pi's State Through The Agent Directory And Stay Under The Root**.

## Documentation statements about lifecycle

- `ARCHITECTURE.md`: project structure calls entry point catalog poll; diagram shows extension fetches model list and writes agent `cache/`; component entry point starts poll and may fall back to login-only; catalog caches under agent dir and overlays metadata before registration. Data store paragraph says URL-keyed `cache/omlx-models.json`-type cache allows models registered before live fetch; startup does not wait; first poll tick is session startup request, requests bounded to 2 sec, cache-before-fetch order. Security/deployment says cache is an extension write. Glossary defines catalog/cache. It does not mention `--list-models` or notice wording.
- `AGENTS.md`: test conventions mention cache fixture via per-test `PI_CODING_AGENT_DIR` and root-contained fixture paths; no user-facing poll/notice behavior.
- `docs/CONFIGURATION.md` §“Startup, the catalog cache, and the warning”: cached models/login-only registered before Pi chooses start; cache at `~/.pi/agent/cache/omlx-models.json` keyed by resolved URL; no-cache start means no OMLX default model selected and use `/model` after list arrives; successful fetch writes cache for next start; `pi --list-models` has no OMLX models before a session fetches/writes cache; failure/late warning text and conditions; no warning when warm cache succeeds; no UI warning in `-p`/JSON modes.
- `README.md`: feature says discovery/register without blocking startup; without cache a session starts without models and list arrives later, switch using `/model`. No cache path or notice strings.
- `CONTRIBUTING.md`: safe test runs leave cached model list alone; `debug:omlx` and `debug:pi` tasks include cache diagnostics; triage describes catalog debug events and notice `shown`/`held`/`suppressed`; latest live smoke proof file is mentioned, not extension catalog cache. No assertion on poll cadence.
- `docs/adr/0001-one-credential-decides-the-omlx-connection.md`: decision states catalog shares credential with requests; consequence says each keyless registration costs extra pair of cache-only refreshes, measured immaterial. No other catalog lifecycle description.

## Archived startup-change rulings (quoted)

`openspec/changes/archive/2026-11-12-stop-blocking-startup-on-the-model-fetch/owner-rulings.md` records:

- Startup blocking is a must-fix; Joel: **“It's directly impacting user's experience without any indication of doing so. We don't want that sort of yucky in there.”** Decided startup must not wait on model fetch without user being told.
- No-cache behavior: Joel chose **“Start without waiting (Recommended)”**, with: **“Startup never waits. If your saved default is an omlx model and nothing is cached, pi starts on another provider's model, or none. The list arrives a moment later and you switch with /model. The docs say so. This is Michael's lean.”**
- Notice: Joel chose **“One notice when it matters (Recommended)”**, described as: **“Show one warning per session when the list fails or arrives late, naming the URL and whether cached models or login-only are in use. Without it, you can end up on another provider's model with nothing saying why. Michael's lean.”**
- Firing conditions: Joel chose **“Failures, plus late only if no cache (Recommended)”**, described as: **“You get a warning whenever the model list fails to load, saying whether cached models or login-only are in use. A list that arrives late only warns if the session started login-only, which is when you might be sitting on another provider's model. With a warm cache there's no warning.”**
- Poll interval/backoff explicitly out of scope for that archived card. These catalog notice rulings have been reopened by current binding ruling A.

## Unknowns

- Pi model store/`refreshModels` and host catalog lifecycle behavior are not assessed here; Chidi's parallel research owns it.
- No tests were run in this addendum. Report is source/test/spec/doc inspection only.


---

# Addendum (run 5477bf8a, 2026-11-12): login-only message and notice code

# Catalog notice facts

1. In `index.ts:243-250`, `registerLoginOnlyProvider` calls `pi.unregisterProvider(PROVIDER)` then `pi.registerProvider(PROVIDER, { name: "OMLX", oauth: buildOmlxOauth(pi, state) })`.

   The message near the requested line is assigned in `registerCachedOrSetupModels` at `index.ts:262-265`, inside its `!credential.configured || !models` branch:

   ```ts
   state.lastError = credential.configured
     ? "No cached OMLX models with real max_context_window/max_tokens; waiting for live catalog refresh."
     : "OMLX credentials are not set. Run /login and choose OMLX.";
   ```

   The exact message **“OMLX credentials are not set. Run /login and choose OMLX.”** is assigned only by this `state.lastError` ternary (`index.ts:262-265`), when the credential is unconfigured. `refreshProvider` separately assigns the different text **“OMLX credentials are not set”** at `index.ts:280`.

   Other `lastError` assignments are the caught poll error (`index.ts:85-86`), `undefined` after successful registration (`index.ts:214`), fetch exception (`index.ts:315-317`), and zero-registrable-model failure (`index.ts:328-332`). The cached/no-limit branch sets the first arm of the ternary at `index.ts:262-264`.

   The only read/pass-through of `state.lastError` is the OAuth login callback at `index.ts:186`:

   ```ts
   : { ok: false as const, error: state.lastError ?? "unknown error" };
   ```

   That returns a failure string from the login implementation. There is no direct UI notification call using `lastError`; catalog notices are produced independently through `catalogNotice`.

2. `src/notice.ts` contains:

   - `RefreshResult` type (`src/notice.ts:2`): `"registered" | "not_configured" | "failed"`.
   - `catalogNotice(...)` (`src/notice.ts:9-25`): returns `undefined` for missing URL; on `failed` returns cached or login-only unavailable message; on `registered` plus login-only start returns the late-arrival message; otherwise `undefined`.
   - `unavailableWithCache(...)` (`src/notice.ts:27-31`), template:
     ```ts
     `oMLX model list unavailable at ${url}; using ${cachedCount} cached ${noun}.`
     ```
     `noun` is `model` when count is one, otherwise `models`.
   - `unavailableLoginOnly(...)` (`src/notice.ts:33-35`), template:
     ```ts
     `oMLX model list unavailable at ${url}; using the login-only provider.`
     ```
   - `arrivedLoginOnly(...)` (`src/notice.ts:37-39`), template:
     ```ts
     `oMLX session started login-only; models from ${url} are now available; choose one with /model.`
     ```

   `index.ts:70` displays a notice through the stored extension UI context:

   ```ts
   state.ui.notify(notice, "warning");
   ```