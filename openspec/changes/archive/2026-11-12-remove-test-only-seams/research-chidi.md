# Chidi research: remove-test-only-seams

Versions: pi `@earendil-works/pi-coding-agent` 1.5.2 (installed copy `PI` = `/Users/joelleibow/.local/share/fnm/node-versions/v26.8.1/installation/lib/node_modules/@earendil-works/pi-coding-agent`; repo `node_modules/@earendil-works/pi-coding-agent` is the same version per its package.json), vitest 5.1.0 (`node_modules/vitest/package.json`).
Method tags: [SRC] read installed source, [DOC] read docs, [EXP] ran an experiment.

## 1. `readStoredCredential` and credential routes

- Signature [SRC] `PI/dist/core/auth-storage.js:425-433`, `auth-storage.d.ts:70`:
  `readStoredCredential(providerId: string, authPath?: string): Credential | undefined`.
  JS: `authPath = join(getAgentDir(), "auth.json")` is a **default parameter**, evaluated at each call. Body: `JSON.parse(stripBom(readFileSync(normalizePath(authPath),"utf-8")))[providerId]`; any throw (missing file, bad JSON) returns `undefined`. Exported from `PI/dist/index.d.ts:4`.
- `AuthStorage` [SRC] same file: `constructor(authPath = join(getAgentDir(),"auth.json"))` at lines 31 and 168 (file backend, read-only backend); `static create(authPath = join(getAgentDir(),"auth.json"))` line 290. All defaults per call/construct, not at module load.
- Only module-level state in that file: `let sharedAuthFileReadState` (line 28), keyed by `authPath`, used in the `AuthStorage` constructor (lines 279-284) to share a read-state across instances **of the same path**; it holds one entry (first path wins; a different path gets a fresh `{data:{}}`). The path is not captured from `getAgentDir()`.
- `ModelRegistry`/`ModelRuntime` [SRC]: `model-registry.js` has no `getAgentDir`/auth-path reference. Credentials come via `ModelRuntime.create` (`model-runtime.js:80`): `new RuntimeCredentials(options.credentials ?? DefaultAuthStorage.create(options.authPath))`. The caller supplies `authPath`; `createAgentSessionServices` (`agent-session-services.js:55-58`) computes `agentDir = options.agentDir ? resolvePath(options.agentDir) : getAgentDir()` then `authPath: join(agentDir,"auth.json")` — per call to that function.
- Other `getAuthPath()`/`AuthStorage.create()` uses in pi (interactive-mode status text, `cli/auth-login.js:56`, `main.js:184`) all go through per-call `getAgentDir()`.
- The extension itself [SRC, repo]: `src/auth-storage.ts:28` calls `readStoredCredential(PROVIDER_KEY, authPathOverrideForTesting)`; passing `undefined` triggers the default param, so with no override it reads `<getAgentDir()>/auth.json` per call. No `AuthStorage`/`ModelRegistry` import in `index.ts` or `src/` (grep). The only other agent-dir use is `src/catalog.ts` (below).
- Answer: yes, every route resolves per call; a test isolates by setting `PI_CODING_AGENT_DIR`. Nothing auth-path related is cached at module load in pi. Caveat: `sharedAuthFileReadState` is module state inside pi's `AuthStorage` (not used by `readStoredCredential`).

## 2. `getAgentDir()`

[SRC] `PI/dist/config.js:510-516`:
```js
export function getAgentDir() {
    const envDir = process.env[ENV_AGENT_DIR];
    if (envDir) return expandTildePath(envDir);
    return join(homedir(), CONFIG_DIR_NAME, "agent");
}
```
- `ENV_AGENT_DIR = \`${APP_NAME.toUpperCase()}_CODING_AGENT_DIR\`` (line 495); `APP_NAME = piConfigName || "pi"` (490) → `PI_CODING_AGENT_DIR` for stock pi. `CONFIG_DIR_NAME = pkg.piConfig?.configDir || ".pi"`.
- Reads `process.env` on every call; **no cache**. Empty string is falsy → falls to default. Normalization: only `expandTildePath` → `normalizePath(path)` (`dist/utils/paths.js:100-`; expands leading `~` via `homedir()`; Windows shell path fix; no `resolve`, so a relative value stays relative). Default branch uses `homedir()` (reads `HOME` on POSIX at call time).
- `getAuthPath/getModelsPath/getSettingsPath/...` (config.js:526-551) each call `getAgentDir()` per call.
- Repo isolation [SRC]: `test/isolation/global-setup.ts` sets `process.env.HOME` and `PI_CODING_AGENT_DIR = <root>/agent` in the main process; `worker-setup.ts` asserts `getAgentDir()` is under `inject("isolationRoot")`.

## 3. The singleton

- Docs [DOC] `PI/docs/extensions.md`: I found **no sentence** saying a factory "may run more than once per process" verbatim. What it does say:
  - L254: "Extension factories may run in invocations that never start a session. Do not start background resources such as processes, sockets, file watchers, or timers from the factory." L256: "Defer background resource startup until `session_start` or the command/tool/event that needs the resource. Register an idempotent `session_shutdown` handler to close any session-scoped resources you start."
  - L512/529 (switch, fork): "Pi emits `session_shutdown` for the old extension instance, reloads and rebinds extensions for the new session, then emits `session_start`… Do cleanup work in `session_shutdown`, then reestablish any in-memory state in `session_start`." (L513, L530)
  - L1529-1533 (`ctx.reload()`): emits `session_shutdown` for the current runtime, reloads, emits `session_start` reason `"reload"`; "Code after `await ctx.reload()` must not assume old in-memory extension state is still valid."
  - Lifecycle diagram L371-390: `/reload`, `/new`, `/resume`, `/fork`, exit → `session_shutdown`; replacement loads a new extension runtime → `session_start`.
  - L1480: after shutdown, state invalidated by your `session_shutdown` handler is gone.
  - No docs text on `globalThis`, `Symbol.for` or a module-level singleton guard (grep of `docs/*.md`).
- Implication stated by the docs: state is per extension instance; cleanup belongs in `session_shutdown`. The repo's guard is `index.ts:31,52-54` (`Symbol.for("pi-omlx/loaded")` on `globalThis`), cleared at `index.ts:131` inside `pi.on("session_shutdown")`.
- Test harness emit [SRC]: pi has an internal helper `emitSessionShutdownEvent(extensionRunner, event)` at `PI/dist/core/extensions/runner.js:80-86`, but it is **not exported**: 0 occurrences in `dist/index.d.ts` and `dist/core/extensions/index.d.ts`, and package `exports` map is only `.` and `./rpc-entry`. `ExtensionRunner` (class, with `emit`/`hasHandlers`) is exported from `dist/index.d.ts:9`; constructing one needs real extension objects (not examined further). `SessionShutdownEvent` type is exported; docs give shape `{ reason: "quit"|"reload"|"new"|"resume"|"fork", targetSessionFile? }` (L607-608). Docs describe no test-harness emit API.
- The repo's existing tests (`test/index.test.ts:105,240`) are fake-pi style: they call the registered handler directly (`handlers.get("session_shutdown")?.()`), with no event argument. The handler in `index.ts:130` takes no parameters.

## 4. vitest 5.1.0 re-import

Docs [DOC] (https://vitest.dev/api/vi.html, fetched; version-agnostic page, the `vi.when` 5.0.0+ entry shows it is the 5.x page):
- `vi.resetModules()`: "Resets modules registry by clearing the cache of all modules. This allows modules to be reevaluated when reimported. Top-level imports cannot be re-evaluated." Does not reset the mocks registry.
- `vi.mock` note: "Vitest will not mock modules that were imported inside a setup file because they are cached by the time a test file is running. You can call `vi.resetModules()` inside `vi.hoisted` to clear all module caches before running a test file."
- No docs statement on query-string imports in what I read (first ~30 KB of the page); query strings are covered only by the experiment.
- `vi.stubEnv(name, value)` / `vi.unstubAllEnvs()` change/restore `process.env`; env restoration is also a config option (not read).

Experiment [EXP] (scratch: `.pi/marbleization/remove-test-only-seams/scratch-chidi/{vitest.config.ts,exp.test.ts}`; vitest 5.1.0; config reused the repo's `globalSetup` and `setupFiles` by absolute path; `HOME` set to scratch; ran with `--disable-console-intercept`). Results:
1. Static `import * as staticCatalog from src/catalog.ts` is the same instance the setupFile loaded (setupFile imports `src/catalog.ts`, `worker-setup.ts:4`), so `CACHE_FILE` was captured at setup under `<root>/agent`. With env switched to dir B and `writeCatalogCache` called: `B/cache` directory **created**, `B/cache/omlx-models.json` **not** written, A file **not** written (write went to A's path whose `cache` dir may not exist → swallowed error). This reproduces the card's directory/file mismatch.
2. `vi.resetModules()` then `await import(abs path to src/catalog.ts)` after setting env to A2: returns a **new** module instance (`fresh !== static`: true) that re-evaluates `CACHE_FILE` from A2. Switching env to B2 and writing: B2/cache created, no file in A2 or B2 (same mismatch, reproduced on the fresh module).
3. `await import(CAT + "?fresh=1")` (no resetModules): also a **new** instance (`q !== static`: true), evaluated with the env of that moment (A3). Env restored to A and write: `A/cache` created, no file in A3 or A.
4. After `vi.resetModules()`, `await import("@earendil-works/pi-coding-agent")` returns the **same** `getAgentDir` function as the statically imported one (true): pi (external in node_modules) is not re-evaluated; this is harmless because `getAgentDir` reads env per call.
- Interaction with setupFiles: setup-file modules are cached in the test file's registry, so they are shared with the test's static imports; `resetModules` and query-string imports both bypass that cache for the target module. The setup file's guard runs once per test file before tests and is unaffected by later re-imports.
- Not tested: whether `vi.resetModules()` in an `afterEach` affects the later static-import-bound instances (it does not per docs: "Top-level imports cannot be re-evaluated"); the `isolate` config options; `vi.stubEnv` behaviour; other vitest pool settings (default used).

## Differences from the brief's assumptions
- The brief says pi "documents that a factory may run more than once per process, and on every session change". Docs support per-session-change reload/rebind and "invocations that never start a session", but I found no literal "more than once per process" sentence.
- `emitSessionShutdownEvent` exists but is not public; fake-pi handler invocation is what the repo already does.

## Gaps
- Did not read the rest of the vitest `vi` page (offset 29940+) or the config pages; did not exercise `vi.stubEnv`.
- Did not verify extension-runner construction for emitting a real `session_shutdown`.
- Windows behaviour not examined.
- No Context7 (`ctx7`) lookup was done; sources were the installed packages, the pi docs, and vitest.dev.

## Git status
`git status --short` showed only `?? .pi/` and `?? openspec/changes/remove-test-only-seams/`.
