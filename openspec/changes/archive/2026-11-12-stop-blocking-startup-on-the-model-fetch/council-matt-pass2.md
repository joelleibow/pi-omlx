# Council — matt, pass 2

Run `a1a10e80-167f-4edd-a42b-9846df694d44`.

## Responses

### C1 — reject

The guard fails the deletion test. In `-p` and json mode, `notify` is pi's `noOpUIContext`, which was measured to write nothing to stdout or stderr. In RPC `hasUI` is true, so the guard never fires there. The guard therefore changes no observable behaviour in any mode. The only effect it has is on a test that sets `hasUI:false` on a fake ctx, so it is a branch that exists for a test. Joel's carried ruling forbids that kind of seam. The spec's no-UI scenario should be cut to what the extension controls: nothing extra on stderr under `diagnostics/spec.md:8-10`.

Sources: research-chidi.md Addendum 3 §3; owner-rulings.md carried: no test-only seams; research-eleanor.md Addendum 3 §4

### C2 — accept

This is settled, so I withdraw my owner decision. `/new`, `/resume`, `/fork` and `/reload` all emit `session_shutdown`. The handler at `index.ts:92-95` deletes the singleton key, and the factory then runs again with fresh `state` (`:47-54`). So one factory instance is one session, and 'one warning per session' means one per instance, with no reset logic. One correction to my pass 1: resetting the warned flag on `session_start` is now a defect. RPC emits `session_start` twice after `new_session` on the same instance, so a reset would show the warning twice. The handler must be idempotent.

Sources: research-chidi.md Addendum 3 §1 (incl. RPC double emit); research-eleanor.md Addendum 3 §1

### C3 — refine

Fix the cause. After the `await fetchModels` in `fetchAndRegister`, add `if (state.stopped) return "failed"` before anything registers, writes or warns. That is one line, reading a flag that already exists (`:92-95`, `:101`). Catching the exception instead would hide the stale-handle failure, which is the symptom, not the cause. The defect exists in today's poll on later ticks: the stale `pi.registerProvider` throws and the `.catch` at `:62-64` swallows it into `lastError`. This change makes it far more likely, though. Today the factory blocks for up to about 4 s, so no session change can happen while the startup fetch is in flight. Once the poll's first tick is the startup fetch, a `/new` inside that window can easily hit it, and the new `notify` adds a second stale call. So it is fixed here. Test: shut down with a fetch pending, then resolve it. Assert that no `registerProvider` call is recorded after the shutdown and that no notify fires. The fake pi records calls and does not throw, so the test goes red without the line. An open, unverified detail: whether the stale instance should also skip `writeCatalogCache`. Its data is the same, so I would skip it too, since the guard sits before the write.

Sources: research-chidi.md Addendum 3 §4; research-eleanor.md Addendum 3 §1-2; michael-orientation.md Measurements (4 s window)

### C4 — refine

Two parts:
- Set `startedLoginOnly` in the factory only when the credential is configured and `registerCachedOrSetupModels` registered login-only. An unconfigured start never fetches (`not_configured`, `:236-240`), and a later `/login` goes through the oauth callback, not the poll, so neither should produce a 'late' warning.
- The window for a spurious 'late' warning is real but narrow. Factories load one after another (Chidi §1), so our fetch can land before `findInitialModel` only when a later extension's factory waits on I/O and our server answers quickly. Ordering by `session_start` doesn't fix it either: model selection (step 4) comes before `session_start` (step 6), so a catalog landing between the two is genuinely late and would be silenced wrongly.

So keep the flag set in the factory, with `shortcut: a catalog that lands while a later extension's factory is still loading still warns 'late'; upgrade to checking session_start ctx.model.provider if it is reported`. The behaviour of `ctx.model` at that point is unverified, so the upgrade is not built now.

Sources: research-chidi.md §1 sequential loading and step order; research-eleanor.md Addendum 3 §2; owner-rulings.md §When the notice fires

### C5 — accept

Both points hold.
- The wording does overstate. `writeCatalogCache` and registration run only when there is at least one model with positive limits (`:283-285`). Restate it as 'when it yields models with positive limits, they are registered and written to the cache'.
- A 200 response with zero usable models already returns `"failed"` from `fetchAndRegister` (`:272-281`). The warning keys off `RefreshResult === "failed"`, so counting this case needs no new rule. It does need its own scenario and test, because Joel's ruling says 'fails to load', and this is the edge where the response itself succeeded.

Sources: research-eleanor.md Addendum 3 §2; owner-rulings.md §When the notice fires

### C6 — refine

Merge the two proposals:
- Put the rule that picks the notice text in one pure function: `catalogNotice(result, startedLoginOnly, url, cachedCount) → string | undefined`, with each text a named constant.
- Add four fields to the existing per-instance `state` (`index.ts:33-40`), which C2 makes the session's home: `startedLoginOnly`, `pendingNotice`, `warned` and `ui`. The proposals agree on everything except the handle. Hold only `ctx.ui`, not the whole `ctx`, since `notify` is the only call made through it.
- The pending notice lives in `state.pendingNotice`. A fetch that finishes before `session_start` stores it there. `session_start` sets `state.ui` and flushes it.
- One `showOnce` edge does the flush: it notifies only when `ui` is held, a notice exists and `!warned`, then sets `warned` and clears the pending notice. That keeps RPC's double `session_start` from showing it twice.
- `session_shutdown` already sets `stopped`. C3's guard makes clearing `ui` unnecessary, so leave it alone.

Sources: research-eleanor.md Addendum 3 §1, §3 (fake pi stores handlers; tests invoke `session_start` with a fake ctx); research-chidi.md Addendum 3 §1, §4

## Recommendation changed

true: Chidi's Addendum 3 moved it. Each factory instance is one session, and RPC emits `session_start` twice on the same instance. So the `warned` reset at `session_start` I proposed in pass 1 would double-warn, and it is removed. My owner decision on 'session' is withdrawn. Captured handles go stale on replacement, and the startup fetch can now be in flight during a `/new`, so I added a `state.stopped` check after the fetch.

## Out of scope

- The stale-handle throw in today's poll (`index.ts:62-64` swallows it into `lastError`) also affects later poll ticks. C3's guard closes it for every tick, because they share `fetchAndRegister`.
- This was not checked: whether `/new` picking up a default `omlx` model the earlier instance cached should be documented as the recovery path. That belongs to the docs pass.
