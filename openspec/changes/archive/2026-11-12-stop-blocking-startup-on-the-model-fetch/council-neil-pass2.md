# Council — neil, pass 2

Run `70490388-0889-4787-9436-b9e7e5d0d82c`.

## Responses

### C1 — reject

Omit `if (!ctx.hasUI) return` (accepting the deletion-test objection). Chidi Addendum 3 §3 proved `ctx.ui` is `noOpUIContext` (`runner.js:132`) whenever `hasUI` is false (`-p`, `--mode json`), writing nothing to stdout or stderr, while RPC sets `hasUI: true` and `--list-models` exits before `session_start`. Deleting the guard changes zero runtime behavior; keeping it solely for unit fakes violates Joel's ruling against test-only branches. Assert instead that `pi-omlx` warns only via `ctx.ui.notify` and leaves `driveExtension`'s stderr spy empty.

Sources: research-chidi.md (§1, Addendum 3 §3); research-eleanor.md (Addendum 3 §3, §4); owner-rulings.md (Carried rulings)

### C2 — reject

Settled by evidence—no owner decision needed. Chidi Addendum 3 §1 and Eleanor Addendum 3 §1 prove `/new`, `/resume`, `/fork`, and `/reload` all emit `session_shutdown` (setting `state.stopped = true` and deleting `EXTENSION_SINGLETON_KEY` at `index.ts:92-95`) before re-running the factory and emitting `session_start`. Each factory instance is one session. Crucially, do not reset `warned` inside `session_start`: RPC `new_session` emits `session_start` twice on the same instance (`rpc-mode.js:356-360`), so `session_start` must be idempotent.

Sources: research-chidi.md (Addendum 3 §1); research-eleanor.md (Addendum 3 §1); owner-rulings.md (One notice when it matters)

### C3 — refine

Already present in today's `startPolling` (`index.ts:102-110, 284`) when `session_shutdown` runs mid-fetch, and widened by moving startup onto tick 1 and adding `notify`. Never blanket `try/catch` (mutates cache/state for a dead session and hides real errors). Instead: (1) in `session_shutdown` (`:92-95`), set `state.stopped = true` and `state.activeCtx = undefined`; (2) after `await fetchModels` in `fetchAndRegister` (`:261-285`), return early before `writeCatalogCache`/`pi.registerProvider` if `state.stopped`; (3) after `await refreshProvider` in `startPolling` (`:102-104`), `if (state.stopped) break;` before `:110` re-registration and `notify`.

Sources: research-eleanor.md (Addendum 3 §1, §2); research-chidi.md (Addendum 3 §4); michael-orientation.md (Standing 9)

### C4 — refine

Set `startedConfiguredLoginOnly` from factory startup (`index.ts:56`: credential configured AND no usable cache registered) so unconfigured starts followed by `/login` (`:126-134`) never warn, AND include the one-line `shortcut:` comment (Joel rule 8). Alone, `findInitialModel` (`sdk.js:80-110`) runs before HTTP I/O settles; however, `loadExtensionsInternal` awaits factories sequentially (`Chidi §1`), so a slow later extension could let oMLX's fetch push to `pendingProviderRegistrations` before step 4, causing one benign extra warning.

Sources: research-chidi.md (§1, §2); research-eleanor.md (Startup flow, Addendum 3 §2)

### C5 — refine

Adopt all agreed spec edits, plus: (1) Yes, qualify `spec.md:10, 29` to say *registrable* models (positive numeric `contextWindow` and `maxTokens`) are registered and cached—`index.ts:181-188, 272-285` skips both otherwise, so unconditional wording fails PL4 spec-code alignment. (2) Yes, count HTTP 200 with zero registrable models as failure: `fetchAndRegister` (`:272-281`) already returns `RefreshResult === "failed"` for empty or missing-limit responses, requiring zero extra branches.

Sources: research-eleanor.md (Addendum 3 §2); specs/catalog-discovery/spec.md (L10, L29); michael-the-architect.md (The design gate PL4)

### C6 — refine

Combine one pure helper `catalogNotice(result, startedConfiguredLoginOnly, apiRoot, hasCachedModels): string | undefined` with **per-instance** fields on the factory's existing `state` (`index.ts:33-54`): `warned`, `startedConfiguredLoginOnly`, `pendingWarning`, `activeCtx`. Reject module-level state, which persists across sessions and tests (`Chidi Addendum 3 §1`, `Eleanor Addendum 3 §3`) and creates a second lifecycle home. Call `catalogNotice` in `startPolling` *after* `:110` `registerCachedOrSetupModels` so `state.registered` reflects post-fallback state; buffer pre-`session_start` text in `state.pendingWarning` and clear on flush.

Sources: research-eleanor.md (Addendum 3 §1, §2, §3); research-chidi.md (Addendum 3 §1, §4)

## Recommendation changed

true: Three bounded updates from Addendum 3: (1) dropped if (!ctx.hasUI) return because Chidi Addendum 3 §3 proved runner.js:132 noOpUIContext already silences print/JSON modes, making the guard a test-only branch; (2) scoped warned to the factory instance without resetting in session_start because Chidi/Eleanor Addendum 3 §1 proved one factory instance equals one session while RPC new_session emits session_start twice; (3) combined pure catalogNotice formatting with per-instance state fields, post-await state.stopped guards, and the sequential-loader shortcut comment.

## Out of scope

- src/catalog.ts:362-366 rewraps AbortError into a plain Error so /models/status timeouts fall through to /models (Eleanor Addendum 1); leave untouched in this change.
