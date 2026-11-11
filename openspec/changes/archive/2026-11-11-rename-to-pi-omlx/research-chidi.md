# Research Report (Chidi)

## Question and Scope

What renaming the pi package `pi-omlx-picker` -> `pi-omlx` (and its clone dir `~/Projects/pi-omlx-picker` -> `~/Projects/pi-omlx`) touches outside the package's own code: (1) how pi identifies packages/extensions, (2) what does not move, (3) publishing/discovery, (4) MIT obligations. Source code of the repo was not read. Binding context: `owner-rulings.md` (rename; standalone joelleibow/pi-omlx with `upstream` remote; Joel edits the `packages` path himself).

`$PI` = `/Users/joelleibow/.local/share/fnm/node-versions/v26.8.1/installation/lib/node_modules/@earendil-works/pi-coding-agent` (v1.5.2). Everything is from installed docs/dist unless marked **[online]**.

## Sources / Files Examined

- `$PI/docs/packages.md`, `settings.md`, `providers.md`, `custom-provider.md`, `sessions.md`, `session-format.md`
- `$PI/dist/core/package-manager.js`, `source-info.js`, `settings-schema.js`, `auth-storage.js`, `models-store.js`, `session-manager.js`, `agent-session-services.js`, `extensions/loader.js`, `resource-loader.js`, `trust-manager.js`; `dist/modes/interactive/interactive-mode.js`; `dist/package-manager-cli.js`
- User state (read-only): `~/.pi/agent/settings.json`, `auth.json` (key names only), `models-store.json` (key names only), `trust.json`, `sessions/`
- `/Users/joelleibow/Projects/pi-omlx-picker/package.json`, `LICENSE`, `git remote -v`
- **[online]** `https://registry.npmjs.org/pi-omlx` and `/pi-omlx-picker` (curl, 2026-11-11); `https://opensource.org/license/mit`

## Findings

### Q1. Package and extension identity

1. **Local package = identified by resolved absolute path, not by `package.json` name.** `docs/packages.md:151` ("local packages by resolved absolute path"); `dist/core/package-manager.js:1517-1534` `getPackageIdentity` returns `local:<resolved path>` for local, `npm:<parsed.name>` for npm, `git:host/path` for git. The `name` in package.json is never read for identity (`pi list`, dedupe, match for `pi remove`: `getSourceMatchKeyForSettings` 1240-1249).
2. **Relative local paths resolve from the settings file's scope dir.** `docs/packages.md:44`; `package-manager.js:1984-1992` (user scope base = `agentDir` = `~/.pi/agent`). Current entry `"../../Projects/pi-omlx-picker"` (`~/.pi/agent/settings.json:19`) -> `~/Projects/pi-omlx-picker`. Renaming the directory means that string must change to `../../Projects/pi-omlx`.
3. **Stale local path fails silently in package resolution.** `resolveLocalExtensionSource` (`package-manager.js:1192-1196`) does `if (!existsSync(resolved)) return;` — no warning, no error, extension just does not load (so the `omlx` provider disappears). (Contrast: `pi install <missing path>` throws `Path does not exist`, line 827; top-level extension paths report `Extension path does not exist`, `resource-loader.js:433`, but that is a different code path than `packages`.) Not verified by running pi.
4. **Extension entry from the `pi` manifest.** `readPiManifest(package.json)`; `pi.extensions` entries are resolved relative to the package root (`package-manager.js:385-392`, `2001`, `docs/packages.md:63-76`). Name plays no part. The repo's manifest is `"pi": {"extensions": ["./index.ts"]}` (`package.json:31-33`), so the extension path pi records is `<package dir>/index.ts`.
5. **Extension path is what pi shows/records.** Extension `path` is used in diagnostics: `Extension "${extensionPath}" error: …` (`agent-session-services.js:80,93,106`), `Tool "x" registered by extension "${extension.path}"` (`extensions/loader.js:240-254`), and shortcut conflicts (`extensions/runner.js:472`). These embed the absolute path, which changes with the directory. The "already registered by extension" ownership check in pi 1.5.2 exists for **MCP servers** (`loader.js:391-393`, keyed on `extension.path`); provider registration has no ownership check — it is queued by name and applied by name (`loader.js:170-172`, `agent-session-services.js:72-84`, `model-registry.js:116-123`). Nothing in the supplied evidence says whether the extension registers MCP servers.
6. **`pi list`** prints the configured source string and `installedPath` only (`package-manager-cli.js:930-943`), i.e. the settings string / resolved path for a local package; for `npm:` it prints `npm:<name>`.
7. **Per-package resource filters** are the object form `{source, extensions, ...}` in `packages` (`docs/packages.md:118-143`). They match source via the same identity key (above) and patterns are relative to the package root (`package-manager.js:501-536`, `baseDir`), so they survive a directory rename provided `source` is updated. The current entry is a bare string (`settings.json:19`), so no filters exist for it.
8. **Changelog state** `extensionChangelogVersions` is keyed by `JSON.stringify({source, scope})` where `source` is the settings string (`source-info.js:2-7`; `interactive-mode.js:1056-1081`; `settings-schema.js:141-144`). Shown only if the package root has a `CHANGELOG.md` (`package-manager.js:482-498`, `docs/packages.md:82-98`). The repo has no `CHANGELOG.md` (ls), and `settings.json:111-114` has no entry for the local package, so nothing is orphaned. If a changelog is added later, the new source string is a "fresh install" (version recorded, nothing shown; `interactive-mode.js:1068-1072`). When shown, the heading is prefixed with `package.json` `name` (`:1083`) — the only place `name` is displayed.
9. **Sessions** are stored under `~/.pi/agent/sessions/--<cwd with / and : replaced by ->--/` (`session-manager.js:294`; `docs/sessions.md:66`). Working in `~/Projects/pi-omlx` creates a new bucket `--Users-joelleibow-Projects-pi-omlx--`; existing sessions stay in `--Users-joelleibow-Projects-pi-omlx-picker--` (exists now, with a subagent transcript) and won't appear in the new directory's session list. Session entries record `provider`/`modelId` (`docs/session-format.md:102`), not package or extension identity.
10. **Project trust** is a path list in `~/.pi/agent/trust.json` (`trust-manager.js:180`); it contains `/Users/joelleibow/Projects` and per-project paths, not `pi-omlx-picker`, so the renamed dir under `~/Projects` is already covered if parent trust applies (parent-trust semantics not verified in code).
11. **Caches:** local packages are loaded in place, "without copying" (`docs/packages.md:40`); `-e` caches live in `~/.pi/agent/tmp/extensions/` (:31) and npm installs under the pi npm dir (`~/.pi/agent/npm` exists). A local path has no install cache to invalidate. If Joel switches the entry to `npm:pi-omlx`, pi installs it by name and identity becomes `npm:pi-omlx` (`package-manager.js:1517-1521`), unrelated to the old local identity.
12. **npm source:** identity/dedupe is by npm name (`docs/packages.md:151`; `package-manager.js:1233,1243`) and `getInstalledPath`/update checks run `npm view <name>`; so for `npm:` the package.json `name` must equal the published name and the registry name is what pi is configured with.
13. **Stray references outside pi:** `~/.pi/agent/missions/…` JSON (2 files) and 6 session files contain the string `pi-omlx-picker` (text/paths from past work; pi does not key anything on them).

### Q2. What does not move

1. **Credentials** are read/written by provider id: `auth.json` is `{ [providerId]: credential }` (`auth-storage.js:188,217,228,391-397`; `docs/providers.md:12,138`). Package name/path not involved.
2. **Model reference** is `provider/modelId` (`docs/providers.md:138`; session `model_change` has `provider`, `modelId`, `session-format.md:102`); `defaultProvider` is a plain provider id string (`settings-manager.js:539-557`; `docs/settings.md:13`); `modelThinkingLevels` keyed `"provider/modelId"` (`settings-schema.js:~150`).
3. **Models store** `~/.pi/agent/models-store.json` is a provider-keyed dictionary (`models-store.js:25-70`; current keys: anthropic, typesafe, huggingface, mistral — no omlx key exists today).
4. **Provider registration** is by name only (see Q1.5); the registering extension's path is only used in error messages.
5. **Observed discrepancy:** `auth.json` has credentials for `anthropic`, `openrouter`, and **`localllm-omlx`** — no `omlx` key. The brief says the provider id is `omlx`. I did not read the repo code; either the id is `localllm-omlx`, or credentials are not currently stored under `omlx`. Either way the rename does not change it, but the id should be confirmed by Eleanor/the code.
6. **Not provider-keyed (changes):** session bucket directory (cwd), extension path in diagnostics, `packages` string, `pi list` display.

### Q3. Publishing and discovery

1. Docs: the `pi-package` keyword makes an npm package eligible for the pi package gallery at pi.dev/packages; `pi.image`/`pi.video` are optional previews (`docs/packages.md:78`). Install is `pi install npm:<name>` (`:9-15`). The repo already has `keywords: ["pi-package", …]` and a `pi` manifest (`package.json:7-12,31-33`); its keywords also include `picker` (`package.json:11`).
2. **No npm name is required to load from a local path**: a local path loads any directory with a `pi` manifest or conventional dirs (`docs/packages.md:40-59`); only `npm:` sources use the name.
3. **[online]** Registry: `GET https://registry.npmjs.org/pi-omlx` -> **404** on 2026-11-11 (confirmed; also `npm view pi-omlx` E404). `pi-omlx-picker` -> 200, `dist-tags.latest` 0.3.6, license MIT. A 404 means unpublished now; it does not reserve the name, and npm's similarity rules were not checked.
4. Remotes now: `origin git@github.com:joelleibow/pi-omlx.git`, `upstream git@github.com:PeachlifeAB/pi-omlx-picker.git`. Existing `pi-omlx-picker@0.3.6` on npm is owned by whoever published it (not verified who); the rename does not move it, and old installs `npm:pi-omlx-picker` keep resolving to the old package.
5. pi docs do not describe how the gallery indexes (npm search vs. other) or its latency; not verified.

### Q4. License

1. `LICENSE` is MIT, `Copyright (c) 2026 PeachlifeAB` (repo `LICENSE:1-3`); matches the canonical text **[online]** opensource.org/license/mit.
2. The only condition: "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software." So the PeachlifeAB copyright line and the permission notice must remain in copies/substantial portions. The MIT text does not restrict renaming, and imposes no attribution of the project name.
3. MIT does not prohibit a fork adding its own copyright line; the common practice is an additional line (e.g. `Copyright (c) 2026 Joel Leibow`) above/below the original, keeping the original intact. This is generally accepted practice, not a text in the license (no legal advice). `package.json` `license: "MIT"` stays accurate.

## Assumptions, Differences, and Unknowns

- **Difference:** brief says provider id `omlx`; `auth.json` holds `localllm-omlx` and no `omlx` (Q2.5). Needs code confirmation.
- **Difference/risk:** a stale `packages` path is silently skipped, not reported (Q1.3). Between the directory rename and Joel's settings edit, the `omlx` provider will simply be absent (not verified by running pi).
- Whether the extension registers MCP servers (the only ownership check in 1.5.2) is unknown without reading the code.
- Settings is a symlink to dotfiles (per owner-rulings); pi resolves the relative path from `~/.pi/agent`, not from the symlink target (`package-manager.js:1989-1991`, `agentDir`); I did not test symlink behavior of `agentDir`.
- Trust-parent semantics, gallery indexing, npm name-similarity rules, and who owns npm `pi-omlx-picker` were not verified.
- Nothing here is a design recommendation.

## Addendum 1 — install commands and named exports

`$PI` = `/Users/joelleibow/.local/share/fnm/node-versions/v26.8.1/installation/lib/node_modules/@earendil-works/pi-coding-agent` (1.5.2).

### (1) Git install/remove commands

- **`pi install git:github.com/joelleibow/pi-omlx` is a supported form.** `$PI/docs/packages.md:13` (`pi install git:github.com/example/pi-tools@v1`), `:38` (git source row), `:39` (an `https://github.com/...` URL is also treated as git). Optional `@ref` pins (`:42`). Parsed by `dist/utils/git.js` `parseGitUrl` (the `git:` prefix accepts shorthand). I ran it: `git:github.com/joelleibow/pi-omlx` -> `repo: "https://github.com/joelleibow/pi-omlx"`, host `github.com`, path `joelleibow/pi-omlx`; `git:git@github.com:joelleibow/pi-omlx` -> `repo: "git@github.com:joelleibow/pi-omlx"` (SSH kept as given).
- **Remove:** `pi remove <source>` (`docs/cli.md:10,266`; `dist/package-manager-cli.js:233,278-283,920`). **`pi uninstall` is a real alias**: `docs/cli.md:11,299` ("`pi uninstall <source>` is an alias for `pi remove <source>`"); `package-manager-cli.js:283,335-336` maps `rawCommand === "uninstall"` to `remove`. `--local`/`-l` applies to both (`docs/cli.md:269`). Removing matches by identity (`git:host/path`, `package-manager.js:1240-1249`), so the source can be written with or without `@ref`.
- **Visibility:** `gh repo view joelleibow/pi-omlx --json visibility` -> `{"visibility":"PRIVATE"}` (2026-11-11). Confirmed: an unauthenticated `git ls-remote https://github.com/joelleibow/pi-omlx` (credential helper disabled, prompts off) fails with `Repository not found` / `Authentication failed`.
- **What a private git install needs:** pi just runs `git clone <repo> <dir>` then `git checkout <ref>` if pinned (`package-manager.js:1696-1698`) with `runCommand("git", …)`; pi has no credential handling of its own (docs/packages.md says nothing about git auth). So the machine's `git` must be able to clone that URL non-interactively. The `git:github.com/...` shorthand clones over **https** (above), so it needs an https credential helper/token (e.g. `gh auth setup-git`); the `git:git@github.com:joelleibow/pi-omlx` form uses SSH and needs an SSH key registered on the account. (A failed clone at startup is warned and skipped, not fatal: `docs/packages.md:19`.) I did not run a real install.
- Related: a git package installed this way is identified by `git:github.com/joelleibow/pi-omlx` and lives under pi's git dir, not at `~/Projects/pi-omlx`; the local-path entry and a git entry would be two different identities (`docs/packages.md:151`).

### (2) Named exports besides default

- **Yes; extra named exports have no effect on loading.** `dist/core/extensions/loader.js:490` loads with `jiti.import(canonicalizePath(extensionPath), { default: true })`, then `:491-494` takes the result as the factory and only requires `typeof factory === "function"`; otherwise it errors `Extension does not export a valid factory function` (`:538-539`). Only the factory is then called (`:523`).
- Empirical check: with the same pi-bundled jiti call (`{default:true}`) on a TS file `export const helper=1; export default function(pi){}`, `typeof` result = `function`, i.e. the default export is returned and `helper` is ignored. (Test used the installed `jiti` package, not pi's own loader wrapper `jiti-loader.js`/`jiti-static-loader.js`, so it is indicative.)
- Caveat: the default export must be the function; a module that has named exports but no default function is rejected.
- Unverified: whether `{default:true}` returns `module.default` or the whole module when a module has **only** a named export function (not relevant if a default function exists).
