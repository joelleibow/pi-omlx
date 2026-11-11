# Proposal

## Why

Joel ruled on 2026-11-11 that the name is wrong: the extension authenticates an `omlx` provider and aggregates the models that server serves, so "picker" describes something it does not do (`owner-rulings.md`). He is treating the repository as his own project, so the package, the clone directory and the remotes take that name.

## What Changes

Michael's challenge is to treat the rename as an honest set of pieces rather than one repository-wide substitution (`michael-orientation.md` §4). This proposal takes four. Code and metadata come first, then the lines that must become true or go; both land in the implementation tasks. The documents come third, in Bambadjan's docs pass after the implementation gate. The directory move comes last, after the Marbleization run finishes. `R1`, `R2` and `R3` name the three rulings, numbered as `michael-orientation.md` §1 numbers them, and the council's answers to this proposal's open questions are recorded here as decisions (`council.md`).

### 1. Code and metadata

Eleanor found the old name on 22 lines in 13 tracked files, plus the `picker` keyword and the internal `pickerDebug` helper with its 10 call sites (`michael-orientation.md` §1, reproducing `research-eleanor.md`). Most of these swap without judgment; the entries that change behaviour or structure say so.

- `package.json:2`: name `pi-omlx-picker` becomes `pi-omlx`.
- `package.json:11`: the `picker` keyword is deleted, and nothing replaces it. Keywords are npm and gallery discovery metadata only (`research-chidi.md` Q3.1), and a substitute would fail the deletion test (`council-matt-pass1.md` 6).
- `package-lock.json:2,8`: regenerate, do not hand-edit. `npm install --package-lock-only --ignore-scripts` on a copy with the new name produced a diff of exactly those two lines and no `latest` dev-dependency bumps (`michael-orientation.md` trap c).
- `index.ts:31`: singleton key `Symbol.for("pi-omlx-picker/loaded")` becomes `Symbol.for("pi-omlx/loaded")`, with no dual key (trap b). `test/index.test.ts:13` stops repeating the literal and imports the key as a named export from `index.ts`, in a structure step with tests green on both sides; pi's loader takes the default factory and ignores named exports beside it (`research-chidi.md` Addendum 1 (2); `council-neil-pass3.md` P1).
- `src/debug.ts:1,28`: `PI_OMLX_PICKER_DEBUG` becomes `PI_OMLX_DEBUG` and the prefix `[pi-omlx-picker]` becomes `[pi-omlx]`, with no alias for the old variable: nothing documented or tested depends on it (`rg PI_OMLX test/` is empty, trap a), and an alias would give one fact two homes. This changes behaviour, so it is a step of its own. The predicate at `src/debug.ts:18` does not change; new tests cover unset, the empty string and `0`, each pinned to what that predicate returns today, which design reads from the code (`council-neil-pass2.md` M4; `council-matt-pass3.md` Q3).
- `src/debug.ts:14`: the helper `pickerDebug` becomes `omlxDebug`, with its call sites at `index.ts:26` and `src/stream.ts:25,155,196,203,266` (`research-eleanor.md`). Renaming an internal symbol is a structure step, tests green before and after, and it stays out of the variable and prefix step (`council-matt-pass2.md` N4).
- Test literals: temporary-directory prefixes at `test/auth-storage.test.ts:20`, `test/catalog.test.ts:233,311,467`, `test/config.test.ts:60` and `test/index.test.ts:38`, and the fixture filename at `test/catalog.test.ts:515` (`research-eleanor.md`).

The package identifier in `scripts/debug-omlx.ts:22` and `scripts/debug-pi.ts:18` belongs to piece 2, because the lines that use it go.

The provider id `omlx` is not on this list. It is what credentials, model references and settings are keyed by (`research-chidi.md` Q2.1–Q2.2), and it keeps its name.

### 2. Lines that are false either way

A handful of lines hold the old name inside a statement that was already wrong, so substituting `pi-omlx` into them would keep them wrong (`michael-orientation.md` trap f). Each line has to become true or go.

The install path. `scripts/debug-pi.ts:18-19` and `scripts/debug-omlx.ts:18-26` look for the package under `~/.pi/packages/<name>` and read a `provider-debug.log` from there. pi 1.5.2 installs managed npm packages under `<agentDir>/npm/node_modules/<name>` (`package-manager.js:1929`), `~/.pi/packages/` on this machine holds only Joel's `remote-pi`, a local package loads where it sits (`research-chidi.md` Q1.11), and nothing in `src/` or `index.ts` writes that log (`michael-orientation.md` trap f; `research-eleanor.md` Addendum 1). Repointing those lines at the npm path leaves them false, so they are deleted and nothing takes their place, and both scripts keep their session, cache and OMLX diagnostics (`council-matt-pass3.md` Q1). Deleting them changes behaviour: the timeline in `scripts/debug-pi.ts` loses provider-row matching, which never worked, because the log it read is never written. `CONTRIBUTING.md:27` carries the same false path and is corrected in the docs pass.

The install command. `README.md:19` reads `pi install npm:pi-omlx-picker`. That line goes false the moment the name changes. When the council sat, `npm view pi-omlx` returned 404 and npm reserved nothing (`michael-orientation.md` trap h; `research-chidi.md` Q3.3); Joel has since ruled that he claims the name with a do-nothing stub (`owner-rulings.md`, "Repository visibility and the npm name (PL2)"), and installing that stub would give a reader an extension that registers nothing. The published `pi-omlx-picker@0.3.6` belongs to `davidaberg`, not Joel, so this repository cannot post a deprecation notice pointing at the new name, and existing `npm:pi-omlx-picker` installs keep resolving to upstream (`michael-orientation.md` trap h). `docs/CONFIGURATION.md:9` (`pi uninstall pi-omlx-picker`, `research-eleanor.md`) names the same source.

So `README.md:19` becomes `pi install git:github.com/joelleibow/pi-omlx`, a form pi documents (`research-chidi.md` Addendum 1 (1)), and the repository is public by the same ruling, so the line needs no note about access. Naming `npm:pi-omlx` would install the stub, or a stranger's code if someone published it first (`council-matt-pass1.md` 1; `michael-orientation.md` trap h). `docs/CONFIGURATION.md:9` keeps `pi uninstall` and passes that same full source, because removal matches on package identity and a bare `pi-omlx` parses as `npm:pi-omlx` and matches nothing (`council-matt-pass2.md` M6; `research-chidi.md` Addendum 1 (1)).

### 3. Documents, after the implementation gate

`README.md` (the title at `:1`, the demo image's alt text at `:8`, the install line at `:19`), `CONTRIBUTING.md` (the description at `:3`, the install path at `:27`) and `docs/CONFIGURATION.md` (`:9`) are Markdown. PL7 says Markdown documentation is not a task, and Michael's implementation gate treats a Markdown file in the diff other than `tasks.md` as a finding, so none of these edits can ride along with the code (`council-neil-pass2.md` M1; `council-matt-pass2.md` N1). Bambadjan writes them in the docs pass, after the implementation gate.

### 4. The directory move, after the run

`~/Projects/pi-omlx-picker` becomes `~/Projects/pi-omlx` (R3), after the Marbleization run finishes: every brief path and this session's working directory are absolute paths under the old name, so a move during implementation breaks the pipeline's own inputs (`council-matt-pass1.md`; `council-neil-pass1.md` risk 2). pi finds the extension through a relative path in `~/.pi/agent/settings.json:19`, `"../../Projects/pi-omlx-picker"`, resolved against `~/.pi/agent`. After the move, that path points at nothing. `resolveLocalExtensionSource` returns on `!existsSync()` and logs nothing (`package-manager.js:1194-1196`), so the `omlx` provider disappears and pi says nothing about it. Joel ruled that he edits the path himself (R3; `michael-orientation.md` trap e). The change moves the directory and stops there; it writes nothing under `~/.pi/agent` (trap e). Sessions stay in the `--Users-joelleibow-Projects-pi-omlx-picker--` bucket and the new directory gets a fresh one (`research-chidi.md` Q1.9, trap e).

The remotes need no work. `origin` already points at `joelleibow/pi-omlx` and `upstream` at `PeachlifeAB/pi-omlx-picker`, `gh repo view` reports the repository exists with `isFork:false`, and no tracked file carries a GitHub URL to either repository, so R2 adds no file edits (`michael-orientation.md` §1).

## What This Change Does Not Do

- It does not release the package, and it does not choose the version a release carries. Joel ruled that the npm name is claimed now with a do-nothing `0.0.0-alpha` stub that he publishes himself, and that the real release comes later (`owner-rulings.md`, "Repository visibility and the npm name (PL2)").
- The provider id `omlx` keeps its name (`research-chidi.md` Q2.1–Q2.2).
- It does not fix the typechecker. `npx tsc --noEmit` already fails at baseline `c27fba9` on `src/provider.ts:35,37` and `test/provider.test.ts:49-72` (`research-eleanor.md` "Baseline"), so a task checks this change by confirming the same failures before and after, a green vitest run and a clean biome pass; a green `npm run check` is not the bar (`michael-orientation.md` trap g). Repairing tsc is a separate change.
- `LICENSE` stays as it is, by Joel's ruling (`owner-rulings.md`, "LICENSE (PL2)"). `LICENSE:3` is `Copyright (c) 2026 PeachlifeAB` under MIT; MIT requires that notice to stay in copies and says nothing about names (`research-chidi.md` Q4.2, `michael-orientation.md` trap d).
- It does not rewrite text elsewhere under `~/.pi/agent`. Two mission files and six session files there contain the old string and pi keys nothing to them (`research-chidi.md` Q1.13).
- It does not migrate state. For a local package pi identifies the extension by its resolved absolute path, not by `package.json.name`, so `pi list`, dedupe and `pi remove` keep working with no rename step on pi's side (`research-chidi.md` Q1.1; `michael-orientation.md` §1).

## Capabilities

### New Capabilities

- `package-identity`: what the package is called, which files carry that name, and which strings the code and metadata must no longer contain. Rests on R1 and Eleanor's inventory (`research-eleanor.md`).
- `provider-access`: the `omlx` provider id that credentials, model references and settings are keyed by, and which the rename leaves alone. Rests on `research-chidi.md` Q2.1–Q2.2 and on `michael-orientation.md` §1, which resolves the `localllm-omlx` discrepancy in favour of `omlx`.
- `diagnostics`: the environment variable that turns the extension's stderr tracing on, and the prefix its lines carry. Rests on `michael-orientation.md` trap a and `research-eleanor.md`'s runtime-identifier list.

### Modified Capabilities

None. The repository has no living specs: `openspec list --specs` returns "No specs found", so all three capabilities are new.

## Impact

Files, by kind:

- Metadata: `package.json`, `package-lock.json`.
- Code: `index.ts`, `src/debug.ts`, `src/stream.ts`, `scripts/debug-omlx.ts`, `scripts/debug-pi.ts`.
- Tests: `test/auth-storage.test.ts`, `test/catalog.test.ts`, `test/config.test.ts`, `test/index.test.ts`.
- Documentation, written in the docs pass: `README.md`, `CONTRIBUTING.md`, `docs/CONFIGURATION.md`.

Outside the repository:

- The clone directory moves (R3). `~/.pi/agent/settings.json:19` is Joel's edit, not the change's (R3; trap e).
- `joelleibow/pi-omlx` is public: the conductor made it so at the PL2 gate, and `gh repo view` reports PUBLIC (`owner-rulings.md`, "Repository visibility and the npm name (PL2)"; `brief-bambadjan-design.md`).
- The npm name `pi-omlx` is claimed by a `0.0.0-alpha` stub Joel publishes from outside this repository's working tree; the real release is a later change (`owner-rulings.md`, same section).
- No pi state is rewritten (trap e). The npm package `pi-omlx-picker@0.3.6` stays as it is, under another maintainer (trap h).

Risks and checks:

- Between the directory move and Joel's edit the provider is absent and pi reports nothing (trap e). Moving last keeps that window short.
- A task checks the rename with a clean `npx biome check`, a green `npx vitest`, and `npx tsc --noEmit` failing exactly as at `c27fba9` (`michael-orientation.md` trap g; `research-eleanor.md` "Baseline"). Research ran neither vitest nor `npm install`, and vitest writes a real cache to the pi agent directory (`research-eleanor.md` "Assumptions"), so the first run of that command is a task's evidence, not this proposal's.

## Open Questions

None remain. The council's answers are in its Synthesis (`council.md`), and Joel ruled the two it left to him on 2026-11-11 at the PL2 gate: `joelleibow/pi-omlx` becomes public, so the install line needs no sentence about access, and the npm name is claimed with a `0.0.0-alpha` stub he publishes himself (`owner-rulings.md`, "Repository visibility and the npm name (PL2)"); `LICENSE` stays as it is (`owner-rulings.md`, "LICENSE (PL2)"). The advisors' positions on both are kept under Owner Decisions Required in `council.md`.
