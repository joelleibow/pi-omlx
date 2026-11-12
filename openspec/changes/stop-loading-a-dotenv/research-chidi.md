# Research (Chidi) — stop-loading-a-dotenv

Facts only; no design or recommendation. Each item says whether it came from installed source, docs, or an experiment (run in throwaway `/tmp` dirs, since deleted; nothing in the repo was touched).
Versions: pi-coding-agent 1.5.2, pi-ai 1.5.2, vitest 5.1.0, vite 8.3.8, tsx 4.23.0, Node v26.8.1, npm 11.19.0, direnv 2.38.2 (installed at `/opt/homebrew/bin/direnv`; GitHub latest release is also v2.38.2, published 2026-10-10).
Paths: `P` = `/Users/joelleibow/.local/share/fnm/node-versions/v26.8.1/installation/lib/node_modules/@earendil-works/pi-coding-agent`.

## 1. Does pi or pi-ai load a `.env`? Extension configuration convention

- **No `.env` loading found (installed source, grep).** I searched `$P/dist` (including the minified `dist/bundle`), `node_modules/@earendil-works/*/dist` (pi-ai, pi-agent-core, pi-tui, etc.), `$P/docs` and `$P/README.md` for `dotenv`, `loadEnvFile`, `env-file`, and the literal strings `".env"` / `'.env'` / `` `.env` ``. Zero files matched (`.js`, and `.md` for docs). Caveat: grep over minified code cannot exclude a computed filename such as `".en"+"v"`; none seen.
- **What pi writes into `process.env` (grep `process.env[...] =` in dist):** only `PI_CODING_AGENT=true` and `AI_AGENT=pi` (`dist/cli/setup.js:5-6`, `dist/rpc-entry.js:6-7`). `docs/environment-variables.md` documents these as the process markers set by the CLI and RPC entry points, plus `PI_*` session variables injected into bash/powershell tool commands (not into the pi process itself).
- **Documented configuration channels** (docs, read):
  - `docs/configuration.md`: `<agent-dir>/settings.json` (user settings, resource paths, package declarations), `models.json` (compatible endpoints), `auth.json` (saved API keys and OAuth credentials), `mcp.json`, `.pi/settings.json` for project level.
  - `docs/providers.md` "Use an API key from the environment": "Set the variable before starting Pi", with a table of per-provider variables. This is the documented env route; pi reads variables already in its environment, it does not read a file for them.
  - `docs/extensions.md` ~L2019, ~L2089 (`registerProvider`): `apiKey` accepts a literal, `$ENV_VAR` / `${ENV_VAR}` interpolation, or leading `!command`; omitted means users store a key via `/login` (auth.json).
  - `docs/extensions.md` L1201: a trust-check API is mentioned "before reading project-local extension configuration that should only be honored for trusted projects".
  - I found **no documented convention** specific to extensions receiving their own configuration (no per-extension settings namespace, no extension-config file, no `.env` guidance). Extensions are in-process, so they read `process.env`, files they choose, or the APIs above.
- **Packages:** `docs/packages.md`: `pi install git:github.com/example/pi-tools@v1` is "Cloned and reconciled to the selected ref"; "Pi installs package dependencies when it installs an npm or git source." A local path package is loaded in place (Joel's case, per the brief).

## 2. Env for tsx scripts once the loader is gone (experiments, tsx 4.23.0 / Node 26.8.1)

Node 26 `node --help` lists `--env-file=...` and `--env-file-if-exists=...`. tsx forwards both to Node.

| Case | Result |
|---|---|
| `tsx --env-file=t.env e.ts` (`S=fromfile` in file, `S` unset) | `S="fromfile"` |
| `S=shell tsx --env-file=t.env e.ts` | `S="shell"`: **an already-set variable wins over the file** |
| `S= tsx --env-file=t.env e.ts` (set but empty) | `S=""`: **an empty-but-set variable also wins** (unlike the repo's loader, which filled empty keys) |
| `tsx --env-file=nope.env` | error `node: nope.env: not found`, nonzero |
| `tsx --env-file-if-exists=nope.env` | runs; prints `nope.env not found. Continuing without it.` (printed twice, because tsx re-spawns Node) |
| `process.loadEnvFile("t.env")` in Node, `S=shell` | `shell`: also does not override existing vars; missing file throws `ENOENT` |

`typeof process.loadEnvFile` is `function` on Node 26.8.1.

## 3. direnv

Sources: `man/direnv.1.md`, `man/direnv-stdlib.1.md`, `man/direnv.toml.1.md` from the direnv repo master (read via raw.githubusercontent), plus the GitHub releases API and `direnv version`.
- Version: current release v2.38.2; Joel's machine has **2.38.2**.
- `.envrc`: "Before each prompt it checks for the existence of an `.envrc` file in the current and parent directories"; it is loaded in a bash sub-shell, exported variables are captured, unset variables removed; leaving the directory unloads them.
- Authorization: a new or changed `.envrc` is "not allowed" until `direnv allow [PATH]` ("Grants direnv permission to load the given .envrc or .env file"); `direnv deny` revokes. `source_env` docs note the sourced file "is not checked by the security framework".
- stdlib: `dotenv [<dotenv_path>]` "Loads a .env file into the current environment"; `dotenv_if_exists [<dotenv_path>]` loads it "only if it exists". (The man page gives no precedence statement for these.)
- `direnv.toml` `load_dotenv` (requires direnv >= 2.31.0): if `true`, direnv also loads `.env` files when no `.envrc` exists; "If both `.envrc` and `.env` files exist, the `.envrc` will always be chosen first." Whether it is set on Joel's machine: not checked (user config file not read).
- Repo state (grep): no `.envrc`, no direnv mention in README or mise.toml. `.env.example` holds `OMLX_BASE_URL="http://127.0.0.1:8000/v1"` and `OMLX_API_KEY="omlx-..."`; its header says "Copy to .env and fill in your values, or export them in your shell."
- Files in the repo mentioning `.env`/`dotenv` (grep, excluding node_modules/.git): `index.ts`, `ARCHITECTURE.md`, `AGENTS.md`, `.env.example`, `scripts/debug-pi.ts`, `scripts/debug-omlx.ts`, `scripts/smoke-live-omlx.ts`, `test/dotenv.test.ts`, `test/index.test.ts`, `test/auth-storage.test.ts`, `test/isolation/worker-setup.ts`, `test/isolation/global-setup.ts`, `openspec/specs/test-isolation/spec.md`, plus archived changes. (Eleanor owns the code mapping; this list is only a grep.)

## 4. npm packaging and git install

Experiments with `npm pack --dry-run` (npm 11.19.0) on a scratch package containing `index.ts`, `src/a.ts`, `.env`, `src/.env`, `.env.local`, `.npmrc`, `.DS_Store`, `.gitignore`, `.git/`, `node_modules/`, `package-lock.json`. Packed files:

| package.json / ignore setup | Tarball contained |
|---|---|
| `files: ["index.ts","src"]`, root `.npmignore` = `.env*` | index.ts, package.json, **src/.env**, src/a.ts |
| same `files`, root `.gitignore` = `.env` | same (src/.env included) |
| same `files`, no ignore file | same |
| no `files`, no ignore file | **.env, .env.local**, index.ts, package.json, **src/.env**, src/a.ts |
| no `files`, `.gitignore` = `.env` | .env.local, index.ts, package.json, src/a.ts (both `.env` and `src/.env` dropped, since the pattern is unanchored) |
| no `files`, `.npmignore` = `src/` (and `.gitignore` `.env` present) | **.env, .env.local**, index.ts, package.json; `.gitignore` not consulted when `.npmignore` exists |

Conclusions from this:
- **npm does not always exclude `.env`.** With no `files` field and no ignore file, `.env` ships. It is excluded only by a `files` allow-list (top-level `.env` not listed) or by an ignore rule.
- This repo's `package.json` has `"files": ["index.ts","src","README.md","LICENSE"]`. Under it, root `.env` is excluded by `files` alone; the `.npmignore` `.env*` line and the `.gitignore` `.env` line change nothing for the root file. (Correction, see Addendum 1: an earlier note here about the repo's own dry-run was taken on a tree I had accidentally modified, and is withdrawn; the HEAD result is in the addendum.) A `.env` placed **inside `src/`** would ship regardless of root `.npmignore` / `.gitignore` in these experiments. The repo's `.npmignore` also lists `.env*`, `scripts/`, `test/`, etc., all of which `files` already excludes.
- npm-packlist README (npm/npm-packlist main): the "always ignored regardless of `files`" set is `.git`, `.npmrc`, and `node_modules`. The "common cruft" set (ignored unless explicitly included) is `.npmignore` and `.gitignore` files, `.*.swp`, `._*`, `.*.orig`, `.npmrc`, `node_modules/.bin`, `build/config.gypi`, `.lock-wscript`, `.DS_Store`, root `npm-debug.log`. **`.env` is not on any list.** Always included: `package.json`, root README, LICENSE/LICENCE, COPYING. Rules order: `files` list first; else `.npmignore`; else `.gitignore`. I did not fetch the npm 11 docs page text (it returned nothing through curl); the packlist README plus the experiments above are the evidence.
- **git install:** pi docs say git sources are "Cloned"; a `git clone` carries tracked files only, so an untracked `.env` (ignored or not) is not copied. This is inference from git behavior plus the docs word "Cloned"; I did not run `pi install`. `.gitignore`'s `.env` line therefore matters to commits (accidental `git add`), not to what the clone delivers. A local-path pi package (Joel's setup) has no copying at all: the directory itself is read.

## 5. vitest 5.1.0 / vite 8.3.8 startup and `.env`

Read installed source and ran an experiment (scratch project, `vitest.config.ts` identical in shape to the repo's: `environment: "node"`, no `envDir`/`envPrefix`/`mode`/`envFile` set; `.env` and `.env.local` in the project root; a test wrote `process.env` and `import.meta.env` to a file).
- Source: `vite/dist/node/chunks/node.js` L37703-37705: `envDir` defaults to the resolved root (unless `envFile === false`), then `loadEnv(mode, envDir, resolveEnvPrefix(config))`. `resolveEnvPrefix` defaults to `"VITE_"`. `loadEnv` (L6169-6196) reads `.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local` (`getEnvFilesForMode`) and returns only keys starting with the prefix. Vitest `cli-api.COfZo8lK.js` L5743-5753 has a `getEnvFiles` mirroring that list, for watching.
- `loadEnv` **does set three `process.env` keys from unprefixed file keys** (L6184-6186): `VITE_USER_NODE_ENV` (from `NODE_ENV` in the file, if unset), `BROWSER`, `BROWSER_ARGS` (if unset).
- Experiment, `.env` containing `S=1`, `VITE_V=2`, `NODE_ENV=production`, `BROWSER=foo`, `OMLX_BASE_URL=http://x`; `.env.local` containing `S=local`. Inside a test file:
  - `process.env.S` → undefined; `process.env.OMLX_BASE_URL` → undefined (unprefixed keys do **not** reach `process.env`).
  - `process.env.VITE_V` → `"2"` (the `VITE_`-prefixed key **does** reach `process.env` in the test worker, and `import.meta.env`).
  - `process.env.NODE_ENV` → `"test"`; `process.env.VITE_USER_NODE_ENV` → `"production"`; `process.env.BROWSER` → `"foo"`.
  - `import.meta.env` = `{BASE_URL, DEV, MODE:"test", PROD, SSR, VITE_USER_NODE_ENV:"production", VITE_V:"2"}`.
- So for this repo: deleting the `node:fs` mock does not expose `OMLX_BASE_URL` / `OMLX_API_KEY` (no `VITE_` prefix) to tests through vitest startup. Vitest's own env-file read occurs in the vitest main process via real `fs`, independent of the `vi.mock("node:fs")` in the worker setup (which applies only to modules loaded in the worker). Only `VITE_*`, `VITE_USER_NODE_ENV`, `BROWSER`, `BROWSER_ARGS` from a root `.env*` are affected, and the repo's source files are not known (by me) to read these; I did not grep the repo for `VITE_`/`BROWSER`.

## Gaps and caveats
- No documented pi convention for per-extension configuration exists in the docs I read (`extensions.md`, `configuration.md`, `providers.md`, `environment-variables.md`); I did not read every docs file line by line, only grep and targeted reads.
- Minified-bundle grep cannot exclude an obfuscated `.env` read; no evidence of one.
- `pi install git:` behavior not executed; the "untracked files not copied" point is inferred.
- Joel's `direnv.toml` (`load_dotenv`) not inspected. direnv `dotenv` precedence versus already-set variables is not stated in the man page and was not tested.
- npm 11 docs page text for the always-excluded list could not be retrieved; npm-packlist README used instead (the package npm's `pack` uses).
- The `.env`-inside-`src/` packaging result comes from one scratch experiment with `files: ["index.ts","src"]`; the repo's `files` is the same shape for `src`.

## Addendum 1

**Cause confirmed.** One of my bash calls failed its `cd` to a scratch dir and the next commands ran in the repository, rewriting `package.json` (`files`), writing/removing `.npmignore` and `.gitignore`. I did not notice because the scratch `cd` and the work were in separate calls. My apologies; the Conductor's `git checkout` restored them. I confirmed `git status --short` now shows only `?? .pi/` and `?? openspec/changes/stop-loading-a-dotenv/`.

**Where each earlier experiment ran.**
- The §4 table rows (six rows, `npm pack --dry-run` with names): that call was a single bash call containing `T=$(mktemp -d); cd $T; ...; run ...; rm -rf $T`, so it ran in scratch. The sizes-only variant of the same matrix in an earlier call was also single-call scratch.
- The call whose `cd /tmp/tmp.X` failed ("No such file or directory") ran its `node -e` rewrite of `package.json`, its `.npmignore` / `.gitignore` writes and removals, and three `npm pack --dry-run` listings **in the repository**. Those listings (which showed `src/dotenv.ts`, no `.env`) are the ones that read the modified tree. They did not feed the table, but they were the source of the parenthetical sentence "the repo's current dry-run pack list showed no `.env`", which is now withdrawn and replaced as below.
- Vitest, tsx, Node `--env-file` and direnv experiments used `mktemp -d` / `/tmp` with the `cd` in the same call (vitest: one call, `cd $T` then run; tsx/Node: `cd /tmp` in same call). None touched the repo.

**Re-run, scratch, one call each, `cd` included** (npm 11.19.0; scratch dir was `/var/folders/.../tmp.7Ma95n96zN`, removed after):

| package.json / ignore setup | Tarball contained |
|---|---|
| `files: ["index.ts","src"]`, root `.npmignore` = `.env*` | index.ts, package.json, src/.env, src/a.ts |
| same `files`, root `.gitignore` = `.env` | same |
| same `files`, no ignore file | same |
| no `files`, no ignore file | .env, .env.local, index.ts, package.json, src/.env, src/a.ts |
| no `files`, `.gitignore` = `.env` | .env.local, index.ts, package.json, src/a.ts |
| no `files`, `.npmignore` = `src/` plus `.gitignore` = `.env` | .env, .env.local, index.ts, package.json |

Identical to the original table; no row changes and the conclusions about the scratch package stand.

**HEAD-exact check (new, scratch).** `git archive HEAD` into a scratch dir (so real `package.json`, `.npmignore`, `.gitignore`), with a root `.env` added (`SECRET=1`):
- HEAD `package.json` `files` = `["index.ts","src","README.md","LICENSE"]`; `.npmignore:31` is `.env*` (under `# config/env`); `.gitignore:2` is `.env`.
- `npm pack --dry-run`: LICENSE, README.md, index.ts, package.json and 16 `src/*.ts` files (including `src/dotenv.ts`), **no `.env`**; npm reported `total files: 20` (4 top-level + 16 `src/*.ts`). Michael's "19 files" differs by one from my count of 20 (I count LICENSE, README.md, index.ts, package.json + 16 src files = 20). I did not diff against his list; the likely cause is a one-file difference in the tree he archived (for instance a `src` file added or removed), not a `.env` difference. Both agree on the point that matters: **no root `.env` in the tarball.**
- Same tree with `.npmignore` and `.gitignore` both deleted: still no root `.env` (`total files: 20`), because `files` excludes it.
- Same tree with a `src/.env` added (ignore files present): `src/.env` **is** included (`total files: 21`).

**Agreement with Michael's measurement.** Yes, in substance: with HEAD's `files` allow-list, a root `.env` is not packed, with or without the `.npmignore` `.env*` line. That matches my scratch result "files only" and the HEAD-exact run. The file count differs (my 20 vs his 19); unresolved, and not material to the `.env` question.

**Corrected statements.** (1) The sentence about the repo's own dry-run is replaced by the HEAD-exact result above. (2) All other findings in this report are unchanged. (3) The `.npmignore` `.env*` and `.gitignore` `.env` lines do not change what npm packs for a root `.env` under the current `files`; `.gitignore` still governs `git add`, and neither protects a nested `src/.env`.
