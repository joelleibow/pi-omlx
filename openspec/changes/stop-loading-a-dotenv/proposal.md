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
poisoned `.env` gives 93/93 and an exit-0 `npm run check` whether the mock is present or removed,
so no input can make its scenario fail (Michael, "What is settled").

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
- `test/dotenv.test.ts` goes with the module it tests. The suite drops from 12 files and 95 tests
  to 11 and 93 (Michael, "Counts move"; both research addenda measure the 12/95 baseline at
  `c5581d6`).
- The `vi.mock("node:fs")` block in `test/isolation/worker-setup.ts` is removed, together with the
  scenario "A .env beside index.ts does not reach the suite" in `openspec/specs/test-isolation`.
  With no reader left, no input can make that scenario fail, and a test that cannot fail proves
  nothing (Michael's ruling, on Joel's rule). The guard in the same file stays, because callers'
  exports still reach the suite.
- `test/isolation/global-setup.ts` keeps its five `CALLER_ENV_KEYS` and loses the `.env.example`
  citation in the comment above them, which would otherwise name a deleted file (Michael, settled
  by the provenance rule).
- `.env.example` is deleted, which is the card's second acceptance criterion (quoted in Michael's
  decision 1), and the direnv guidance that replaces it lands in the docs pass under Joel's
  standing ruling that documentation never blocks a feature (Michael, decision 6).
- `.gitignore` keeps its `.env` line, and `.npmignore` is left alone. An ignore entry points
  nobody at a `.env`; it keeps a key out of git, and `files` already decides what npm packs
  (Michael's ruling, with Chidi Addendum 1's measurements behind it).

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
  Environment", with the same text and both overlay scenarios. That new name is with Michael.

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
  `PathLike` imports it leaves unused), `test/isolation/global-setup.ts` (one comment).
- **Specs:** the new `environment-configuration` capability, and a delta to `test-isolation`.
- **Users:** the breaking case above, bounded by `credential-resolution`. One semantic shift is
  worth naming: the `.env` reached every pi session started in the clone, while direnv reaches only
  launches under the project directory. ADR 0001 makes `/login` the global mechanism, so nothing a
  spec promises is lost (Michael, "Behavior change").
- **Documentation this change makes false,** for the docs pass and not for this diff:
  `ARCHITECTURE.md:71` (the worker setup keeping a `.env` out of the run), `CONTRIBUTING.md`'s
  script environment guidance, and the `.env` guidance in `CONFIGURATION.md` and `README.md`
  (Michael, "Traps"). `AGENTS.md` needs nothing.
- **Left to the council and the design:** whether the direnv guidance has contributors put an
  `.envrc` inside the clone, and so whether `.gitignore` gains `.envrc` beside `.env` (Michael's
  one open point, with his choice stated). This proposal does not settle it.
- **With Michael:** the name of the re-added `test-isolation` requirement, which the validation
  mechanism above forces and his ruling did not name. The draft carries "Every Run Isolates Itself
  From Operator State And Caller Environment".
- **Baseline:** `npm run check` green at `c5581d6`, with Biome over 39 files, TypeScript clean, and
  Vitest at 12 files and 95 tests (Eleanor's baseline rerun and Addendum 1; Chidi's addendum agrees
  on HEAD's `files`, `.gitignore` and `.npmignore`).
