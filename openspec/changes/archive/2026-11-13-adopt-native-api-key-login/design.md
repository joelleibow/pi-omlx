# Design

## Context

The extension registers `omlx` through the legacy `ProviderConfig` overload with an OAuth login, runs a ten-minute poll with a 2 s→60 s backoff, keeps its own catalog cache under pi's agent directory, and shows up to one catalog notice per session (`research-eleanor.md` addendum `0932ab2f`). This design replaces that with pi's own lifecycle. The motivation is `proposal.md`; what follows assumes the pi facts `research-chidi.md` measured against 1.5.2 and does not restate either.

Three pi constraints shape every decision below.

- A native `Provider` is used **untouched** unless `models.json` or a legacy registration overlays it, so its `auth`, `getModels`, `stream` and `refreshModels` are exactly what the extension writes (`research-chidi.md` Q1, Q6).
- `refreshModels` runs twice per network refresh: an offline restore with `allowNetwork: false`, awaited before the session exists, then a network phase whose `context.credential` is a synthesised `{type: "api_key", key, env}` — the output of `resolve`, not the stored entry (`models.js:180-216`, `:244-258`; `research-chidi.md` addendum `ebf305b8` Q1, measured).
- The factory receives only `pi`. It has no credential, no registry and no event context; the hooks and the handlers are the only places either is reachable, and a captured `ctx` dies on reload (`research-chidi.md` Q7; `michael-orientation.md` trap vi).

Constraints that hold whatever this design decides: the credential order in `docs/adr/0001-one-credential-decides-the-omlx-connection.md`; `PROVIDER_KEY` in `src/auth-storage.ts` (`openspec/specs/provider-access/spec.md`); the isolation contract in `AGENTS.md`; no production export or branch that exists only for a test; no suppressions.

## Goals / Non-Goals

**Goals:**

- One complete native `Provider` for `omlx`, registered once, with `auth.apiKey.{login, check, resolve}`, `getModels`, `stream`, `streamSimple` and `refreshModels`, and no OAuth handler.
- One credential resolution, used by `check`, by `resolve` and by the login's probe.
- The catalog fetched only by pi's `refreshModels` and persisted only in pi's model store.
- The two startup warnings ruling C1 settles, at most one per start.
- The login probe ruling C2 settles, with the same registrable-model rule the refresh applies.
- A fake pi that drives a `Provider`, so every test asserts the shape the code produces.

**Non-Goals:**

- `pi auth login` and `pi auth check` support. They never load extensions and cannot see `omlx` (`research-chidi.md` Q3, measured).
- Env-only keyless, which the carried ruling keeps unsupported.
- Any migration or rewrite of a stored OAuth-shaped entry. Ruling B takes the clean break, and the extension never writes `auth.json`.
- The chezmoi template, which is Joel's, in his dotfiles.
- Changing the stream wrapper's timeout, retry or event normalization, the thinking controls' behaviour, or the metadata overlay's fields.
- Deleting the old cache file or any other file the user owns.
- Documentation. `README.md`, `docs/CONFIGURATION.md`, `ARCHITECTURE.md`, `AGENTS.md` and ADR 0001's successor are the docs pass's work.

## Decisions

### D1. One complete provider, built in `src/provider.ts`, registered once at the composition root

`src/provider.ts` exports `createOmlxProvider()` returning a pi-ai `Provider` for `PROVIDER_KEY`: `auth.apiKey` with `name`, `login`, `check` and `resolve`, no `oauth`, plus `getModels`, `stream`, `streamSimple` and `refreshModels`. `index.ts` calls `pi.registerProvider(provider)` once in the factory and keeps the returned object in a factory-local binding for its handlers. `toProviderConfig` is deleted. The factory takes no arguments: the dependency list came out empty once the provider's own state moved into its closure, a call Michael accepted at the implementation gate (round 1).

**The two stream entry points.** `streamSimple` is today's wrapper: the first-delta timeout, retry and event normalization in `src/stream.ts`, delegating to pi-ai's OpenAI-completions `streamSimple`. `stream` is the contract's raw counterpart and delegates straight to `@earendil-works/pi-ai/compat`'s `stream`, which reaches the OpenAI-completions API itself and never enters `src/stream.ts` — so only `streamSimple` carries the wrapper's timeout and retry, and `stream` carries neither. That is harmless: pi's chat path goes through `streamSimple` (`sdk.js:271`), and `stream` exists because a complete `Provider` must supply it. Both pass `options` through on their own route, because `before_provider_request` arrives on `options.onPayload` and an implementation that dropped it would stop the event (`research-chidi.md` Q6; `src/stream.ts:107-111`). D14 drives both entry points against the same fake server.

**Reasoning.** Only the complete `Provider` carries an API-key login with its own prompts (`research-chidi.md` Q1; `michael-orientation.md` trap i). Registered at factory time, the provider is available to startup model selection and `--list-models`, because pi flushes pending registrations before startup continues (Q6).

**Alternative beaten.** Keep the legacy `registerProvider(name, config)`. Its `apiKey` field can produce only pi's generic secret-only prompt with a static base URL (`provider-composer.js:244-311`, cited in `research-chidi.md` Q1), so the URL step this login needs cannot exist on that form.

### D2. The provider holds the model list, and `publish({update})` is its only writer

`createOmlxProvider` closes over `let models: Model[] = []`. `getModels()` returns it. `refreshModels` replaces the array inside `update()`, never outside a publish.

**Reasoning.** `getModels()` is synchronous and must not throw, and `update` runs synchronously after the optional persistence write, which is the contract's own commit point (`models.d.ts:86-91`; `models.js:143-166`). One list then serves startup selection, `/model`, `--list-models`, and D10's thinking hook.

**Alternative beaten.** Have `getModels()` read pi's store on each call. That duplicates the restore phase pi already ran before the session exists, and would make a synchronous call do I/O.

### D3. `resolve` is the one credential resolution, and it carries the base URL in `env`

`src/config.ts` keeps `normalizeBaseUrl` and `DEFAULT_OMLX_BASE_URL` and gains `resolveOmlx(credential, envLookup)` returning `{baseUrl, apiKey, source}` or `undefined`. `envLookup` is the awaited `AuthContext.env` pi hands the hook, which returns a promise (llama awaits it: `research-chidi.md` Q2):

- with a credential: `baseUrl` is `normalizeBaseUrl(credential.env?.OMLX_BASE_URL)` or the default, `apiKey` is `credential.key || KEYLESS_PLACEHOLDER`, `source` is `"stored"`, and the environment is not read for either half;
- without one: `baseUrl` is `normalizeBaseUrl(await envLookup("OMLX_BASE_URL"))` or the default, `apiKey` is `await envLookup("OMLX_API_KEY")`, and with no key the whole result is `undefined`.

`resolve` returns `{auth: {apiKey, baseUrl}, env: {OMLX_BASE_URL: baseUrl}, source}`, or `undefined` exactly when `resolveOmlx` does. `check` returns `{type: "api_key", source}` or `undefined` and does nothing else.

**A stored `oauth` entry needs no code here.** `resolveProviderAuth` returns `undefined` for an oauth record when the provider declares no OAuth handler, and `checkProviderAuth` reports nothing for it (`resolve.js:26-33`; `models.js:275-277`, both cited in `research-chidi.md` Q5). An OAuth-shaped entry therefore never reaches `check` or `resolve`, and the extension neither rewrites it nor reads it as a login. That is ruling B met by leaving it alone.

**Reasoning.** The network phase of `refreshModels` receives only `{key, env}`, so the base URL has to ride in `env` or the hook must resolve the credential a second time, which the spec forbids (`models.js:251-258`; `openspec/changes/adopt-native-api-key-login/specs/credential-resolution/spec.md`, "The Catalog And Chat Share The One Resolution"). `auth.baseUrl` additionally overrides a model's own `baseUrl` per request (`model-runtime.js:472`). `check` must stay side-effect free by contract (`auth/types.d.ts:179-183`), which is why it is nothing more than `resolveOmlx`'s answer.

**Alternative beaten.** llama's line, `credential?.key ?? ctx.env("LLAMA_API_KEY") ?? "local"` (`llama/provider.js:166`, cited in `research-chidi.md` Q4). It lets `OMLX_API_KEY` reach a saved keyless login, which the saved-login-wins ruling forbids, and `??` treats a stored `key: ""` as a value, which D4 covers.

**Source.** `owner-rulings.md` (carried rulings); `michael-orientation.md` §2; `research-chidi.md` Q2, Q4; `council.md`, Accepted & Rejected Feedback.

### D4. The placeholder is one constant, `"local"`, exported by `src/config.ts`

`export const KEYLESS_PLACEHOLDER = "local";`, applied in `resolveOmlx` and nowhere else: the login's probe fetches with `resolveOmlx`'s answer, and the refresh receives the key already resolved inside the credential pi hands it. No second site re-applies it (implementation gate round 1, accepted).

**Reasoning.** A keyless login must still send a bearer, because the client throws on a falsy key (`openai-completions.js:35-40`, cited in `research-chidi.md` Q4). pi's own keyless provider sends exactly this sentinel (`llama/provider.js:166`), so a keyless `omlx` request is wire-identical to a keyless llama one. oMLX with `skip_api_key_verification` on a loopback bind returns before it reads the header, so the value is ignored from the server's side (`research-chidi.md` addendum `8e4d016f`; ruling C).

**Alternative beaten.** `"omlx"` or another novel string: a second sentinel to explain, with no behaviour that differs. `""` or `undefined`: the client throws.

### D5. `login` lives in `src/login.ts`, returns the credential, and never touches pi's store

`src/oauth-login.ts` becomes `src/login.ts`, exporting `loginOmlx`. It prompts `text` for the base URL with the environment's URL or the default as placeholder, then `secret` for a key that may be empty, normalizes the URL to `/v1`, rejects a blank URL before any request, and returns `{type: "api_key", key?: string, env: {OMLX_BASE_URL}}` with the key omitted when none was entered. `getOmlxApiKey` and `refreshOmlxToken` are deleted with the OAuth shape.

**Reasoning.** pi persists the returned credential itself (`models.js:365-412`), so the module has nothing OAuth about it left, and a name that asserts otherwise is a lie a reader pays for. The omitted key is what makes the stored entry keyless: `JSON.stringify` drops `undefined`, and pi accepts an absent key (`research-chidi.md` Q4, measured shape).

**Alternative beaten.** Keep the file name and the callbacks, which would leave an `oauth-login` module implementing an API-key login and two exports no code calls.

### D6. The login probes with the two rules the rest of the system already uses

After building the credential, `loginOmlx` resolves it with `resolveOmlx` — the function `resolve` uses — and calls `fetchModels(url, key, {signal: interaction.signal, ...})`. Because a credential is present, the login calls the `resolveOmlx` overload whose signature returns a resolution — `resolveOmlx(credential: {key?, env?}, env): Promise<OmlxResolution>` — never the one that returns `OmlxResolution | undefined` for `credential: undefined`: `resolveOmlx` cannot fail for a present credential, so the login carries no guard, and no test, for a state the resolution cannot produce (implementation gate round 1, accepted). It runs the response through `registrableModels(...)` from `src/catalog.ts` — the function the network phase uses, over the same `OmlxModel[]` the network phase gets, before any mapping — and then drops the result. A throw from the fetch, or an empty registrable list, becomes an error whose message names the cause and travels out of `login`; nothing is published, stored or registered.

**Reasoning.** Ruling C2. The design point that matters is why the probe exists at all: pi never shows the cause of a failed refresh. The post-login warning and `/model`'s message are fixed strings (`interactive-mode.js:5277-5279`; `model-selector.js:142-143`), and the login dialog is the only surface that carries a thrown error (`interactive-mode.js:5339-5346`, all three cited in the C2 ruling). Sharing `resolveOmlx` and `registrableModels` is what keeps the probe and the refresh from disagreeing about what "keyless" and "registrable" mean — Michael's condition, and the reason a probe is not a second resolution path: it runs on the credential the login is about to return, before pi stores anything.

**Alternative beaten.** No probe, which both advisors picked in pass 3: it would store a mistyped URL or a rejected key and leave the user with "could not be refreshed; using cached models" and nothing cached.

### D7. `refreshModels` restores offline and throws on the network phase

`src/catalog.ts` exports `refreshOmlxCatalog(context, commit)`, where `commit` replaces the provider's list. `src/provider.ts` wires it as `refreshModels: (context) => refreshOmlxCatalog(context, (next) => { models = next })`:

1. **Offline phase.** `publish({update: () => commit(context.stored?.models ?? [])})`, then return. Nothing is fetched and nothing throws.
2. **Network phase.** pi calls this phase only with `resolveOmlx`'s own output — `{type: "api_key", key, env: {OMLX_BASE_URL}}` — so the hook reads the URL from `credential.env.OMLX_BASE_URL`, calls `fetchModels` with `context.signal` and the overlay, runs `registrableModels` over the returned `OmlxModel[]`, and maps only the survivors through `toProviderModel`: filter, then map. If nothing survives the filter, throw an error naming the endpoint and the reason. Otherwise `publish({persist: {models: mapped, checkedAt: Date.now()}, update: () => commit(mapped)})`.

**A broken credential is an error, not a branch.** A `context.credential` that is absent, is not `api_key`, carries no key, or carries no `env.OMLX_BASE_URL` cannot come from `resolveOmlx`, so it means the contract between the extension and pi has broken. The hook throws an error naming the missing piece and pi records it, instead of returning and leaving the user with no models and no cause. The key arrives already resolved — the placeholder is applied once, in `resolveOmlx` (D4) — so the refresh neither re-applies it nor defaults the key itself (implementation gate round 1, accepted: the earlier draft returned silently in two of these branches and used `??` for the key).

**Reasoning.** A throw lands in `ModelsRefreshResult.errors` and reaches `/model` and the post-login message; a hook that returns early shows the user nothing anywhere (`research-chidi.md` addendum `ebf305b8` Q3). Publishing only after the registrable check keeps pi's store holding its previous catalog on failure, which the spec requires. The offline phase must not throw, because it runs before the session exists and is awaited (`agent-session-services.js:111`).

Nothing here waits for the network before a session exists: pi awaits only the offline phase and runs the network phase once the session is up (`research-chidi.md` addendum `ebf305b8` Q2). And the extension holds no abort or supersession state of its own: it passes `context.signal` to `fetchModels`, and pi rejects a publish from an aborted or superseded refresh before either write (`models.js:143-166`).

**The published shape.** `toProviderModel` changes to produce a complete pi `Model` and moves to `src/catalog.ts`, beside this hook, which is its only caller (D12): today's fields plus `provider: PROVIDER_KEY`, `api: "openai-completions"` and `baseUrl`, the last read from the URL the refresh fetched from. All three are required by pi-ai's `BaseModel` (`types.d.ts:647-658`), and pi filters availability and routes a request by `model.provider` (`model-runtime.js:186`, `:459-469`), so a model without them would never be listed or reached. The model's own `baseUrl` is the one this refresh used; `resolve`'s `auth.baseUrl` still overrides it per request when a stored URL has moved (D3).

**Alternative beaten.** pi-ai's `createProvider`, whose `refreshModels` restores, fetches and publishes for you (`models.js:549-626`, cited in `research-chidi.md` Q6). Its documented behaviour does not include throwing on a response with no registrable model, and it has no overlay step; adopting it would mean re-deriving its semantics against ours. llama, pi's own reference implementation, hand-writes the hook for the same reason.

### D8. One startup notice: a pure selector in `src/notice.ts`, one `notify` in `session_start`

`src/notice.ts` becomes one function, `startupNotice({storedType, configured, modelCount}): string | undefined`, returning the OAuth remedy when `storedType === "oauth"`, otherwise the landed-model warning when `configured && modelCount === 0`, otherwise `undefined`. `index.ts`'s `session_start` handler computes the three inputs and calls `ctx.ui.notify(notice, "warning")` once when one comes back:

- `storedType`: `readOmlxCredential()?.type` (D9);
- `configured`: `(await ctx.modelRegistry.getProviderAuth(PROVIDER_KEY)) !== undefined`, taken from the event's `ctx` at that moment and never captured, with a rejection counted as unconfigured. The handler is async, which pi allows: handlers are awaited (`runner.js:827`);
- `modelCount`: `provider.getModels().length`.

**Reasoning.** One return value from one function makes "at most one warning per start" structural rather than a promise, and the ordered `else` is exactly Michael's second condition. The predicate is the one that runs. `hasConfiguredAuth` takes a `Model` and reads `model.provider`, so a provider id passed to it is `undefined` and reports false (`model-registry.js:31-33`, measured in `scratch-michael/has-configured.mjs`). Between the two forms Michael offered, this design takes `getProviderAuth`, which runs the same resolution a request runs (`model-registry.js:102-104`): "configured" here means exactly what a request would find, on either side of the credential order, and the notice cannot drift from what `resolve` decided. `getProviderAuthStatus` would answer the same question from a snapshot (`model-runtime.js:448-458`); the design prefers the resolution because the warning's claim is about requests. `getProviderAuth` can reject with a `ModelsError`, so the handler counts a rejection as unconfigured — a notice must never surface an extension error. The model count is the list pi chose the starting model from, because the offline restore is awaited before the session exists (`research-chidi.md` addendum `ebf305b8` Q4). The handler calls no `setModel` and re-runs none of pi's selection: it names `/model`, and the choice stays the user's. In print and json modes `notify` is a no-op (`runner.js:132-136`; `print-mode.js:60`, from the C1 ruling), so nothing reaches stderr — tested rather than assumed.

**Alternative beaten.** Read the stale entry inside the offline `refreshModels` through `context.credential.type`, then hold it for the session event. It depends on a phase order nobody measured for a provider `check` reports unconfigured (`models.d.ts:163-168` says such providers are skipped; `models.js:180-216` traces otherwise), and it needs state shared between the hook and the event, which the live `ctx` makes unnecessary (`council.md`, Set aside).

### D9. `src/auth-storage.ts` stays, read-only, as the one reader of the stored type

The module keeps `PROVIDER_KEY` and `readOmlxCredential` unchanged, and `readOmlxCredential` loses every consumer except `session_start`. No `try`/`catch` is needed around it: it wraps pi's `readStoredCredential`, which already returns `undefined` on any failure, a JSON parse error included (`auth-storage.js:425-433`, cited in `research-chidi.md` Q2), so a malformed file reads as no stored type and cannot fail a session start.

**Reasoning.** It is a read of pi's file, which ADR 0001 forbids nothing about — the extension never *writes* it — and it keeps `PROVIDER_KEY` at the module `openspec/specs/provider-access/spec.md` names, reusing code `test/auth-storage.test.ts` already covers (`council.md`, Michael's Rulings).

**Alternative beaten.** Move `PROVIDER_KEY` into `src/config.ts` and read the entry somewhere else. That needs a `provider-access` spec delta and a new home for a value with one, for no gain.

### D10. Thinking controls read `model.reasoning` from the provider's own list

The `before_provider_request` handler finds the active model in `provider.getModels()` by id and passes `model.reasoning` into `applyOmlxThinkingControls` as the thinking default. The controls, the payload rewrite and `src/thinking.ts` are otherwise unchanged, and `toProviderModel` keeps mapping `thinkingDefault === true` onto `reasoning`.

**Reasoning.** The store holds plain pi `Model` objects, so an OMLX-only `thinkingDefault` cannot survive the offline restore, and `pi -p` with a stored model runs only that restore (`research-eleanor.md` addendum `0932ab2f`; `research-chidi.md` addendum `ebf305b8` Q4, measured). Reading the list the provider serves keeps one list and one lookup.

**Alternative beaten.** Keep the network-only `OmlxModel[]` the index handler reads today. After an offline restore it is empty, and every offline-restored session loses its thinking controls (`council.md`, Accepted & Rejected Feedback, C4).

### D11. The trace moves to `resolve`, and reports a source change rather than a request

`resolve` emits the existing `provider_registered` line through `src/debug.ts` — same name, `[pi-omlx]` prefix, `source: "stored" | "environment"`, no key — under the existing `PI_OMLX_DEBUG` predicate. The guard that keeps it to a source change rather than one line per request lives inside `createOmlxProvider`'s closure, per provider instance: a fresh load has emitted nothing, so the first resolve after it reports again, and no reset export exists for a test to reach for.

**Reasoning.** The factory has no credential, so the line has to move to a hook pi calls, and `check` must stay side-effect free (D3). `resolve` runs per request, so an unguarded line would flood an interactive session that is being debugged. Instance state, not module state, is what keeps the two trace scenarios testable in one file without a seam Joel's ruling forbids and without a test clearing anything the extension keeps (`openspec/specs/test-isolation/spec.md`).

**Alternative beaten.** Emit from `check`, which runs on availability passes rather than per request — it would put I/O inside the one hook whose contract says "side-effect-free" (`auth/types.d.ts:179-183`).

### D12. What goes, file by file

- `index.ts`: `startPolling`, `POLL_INTERVAL_MS`, `BACKOFF_BASE_MS`, `refreshProvider`, `fetchAndRegister`, `registerModels`, `registerCachedOrSetupModels`, `registerLoginOnlyProvider`, the unregister-then-register dance, the `State` fields that only served them (`catalog`, `registered`, `stopped`, `lastError`, `startedLoginOnly`, the held-notice pair), and the `session_shutdown` handler whose only job was to stop the poll. The registration, `session_start` and `before_provider_request` handlers stay; `model_select` stays as it is.
- `src/catalog.ts`: drops the cache read, the cache write and the cache-path helper; gains `registrableModels`, used by D6 and D7, and `toProviderModel` — moved from `src/provider.ts` with `BASE_COMPAT`, `requirePositive` and the thinking-format import — beside `refreshOmlxCatalog`, its only consumer. The HTTP, parsing and overlay code stays.
- `src/provider.ts`: drops `toProviderConfig` and its tests; loses `toProviderModel` to `src/catalog.ts`, with its tests moving to `test/catalog.test.ts` unchanged, because the behaviour they pin — reasoning only for `thinking_default` true, the display-name mapping, the complete `Model` shape — does not change; and gains `createOmlxProvider()` with its `stream`, `streamSimple` and `refreshModels` wiring.
- `src/oauth-login.ts` → `src/login.ts` (D5).
- `src/notice.ts` → the one selector (D8).
- `src/config.ts`: `resolveOmlx` replaces `resolveOmlxCredential`; the `shortcut:` mirror comment goes, because the order now runs inside pi's own hook rather than beside it.
- Unchanged: `src/auth-storage.ts` (D9), `src/debug.ts` (D11 changes only the call site), `src/stream.ts`, `src/thinking.ts`.

**Why the model mapper moves.** As the first draft placed it, `src/catalog.ts` imported `toProviderModel` from `src/provider.ts` while `src/provider.ts` imported `refreshOmlxCatalog` from `src/catalog.ts` — a cycle that ran only because both uses are call-time, and that dragged `src/stream.ts` into `src/catalog.ts`'s import graph through the test worker's setup, which forced `test/stream.test.ts` to `vi.resetModules()` and import the wrapper dynamically. With the mapper and its three helpers beside their only consumer, `src/catalog.ts` imports nothing from `src/provider.ts`, and `test/stream.test.ts` returns to a static import (implementation gate round 1, accepted).

**Reasoning.** Each removal has a consumer that no longer exists: the poll was the extension's own trigger, the cache was the extension's own store, the login-only registration existed because a legacy provider with no models was indistinguishable from an unconfigured one, and `lastError` was read only by the OAuth callback (`research-eleanor.md` addendum `5477bf8a`). The poll's removal landed with the registration flip (task 4.4) rather than with 4.5, a call Michael accepted at the implementation gate (round 1).

**Alternative beaten.** Assemble the `Provider` inline in `index.ts` and keep the modules as they are. The composition root would then hold the login's prompts, the refresh's phases and the notice policy — policy in the layer that is supposed to only wire.

### D13. Guards, and what makes each fire

- **Blank base URL** → refused by `loginOmlx` before any request, when the URL is empty after trimming. Nothing is stored.
- **Probe failure** → `loginOmlx` throws when the fetch throws, when the interaction's signal aborts, or when the registrable list is empty. pi stores nothing, and the dialog shows the message.
- **Nothing to resolve** → `resolve` returns `undefined`, as D3 states, when neither a credential nor an `OMLX_API_KEY` supplies a key. A request in that state fails in pi's own `prepareRequest` with "Provider is not configured: omlx", which calls `resolve` directly rather than `check` (`model-runtime.js:459-469`); `check`'s job is what keeps the provider's models out of pi's available set in the first place.
- **A refresh credential that is absent, is not `api_key`, has no key, or has no `env.OMLX_BASE_URL`** → the network phase throws an error naming the missing piece, so pi records it. `resolveOmlx` produces none of those states, so the throw marks a broken contract with pi rather than a case to handle (`models.js:244-258`).
- **A response with nothing registrable** → the network phase throws before `publish`, so pi's store and the provider's list keep what they held.
- **A second startup warning** → impossible by construction: `startupNotice` returns one value, and the OAuth remedy is the first branch.
- **A non-interactive run** → pi's `notify` is a no-op in print and json modes, and the tests assert nothing is written.

**Reasoning.** Each guard sits where the state it refuses is visible, and none of them is a second resolution: the blank-URL and probe guards read the credential `login` is about to return, and the refresh guards read what `resolve` already produced.

**Alternative beaten.** Guard the login by re-resolving the credential inside the probe's failure path, which would duplicate the resolution in the one place the ADR forbids it.

### D14. Tests drive a `Provider`

The fake pi's `registerProvider` records the object it is handed. The tests then drive: `provider.auth.apiKey.login({prompt, notify, signal})` with a prompt stub that answers URL then key; `check` and `resolve` with `{ctx: {env, fileExists}, credential, signal}`; `refreshModels({credential, stored, publish, allowNetwork, signal})` with a publish that records `persist` and runs `update`; `getModels()`; `stream` and `streamSimple` against the fake server the stream wrapper's tests already use; and the handlers with a `ctx` whose `modelRegistry.getProviderAuth` answers what the test sets and whose `ui.notify` records its calls. Fixtures keep reaching pi's state through `PI_CODING_AGENT_DIR` under `inject("isolationRoot")`.

**Reasoning.** Today's fake fixes the string overload and drives `oauth.login` (`michael-orientation.md` trap viii); a fake that still did would assert a shape the production code no longer produces. The isolation contract needs no change: no new `CALLER_ENV_KEYS` entry and no new path outside the repository.

**Alternative beaten.** Keep the string overload in the fake alongside the new one for the existing tests. It preserves tests for a form this change deletes, and the fake would be forgiving in exactly the place the change is riskiest.

`test/oauth-login.test.ts` becomes `test/login.test.ts`. Its "loginOmlx rejects when the catalog fetch fails, without storing credentials" test survives as the probe's rejection test — the change to that test is deliberate, which is what ruling C2 requires.

## Risks / Trade-offs

- **A login cannot be saved while the server is down.** → The login dialog names the cause, which is the point of the probe (D6), and a later `/login` overwrites the entry. If oMLX is simply stopped, this is the behaviour the user asked for.
- **Each login fetches the catalog twice** — the probe, then pi's refresh. → Accepted: one request each, and the probe's result is discarded so nothing is published twice. A slow server makes the dialog wait once longer.
- **A keyless login against a server that only sets `allow_unauthenticated_inference`** (not `skip_api_key_verification`) fails: `/v1/models/status` still requires the main key, and the `/v1/models` fallback carries no limits, so nothing is registrable. → The failure names the count, and the docs (docs pass) state that a keyless login expects `skip_api_key_verification` on a loopback bind (`research-chidi.md` addendum `8e4d016f`).
- **A stored key beginning with `$` or `!` is reinterpreted when pi reads it**, so a literal key can arrive at the server differently than it was typed. → Recorded here and stated in the docs; not fixable in code without taking over pi's read (ADR 0001).
- **The store is keyed by provider id, not by URL.** Changing `OMLX_BASE_URL` while a stored catalog exists restores the old server's models until the next refresh replaces them. → Named as a limit; the next of pi's triggers replaces them, and the empty-store case is the one C1 now warns about.
- **The old `cache/omlx-models.json` stays on disk, unread.** → No code deletes a file the user owns; the docs pass names it. A rollback is therefore also a clean one.
- **A user `models.json` entry for `omlx` composes above the native provider** and routes through pi's composer, which inherits this provider's `login`, `check` and `resolve` (`research-chidi.md` Q6). → Documented limit: the native object is used untouched only when no overlay exists.
- **The OAuth-shaped entry still displays as configured in `/login`'s provider list**, because the selector reads the stored-provider snapshot rather than the auth check (`research-chidi.md` Q5, derived from code). → Cosmetic, and the first start's warning names the remedy.
- **Wording drift.** The two messages live in one module as constants, so the docs pass aligns the documentation to them rather than inventing a third phrasing.

## Migration Plan

1. **Upgrade.** The first start after this change warns once that the session landed on another provider's model, or — when the stored entry is still OAuth-shaped, as Joel's is and as his chezmoi template seeds — shows the `/logout` then `/login` remedy. The remedy is the whole migration: pi overwrites the entry on the next login.
2. **Joel's dotfiles.** The chezmoi template seeds the `api_key` shape (`{type: "api_key", key: <1Password value>, env: {OMLX_BASE_URL: ...}}` instead of `{type: "oauth", access, refresh, expires, baseUrl}`). That change is his, and nothing in this repository can make it.
3. **No data migration in the extension.** `models-store.json` is pi's file, written by pi on the first successful refresh under `$PI_CODING_AGENT_DIR`; the old cache file is left where it is.
4. **Rollback.** Revert the diff. The old code reads `cache/omlx-models.json` again — it was never deleted — and ignores pi's store entry, so the revert returns the previous lifecycle without a migration step. The credential is the limit: the old resolver reads `stored.baseUrl`, not `env.OMLX_BASE_URL`, and requires a key on an `api_key` record (`src/config.ts:42-56` at HEAD), so a reverted build on a new-shape entry fetches the default URL for a keyed login and stays login-only for a keyless one. The rollback's last step is `/logout` then `/login`, which restores the old OAuth shape.

## Open Questions

- **Whether `/reload` re-runs `session_start` after pi's offline restore.** Unmeasured. If it does not, a reload shows no warning until the next session, which the message's own pointer at `/model` covers.
- **Whether `getProviderAuth` on a first `session_start` of a fresh process always sees the credential state of the final availability pass** (`research-chidi.md` Q7 marks exactly this unverified). The tests drive the fake, so it is settled only by a live session: at worst the first second of a session shows an extra or missing warning, and no request is affected.
