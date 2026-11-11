# Council — neil, pass 1

Run `de54d761-7e27-487c-a765-c47f6e1b0c49`.

## Recommendation

Settle the six open questions by deleting dead premises rather than shimming them:
1. **Install/uninstall docs (`README.md:19`, `docs/CONFIGURATION.md:9`):** Use `pi install git:github.com/joelleibow/pi-omlx` and `pi uninstall git:github.com/joelleibow/pi-omlx` while npm `pi-omlx` is unpublished (404). `pi uninstall` is a real CLI alias for `pi remove`. Because `joelleibow/pi-omlx` is currently private and `git:github.com/...` clones over HTTPS, confirm visibility/SSH form with Joel.
2. **Install-path lines (`scripts/debug-pi.ts`, `scripts/debug-omlx.ts`, `CONTRIBUTING.md:27`):** Delete the dead `~/.pi/packages/<name>` and package `provider-debug.log` probes while keeping both scripts' live session, cache, and OMLX diagnostics. Do not point them at `~/.pi/agent/npm/node_modules/pi-omlx`: `pi-omlx` is unpublished, local installs stay in `~/Projects/pi-omlx`, and nothing writes `provider-debug.log` (`src/debug.ts` writes stderr).
3. **`PI_OMLX_PICKER_DEBUG`:** No alias. Rename to `PI_OMLX_DEBUG`, prefix `[pi-omlx]`, and helper `omlxDebug`, with unit tests. Nothing documented or tested breaks without a shim.
4. **Singleton key (`test/index.test.ts:13`):** Export the `Symbol.for("pi-omlx/loaded")` constant as a named export from `index.ts` alongside `export default` and import it in the test (one home for the fact).
5. **`LICENSE`:** Leave untouched.
6. **`picker` keyword (`package.json:11`):** Delete `"picker"` with no replacement, leaving `["pi-package", "omlx", "pi", "model"]`.

**Before drafting `design.md`, adjust `proposal.md` and `specs/`:**
- Move `README.md`/`CONTRIBUTING.md` checks out of `specs/package-identity/spec.md` (`Branding Names pi-omlx`) into `proposal.md`'s post-gate docs scope, and add manifest/code requirements (`keywords` excludes `"picker"`, singleton key uses `pi-omlx/loaded`). Otherwise PL7 and the implementation gate deadlock because Markdown diffs outside `tasks.md` are forbidden during code implementation.
- Sequence the `~/Projects/pi-omlx-picker` -> `~/Projects/pi-omlx` directory move after gates/docs/archive, not inside Derek's code tasks while `<cwd>` hosts active pipeline artifacts.
- Qualify `specs/provider-access/spec.md` Scenario 1 with "when pi loads the renamed package source" so it matches R3's silent-skip window.

## Evidence

- pi install git:github.com/joelleibow/pi-omlx parses to HTTPS git clone, pi uninstall aliases pi remove, and joelleibow/pi-omlx is currently PRIVATE. (research-chidi.md Addendum 1 (1); michael-orientation.md §3.1, trap h)
- scripts/debug-pi.ts and scripts/debug-omlx.ts have live session/OMLX diagnostics, but ~/.pi/packages/<name> and provider-debug.log are dead premises; pi 1.5.2 puts global npm installs in ~/.pi/agent/npm/node_modules/<name> and src/debug.ts logs to stderr. (research-eleanor.md Addendum 1; michael-orientation.md trap f)
- PI_OMLX_PICKER_DEBUG appears only at src/debug.ts:1, undocumented and untested. (michael-orientation.md trap a; research-eleanor.md)
- dist/core/extensions/loader.js:490-494 imports extension entries with { default: true } and ignores extra named exports. (research-chidi.md Addendum 1 (2))
- MIT requires keeping Copyright (c) 2026 PeachlifeAB and imposes no rename or fork-copyright requirement. (research-chidi.md Q4.1-Q4.3; michael-orientation.md trap d)
- PL7 forbids Markdown tasks while requiring a task/test per spec requirement, and the implementation gate rejects Markdown diffs other than tasks.md. (michael-the-architect.md (PL7, Implementation gate))

## Assumptions

- [verified] package.json keywords are ["pi-package", "omlx", "pi", "picker", "model"] and pi only checks "pi-package" for gallery eligibility.
- [verified] pi 1.5.2 ignores extra named exports on extension entrypoints when default export remains a factory function.
- [verified] joelleibow/pi-omlx is currently private on GitHub, and git:github.com/... expands to HTTPS without pi-managed auth.
- [unverified] Existing activation semantics in src/debug.ts (truthy/exact value check) remain unchanged when renaming PI_OMLX_PICKER_DEBUG; src/debug.ts body was not read directly.
- [unverified] Vitest currently passes at baseline when run; test suite was not executed because tests write real cache.

## Risks

- Running `pi install git:github.com/joelleibow/pi-omlx` while `joelleibow/pi-omlx` remains private and git lacks HTTPS credentials fails `git clone` with Authentication failed / Repository not found.
- Renaming `~/Projects/pi-omlx-picker` to `~/Projects/pi-omlx` mid-pipeline invalidates the orchestrator's active `/Users/joelleibow/Projects/pi-omlx-picker` paths before gates, docs pass, and archive finish.
- Starting pi after the directory move before Joel updates `~/.pi/agent/settings.json:19` causes `resolveLocalExtensionSource` to return silently, making the `omlx` provider disappear with no error.

## Confidence

high: Every tracked old-name occurrence, pi 1.5.2 loader/CLI path, lockfile diff, and GitHub/npm state was verified directly in the research and addenda.

## Challenge claims

1. Rewriting scripts/debug-*.ts to ~/.pi/agent/npm/node_modules/pi-omlx replaces one nonexistent path with another: pi-omlx is unpublished on npm, local installs load in place, and nothing writes provider-debug.log.
2. Keeping README/CONTRIBUTING requirements in specs/package-identity/spec.md deadlocks PL7 and the implementation gate, where every spec requirement demands a task/test yet Markdown diffs outside tasks.md block.
3. Moving ~/Projects/pi-omlx-picker during code implementation breaks the running pipeline's own openspec/ and .pi/marbleization/ paths before review gates and docs complete.

## Owner decisions

- Repository visibility vs README install URL: joelleibow/pi-omlx is currently PRIVATE, so `pi install git:github.com/joelleibow/pi-omlx` (HTTPS) fails without HTTPS git credentials or making the repo public. Pick: make `joelleibow/pi-omlx` public and document `git:github.com/joelleibow/pi-omlx` (or use `git:git@github.com:joelleibow/pi-omlx` if keeping it private).

## What would change my mind

- Evidence of an external script or tracked tool writing log/provider-debug.log would justify keeping a local log-path probe instead of deleting it.
- Publishing pi-omlx to npm inside this change would let README.md:19 and docs/CONFIGURATION.md:9 point directly to npm:pi-omlx.
- Evidence that pi's static jiti loader rejects modules with named exports alongside export default would justify keeping the duplicated Symbol.for literal in test/index.test.ts.
