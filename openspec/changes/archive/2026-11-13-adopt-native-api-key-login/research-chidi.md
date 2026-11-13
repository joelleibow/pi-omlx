# Research (Chidi): pi 1.5.2 native API-key login, platform facts

Scope: platform behaviour of pi 1.5.2 only. No design, no recommendation. Eleanor maps the repository.

Paths. `PCA` = `/Users/joelleibow/.local/share/fnm/node-versions/v26.8.1/installation/lib/node_modules/@earendil-works/pi-coding-agent`. `PAI` = `PCA/node_modules/@earendil-works/pi-ai` (version 1.5.2). Line numbers are from the installed `dist/*.js` or `*.d.ts`. "Installed source" is authoritative for runtime behaviour. "Docs" or "CHANGELOG" is stated where it answered.

Experiments: two throwaway runs of the real `pi` CLI under `.pi/marbleization/adopt-native-api-key-login/scratch-chidi/agent`, selected through `PI_CODING_AGENT_DIR`. That scratch directory was deleted afterwards. `~/.pi/agent` was not touched. Nothing in the repository other than this file was written.

Extension call shape (read only for context): `index.ts:205` and `:245` call `pi.registerProvider(PROVIDER, { ..., oauth: buildOmlxOauth(pi, state) })`, the legacy `ProviderConfig` form. `index.ts:204` and `:244` call `pi.unregisterProvider(PROVIDER)` first.

---

## Q1. Which registration forms can declare a native API-key login?

**Only a complete `Provider`. The legacy `ProviderConfig` cannot.**

Two overloads (`PCA/dist/core/extensions/types.d.ts:1403-1404`):
```ts
registerProvider(provider: Provider): void;                       // complete pi-ai Provider
registerProvider(name: string, config: ProviderConfig): void;     // legacy
```
Docs (`PCA/docs/custom-provider.md`, "Register a provider") name the same two forms: a complete `Provider` "for native authentication, filtering, discovery, refresh, and streaming behavior", and `ProviderConfig` "for the legacy configuration form". The docs table row "Add a `/login` flow" says "A provider with native or legacy OAuth configuration".

**`ProviderConfig`** (`types.d.ts:1459-1511`). Its auth-related fields:
- `apiKey?: string`: a literal, `$ENV`, or `!command`.
- `authHeader?: boolean` and `headers?`.
- `oauth?: { name, isSubscription?, login(callbacks: OAuthLoginCallbacks), refreshToken(credentials, signal), getApiKey(credentials), modifyModels? }`.

There is no field for an API-key login, `check`, or `resolve`.

**`Provider`** (`PAI/dist/models.d.ts:72-134`) has `auth: ProviderAuth`. `ProviderAuth` is `{ apiKey?: ApiKeyAuth; oauth?: OAuthAuth }` (`PAI/dist/auth/types.d.ts:245-248`). `ApiKeyAuth` (`auth/types.d.ts:174-200`) is:
```ts
interface ApiKeyAuth {
  name: string;
  login?(interaction: ProviderAuthInteraction): Promise<ApiKeyCredential>;   // optional; absent = ambient-only
  check?(input: { ctx: AuthContext; credential?: ApiKeyCredential; signal: AbortSignal }): Promise<AuthCheck | undefined>;
  resolve(input: { same }): Promise<AuthResult | undefined>;                  // required
}
interface ApiKeyCredential { type: "api_key"; key?: string; env?: ProviderEnv }   // :15-19
interface AuthResult { auth: { apiKey?, headers?, baseUrl? }; env?: ProviderEnv; source?: string }  // :6-10, :87-93
interface AuthCheck { source?: string; type: "api_key" | "oauth" }
```
`AuthInteraction` (`:161-165`): `{ signal, prompt(AuthPrompt): Promise<string>, notify(AuthEvent) }`. Prompt types are `text | secret | select | manual_code`, each with `message` and an optional `placeholder` (`:105-127`). Events are `info | auth_url | device_code | progress` (`:132-153`).

**Composer code that reads them** (`PCA/dist/core/provider-composer.js`):
- `composeApiKeyAuth` (`:244-311`) builds the API-key auth for any provider that has a `config` (models.json) or an `extension` (legacy `ProviderConfig`) overlay.
  - `inherited = base?.auth.apiKey` (`:245`). `base` is a built-in or native extension provider.
  - `login: inherited?.login ?? (generic prompt "Enter API key", type secret)` (`:254-259`). So the legacy form only ever gets `inherited.login` or the generic secret-only prompt. It has no URL prompt and no hook to add one.
  - If there is no inherited API-key auth, no `config.apiKey`, and an OAuth exists, it returns `undefined` (`:248-250`, "OAuth-only providers get no fabricated API-key login method").
  - `check` (`:260-283`) and `resolve` (`:284-309`) delegate to `inherited` when present. Otherwise a stored `credential.key` wins, then the configured `apiKey` is resolved (`:293-299`).
  - The base URL for a legacy provider is static, from `ProviderConfig.baseUrl` (`:396`, `applyExtension` at `:188-195`). The legacy `resolve` never returns `auth.baseUrl`.
- `composeOAuthAuth` (`:312-327`) and `adaptOAuth` (`:196-215`) turn the legacy `oauth` block into a pi-ai `OAuthAuth`. `adaptOAuth` forces `type: "oauth"` onto whatever `login` returns (`:210`).
- `composeModelProvider` (`:349-469`) throws `Provider X: no authentication method configured.` when neither API-key nor OAuth auth results (`:374-375`).

**Native registration path**: `ModelRegistry.registerProvider(providerOrName, config?)` (`PCA/dist/core/model-registry.js:116-124`) sends a string to `runtime.registerProvider` (legacy) and an object to `runtime.registerNativeProvider`. `ModelRuntime.composeProvider` (`model-runtime.js:156-173`) returns the native/built-in provider **untouched** when there is no models.json overlay and no legacy extension entry ("use the builtin untouched so its auth/login/stream behavior is exact"). Otherwise it composes through `composeModelProvider`.

**Reference implementation** (lead confirmed): `PCA/dist/extensions/llama/provider.js:134-175`.
- `auth.apiKey.name = "llama.cpp server"`.
- `login` (`:138-155`) prompts `text` for the URL, with a placeholder from `process.env.LLAMA_BASE_URL` or the default. It then prompts `secret` "API key (optional)" and calls `new LlamaClient(url, key||undefined).list(...)` to validate. It returns `{ type: "api_key", key: apiKey || undefined, env: { LLAMA_BASE_URL: serverUrl } }`.
- `check` (`:156-161`) and `resolve` (`:162-174`) are described in Q2.

---

## Q2. What is stored, and how do `check` / `resolve` / env interact?

**auth.json shape** (validator `PCA/dist/core/auth-storage.js:175-212`):
- `api_key`: `{ "type": "api_key", "key"?: string, "env"?: { [name: string]: string } }`.
  - `key` may be absent or any string, including `""`.
  - `env` must be a plain object of string values.
  - Anything else throws `Invalid auth.json credential for provider "<id>"`.
- `oauth`: `{ "type": "oauth", "access": string, "refresh": string, "expires": finite number, ...extra }`.

I observed the llama.cpp login shape in the scratch run: `{"type":"api_key","env":{"LLAMA_BASE_URL":"http://127.0.0.1:8080"}}`. The key is omitted because `JSON.stringify` drops `undefined`.

**Read-time key interpretation** (`auth-storage.js:376-381`; also `:220-225` for the read-only store). On `read`, an `api_key` credential with a non-empty `key` goes through `resolveConfigValue(key, credential.env)`. `PCA/dist/core/resolve-config-value.js` treats a stored key that starts with `!` as a shell command. It treats `$NAME` or `${NAME}` as an env interpolation. `$$` and `$!` are escapes. `isCommandConfigValue` keys are returned unresolved by `read` in the guarded branch (`:221` and `:380`). An empty or undefined `key` is returned as-is. So a literal API key containing `$` or starting with `!` is reinterpreted at read time. I did not test which paths run the command.

**Request-time ordering** (`PAI/dist/auth/resolve.js:10-39`, `resolveProviderAuth`). The header comment states it: "A stored credential owns the provider: ambient/env is consulted only when nothing is stored. No silent env fallback after a failed refresh or for a credential type without a matching handler." Order:
1. Explicit `overrides.apiKey` (a stream option) → `apiKey.resolve({credential: {type:"api_key", key, env}})` (`:17-23`).
2. A stored credential → if it is `api_key` and the provider has `auth.apiKey`, call `resolve` with it (`:29-32`). If it is `oauth` and the provider has `auth.oauth`, refresh and `toAuth` (`:26-28`). Any other combination returns `undefined` with no env fallback (`:33`).
3. Nothing stored → `apiKey.resolve({ctx, credential: undefined})`, the ambient path (`:36-38`).

`overrides.env` is overlaid onto both `ctx.env` (`overlayEnvAuthContext`, `:40-45`: `env[name] || base.env(name)`) and the stored credential's `env` (`:30`).

**`check` vs `resolve`** (`PAI/dist/models.js:274-294`, `checkProviderAuth`):
- Stored `oauth` → `{source:"OAuth", type:"oauth"}` only if `provider.auth.oauth` exists, else `undefined` (`:275-277`).
- Otherwise, if `provider.auth.apiKey.check` exists, call it with `{ctx, credential (api_key only), signal}`.
- Otherwise fall back to a full `resolveProviderAuth` and report `{source, type:"api_key"}`.

The `ApiKeyAuth.check` doc (`auth/types.d.ts:179-183`): "Optional side-effect-free availability check. Use this when `resolve()` may execute commands…". The `resolve` doc (`:189-194`) describes per-field merging: `credential.key ?? env("...")`, `credential.env?.NAME ?? env("...")`.

**Llama example**:
- `resolveServerUrl` (`llama/provider.js:11-14`): `credential.env.LLAMA_BASE_URL`, else `await ctx.env("LLAMA_BASE_URL")`.
- `check` (`:156-161`): returns `{type:"api_key", source: credential ? "stored credential" : "LLAMA_BASE_URL"}` when a URL resolves, else `undefined`.
- `resolve` (`:162-174`): `apiKey = credential?.key ?? await ctx.env("LLAMA_API_KEY") ?? "local"`. It returns `{ auth: { apiKey, baseUrl: <url>/v1 }, env: { ...credential?.env, LLAMA_BASE_URL }, source }`.

Note that `??` treats `""` as a value. A stored `key: ""` would be sent as `""`, not `"local"`. Llama's own login avoids this with `key: apiKey || undefined`.

**Where an extension expresses an environment fallback**: `AuthContext.env(name)` is the `ctx` passed to `check` and `resolve` (`auth/types.d.ts:81-85`). The default implementation (`PAI/dist/auth/context.js:21-24`) reads `process.env[name]` and returns `undefined` for an empty or whitespace-only value. `ModelRuntime.create` calls `createModels({credentials, modelsStore})` with no custom `authContext` (`model-runtime.js:76`), so the default applies. For the legacy form, `configContextEnv` (`provider-composer.js:233-243`) uses `ctx.env` only to resolve `$VAR` references inside `apiKey` and `headers`.

**How the base URL reaches the request**: `ModelRuntime.prepareRequest` (`model-runtime.js:459-492`) sets `requestModel = {...model, baseUrl: resolution.auth.baseUrl}` when `auth.baseUrl` is returned (`:472`). It passes `resolution.auth.apiKey` as `options.apiKey` and `resolution.env` as `options.env`. So `resolve` can override a model's `baseUrl` per request. `ModelRegistry.getApiKeyAndHeaders` (`model-registry.js:34-62`) also returns `baseUrl` and `env`.

**How the refresh hook sees credentials** (`PAI/dist/models.js:244-272`, `resolveRefreshCredential`, and `:178-221`, `refresh`):
- Offline phase (cache restore): `refreshModels` receives the raw stored credential of **any type** as `context.credential` (`refresh` calls `runProviderRefreshPhase(provider, storedCredential, false, …)`, `models.js:190-196`).
- Network phase: for a stored `api_key` or no stored credential, `apiKey.resolve(...)` is run, and the hook receives a synthesised `{type:"api_key", key: result.auth.apiKey, env: result.env}` (`:251-258`). So `context.credential.key` is the **resolved** key, for example `"local"` for llama, and `context.credential.env` is the resolved env.
- A stored `oauth` credential with no `provider.auth.oauth` gives `undefined`, so the network phase is skipped (`:245-250`).

Llama's `refreshModels` (`:177-`) reads `credentialServerUrl(context.credential)`, that is `credential.env.LLAMA_BASE_URL`, and returns early if `context.credential?.type !== "api_key"` (`:195`).

---

## Q3. `/login`, `/login <provider>`, `pi auth login`, `/logout`, `pi auth check --no-refresh`

For a provider whose `auth` has `apiKey` (with `login`) and **no** `oauth`:

**Interactive `/login` (no argument)** (`PCA/dist/modes/interactive/interactive-mode.js`):
- `handleLoginCommand` (`:5027`) with no ref calls `showLoginAuthTypeSelector()` (`:5058`).
- The selector offers "Sign in with an account" (oauth) and "Sign in with an API key" (`apiKeyLabel`, `:5068`). Picking one calls `showLoginProviderSelector(authType)` (`:5122`), and the provider list is filtered by that auth type.
- **The provider does not appear in a flat, plain `/login` list.** It appears only after choosing "Sign in with an API key". The API-key list also holds every other provider with `auth.apiKey`.
- `getLoginProviderOptions` (`:4978-5012`) adds an `api_key` option for any provider with `provider.auth.apiKey`, whether or not it has `login`. One without `login` opens `showAmbientAuthDialog` ("… is configured outside pi", `:5172-5184` region, `showAmbientAuthDialog` defined at `:5293`).

**`/login <provider>`** (`:5027-5045`):
- Matching is case-insensitive on `provider.id` or `provider.name` (`PCA/dist/core/provider-matching.js:2-7`).
- One matching option starts the login directly: `startProviderLogin` (`:5047`) → `showApiKeyLoginDialog` (`:5310`) → `modelRuntime.login(id, "api_key", {prompt, notify})`.
- A provider with both oauth and api_key options shows a method selector. For API-key-only providers there is no selector.

**After login** (`completeProviderAuthentication`, `:5200-5290`): `modelRuntime.refresh({providers:[id]})` runs with network allowed by default (`:5272`, 15 s timeout). The model-selection step is deferred until the refresh lands when the previous model is unknown and the provider has a default model. For `providerId === "llama.cpp"` there is a hard-coded post-login hint (inside `completeProviderAuthentication`, `llamaCppPostLoginGuidance`).

**`pi auth login <provider> [--api-key] [--no-browser]`** (`PCA/dist/cli/auth-login.js`; docs `PCA/docs/cli.md:307`):
- `selectAuthType` (`:86-97`): oauth if the provider has it and `--api-key` is not given. Otherwise API key if `auth.apiKey.login` exists. Otherwise "configured outside pi".
- Prompts go to the terminal: `terminal.secret(...)` for `secret`, `terminal.question(...)` for `text`, with the placeholder shown as ` (placeholder)` (`:123-133`).
- It requires an interactive terminal (`:31-34`) and then runs a catalog refresh (`:57`, `refreshProviderCatalog`).
- **EXPERIMENT (verified):** `pi auth login omlx` and `pi auth login llama.cpp` both report `Unknown provider "…"`. The listed providers are pi-ai built-ins only. **`pi auth` subcommands never load extensions.** `runAuthLoginCommand` builds `ModelRuntime.create({allowModelNetwork:false,…})` (`PCA/dist/main.js:108`), and no extension registration happens there. The `auth-logout.js:26` comment says so: "Providers registered by extensions are not loaded here, so their stored credentials match by id alone."
- The built-in llama.cpp provider, an extension, is equally unknown to `pi auth login`.

**`/logout`** (`:5154-5199`, `showOAuthSelector` and `getLogoutProviderOptions` at `:5013-5026`):
- It lists **every stored credential** from `modelRuntime.listCredentials()`, not providers by capability. The name is `provider?.name ?? providerId`.
- It calls `modelRuntime.logout(id)`, which deletes the entry. The message depends on the credential's type: "Logged out of X" for oauth, "Removed stored API key for X. Environment variables and models.json config are unchanged." for api_key.

**`pi auth logout <provider>`** (`auth-logout.js:10-56`):
- It matches a stored credential by provider id even when the provider is unknown (extension providers are not loaded).
- **EXPERIMENT (verified):** with a scratch auth.json holding `omlx` (oauth) and `llama.cpp` (api_key), `pi auth logout omlx` printed `Logged out of omlx.`, exit 0. It removed only the `omlx` entry and left the llama entry intact.

**`pi auth check --provider <p> [--no-refresh]`** (`PCA/dist/cli/auth-check.js:5-35`, `PCA/dist/main.js:~190-215`):
- It creates the runtime with `ModelRuntime.create({ credentials: ReadOnlyAuthStorage | AuthStorage, allowModelNetwork:false, refreshOnCreate:false })` (`auth-check.js:42-49`). No extensions are loaded.
- `modelRuntime.getProvider(provider)` undefined → `{status:"not_ready", reason:"provider_not_found"}`.
- **EXPERIMENT (verified)** with the scratch auth.json above (`PI_OFFLINE=1`, `--no-refresh --json`):
  - `--provider omlx` → `{"status":"not_ready","provider":"omlx","reason":"provider_not_found"}`, exit 1.
  - `--provider llama.cpp` → the same `provider_not_found`, exit 1, even with a valid stored `api_key` + `env.LLAMA_BASE_URL` entry.
  - `--provider openai` (built-in, nothing stored) → `credentials_not_configured`, exit 1.
- So `pi auth check` can never report `ready` for an extension-registered provider in 1.5.2, regardless of OAuth or native API-key. `--no-refresh` only chooses a read-only `AuthStorage` and skips the `getAuth` call; it is not the reason for the miss.

---

## Q4. Keyless server

- **The login may return an empty key.** `ApiKeyCredential.key` is optional (`auth/types.d.ts:17`). The validator accepts an absent key or `""`. Llama returns `key: apiKey || undefined`, so the key is dropped from the JSON (verified shape above). The prompt text is "API key (optional)" (`llama/provider.js:146`).
- **Whether the provider counts as configured is decided by `check`/`resolve`, not by key presence.** Llama's `check` and `resolve` return a result whenever a server URL resolves (`:156-174`).
- **What is sent**: llama's `resolve` returns `apiKey = credential?.key ?? ctx.env("LLAMA_API_KEY") ?? "local"` (`:166`), so a placeholder `"local"` goes out as the bearer token. The reason is in pi-ai's OpenAI-completions client: `getClientApiKey` throws `No API key for provider: <id>` when `apiKey` is falsy and there is no `Authorization` or `cf-aig-authorization` header (`PAI/dist/api/openai-completions.js:35-40`, used at `:182`).
- The llama HTTP client (`llama/client.js:148`) adds `Authorization: Bearer …` only if a key was given. That covers its own catalog and management calls, not chat requests.
- **Legacy form with an empty stored key**: `composeApiKeyAuth.check` (`provider-composer.js:261-267`) treats a falsy `credential.key` as "no key". It falls through to `inherited?.resolve(input)`, and with no inherited provider it returns `undefined`. So a keyless stored credential counts as unconfigured under the legacy form.
- **`getApiKeyAndHeaders` when auth resolves to `undefined`** (`model-registry.js:36-43`): it returns `{ok:false, error:"No API key found…"}` only if the compatibility config has `authHeader` set. Otherwise it returns `{ok:true, headers}` with no `apiKey`.

---

## Q5. An `auth.json` `omlx` entry of `type: "oauth"` when the provider no longer declares OAuth

(Native provider with `auth.apiKey` only. Behaviour traced in code; not all paths run end-to-end.)

**Loading and storage**: no migration or validation drops it. The validator accepts any well-formed oauth entry (`auth-storage.js:203-209`), and the entry stays in `auth.json`. The only migration file, `PCA/dist/migrations.js`, covers legacy `oauth.json` and `settings.json` apiKeys and is skipped if `auth.json` exists (`:13-23`).

**At startup** (`agent-session-services.js:57-103` order: `ModelRuntime.create` → extensions load → pending registrations flushed → `modelRuntime.refresh({allowNetwork:false})`):
- `ModelRuntime.refreshProviderAvailability`/`runAvailabilityRefresh` (`model-runtime.js:189-214`) fills `snapshot.storedProviders` from `credentials.list()`. That includes `omlx`, because `list` returns every entry regardless of type (`auth-storage.js:418`). It fills `snapshot.configuredProviders` from `models.checkAuth()`.
- `checkProviderAuth` (`PAI/dist/models.js:275-277`) returns `undefined` for a stored oauth credential when `provider.auth.oauth` is absent. So `omlx` is **not** in `configuredProviders`, and `hasConfiguredAuth` is false (`model-runtime.js:366-368`). Its models are not in `getAvailable()`, so they are not selectable.
- **Brief window**: `registerNativeProvider` and `registerProvider` call `markProvisionallyConfigured` (`model-runtime.js:657-671`). If `storedProviders` already has the id, the provider is marked configured, with type `"api_key"` for a provider that has `auth.apiKey`. The next availability pass (`void this.refresh({allowNetwork:false})`, `:650`) replaces that entry. The stale mark is transient, and I did not observe it. It is a possible one-tick inconsistency.
- Model refresh: the offline phase passes the stored oauth credential to `refreshModels` as `context.credential` (Q2). The network phase is skipped because `resolveRefreshCredential` returns `undefined` (`models.js:245-250`).

**At request time**: `ModelRuntime.prepareRequest` → `getAuth` → `resolveProviderAuth` returns `undefined` on `stored.type === "oauth"` with no `provider.auth.oauth` (`resolve.js:26-33`). `prepareRequest` throws `ModelsError("auth", "Provider is not configured: omlx")` (`model-runtime.js:468-469`). There is **no** fallback to environment variables or to the provider's `resolve` (the comment at `resolve.js:4-9`).

**In `/login`**:
- `getLoginProviderOptions` (`interactive-mode.js:4978-5012`) takes the status from `getProviderAuthStatus` (`model-runtime.js:448-458`). That method reports `{configured:true, source:"stored"}` whenever `snapshot.storedProviders` has the id, regardless of credential type.
- The type shown is `isUsingOAuth(id) ? "oauth" : "api_key"` (`:4982-4987`), and `isUsingOAuth` reads the `checkAuth` snapshot (`:360-362`). Thus the stale entry would display as configured, source "stored", type "api_key" in the selector. This is derived from the code, and I did not view the UI.
- Running `/login omlx` and finishing the native login calls `credentials.modify(id, async () => credential)`, which **overwrites** the oauth entry with the new `api_key` entry (`PAI/dist/models.js:365-412`; one credential per provider id).

**In `/logout`**: the stale entry is listed (type oauth) and removable (`getLogoutProviderOptions`, `:5013-5026`). The experiment above confirms removal by id.

**In `pi auth check`**: `provider_not_found`, because extensions are not loaded (Q3). The stored entry has no effect.

**Can the provider's `resolve` read the oauth entry?** No. `resolveApiKey` is only called with a credential of type `api_key` or with `undefined` (`resolve.js:17-38`). The `check` and `resolve` inputs are typed `credential?: ApiKeyCredential`. The ways a native provider could see the stale entry are:
- `refreshModels` offline phase: `context.credential` (raw stored credential of any type, `models.js:190-196`).
- `ctx.modelRegistry`: none. The `ModelRegistry` facade (`model-registry.js`) exposes no raw-credential read. `getProviderAuth(id)` (`:102-104`) returns the resolved `AuthResult`, which is `undefined` here.
- Reading `auth.json` directly outside pi's API. This is not a pi API, so it is noted only as a possibility.

**Reverse direction**: with a provider that still declares oauth and a stored `api_key`, `resolveProviderAuth` uses the api_key path (`:29-32`). The two credential types never cross.

---

## Q6. What else a complete `Provider` requires or changes

(Facts about the API.)

**Required members** (`PAI/dist/models.d.ts:72-134`): `id`, `name`, `auth` (at least one of `apiKey`/`oauth`), `getModels()`, `stream(...)`, `streamSimple(...)`. Optional: `baseUrl`, `headers`, `getAllModels`, `refreshModels`, `refreshModelsAuth`, `filterModels`, `filterAllModels`, `fetchDeferred`, `cancelDeferred`, `generateImages`, `classify`. `registerNativeProvider` throws if `id.trim()` is empty (`model-runtime.js:643-644`).

**Helper**: `createProvider(options)` in `PAI/dist/models.js:549`, exported from pi-ai's root index (`dist/index.d.ts:19`, `export * from "./models.ts"`; `auth/helpers.ts` and `auth/types.ts` are also exported there).
- `CreateProviderOptions` (`models.d.ts:222-254`) takes `id`, `name?`, `baseUrl?`, `headers?`, `auth`, `models`, `fetchModels?`, `filterModels?`, `filterAllModels?`, `api?`, `images?`, `classifiers?`.
- Its `api` is a single `ProviderStreams` or a map keyed by `model.api`. At least one of `api`, `images`, or `classifiers` is required or it throws (`:553-562`).
- It implements `refreshModels` around `fetchModels` (`models.js:~600-626`): restore `context.stored`, then if `allowNetwork` fetch, then `publish({persist:{models, checkedAt}, update})`. The in-memory state is `dynamicModels`, merged over the baseline `models` by (type,id).
- The llama provider is hand-written instead, with its own `refreshModels`.
- The streaming implementations used in `llama/provider.js` are `stream` and `streamSimple` from `@earendil-works/pi-ai/compat`. The lazy API modules are importable as `@earendil-works/pi-ai/api/*` (`package.json` exports: `./api/*`, `./compat`).

**Model listing**: `getModels()` is **sync** and must not throw. "Dynamic providers return the list as of the last `refreshModels()` (empty before the first)" (`models.d.ts:86-91`). Models carry their own `baseUrl`, and the request-time `auth.baseUrl` overrides it (`prepareRequest`, `model-runtime.js:472`).

**`refreshModels` contract** (`models.d.ts:15-36, :100-105`; docs `custom-provider.md` "Supply and refresh models"):
- A complete Provider returns `Promise<void>`. It installs state through `context.publish({persist?, update?})`, and the update runs synchronously after the optional persistence write.
- `RefreshModelsContext` has `credential?`, `stored?`, `publish`, `allowNetwork`, `force?`, `signal`, `baseUrl?`.
- `refreshModelsAuth` is `"credential"` (default) or `"configured"`. "configured" gives no credential and never refreshes OAuth.
- Legacy `ProviderConfig.refreshModels` instead **returns** `ProviderModelConfig[]`, and pi replaces the registration's live models with it (`types.d.ts:1489-1493`, `custom-provider.md`). On the legacy form, `composeModelProvider` wraps it (`provider-composer.js:403-426`).
- Refresh is triggered by `ModelRegistry.refresh()` (`model-registry.js:12`) → `runtime.refresh` → `models.refresh`. Only configured dynamic providers refresh, since "static, unknown, and unconfigured providers are skipped" (`models.d.ts:163-168`). It also runs after a login or logout (`model-runtime.js:582-596`, `synchronizeCredentialState`, which refreshes with `allowNetwork:false`) and after the TUI login (network allowed, 15 s).

**Streaming hooks**: a complete Provider supplies its own `stream` and `streamSimple` (the legacy form routes through `streamWith` in the composer, `:377-392`). Per the docs, a custom stream must honour `options.onPayload`, `onResponse`, `onProviderStreamEvent`, the abort signal, and provider-scoped env (`custom-provider.md` "Implement custom streaming"). Delegating to a built-in API keeps those. Llama delegates to pi-ai's `stream`/`streamSimple` from `/compat`. Note that `ModelRuntime.stream` passes the resolved `apiKey`, `headers`, and `env` in `options` (`:485-490`).

**`unregisterProvider(name)`** (`model-registry.js:125-127` → `model-runtime.js:691-697`): it deletes both the legacy `extensionProviders` entry and the `nativeExtensionProviders` entry, then recomposes the provider. With no built-in or models.json base, the provider is removed (`recomposeProvider` → `models.deleteProvider`, `:149-153`). Before the runtime binds, `unregisterProvider` filters the pending queues (`loader.js:176-179`).

**Interaction between the two forms for the same id** (`model-runtime.js`):
- `registerNativeProvider` deletes any legacy entry for that id first (`:645`).
- `registerProvider` deletes any native entry (`:676`). A legacy re-registration also merges defined fields over its previous registration, "preserves undefined ones" (`:677-685`).
- `unregisterProvider` followed by `registerProvider` resets that merge.

**models.json and legacy overlays are composed above a native provider**: the docs say "Pi composes `models.json` overrides above a registered native provider" (`custom-provider.md`). A user models.json entry for the same id makes `composeProvider` go through the composer, and `composeApiKeyAuth` inherits the native `login`, `check`, and `resolve` (`provider-composer.js:245-259`).

**Registration timing**: `pi.registerProvider` during factory load is queued and flushed after load (`loader.js:168-179`, `agent-session-services.js:72-103`). Afterwards it takes effect immediately (`loader.js:371-380`, via `applyRuntimeChange`). The docs say "Pi waits for asynchronous factories before startup continues, so providers registered there are available to startup model selection and `pi --list-models`" (`custom-provider.md`). The CHANGELOG notes a fix for "new sessions … ignoring the saved default model … when it belongs to an extension-registered native provider with a stored credential" (CHANGELOG `:643`, 0.99.2).

---

## Q7. Obtaining the resolved credential outside a request

- **At factory time**: the factory receives only `pi` (`ExtensionAPI`). There is no `modelRegistry`, `modelRuntime`, or credential access on `pi`. I checked `types.d.ts` for any auth accessor on the API, and `modelRegistry` appears only on `ExtensionContext` (`types.d.ts:245`). `pi.registerProvider` is queued and applied later, and the action methods throw "Extension runtime not initialized" until the runner binds (`loader.js:113-126`). A native `Provider` itself can read credentials through its own `check`, `resolve`, and `refreshModels(context.credential)` hooks. Those are invoked by pi after registration, not by the factory.
- **In a session context**: `ExtensionContext.modelRegistry: ModelRegistry` (`types.d.ts:245`; the getter in `runner.js:646-649` calls `assertActive()`). Methods on the facade (`model-registry.js`):
  - `getProviderAuth(provider)` (`:102-104`) → `runtime.getAuth(provider)` → `AuthResult | undefined` (`{auth:{apiKey,headers,baseUrl}, env, source}`). It **rejects** with a `ModelsError` on a resolve failure.
  - `getApiKeyForProvider(provider)` (`:105-112`) returns the `apiKey` only and swallows errors.
  - `getApiKeyAndHeaders(model)` (`:34-62`) returns `{ok, apiKey, headers, baseUrl?, env}` and never throws.
  - `getProviderAuthStatus`, `hasConfiguredAuth`, `getProvider`, `isUsingOAuth`, `refresh`.
  - Docs `extensions.md:1218`: "`getProviderAuth(id)` resolves its current API key, headers, base URL, and provider-scoped environment without requiring a loaded model."
  - These go through the same `resolveProviderAuth` as requests, so for a stored `oauth` entry with no OAuth handler they return `undefined` (Q5).
- **In a background task**: the facade works only through a context. A `ctx` captured from an event is invalidated on session replacement or reload. `runtime.invalidate` sets a stale message, and every context getter calls `assertActive()` (`loader.js:127-136`, `runner.js:626-649`). The `invalidate` message says not to use a captured `pi` or command `ctx` after `ctx.newSession()`, `fork()`, `switchSession()`, or `reload()`. `docs/extensions.md:256` says to start background resources in `session_start` and close them in an idempotent `session_shutdown` handler.
- **Before `session_start`**: only the factory (with `pi`) and the provider hooks. `docs/extensions.md:213` says an async factory "completes before `session_start`, before `resources_discover`, and before provider registrations … are flushed", and the flowchart (`:378-385`) shows project_trust, then `session_start`. At that point the runtime already exists. `createAgentSessionServices` builds `ModelRuntime` before the extensions load (`agent-session-services.js:57-60`), but extension code has no handle to it.
- A provider's `auth.apiKey.check`/`resolve` get `AuthContext` (`env`, `fileExists`) and `signal`, with no registry handle.
- **Unverified**: whether `ctx.modelRegistry.getProviderAuth` on the first `session_start` of a fresh process always sees the credential state of the final availability pass. The startup `refresh({allowNetwork:false})` completes inside `createAgentSessionServices` (`:104`) before the session is created, and `getAuth` reads credentials directly (it does not use the snapshot), so I expect it to work. I did not run it.

---

## Q8. When native API-key logins with custom prompts arrived

- **Source**: `PCA/CHANGELOG.md`, `## [0.81.0] - 2026-07-21`:
  - "Full provider extensions — Extensions can register complete pi-ai providers with authentication, model refresh, filtering, and custom streaming. See Register New Provider" (`:1542`).
  - "Added extension registration for complete pi-ai providers, including native authentication, model refresh, filtering, and streaming behavior" (`:1553`).
  - "Added built-in llama.cpp router support with `/login` connection setup…" (`:1552`).
- **Commit `2dee67c`** (author date Sat Jul 4 2026, `git show 2dee67c`, "Use subscription path for login to avoid depending on env vars") **predates 0.81.0 by 17 days**. Its date falls after 0.80.3 (2026-06-30) and before 0.80.4 (2026-07-09). So by the changelog, the complete-`Provider` registration with a native `apiKey.login` did not exist when the commit was made. Its stated reason ("the API-key path then could not ask for a URL") is consistent with the legacy `ProviderConfig` having no API-key login hook. That is an inference from the dates and the type definitions, not a quoted pi statement.
- Other API-key-login changelog entries found: `0.80.7`, "Fixed `/login amazon-bedrock` to prompt for and save a Bedrock API key" (`:1681`), and `0.80.2`, the `ApiKeyCredential` rename to `type: "api_key"` with provider-scoped `env` (`:1834`). I did not find a changelog line that names "custom prompts for API-key login" as a feature; the 0.81.0 lines above are the closest.
- Not checked: pi's git history (not available locally; the installed package has no `.git`).

---

## Differences from the supplied leads

- **Confirmed**: the llama provider declares `auth.apiKey.login` with its own prompts, returns `{type:"api_key", key, env:{LLAMA_BASE_URL}}`, and has `check` and `resolve`. A keyless server gets `"local"` from `resolve`. `custom-provider.md` distinguishes the two registration forms.
- **Refined**: the lead said the llama provider "appears to send `"local"`". Precisely, `resolve` returns it as `auth.apiKey`, and `prepareRequest` forwards it. It matters because the OpenAI-completions client throws on an empty key.
- **New, not in the leads**: `pi auth login`, `pi auth check` and `pi auth logout` do not load extensions, so extension-registered providers (including built-in llama.cpp) are unknown to `login` and `check` (verified by experiment). `logout` works by id.
- **New**: the legacy `ProviderConfig` can reach an API-key login only through the generic "Enter API key" prompt (when `apiKey` is configured), with a static `baseUrl`.

## Gaps and unknowns

- I did not run an extension with a native provider through the TUI, so the stale-oauth `/login` status display (Q5) and the provisional-configured window are derived from code, not observed.
- I did not test a literal key that starts with `!` or contains `$` end-to-end. The `resolveConfigValue` reading is from source.
- Whether `pi auth check`/`login` will ever load extensions is not documented. The 1.5.2 behaviour is verified; any future change is unknown.
- `PCA/docs/cli.md` describes `pi auth login` as signing in "like `/login <provider>`" without saying that extension providers are excluded. I did not find a document that states this limit.
- I did not find an upstream statement of the `check` and `resolve` contract for an empty-string key beyond the type comments. The `""` versus `undefined` difference in llama's `??` is from reading the code.
- pi's git history and issue tracker were not consulted. Q8 relies on the shipped CHANGELOG only.


---

# Addendum (run 8e4d016f, 2026-11-12): keyless oMLX and a placeholder bearer

# Addendum (Chidi): keyless oMLX and an arbitrary placeholder bearer

Output path note: the brief says to write `research-chidi.<runId>.md` in the repository; the follow-up task named this path as authoritative, so the repository was not written. The full earlier report is unchanged at `openspec/changes/adopt-native-api-key-login/research-chidi.md`.

## Answer in short

**With verification off, oMLX accepts a request carrying any `Authorization: Bearer <placeholder>` and ignores the value, on `/v1/models`, `/v1/models/status` and `/v1/chat/completions` alike.** The check returns success before the header is read. A placeholder such as `"local"` is therefore harmless against a keyless oMLX. **With verification on, a wrong bearer gets HTTP 401** `{"detail":"Invalid API key"}`; a missing bearer gets 401 `API key required`; a remote client that has sent 8 wrong keys gets 429 for 30 s.

This is read from source only. No server was probed.

## Source read

- Repository: <https://github.com/jundot/omlx>. Cloned to `.pi/marbleization/adopt-native-api-key-login/scratch-chidi/omlx-src` (scratch, not the repository proper).
- **oMLX v0.8.0rc1**, `omlx/_version.py:1` (`__version__ = "0.8.0rc1"`), HEAD `c74f1b18558842e6b10fcfa6e2e901bb382129d4` (2026-11-13). Tag `v0.8.0rc1` = `454c90d3` (2026-11-13).
- **oMLX v0.7.3** (latest non-pre-release tag, `9de79bc3`, 2026-11-01), compared: the auth functions are identical in logic (`omlx/server.py:371-437` at v0.7.3 vs `:373-439` at v0.8.0rc1; only line offsets differ).
- Line numbers below are for HEAD `c74f1b18` unless stated. The installed oMLX version on the user's machine is unknown; both tags behave the same.

## The setting names (confirmed)

- **`skip_api_key_verification`** is the real name. `omlx/settings.py:699`: `AuthSettings.skip_api_key_verification: bool = False`. Added in commit `0a6473b3` (2026-03-07, "feat: add skip API key verification option…", first tag `v0.2.4`). The UI label is "Disable all authentication" (`README.md:386`).
- A second, newer opt-in: **`allow_unauthenticated_inference`** (`settings.py:700`, default `False`; commit `cf7d4033`, 2026-09-23, first tag `v0.7.0rc1`). README `:388` calls it "Allow inference without API key" and says management endpoints still require the main API key.
- A third keyless situation is no key configured at all: `_server_state.api_key is None` (`omlx/server.py:316`, `:2524`).

## The check, step by step

`omlx/server.py:260`: `security = HTTPBearer(auto_error=False)`. A missing or non-Bearer `Authorization` header gives `credentials = None` rather than an error.

`verify_api_key` (`server.py:373-431`), in order:

1. `:393` `loopback_only = active_host is None or is_loopback_bind(active_host)`, where the host is `_server_state.bind_host` (set at `:2526`) or the configured host.
2. `:396-399` **No main key configured** (`api_key is None`): return `True` if loopback-only, otherwise raise 401 `API key required`. The bearer is never read.
3. `:402-407` **Key configured and `skip_api_key_verification` on and loopback-only**: return `True`. The bearer is never read.
4. `:410-416` Otherwise take the bearer (or the `x-api-key` header); none present gives 401 `API key required`.
5. `:424-429` Compare against the main key and sub keys under `check_api_key`; a mismatch logs `Rejected API key (fp=…)` and raises **401 `Invalid API key`**.

`verify_inference_api_key` (`server.py:442-448`): if `allow_unauthenticated_inference` is true it returns `True` immediately; otherwise it calls `verify_api_key`.

## Per-endpoint dependency

| Endpoint | Route (HEAD) | Dependency |
|---|---|---|
| `GET /v1/models` | `server.py:3806-3807` | `verify_inference_api_key` |
| `GET /v1/models/status` | `server.py:3976-3977` | `verify_api_key` (not the inference variant) |
| `POST /v1/chat/completions` | `server.py:5036-5040` | `verify_inference_api_key` |

At v0.7.3 the same three dependencies apply (`server.py:3778`, `:3942`, `:5003`).

## Behaviour matrix (from the code above)

| Server state | Bearer `"local"` (any placeholder) |
|---|---|
| No main key, loopback bind | Accepted on all three endpoints; bearer ignored (step 2). |
| Main key set, `skip_api_key_verification` on, loopback bind | Accepted on all three; bearer ignored (step 3). |
| Main key set, `allow_unauthenticated_inference` on | `/v1/models` and `/v1/chat/completions` accepted, bearer ignored. **`/v1/models/status` still requires a valid key**: wrong bearer gives 401, because it uses `verify_api_key`. |
| Main key set, verification on (default) | 401 `Invalid API key` on all three; no bearer gives 401 `API key required`. |
| No main key, non-loopback bind | 401 `API key required` regardless of bearer (step 2). Startup refuses this combination without a key (`omlx/utils/network.py:143-165`, `network_auth_error`). |
| `skip_api_key_verification` on, non-loopback bind | Skip is ignored (step 3 needs `loopback_only`); startup refuses it (`network.py:153-157`). Test: `tests/test_api_auth.py` `test_skip_verification_is_ignored_on_network_host`. |

Notes:
- "Accepted" means the auth dependency passes. It does not say anything about the response body.
- The README (`:386`) says `skip_api_key_verification` "turns off both inference and admin authentication, so it stays restricted to loopback-only binds"; `docs/admin-api.md:16` says the same for admin requests.
- Wrong-key lockout (`omlx/admin/auth.py:234-236`, `:280-325`): 8 wrong keys from one non-local client gives a 30 s lockout, then 300 s on repeats. The response is **429** with `Retry-After` and detail `Too many wrong API keys. Try again in Ns.` (`admin/auth.py:252-260`). Clients on the same machine (loopback or the server's own address) are exempt (`_client_key`, `:263-277`, returns `None`). This only counts when verification actually compares the key, so a keyless server never reaches it.
- Another detail of the comparison: an empty configured key never matches (`admin/auth.py` `verify_api_key`: `if not api_key or not server_api_key: return False`). Not relevant to a keyless server, where the compare is not reached.

## Test evidence

`tests/test_api_auth.py:274-` (`TestSkipApiKeyVerification`): skip on a loopback bind returns `True` with `credentials=None`; skip on `0.0.0.0` raises 401. `:625-` (`TestUnauthenticatedInference`) covers inference paths including `/v1/chat/completions` under `allow_unauthenticated_inference`. These tests send no bearer, so the "arbitrary bearer is ignored" fact rests on the code path (steps 2-3 return before `credentials` is used), not on a test that sends a placeholder.

## Gaps

- No live request was made, as instructed. I did not run oMLX's tests.
- No test in the repository sends an arbitrary bearer to a keyless server; the conclusion follows from the code ordering.
- The user's installed oMLX version is unknown; I compared only v0.7.3 and v0.8.0rc1. I did not read earlier versions. Loopback gating of the skip switch arrived with commit `09a7c437` (2026-09-13, first tag `v0.7.0.dev4`), so earlier servers may have applied skip on any bind host; I did not read that code.
- The detail text `Invalid API key` and the 401 status come from the code; I did not check the `WWW-Authenticate` header (FastAPI's `HTTPException` here sets none).


---

# Addendum (run ebf305b8, 2026-11-12): pi catalog lifecycle

# Addendum (Chidi): pi 1.5.2 catalog lifecycle for a native `Provider`

Output path note: the brief names `research-chidi.<runId>.md` in the change directory; the follow-up task named this path as authoritative, so the repository was not written. Your report `research-chidi.md` is unchanged.

Paths. `PCA` = `/Users/joelleibow/.local/share/fnm/node-versions/v26.8.1/installation/lib/node_modules/@earendil-works/pi-coding-agent` (pi 1.5.2). `PAI` = `PCA/node_modules/@earendil-works/pi-ai/dist`. Lines are from the installed `dist/*.js`.

**Experiments** (all under `.pi/marbleization/adopt-native-api-key-login/scratch-chidi/cat/`, with `PI_CODING_AGENT_DIR` pointing at its `agent/` or `agent2/` subdirectory, run with `-ne -e <scratch ext>`; `~/.pi/agent` untouched). The scratch extension `ext.mjs` registers a hand-written native `Provider` `omlxtest` with `auth.apiKey.{login,check,resolve}`, a sync `getModels()`, and a `refreshModels` that appends one log line per call (`allowNetwork`, `force`, `credential`, `stored` count, `baseUrl`) and restores `context.stored` via `publish({update})`, then, if the network is allowed, publishes two fresh models with `persist:{models,checkedAt}`. The provider's `stream`/`streamSimple` throw `... not used`, so reaching them shows a session selected the model. Modes `CAT_MODE=throw|hang` make the network phase throw or wait for abort. Results are marked **(measured)**; the rest is read from source. Interactive TUI paths were read, not driven.

---

## Q1. The `refreshModels(context)` contract

**Type** (`PAI/models.d.ts:15-36`, hook at `:100-105`):

```ts
interface RefreshModelsContext {
  credential?: Credential;                 // effective credential; OAuth refreshed first
  stored?: Readonly<ModelsStoreEntry>;     // immutable snapshot of the persisted catalog for this provider
  publish(p: { persist?: ModelsStoreEntry | null; update?: () => void }): Promise<boolean>;
  allowNetwork: boolean;                   // false during offline / cache-only phase
  force?: boolean;                         // set only when allowNetwork; bypass freshness checks
  signal: AbortSignal;                     // always present
  baseUrl?: string;                        // provider.baseUrl as registered, incl. config overrides
}
interface ModelsStoreEntry { models: readonly AnyModel[]; lastModified?: number; checkedAt?: number; etag?: string }
```

The hook returns `Promise<void>`. The doc comment says implementations "retain their previous list on failure, publish persistence and synchronous state changes through `context.publish()`, and honor the shared abort signal".

**Two phases per refresh, in order** (`PAI/models.js:180-216`, `refresh`):
1. Read the stored credential (`:196-200`, errors held, not yet thrown).
2. **Offline phase**: `runProviderRefreshPhase(provider, storedCredential, false, undefined, …)` (`:168-179`). It reads `modelsStore.read(provider.id)`, runs `withKnownModelTypes(structuredClone(stored))` (drops stored models of an unknown type, `:20-22`) and calls `refreshModels` with `allowNetwork:false`, `force:undefined`, and `credential` = the **raw stored credential of any type** (or `undefined`). A held credential-read error is thrown after this phase.
3. If `!allowNetwork` or the signal is aborted, stop.
4. `resolveNetworkRefresh` (`:237-`): with `refreshModelsAuth:"configured"` the provider is checked only; otherwise `resolveRefreshCredential` (`:244-`). A stored `api_key` or none runs `apiKey.resolve` and passes `{type:"api_key", key: result.auth.apiKey, env: result.env}`; an unconfigured provider (resolve returns `undefined`) gets **no network phase at all**. A stored `oauth` credential with no `auth.oauth` gives `undefined`, so no network phase.
5. **Network phase**: the same `runProviderRefreshPhase` with `allowNetwork:true` and `force` as passed.

So the hook is called twice per network refresh: first offline (restore), then network. **(measured)** In RPC the log shows `allowNetwork=false … stored=1` then `allowNetwork=true cred={"type":"api_key","key":"local","env":{"BASE":…}} stored=1`; the stored credential had no `key`, and the network-phase credential carries the key that `resolve` returned (`"local"`, my scratch `??` default), plus the resolved `env`.

**`publish({persist, update})`** (`PAI/models.js:143-166`, `publishProviderModels`):
- Publications for a provider are serialized through a promise chain.
- Before writing it checks `signal.aborted` and that the refresh **generation** is still current; if not it returns `false` and writes nothing.
- `persist === null` → `modelsStore.delete(providerId)`; `persist` an entry → `modelsStore.write(providerId, structuredClone(entry))`; `persist` omitted → no storage change.
- It re-checks the signal and generation, then runs `update()` **synchronously**, and resolves `true`. `update` is the place to swap the provider's in-memory list, which `getModels()` serves.
- A newer refresh of the same provider supersedes the older one (`supersedeProviderRefresh`, `:127-136`, aborts the previous controller, bumps the generation): an overlapping refresh makes the older `publish` return `false`.

**Where `persist` goes**: `FileModelsStore` (`PCA/dist/core/models-store.js:26-114`), a locked JSON file `models-store.json` keyed by provider id (`write` at `:92-102` replaces `current[providerId]` and keeps other providers' entries). Default path: `ModelRuntime.create` uses `join(dirname(modelsPath), "models-store.json")` where `modelsPath = join(getAgentDir(), "models.json")` (`model-runtime.js:81-86`), and `getAgentDir()` returns `$PI_CODING_AGENT_DIR` when set (`PCA/dist/config.js:510-516`). **(measured)** With `PI_CODING_AGENT_DIR=<scratch>/agent`, after an RPC network refresh `<scratch>/agent/models-store.json` held `omlxtest: { models:[net1,net2], checkedAt: 1794540795121 }`; `models.json` need not exist. `createAgentSessionServices` passes `modelsPath: join(agentDir,"models.json")` the same way (`agent-session-services.js:58-61`). If `modelsPath` is null the store is in-memory (`model-runtime.js:83-86`).

Data stored are the plain model objects; `structuredClone` is applied on write and read, so functions are not storable. On restore, models whose `type` is unknown to this pi version are dropped.

**`checkedAt`**: the core does nothing with it. `grep checkedAt` finds uses only in pi's own providers: `PCA/dist/core/remote-catalog-provider.js:93-95` (pi.dev catalogs skip the request when `!context.force && stored.checkedAt !== undefined && stored.lastModified !== undefined && Date.now() - stored.checkedAt < REMOTE_CATALOG_REFRESH_INTERVAL_MS`, a 4 h constant at `:7`), and as a value written by `llama/provider.js:223`, `PAI/providers/radius.js:43,60`, and `createProvider` (`PAI/models.js:615`). `Models.refresh` never skips a network call on `checkedAt`. Each provider decides for itself. Llama's `refreshModels` does not consult it (it fetches whenever `allowNetwork`).

**`persist` field shape** is `ModelsStoreEntry` (`PAI/models-store.d.ts`): `models`, optional `lastModified`, `checkedAt`, `etag`.

---

## Q2. Where pi calls `refreshModels` with the network allowed

Default for `ModelRuntime.refresh()` is `allowNetwork = this.modelNetworkEnabled` (`model-runtime.js:610`), which is `process.env.PI_OFFLINE === undefined` (`:97`). Every call below is skipped or goes offline when `PI_OFFLINE` is set, unless the caller passes `allowNetwork:true` (the llama extension does for `/llama`; see below).

| Trigger | Code | Network? | Blocks? | Timeout |
|---|---|---|---|---|
| **Runtime creation** | `ModelRuntime.create` (`model-runtime.js:79-118`) | `allowNetwork: refreshFromNetwork` = `modelNetworkEnabled && options.allowModelNetwork === true`; no caller in 1.5.2 passes `true` for sessions (`main.js:108,128,175`; `agent-session-services.js:57-61` passes none) | startup | `modelRuntimeSignal` 15 s (`main.js:660`) but offline only |
| **Provider registration** | `registerNativeProvider` / `registerProvider` / `unregisterProvider` (`model-runtime.js:650, 689, 696`) | `refresh({allowNetwork:false})`, not awaited | no | n/a |
| **After extension load** | `createAgentSessionServices` `await modelRuntime.refresh({allowNetwork:false})` (`agent-session-services.js:111`) | offline | **yes, startup waits for the offline phase** | n/a |
| **Interactive startup** | `InteractiveMode.run()` (`interactive-mode.js:861-870`): after `init()`, unless `PI_OFFLINE`, `void refreshModelCatalogs(runtime, signal)`; result ignored (`.then(updateAvailableProviderCount).catch(()=>{})`) | **yes, all providers** | **no** (fire and forget; TUI already up) | 15 s abort |
| **RPC startup** | `main.js:818-826`: `if (!offlineMode && appMode === "rpc")` `void modelRuntime.refresh({signal})` | yes | no | 15 s |
| **After a TUI login** | `completeProviderAuthentication` (`interactive-mode.js:5269-5272`): `refresh({providers:[id], signal})` | yes, that provider | not the login dialog; model selection is deferred until it lands only when the previous model is unknown and the provider has a default model (`:5205-5214`, `deferSelection`) | 15 s |
| **`/model` selector** (and the `app.model.select` shortcut `:2564`) | `ModelSelectorComponent` constructor `void this.refreshModels()` (`model-selector.js:103`, body `:127-165`) → `refreshModelCatalogs` | yes, all | no: the list is drawn from the snapshot first, then updated | 15 s (`:128`) |
| **`/model <term>` with no cached match** | `findExactModelMatch` (`interactive-mode.js:4476-4503`) awaits `refreshModelCatalogs`; status "Refreshing model catalogs…" | yes, all | **yes, that command waits** | 15 s |
| **`/scoped-models` selector** | `interactive-mode.js:4682` `void refreshModelCatalogs(...)` | yes, all | no | timeout not checked |
| **extension `ctx.modelRegistry.refresh()`** | `model-registry.js:12` → `ModelRuntime.refresh` | per `options.allowNetwork` (default per above) | caller's choice | caller's signal |
| **`pi update --models`** | `package-manager-cli.js:538-575` | `allowNetwork:true, force:true` | the command | 15 s |
| **`pi auth login <p>`** | `auth-login.js:187-214` | yes after saving | the command | 15 s |
| **`--list-models`** | `main.js:776-780` → `listModels` → `modelRuntime.getAvailable()` (`list-models.js:24-30`) | **no refresh** | n/a | `getAvailable` only runs auth checks (15 s signal) |
| **print / json modes** | none in `main.js` | **no** | n/a | n/a |

Concurrency: interactive all-catalog refreshes go through `ModelCatalogRefreshCoordinator` (`modes/interactive/model-catalog-refresh.js:2-33`), which shares one in-flight `modelRuntime.refresh({signal})` among callers, aborting it when the last waiter leaves. Provider-level generation checks (above) also abort an overlapping refresh of the same provider.

**Measured** (`scratch-chidi/cat/log*.txt`):
- `--list-models`: only the two offline calls (`allowNetwork=false`, `restore published=true`), no network phase. One call comes from the factory-time registration (`void refresh`), one from `createAgentSessionServices`.
- `-p` print mode, with and without `--model`: only offline calls; no network phase.
- `--mode rpc`: three offline calls, then one network phase, log `network published=true`.

**Corrections to Michael's trap ii** (`michael-orientation.md`):
- Confirmed: interactive startup (`:863-869` → actual call at `:866`), after login (`:5272`), no periodic refresh (`grep setInterval` finds none in `model-runtime.js`, `remote-catalog-provider.js`, `PAI/models.js`; the only one in `interactive-mode.js:3761` is a suspend keep-alive).
- **Wrong attribution**: `:4682` is the **`/scoped-models`** selector, not `/model`. `/model` refreshes in `ModelSelectorComponent` (`model-selector.js:103`). `:4491` is `/model <term>` (`findExactModelMatch`), not "an unknown model reference" in general: `--model <unknown>` on the command line does **no** refresh (see Q4).
- **Missing**: RPC startup (`main.js:820-826`); `pi update --models`, but see next point.
- **`pi update --models` does not reach extension providers**: it creates `ModelRuntime.create(...)` with built-ins only (`package-manager-cli.js:543-551`), as `pi auth` does (your report, Q3). An extension-registered provider is not refreshed by it. Code reading; not run.
- Not refreshed anywhere: print and json modes, `--list-models`, `/reload` (it re-registers providers, which only triggers the offline `refresh`).
- Interactive startup refresh is skipped under `PI_OFFLINE`; the RPC one too.

---

## Q3. When `refreshModels` throws, times out, or publishes nothing

- **Throw**: `Models.refresh` catches it per provider (`PAI/models.js:~213-220`): `if (!signal.aborted) errors.set(provider.id, error)`. It does not reject. The map is returned as `ModelsRefreshResult.errors` (`ModelsRefreshResult { aborted, errors: ReadonlyMap<string, Error> }`, `models.d.ts:45-48`). `ModelRuntime.refresh` forwards it (`model-runtime.js:597-641`). Nothing is stored in the runtime: `getError()` does **not** include refresh errors (it reports models.json errors, composition errors and availability-refresh errors, `:335-346`). The previous in-memory list and stored entry stay, because nothing was published.
- **Timeout/abort**: callers abort via the signal; `Models.refresh` races each provider against the signal (`raceWithAbortSignal`), returns `aborted:true`, and does not record an error for an aborted provider. A hook that ignores the signal keeps running, but its later `publish` returns `false` (signal aborted), so nothing is persisted or swapped.
- **Publishes nothing**: no storage change, in-memory list unchanged; no error.
- **What the user sees**, by caller:
  - Interactive startup refresh (`:866-870`): nothing. Result and errors are discarded.
  - RPC startup: nothing (`.catch(()=>{})`).
  - `/model` selector: `result.errors.size === 1` → `Could not refresh <provider>; showing cached models.`; several → `Could not refresh N model catalogs (a, b); …`; timeout → `Model refresh timed out; showing cached models.`; if `getError()` is set it shows that (`model-selector.js:136-153`).
  - `/model <term>`: warning `Could not refresh <ids>; searching cached models.` or the timeout text (`interactive-mode.js:4492-4499`).
  - After TUI login: warning `<Saved API key for X>, but its model catalog could not be refreshed; using cached models.` or `… refresh timed out …` (`:5276-5285`).
  - `pi auth login`: a `terminal.write` line (but extension providers are not loaded there).
  - `pi update --models`: an `Error:` line and exit code 1; a `ModelsError` with code `"oauth"` becomes a warning (`package-manager-cli.js:553-565`).
- **Measured** (RPC): `CAT_MODE=throw` → no stdout, no stderr output; the log shows the network call, the store still held `net1,net2`. `CAT_MODE=hang` → the hook's `signal` aborted after 15 s (log `03:33:57.620 … 03:34:12.615 hang aborted`), nothing on stdout/stderr.
- **Can extension code observe it?** Only if it calls `ctx.modelRegistry.refresh(...)` itself and reads `.errors` and `.aborted`. The extension's own `refreshModels` can catch its own errors. There is no event or hook for a refresh run by pi. `ModelRegistry.getError()` does not carry them.

---

## Q4. Startup with a stored catalog

**Order at startup** (`main.js:656-662`, `agent-session-services.js:57-111`): `ModelRuntime.create` (built-ins, offline refresh) → extensions load (factory runs; a native `registerProvider(provider)` is queued) → pending registrations flushed (`registerNativeProvider`, `model-runtime.js:642-651`) → **`await modelRuntime.refresh({allowNetwork:false})`** (`:111`) → session created. That awaited call runs the offline phase of every provider that has `refreshModels` and then the availability pass.

So **yes: models restored from `context.stored` by the offline phase are present before any model resolution.** The provider only has to restore them in the offline phase, with `publish({update})` setting what `getModels()` returns.

**Selectable?** A model is selectable when its provider is in `snapshot.configuredProviders`, which comes from `checkAuth` (`model-runtime.js:189-214`; `models.checkAuth` → `apiKey.check`, `PAI/models.js:274-294`), refreshed in that same awaited call. With a stored `api_key` credential and a `check` returning a result, the restored models are in `getAvailableSnapshot()`.

**Session start on a stored model, before any network refresh: yes (measured).**
- `-p --model omlxtest/stored1` ran against the stored model; the scratch provider's `streamSimple` was reached ("streamSimple not used"), with only offline refresh calls in the log.
- With `agent/settings.json` `{"defaultProvider":"omlxtest","defaultModel":"net1"}` (net1 from a previous refresh), `pi -p "hi"` also reached the omlxtest `streamSimple`. Code: `findInitialModel` (`model-resolver.js:404-410`) requires `modelRuntime.getModel(provider,id)` **and** `hasConfiguredAuth(provider)`; the session restore path (`sdk.js:91-97`) the same; `restoreModelFromSession` (`model-resolver.js:440-443`) the same.

**What `getModels()` must return before the first refresh**: it may return `[]` ("dynamic providers return the list as of the last `refreshModels()` (empty before the first)", `models.d.ts:86-91`). The consequences of an empty list, **(measured)** with a store entry absent (`agent2/`):
- `pi -p --model omlxtest/net1` → `Error: Model "omlxtest/net1" not found. Use --list-models to see available models.` `resolveCliModel` reads `modelRuntime.getModels()` (all models, no auth needed, `model-resolver.js:322-325`), so an empty catalog means the provider does not exist for `--model`. A `--model <provider>/<unknown id>` for a provider that **has** at least one model resolves to a copy of the provider's first (or default) model with the unknown id and the warning `Model "x" not found for provider "omlxtest". Using custom model id.` (`:359-376`, `buildFallbackModel`, `:215-225`; **measured**: `--model omlxtest/zzz` printed that warning and reached `streamSimple`).
- With `defaultProvider/defaultModel` pointing at the empty provider and `PI_OFFLINE=1`, pi silently fell back to another provider's model (in my scratch environment a real model answered `Hi! …`). I did not investigate which; the point is that an empty catalog at startup means a silent fall back to whatever else is available, with no refresh attempted first (no network phase runs before model selection in any mode).
- `--list-models omlxtest` → `No models matching "omlxtest"` (**measured**).

`--model` and the settings default are therefore resolved against the **offline** state only; no code path refreshes the catalog before resolving them. The interactive startup refresh happens after the session exists (Q2).

Provisional state: `registerNativeProvider` calls `markProvisionallyConfigured` (`model-runtime.js:657-671`), which marks a provider with a stored credential as configured until the next availability pass replaces the entry (see your report, Q5).

---

## Q5. How extension code triggers a refresh; factory-time availability

- **API**: `ctx.modelRegistry.refresh(options?: ModelsRefreshOptions): Promise<ModelsRefreshResult>` (`PCA/dist/core/model-registry.js:12`, doc: "Reload models.json asynchronously. Await before making synchronous registry reads"). `ModelsRefreshOptions` (`PAI/models.d.ts:37-44`): `allowNetwork?`, `providers?`, `force?`, `signal?`. It runs `ModelRuntime.refresh` (`model-runtime.js:597-641`): reloads `models.json`, then **`rebuildProviders()`** when no `providers` filter is given (`:600-606`: clears and recomposes every provider; a native provider object is reused), or recomposes only the listed ones, then `models.refresh(...)`, updates the snapshot and runs an availability pass. Default `allowNetwork` is `!PI_OFFLINE`.
- **From which contexts**: `modelRegistry` is a getter on the `ExtensionContext` (`types.d.ts:245`; `runner.js:646-649`, calls `assertActive()`), so any event handler, command handler, or tool `execute` that receives a `ctx`. The llama extension is the reference: `llama/index.js:42-55` calls `ctx.modelRegistry.refresh({providers:[id], allowNetwork:true, signal})` from a command and throws if `result.aborted` or `result.errors.get(id)`.
- **Not from the factory.** The factory receives `pi` only; no registry, runtime, or credential access exists on `pi` (your report Q7). `pi.registerProvider(...)` called during load is queued (`loader.js:168-179`, flushed at `agent-session-services.js:72-103`). Calling `pi.registerProvider(provider)` **after** load re-registers the provider immediately (`loader.js:371-380`; `agent-session.js:2948-2951` calls `registerNativeProvider` then `_refreshCurrentModelFromRegistry`), which only triggers `refresh({allowNetwork:false})`: a re-registration swaps the provider object and restores the offline state, it does not fetch.
- **Before `session_start`**: only the offline phases above; no network phase has run in any mode, and the factory has no way to run one. `docs/extensions.md:213`: an async factory completes "before `session_start`, before `resources_discover`, and before provider registrations … are flushed".
- Overlap: `ctx.modelRegistry.refresh` supersedes (aborts) any in-flight refresh of the same provider (generation check, Q1). It is **not** coalesced with the interactive coordinator; a user opening `/model` during the extension's refresh will start another.

---

## Q6. What a complete `Provider` must supply for the chat path

**Provider members**: `id`, `name`, `auth`, `getModels()`, `stream`, `streamSimple` are required; `baseUrl`, `headers`, `getAllModels`, `refreshModels`, `refreshModelsAuth`, `filterModels`, `filterAllModels` optional (`PAI/models.d.ts:72-134`). The model returned by `getModels()` must be a chat `Model` (`type` omitted or `"chat"`; `ModelRuntime.stream/streamSimple` call `assertChatModel(model)`, `model-runtime.js:495-497, 525-527`).

**Model object fields** (`PAI/types.d.ts:647-683`):
- Required (`BaseModel`): `id`, `name`, `api`, `provider`, `baseUrl`, `input` (array of `"text"|"image"`), `cost` `{input,output,cacheRead,cacheWrite}`.
- Required (chat `Model`): `reasoning: boolean`, `contextWindow`, `maxTokens`.
- Optional: `type`, `headers`, `inputLimits`, `thinkingLevelMap` (maps pi levels to provider values, `null` = unsupported), `promptCache`, `samplingParams`, `samplingParamsByThinkingLevel`, `compat` (typed per `api`: for `"openai-completions"` it is `OpenAICompletionsCompat`; "if not set, auto-detected from baseUrl").
- Nothing validates these at registration for a native provider (only the legacy composer validates, `provider-composer.js:83-116`). The scratch provider's minimal model object (`api:"openai-completions"`, `baseUrl`, `reasoning:false`, `input:["text"]`, `cost`, `contextWindow`, `maxTokens`, no `compat`) was accepted, listed by `--list-models`, and selected.
- Llama's own model (`llama/provider.js:99-128`): `api:"openai-completions"`, `baseUrl: <server>/v1`, `thinkingLevelMap` only for reasoning models, and a `compat` with `supportsStore:false, supportsDeveloperRole:false, supportsReasoningEffort:false, supportsUsageInStreaming:true, supportsStrictMode:false, maxTokensField:"max_tokens"` and `thinkingFormat:"qwen-chat-template"` when reasoning.
- The request-time `auth.baseUrl` from `resolve()` overrides `model.baseUrl` (`model-runtime.js:472`).

**Is a provider's own `streamSimple` honoured?** Yes. The session's stream function is `modelRuntime.streamSimple(model, context, requestOptions)` (`sdk.js:271`). `ModelRuntime.streamSimple` resolves auth, then calls `prepared.provider.streamSimple(prepared.model, transcript, prepared.options)` (`model-runtime.js:525-529`), where `options` carries the resolved `apiKey`, merged `headers`, `env`, and the original request options (`:482-490`). **Measured:** the scratch provider's `streamSimple` was reached for the selected model (the `... not used` error). A wrapper must pass those options through (see next).

**`before_provider_request`**: it is fed through `onPayload`. The session sets `onPayload: transformProviderPayload` (→ `runner.emitBeforeProviderRequest`), plus `onResponse` and `onProviderStreamEvent` on the agent (`sdk.js:224-257, 276-278`); they arrive in `options` of the provider's `streamSimple`. The OpenAI-completions API calls `options.onPayload(params, model)` and `options.onResponse(...)` (`PAI/api/openai-completions.js:189, 203`). So the event fires for a native provider's requests **if the provider's stream implementation reaches that API and forwards `options`** (delegating to pi-ai's `stream`/`streamSimple` or `openAICompletionsApi()` does; a hand-written wrapper that drops `options.onPayload` would stop the event). The docs state the contract: a custom stream "must invoke `options.onPayload` before sending … and `options.onResponse` after" (`PCA/docs/custom-provider.md`, "Implement custom streaming"). Not run: I did not fire a real `before_provider_request` handler against a scratch provider.

**`unregisterProvider` on a native provider and its stored catalog** (`model-runtime.js:691-697`): deletes the legacy and native entries and recomposes the provider; with no built-in or models.json base, `models.deleteProvider(id)` removes it (`:149-153`) and refresh is superseded. The models disappear from `getModels()`, `--list-models` and `/model`. **It does not touch `models-store.json`**: the only store deletions are `publish({persist:null})` (`PAI/models.js:150`) and nothing in `PCA/dist/core` calls `modelsStore.delete`/`write` (`grep`). So the persisted entry stays, and a later re-registration under the same id restores it in the next offline phase. `/logout` likewise only deletes the credential (`PAI/models.js:413-424`); the stored catalog stays but its models become unavailable once `check` returns `undefined`. In the interactive session, `unregisterProvider` and `registerProvider` also re-point the current model (`agent-session.js:2827-2837`, `_refreshCurrentModelFromRegistry`: if the model object is no longer found by id the session keeps its old object; if found, it swaps in the new one).

**`refreshModelsAuth`**: `"credential"` (default): network phase only runs when `apiKey.resolve` returns a result, and the hook gets `{type:"api_key", key, env}` (your report, Q2). `"configured"`: runs when `check`/auth says configured and passes **no** credential (`PAI/models.js:237-243`).

---

## Q7. `--list-models omlx` and `/model` with a stored catalog and no network

- **`--list-models`** (**measured**): `listModels` prints `modelRuntime.getAvailable()` (`list-models.js:24-30`), filtered by a fuzzy pattern on `provider id`, sorted by provider then id, with columns `provider model context max-out thinking images` from `contextWindow`, `maxTokens`, `reasoning`, `input` (`:41-60`). With the stored `stored1` and a stored credential (offline):

  ```
  provider  model    context  max-out  thinking  images
  omlxtest  stored1  8K       1K       no        no
  ```
  No network is attempted (Q2). It needs `check` to return a result (a configured provider) or the models are not listed: with `agent2/` (credential but empty store) it printed `No models matching "omlxtest"`. With no available models at all it prints the "No models available. Use /login …" guidance (`:30-33`).
- **`/model`** (code only, not driven): `ModelSelectorComponent` draws `modelRuntime.getAvailableSnapshot()` immediately (`model-selector.js:95-103, 106-125`), i.e. the same stored models, then runs the 15 s refresh and redraws. With no network, the refresh finishes with an error entry for the provider and the selector shows `Could not refresh <provider>; showing cached models.` while the stored models stay listed (`:136-146`). If the hook publishes nothing (e.g. returns early because the server is unreachable without throwing), no message appears and the list is unchanged.
- `/model <term>` matches the cached snapshot first; a hit does not refresh (`interactive-mode.js:4476-4482`).

---

## Gaps

- I did not drive the interactive TUI. The `/model`, `/scoped-models`, post-login and startup behaviours in Q2, Q3 and Q7 are read from `interactive-mode.js` and `model-selector.js`; the rows marked measured are print, `--list-models` and RPC runs.
- `before_provider_request` for a native provider was derived from `sdk.js` and the OpenAI-completions API, not exercised with a handler.
- `pi update --models` skipping extension providers is derived from `package-manager-cli.js:543-551`; not run.
- The "fall back silently" observation (Q4) used my environment's other providers; I did not trace which model answered, and I made one real model request that way.
- A `refreshModels` that ignores the abort signal keeps running after a timeout; I did not measure its side effects beyond the publish guard.
