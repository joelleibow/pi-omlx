# Research Report

## Question and Scope

Map every tracked repository occurrence carrying the old `pi-omlx-picker` / “Picker” product name, distinguish model-picking language, identify user-facing runtime identifiers, upstream references, and release/version surface for the rename to `pi-omlx`. Scope: tracked files in `/Users/joelleibow/Projects/pi-omlx-picker`, including package metadata, code, docs, assets, tests, and `.github/`. The untracked `.pi/` and `openspec/` change artifacts are not part of the repository's tracked-file occurrence inventory; `owner-rulings.md` was read as binding context.

## Sources / Files Examined

- `openspec/changes/rename-to-pi-omlx/owner-rulings.md` (binding decisions: package name `pi-omlx`; new repository `joelleibow/pi-omlx`, PeachlifeAB repository retained as upstream; Joel handles his packages setting).
- `package.json`, `package-lock.json`, `index.ts`, `src/debug.ts`, `src/catalog.ts`, `scripts/debug-omlx.ts`, `scripts/debug-pi.ts`.
- `README.md`, `CONTRIBUTING.md`, `docs/CONFIGURATION.md`, `LICENSE`, `.npmignore`, `.biomeignore`, `.github/dependabot.yml`, `.assets/demo.gif`.
- Tracked-file `git grep` for old-name variants, `picker`, PeachlifeAB, GitHub/npm/pi.dev URLs; `git ls-files` and `git status`.
- `openspec instructions research --change rename-to-pi-omlx --json` (research template).
- Baseline commands: `npx tsc --noEmit`; `npx biome check *.ts *.json src test scripts`.
- No `AGENTS.md`, `CLAUDE.md`, or `ARCHITECTURE.md` found. No ADR files found.

## Findings

### Old name and “Picker” occurrences in tracked files

- `package.json:2` — package identity, `"name": "pi-omlx-picker"`. `package.json:11` — `picker` in keywords (package discoverability metadata, product-derived).
- `package-lock.json:2,8` — root package name `pi-omlx-picker` in lockfile root and package entry.
- `README.md:1` — product title “Pi OMLX Picker”; `README.md:8` — image alt text “Pi OMLX Picker Demo”; `README.md:19` — install command `pi install npm:pi-omlx-picker`.
- `CONTRIBUTING.md:3` — product/package name in development description; `CONTRIBUTING.md:27` — documented Pi package install path `~/.pi/packages/pi-omlx-picker/...`.
- `docs/CONFIGURATION.md:9` — uninstall instruction `pi uninstall pi-omlx-picker`.
- `index.ts:31` — global singleton key `Symbol.for("pi-omlx-picker/loaded")`; `index.ts:26` imports the internal helper named `pickerDebug`, and calls at lines 74, 83, 185 are logs/events, not product branding by themselves.
- `src/debug.ts:1` — environment variable name `PI_OMLX_PICKER_DEBUG`; `src/debug.ts:14` — internal helper symbol `pickerDebug`; `src/debug.ts:28` — emitted log prefix `[pi-omlx-picker]`.
- `scripts/debug-omlx.ts:22` — package identifier `pi-omlx-picker`; `scripts/debug-pi.ts:18` — `PACKAGE_ID = "pi-omlx-picker"` (used to inspect installed package path; see lines 19 and 73–75).
- `test/auth-storage.test.ts:20` — temporary test directory prefix `pi-omlx-picker-auth-`.
- `test/catalog.test.ts:233,311,467` — temporary directory prefix `pi-omlx-picker-`; line 515 — temporary fixture filename `pi-omlx-picker-missing-model-settings.json`.
- `test/config.test.ts:60` — temporary directory prefix `pi-omlx-picker-config-`.
- `test/index.test.ts:13` — test singleton key mirrors runtime `Symbol.for("pi-omlx-picker/loaded")`; line 38 — temp directory prefix `pi-omlx-picker-index-`.
- Case/separator variants `pi_omlx_picker`, `PI_OMLX_PICKER` as contiguous old full name do not occur as written; `PI_OMLX_PICKER_DEBUG` is the debug env variable above. No separate global variable named with the old product token found.
- Product “Picker” occurs in README title/alt text and package keyword above. No tracked occurrence uses “picker” to mean a user-visible model-picking behaviour; `pickerDebug` is an internal helper identifier, not the behavior. Model selection is called `/model` in `README.md:5,30`.
- `.assets/demo.gif` is referenced at `README.md:8`; visual contents inspected and show no product-name text. `.assets/demo.tape` is tracked; text search found no old-name hit. `.npmignore`, `.biomeignore`, and `.github/dependabot.yml` contain no old-name match. `.npmignore:1` excludes `package-lock.json`; `.npmignore:4` excludes `.github/`; `.npmignore:12` excludes CONTRIBUTING. No release workflow or changelog is present in tracked paths.

### Runtime identifiers users depend on

- `PI_OMLX_PICKER_DEBUG` (`src/debug.ts:1,18`): users set this environment variable to opt in to stderr diagnostics; the emitted lines use `[pi-omlx-picker]` at `src/debug.ts:28`. The `pickerDebug` caller in `index.ts` and `src/stream.ts:25,155,196,203,266` emits specific event diagnostics.
- Singleton `Symbol.for("pi-omlx-picker/loaded")` (`index.ts:31,50–51,101`; matching test `test/index.test.ts:13`): internal process-global duplicate-extension-load guard; not ordinarily set or seen directly by users, but changing the key could affect coexistence with already-loaded copies during a transition.
- Pi install path: `CONTRIBUTING.md:27` documents `~/.pi/packages/pi-omlx-picker/`; `scripts/debug-pi.ts:18–19` derives installed location as `~/.pi/packages/<PACKAGE_ID>`. The owner ruling says Joel will update his `packages` entry when changing clone directory; Pi's exact package-path behavior is outside this repository investigation.
- `scripts/debug-omlx.ts:22` and `scripts/debug-pi.ts:18` carry a package identifier for local diagnostics. `scripts/debug-pi.ts:73–75` reads installed package metadata; these names are not provider identifiers.
- Catalog cache filename is not package-branded: `src/catalog.ts:567` uses `<Pi agent dir>/cache/omlx-models.json`. The brief notes tests write real cache and says not to run them; no test suite was run.
- No old-name cache file other than test temp prefixes was found. Provider ID is `omlx` (`src/auth-storage.ts` declares `PROVIDER_KEY`, and README `:30` documents `/login omlx`); it is explicitly not in scope for renaming.

### Upstream references, links, copyright

- `README.md:3` links to OMLX itself at `https://github.com/jundot/omlx` (not this extension's upstream).
- `CONTRIBUTING.md:16` links to mise; line 34 and lines 42–47 refer generically to OMLX upstream but do not specify a PeachlifeAB project URL. Lines 21–22/27 discuss mise task names and installed package path.
- No tracked GitHub URL to `PeachlifeAB/pi-omlx-picker`, issues URL, npm package page URL, or pi.dev package page URL was found. Installation instruction is `npm:pi-omlx-picker` at `README.md:19`.
- `LICENSE:3` copyright is `Copyright (c) 2026 PeachlifeAB`. Owner ruling directs the old GitHub repo to remain upstream, but repository text alone does not establish any licensing/copyright change.

### Version and release surface

- `package.json:3` version is `0.3.6`; `package-lock.json:3` mirrors the root package version.
- `package.json:15–22` defines checks, formatting, typecheck, tests, and `"release": "npm publish --access public"` (line 21). No release script other than direct npm publish is present.
- `package.json:23–28` `files` publishes `index.ts`, `src`, `README.md`, and `LICENSE`; package metadata and npm's standard package manifest are part of the publish surface. `package-lock.json` is excluded by `.npmignore:1` (also package `files` is an allowlist).
- Tracked `.github/` contains only `.github/dependabot.yml`; no CI or release workflow. No changelog found.

### Baseline

- `npx tsc --noEmit` — failed before rename work. Errors: `src/provider.ts:35,37` incompatibility between duplicated `@earendil-works/pi-ai` type copies; `test/provider.test.ts:49–53,60,66,72` accesses fields `reasoning`/`compat` absent from `ProviderModelConfig` union. Full command output was observed.
- `npx biome check *.ts *.json src test scripts` — passed: “Checked 34 files in 11ms. No fixes applied.”
- No `npm test` or `npm install` run, following the brief's constraints.

## Assumptions, Differences, and Unknowns

- The tracked search establishes repository occurrences, not hidden content within binary assets or remote GitHub/npm/pi.dev state. The demo GIF was visually inspected; `.assets/demo.tape` yielded no text match.
- No occurrence of “picker” describing model-selection behavior was found; “model selection” is phrased separately.
- No pi.dev or upstream GitHub / issues / npm page URL exists in tracked files found. Whether those external pages or Pi itself bind package identity to path is unknown and belongs to Chidi/owner, not inferred here.
- `npx biome check` was run with shell-expanded arguments exactly as requested. The `openspec instructions research` output resolves the report path/template; no external installation or test-suite side effects were invoked.

## Addendum 1 — keywords and the dev scripts

### Exact package keywords

`package.json:7–13` contains exactly this array, in order: `["pi-package", "omlx", "pi", "picker", "model"]`. The `"picker"` member is product/identity metadata; the other four values are as quoted. The package is currently named `pi-omlx-picker` at `package.json:2`.

### Where Pi 1.5.2 installs packages, and what the path probes mean

The repository lockfile pins `@earendil-works/pi-coding-agent` at 1.5.2 (`package-lock.json:953–956`). In that version's installed `dist/core/package-manager.js`, managed global npm packages resolve to `join(this.agentDir, "npm", "node_modules", source.name)` (`:1921–1930`); `getAgentDir()` defaults to `~/.pi/agent` and honors the agent-dir environment override (`dist/config.js:509–520`). So a Pi-managed global npm package is under `~/.pi/agent/npm/node_modules/<name>`, not `~/.pi/packages/<name>`. This is the implementation's global managed npm path; local/project scope has a different `.pi/npm/node_modules/<name>` path (`package-manager.js:1925–1929`).

The `~/.pi/packages/<name>` assumption is therefore wrong for a current Pi 1.5.2 managed npm installation. Its presence would only be useful if a user separately places a package there; the scripts themselves do not discover Pi's managed install location dynamically. The old-name path is not merely a rename string to substitute: its parent directory is the wrong basis for locating Pi-managed npm packages.

`provider-debug.log` is also not produced by Pi or this extension in the code examined. The extension's own opt-in debug routine writes to `process.stderr` (`src/debug.ts:1,18,27–29`), and its caller uses the package-branded singleton only for de-duplication (`index.ts:30–32`); no path/file logger is configured there. Pi 1.5.2's own debug log path is `join(getAgentDir(), `${APP_NAME}-debug.log`)` (`dist/config.js:549–552`), distinct from `provider-debug.log`. The two scripts only read the `provider-debug.log` paths and report missing files if absent.

### `scripts/debug-pi.ts`: end-to-end behavior and live/dead portions

`main()` prints a header and dispatches selected modes (`scripts/debug-pi.ts:28–50`): default/all runs install, config, sessions, logs, and cache; individual install/config/sessions/logs/cache modes run those sections, while `timeline` runs a correlated Pi/OMLX/file-change diagnostic.

- **Install (`:53–77`):** finds `pi` executables on `PATH`, summarizes `~/.pi`, its real path and git state, inspects an assumed installed package path, compares that path to cwd, and reads its package.json identity fields. The `~/.pi` home and realpath/git operations can inspect the real Pi configuration root; the hardcoded `~/.pi/packages/pi-omlx-picker` probe (`:18–19,62–76`) does not locate the Pi 1.5.2 managed npm install described above, so its installed-package and same-repo result are stale/misleading for managed npm installs.
- **Config (`:79–97`):** reads `~/.pi/config.json` and `~/.pi/skills-lock.json` and checks `~/.pi/pi-wiki`. The Pi 1.5.2 global settings file is instead `<agentDir>/settings.json` (`dist/config.js:509–531`; default `~/.pi/agent/settings.json`); its `config.json` probe is not the documented current global settings file. Skills/wiki locations are ancillary and not evidence of package install location.
- **Sessions (`:99–108`):** summarizes the per-cwd session directory beneath `~/.pi/agent/sessions`. This root matches Pi 1.5.2's session location: `dist/core/session-manager.js:289` documents encoded cwd directories under `~/.pi/agent/sessions/`, and `:1326` documents the default session path. It prints recent JSONL and a session summary; this part is live/useful.
- **Logs (`:110–117`):** checks `~/.pi/log`, `~/.pi/packages/pi-omlx-picker/log`, and `provider-debug.log` in the latter. The package path is the invalid managed-install derivation; the `provider-debug.log` filename has no writer in repository code. This section can enumerate whatever files users happen to put in those directories but does not find the normal Pi-managed package or Pi's own `pi-debug.log`.
- **Cache (`:119–129`):** lists candidate cache paths. `~/.pi/agent/cache` is an actual Pi agent-dir-shaped path; other candidates are heuristic probes, not proof those caches are Pi-managed.
- **Timeline (`:131–end`):** anchors to a given session file/id/timestamp or the latest `before_provider_request` row, then reads provider rows from the hardcoded `PACKAGE_DEBUG_LOG` (`:147–153`, `:351–360`), correlates request events, reads `~/.omlx/logs/server.log` and changed files (`:177–180`, `:327–355`). Session-file anchors and session root are usable; provider-request matching cannot work unless an external actor has populated the expected `provider-debug.log`, because this repo's logger writes stderr rather than that file. Thus the timeline feature is partially broken by a dead log-file premise; the script as a whole is not dead.

The script is substantial and performs genuine `PATH`, filesystem, git, JSON, and session diagnostics; several sections rely on valid current Pi paths (especially sessions) even though install/config/package-log assumptions are stale. It is not just a dead derivation.

### `scripts/debug-omlx.ts`: end-to-end behavior and live/dead portions

This script is an OMLX-oriented filesystem/config diagnostic, not a Pi package installer probe. It prints environment/config context; reads `~/.omlx/model_settings.json`; summarizes model settings, `~/models`, model template/config paths and rope settings; summarizes local and assumed package debug-log locations; reports OMLX/Hugging Face cache directories; and provides next-step advice (`scripts/debug-omlx.ts:15–34,53–102`). User-selected model names narrow the output (`:54,80–82`).

- `~/.omlx/model_settings.json`, `~/models`, and OMLX/Hugging Face cache paths (`:16–17,29–34`) are OMLX/model diagnostics, not paths whose validity depends on Pi's npm installer.
- `LOCAL_DEBUG_LOG = resolve("log/provider-debug.log")` (`:26`) is a cwd-relative optional diagnostic file. `PI_DEBUG_LOG` derives `~/.pi/packages/pi-omlx-picker/log/provider-debug.log` (`:18–25`); it repeats both the wrong Pi managed-package location and the unverified/non-produced log-file assumption. It reports missing files rather than failing. Log parsing happens only if those paths happen to exist (`:88–92,188–208`).
- Smoke-log diagnostics use cwd-relative `log/smoke-test` (`:27,70,92`), matching the documented location (`CONTRIBUTING.md:27`) when run from the repo.

This script is also not wholly dead: model settings, model paths, cache locations, and optional local smoke artifacts are separate useful diagnostics. Only the package-derived provider-log path is a false/stale premise.

### Do anything invoke these scripts?

`CONTRIBUTING.md:21–23,28–29,41–51` documents `mise run debug:omlx` and `mise run debug:pi` as usable commands and triage steps. However, `git ls-files '*mise*' '*task*' '.github/*'` finds only `.github/dependabot.yml`; there is no tracked `mise.toml` or task definition. `package.json:17–24` has check/format/typecheck/test/release scripts and does not invoke either debug script. The scripts are thus manually documented but no task mapping is present in this tracked repository snapshot; the `mise run` names cannot be executed from a checked-in definition here. `CONTRIBUTING.md:7–12` invokes `mise run verify`, `smoke:omlx`, and `verify:live`, also without tracked task definitions.

**Bottom line:** Both debug scripts are real standalone diagnostic programs; neither is invoked by package scripts, and their `mise` entry points are documented but undefined in tracked files. The `~/.pi/packages/<old-name>` derivations inside them and the `provider-debug.log` premise are dead/stale components, not grounds to call either entire script dead. `debug-pi` has substantial independent live behavior, including a session path confirmed by Pi 1.5.2; `debug-omlx` primarily diagnoses local OMLX/model state and smoke artifacts.