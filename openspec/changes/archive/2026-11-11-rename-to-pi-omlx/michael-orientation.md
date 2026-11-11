# Michael — orientation consult (not a gate)

Run `5495c45b-e661-4d90-b395-96b43b82fbdb`, 2026-11-11.

## 1. Decisions that bind

**Joel's rulings (`openspec/changes/rename-to-pi-omlx/owner-rulings.md`):**
- R1 — the package is `pi-omlx` (§"The package is pi-omlx"). Reach: `package.json:2`, the lockfile root name, and every tracked occurrence of the old name or "Picker" branding. I reproduced Eleanor's map with `git grep -ni` — 22 old-name lines in 13 files, plus `picker` keyword (`package.json:11`) and the internal `pickerDebug` identifier (`src/debug.ts:14`, 10 call sites). Her inventory is complete.
- R2 — standalone `joelleibow/pi-omlx`, PeachlifeAB kept as `upstream` (§"Where pi-omlx lives"). Measured: `git remote -v` already shows origin→`joelleibow/pi-omlx`, upstream→`PeachlifeAB/pi-omlx-picker`; `gh repo view` reports the repo exists, `isFork:false`. No tracked file carries a GitHub URL to either repo (git grep), so R2 adds no file edits.
- R3 — clone dir becomes `~/Projects/pi-omlx`; Joel edits the `packages` entry himself (§"The clone directory and pi's packages entry"). The change moves the directory and stops.
- Standing: documentation never blocks a feature.

**What pi itself fixes (source, pi 1.5.2, verified):**
- A local package's identity is `local:<resolved absolute path>` (`dist/core/package-manager.js:1517-1531`). `package.json.name` is read only for `npm:` identity (`:1519`) and the changelog heading (`dist/modes/interactive/interactive-mode.js:1082`). So pi persists nothing under the old name for Joel's local install; the rename owes pi nothing beyond the files.
- Provider id is `omlx` (`src/auth-storage.ts:4`), documented at `README.md:30`, out of scope. Chidi's `localllm-omlx` discrepancy is resolved: `git log -S localllm` is empty — that auth key is not this repo's; `auth.json` simply holds no `omlx` entry on this machine today. Not a rename concern.

## 2. Traps (measured)

a. **Env var + log prefix.** `PI_OMLX_PICKER_DEBUG` (`src/debug.ts:1`) and `[pi-omlx-picker]` (`src/debug.ts:28`). User-settable, but the definition is the only tracked occurrence — undocumented and untested (`rg PI_OMLX test/` empty). Under R1 it renames to `PI_OMLX_DEBUG` / `[pi-omlx]`. My choice: no alias for the old var — a shim for an undocumented smoke knob; nothing breaks except a local trace someone re-exports. `pickerDebug` goes with it (R1's reason is that "picker" is wrong).

b. **Singleton key.** `Symbol.for("pi-omlx-picker/loaded")` at `index.ts:31`, mirrored as a literal at `test/index.test.ts:13`. Process-local; nothing persisted. The only effect of changing it is that a process loading both the old npm package and the new one would register `omlx` twice (provider registration has no ownership check — Chidi Q1.5). Joel's settings has only the local path. Rename it, no dual key. The test literal is one fact in two places; the test should import the key, or the proposal says why not.

c. **Lockfile.** Ran `npm install --package-lock-only --ignore-scripts` on a copy with the new name: diff is exactly `package-lock.json:2` and `:8`; no `latest` dev-dep bumps. The task regenerates it with that command and verifies the diff is name-only; hand-editing is not needed. `node_modules/.package-lock.json` is untracked.

d. **License.** `LICENSE:3` is `Copyright (c) 2026 PeachlifeAB`, MIT. MIT requires that notice stay in all copies; it says nothing about names. The rename needs no LICENSE edit, and no ruling adds Joel's line. Default: untouched.

e. **Directory move vs pi.** `~/.pi/agent/settings.json:19` is `"../../Projects/pi-omlx-picker"`, resolved from `~/.pi/agent`. After the move, `resolveLocalExtensionSource` returns on `!existsSync(resolved)` with no log (`package-manager.js:1194-1196`): the `omlx` provider is absent, silently, until Joel's edit. Ruled (R3); the proposal must state this consequence and sequence the move last. Sessions bucket `~/.pi/agent/sessions/--Users-joelleibow-Projects-pi-omlx-picker--` exists and stays; the new cwd gets a fresh bucket (`session-manager.js:294`). The change touches nothing under `~/.pi`.

f. **A mechanical rename preserves a false premise.** `scripts/debug-pi.ts:18-19` (`~/.pi/packages/<PACKAGE_ID>`), `scripts/debug-omlx.ts:18-24` and `CONTRIBUTING.md:27` assume pi installs at `~/.pi/packages/<name>`. pi 1.5.2 installs npm packages at `~/.pi/agent/npm/node_modules/<name>` (`package-manager.js:1929`); `~/.pi/packages/` contains only Joel's `remote-pi`. Nothing in `src/` or `index.ts` writes `log/provider-debug.log` either (`rg provider-debug src index.ts` empty). Substituting `pi-omlx` into these yields a path that is still false. The proposal must say what those lines become — point at the real install path, or delete the dead derivation — not `s/pi-omlx-picker/pi-omlx/`. The scripts are code; the CONTRIBUTING line is docs (minor).

g. **Baseline is red.** `npx tsc --noEmit` fails at `c27fba9` (reproduced: `src/provider.ts:35,37`, `test/provider.test.ts:49-72`). The implementation gate cannot demand a green `npm run check`; verification for this change is "same tsc failures before and after, vitest green, biome clean". Fixing tsc is a separate change.

h. **npm.** `npm view pi-omlx` → 404 (free, not reserved). `pi-omlx-picker@0.3.6` maintainer is `davidaberg` — not Joel — so no deprecation notice pointing to `pi-omlx` is possible from our side, and old `npm:pi-omlx-picker` installs keep resolving to upstream. `npm whoami` → E401 in this shell: publishing is Joel's hands only. `README.md:19` (`pi install npm:pi-omlx-picker`) becomes false the moment the name changes and stays false until `pi-omlx` is published.

## 3. Calls that are certainly Joel's

1. **Does this change publish `pi-omlx` to npm?** The rulings cover repo, name and directory, not publishing. Not publishing costs: README's install line is false (or must switch to `pi install git:github.com/joelleibow/pi-omlx`, which pi supports — `getPackageIdentity` git branch), and the name stays unreserved. Publishing costs: his credentials and his version choice. My choice: this change does not publish; README instructs the git source until he does.
2. **Version on first publish under the new name** — 0.3.6 as-is or 0.4.0. Only matters if (1) is yes; no technical cost either way.
3. **Add his copyright line to LICENSE** — optional under MIT, not required; zero cost either way. My default: leave it.

## 4. Strongest challenge

The measurement says the old name is almost entirely ceremony to pi: for Joel's local install pi never reads `package.json.name`, nothing in `~/.pi` is keyed to it, and the npm identity Joel would be "fixing" is one he cannot redirect because upstream's package belongs to someone else. The one operation in the ruled change that actually breaks something — silently (`package-manager.js:1194`) — is the directory move, and it buys pi nothing; it is for Joel's tidiness, mitigated only by Joel remembering to edit a symlinked settings file. The challenge is not to overturn R3 but to insist the proposal treat the rename as three honest pieces: trivial mechanical edits (name, lockfile, strings), a small set of lines where the rename must make a false statement true or delete it (§2f, README:19), and a directory move sequenced last with its silent-skip consequence stated — rather than a repo-wide substitution that leaves the scripts lying about where pi installs things.

---
Skipped: did not run vitest (tests write real cache per Eleanor's brief); did not test `agentDir` symlink resolution or pi's git-source install end to end. Risk: the `localllm-omlx` auth key's origin is unknown — not this repo's, but if Joel expects stored `omlx` credentials on this machine, there are none today.

**Decided by:** owner-rulings.md (three rulings of 2026-11-11: package is pi-omlx; standalone joelleibow/pi-omlx with PeachlifeAB as upstream; directory to ~/Projects/pi-omlx with Joel editing the packages entry) plus pi 1.5.2 source: local-package identity by path (dist/core/package-manager.js:1517-1531), silent skip of a missing local path (:1194-1196), npm install location (:1929).

**Owner:** michael

**Follow-up:** For Joel: does this change publish `pi-omlx` to npm (and at which version), or stop at repository + directory? That decides what `README.md:19` becomes (npm:pi-omlx vs. a git-source install) and whether the version moves.
