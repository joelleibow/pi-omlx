# Proposal

## Why

The extension sets its own environment from a file. `index.ts:3,10` imports and calls
`loadDotenvFromExtensionDir(import.meta.url)` when it starts, and `src/dotenv.ts` finds the `.env`
beside the entry file and merges it into `process.env` (Eleanor, "Existing dotenv path and
impacts"). Nothing in pi asks for that. pi's docs name `settings.json`, `auth.json`, `/login` and
"Set the variable before starting Pi"; they describe no per-extension configuration file and carry
no `.env` guidance at all (Chidi §1). Joel configures a project through direnv instead, "which
already gives scripts their environment without touching pi" (owner-rulings §1, the card's
context). The extension's own read duplicates a channel he already runs.

The read is finding 3 of the 2026-11-11 ponytail audit, which Joel's triage called must-fix, and he
opened this card to remove it (owner-rulings §1). PR #8 neutralized the same read for the suite
with a `node:fs` mock and left the deletion here: "Deleting the loader stays on its own card"
(archived `isolate-the-suite-from-the-agent-directory/owner-rulings.md` §5, quoted as Michael's
decision 2). This card removes the loader. The mock goes with it, because Michael measured that a
poisoned `.env` gives a green suite and an exit-0 `npm run check` whether the mock is present or
removed, so no input can make its scenario fail (Michael, "What is settled").

## What Changes

- `src/dotenv.ts` is deleted, and `index.ts` loses the import and the startup call. Nothing in the
  extension reads a file to set environment variables (the card's first acceptance criterion).
- **BREAKING**: a `.env` beside `index.ts` no longer supplies `OMLX_BASE_URL`, `OMLX_API_KEY` or
  any other variable. A clone-installed user whose only credential came from that file now falls to
  "Nothing stored and nothing set registers the login-only provider", and `/login omlx` is the
  documented path. Two things bound it. `OMLX_BASE_URL` and `OMLX_API_KEY` apply only when no
  credential is stored (`credential-resolution`, ADR
  `docs/adr/0001-one-credential-decides-the-omlx-connection.md`), so a saved login is unaffected.
  And a published install never carried a `.env`: `package.json`'s `files` allow-list excluded it
  before this change (Chidi Addendum 1, HEAD-exact `npm pack --dry-run` with a root `.env` in
  place).
- `test/dotenv.test.ts` goes with the module it tests, taking its two tests with it, and one test
  lands in `test/index.test.ts` for the new capability. This proposal names what moves and not the
  suite's total, which the new test would make stale (Michael, C4 ruling).
- The `vi.mock("node:fs")` block in `test/isolation/worker-setup.ts` is removed, together with the
  scenario "A .env beside index.ts does not reach the suite" in `openspec/specs/test-isolation`.
  With no reader left, no input can make that scenario fail, and a test that cannot fail proves
  nothing (Michael's ruling, on Joel's rule). The guard in the same file stays, because callers'
  exports still reach the suite.
- `test/isolation/global-setup.ts` keeps its five `CALLER_ENV_KEYS` and loses the `.env.example`
  citation in the comment above them, which would otherwise name a deleted file (Michael, settled
  by the provenance rule).
- `.env.example` is deleted, which is the card's second acceptance criterion (quoted in Michael's
  decision 1). The direnv guidance that replaces it lands in the docs pass, beside
  `CONTRIBUTING.md`'s script tasks: an untracked `.envrc` in the clone exporting the two variables,
  then `direnv allow` (Michael, C4 ruling, under Joel's standing ruling that documentation never
  blocks a feature).
- `.gitignore` keeps its `.env` line and gains `.envrc` beside it, in the implementation diff,
  because the guidance above tells contributors to hold a key in an untracked `.envrc` in the clone
  and nothing else keeps it from `git add` (Michael, C5 ruling). `.npmignore` is left alone: an
  ignore entry points nobody at a `.env`, and `package.json`'s `files` already decides what npm
  packs (Chidi Addendum 1).

The change deliberately does not touch how the dev scripts get their configuration, beyond pointing
at direnv. `scripts/*.ts` read `process.env` directly and import neither `index.ts` nor
`src/dotenv.ts`, so they never received `.env` values through the loader and have nothing to lose
(Michael, "Scripts are unaffected"). The card puts the rest of their configuration out of scope
(owner-rulings §1).

## Capabilities

### New Capabilities

- `environment-configuration`: where the extension's environment comes from, which is the process
  it is started in and no file.

### Modified Capabilities

- `test-isolation`: "Every Run Isolates Itself From Operator State" loses the sentence keeping the
  `.env` beside `index.ts` out of the run's environment, and the scenario that asserted it. The
  other two scenarios and the two remaining requirements are unchanged. OpenSpec's strict
  validation refuses a `MODIFIED` block that omits a scenario the living spec still has ("a MODIFIED
  requirement replaces the whole block, so archive refuses to drop them"), so the delta removes the
  requirement and adds it back as "Every Run Isolates Itself From Operator State And Caller
  Environment", with the same text and both overlay scenarios (Michael accepted this rename).

A new capability carries the first acceptance criterion rather than an extension of
`credential-resolution`. That capability owns which credential decides the base URL, the key and
keyless-ness, and every one of its requirements speaks of what is "stored" or "set"; a rule about
where environment values come from would give it a second subject. None of the other five living
capabilities owns that subject either: `diagnostics` owns the debug predicate, `test-isolation` the
suite's distance from operator state, `verification` the check command, `provider-access` the
provider id, and `package-identity` the package name. The new spec also restores what the removed
`test-isolation` scenario gave up. Its scenario fails if a loader returns: the `.env`'s keys would
reach the environment, and the extension would fetch a catalog instead of registering the
login-only provider. That is the property the removed scenario lost once no reader existed.

`credential-resolution`, `diagnostics`, `provider-access`, `package-identity` and `verification`
were read for what must not change and are not modified by this change.

## Impact

- **Code removed:** `src/dotenv.ts`, `test/dotenv.test.ts`, `.env.example`.
- **Code edited:** `index.ts` (the import and the startup call, with the import grouping Biome
  reorders afterwards), `test/isolation/worker-setup.ts` (the `vi.mock` block, plus the `vi` and
  `PathLike` imports it leaves unused), `test/isolation/global-setup.ts` (one comment),
  `test/index.test.ts` (the new test, and the loader thunk its extension driver resolves after
  `withEnv`, design D5), `.gitignore` (one line).
- **Specs:** the new `environment-configuration` capability, and a delta to `test-isolation`.
- **Users:** the breaking case above, bounded by `credential-resolution`. One semantic shift is
  worth naming: the `.env` reached every pi session that loads the clone, while direnv reaches only
  launches under the project directory. ADR 0001 makes `/login` the global mechanism, so nothing a
  spec promises is lost (Michael, "Behavior change" and C4 ruling).
- **Documentation,** for the docs pass and not for this diff: `ARCHITECTURE.md:71` loses its clause
  about the worker setup keeping a `.env` out of the run, and `CONTRIBUTING.md` gains the direnv
  guidance. `README.md`, `docs/CONFIGURATION.md` and `AGENTS.md` stay as they are, since none of
  them mentions `.env` (Eleanor Addendum 3; Michael, C4 ruling and traps).
- **Settled in `council.md`:** where the proving test lives, how it loads a copy of the extension,
  and the `.envrc` line the direnv guidance needs. This proposal points there rather than repeating
  them.
- **Baseline:** `npm run check` green at `c5581d6`, Biome and TypeScript clean and the suite
  passing (Eleanor's baseline rerun and Addendum 1; Chidi's addendum agrees on HEAD's `files`,
  `.gitignore` and `.npmignore`).
