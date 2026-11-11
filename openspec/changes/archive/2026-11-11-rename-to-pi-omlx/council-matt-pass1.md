# Council — matt, pass 1

Run `3b7e4b32-1db8-4d8d-b3a7-9c0c3e359e44`.

## Recommendation

Settle the six questions this way:

1. **README install line:** use `pi install git:github.com/joelleibow/pi-omlx`. `docs/CONFIGURATION.md:9` should remove the same source string. Uninstall is matched by source, and a git source's identity is `git:host/path`, so `pi-omlx` on its own would not match it. Do not write `npm:pi-omlx` before it is published: the name is free and unreserved, and anyone who publishes it first would have this README install their code.
2. **Install-path lines:** delete the `~/.pi/packages/<name>` lines and the `provider-debug.log` reads in both scripts, and CONTRIBUTING:27. Do not repoint them. The npm path is wrong for a local package, which loads where it sits, and for the git source in answer 1. Nothing writes that log. Deleting them changes script behavior, so it is its own step, not part of the rename.
3. **Debug variable alias:** none. `PI_OMLX_PICKER_DEBUG` is undocumented and untested, and an alias would give one fact two homes. Name the change as a behavior change.
4. **Singleton key in the test:** the test should import the key, as a structure-only step with tests green before and after. The rename then becomes a one-line edit. The key is process-local and is not a contract, so the test does not need its own copy.
5. **LICENSE:** leave it untouched. Nothing breaks without Joel's line. Adding it is his choice to make (see owner decisions).
6. **The `picker` keyword:** delete it and add nothing. Keywords do nothing while the package is unpublished, so a replacement fails the deletion test.

The proposal and specs need these changes before design:

- **package-identity spec, the broad clause:** replace "No artifact this repository produces SHALL be named pi-omlx-picker" with a check someone can run. A case-insensitive `git grep` for `pi-omlx-picker` and `picker` over tracked files returns nothing, with `openspec/` excluded. Those change artifacts quote the old name everywhere and would trip the check if committed.
- **package-identity spec, the publish scenario:** cut "or published". Publishing is out of scope. `npm pack --dry-run` showing `pi-omlx` is the check.
- **package-identity spec, missing requirements:** add one covering answers 1, 2 and 6, so the design builds nothing the specs don't ask for. Install and uninstall instructions must name the one source that resolves to joelleibow/pi-omlx, and no document or script may name a pi install path the package does not use.
- **diagnostics spec:** the code behind it has no test today, so each scenario needs a new test that fails if the behavior is deleted. "Set" must keep the truthiness rule in today's `src/debug.ts:18`, not a new one. The edge cases are unset, an empty string and `0`.
- **provider-access spec:** only the third scenario (credentials keyed `omlx`) is this repository's to prove. The first and second rest on pi's behavior. This machine also has no `omlx` credential, so "an existing login keeps working" can't be shown here. Either say the existing auth-storage tests cover it, or trim the spec to that requirement.
- **Proposal, directory move:** the move must come after the Marbleization run finishes. This session's cwd and every brief path are absolute paths under `~/Projects/pi-omlx-picker`, so moving the directory mid-run breaks the pipeline's own paths.

## Evidence

- pi identifies a git source as git:host/path and an npm source by its name, and uninstall matches on that identity (research-chidi.md Q1.1, Q1.6, Q3.3; michael-orientation.md §3.1)
- pi-omlx is unpublished and npm does not reserve the name (research-chidi.md Q3.3; michael-orientation.md trap h)
- The install-path premise is false and nothing writes provider-debug.log (michael-orientation.md trap f; research-chidi.md Q1.1, Q1.11)
- The debug variable is undocumented and untested (michael-orientation.md trap a)
- The singleton key is process-local and duplicated as a literal in the test (michael-orientation.md trap b; research-eleanor.md)
- MIT does not require Joel's line (research-chidi.md Q4.2-4.3)
- Keywords only affect npm and gallery discovery (research-chidi.md Q3.1-3.2)
- This machine has no omlx key in auth.json (research-chidi.md Q2.5; michael-orientation.md §1)

## Assumptions

- [unverified] The exact `git:github.com/...` install syntax works in pi 1.5.2 (end-to-end git install never run)
- [unverified] joelleibow/pi-omlx is public, so a git install needs no auth
- [unverified] The uninstall command is `pi remove`, not `pi uninstall` (Chidi cites only `pi remove`)
- [unverified] The scripts keep a purpose once the path derivation is deleted (debug-pi.ts:73-75 not read)
- [unverified] pi's loader ignores a named export from index.ts
- [verified] Every artifact path is absolute under the old directory

## Risks

- Before publish, a README with `npm:pi-omlx` installs whoever claims that name first.
- CONFIGURATION says `pi remove pi-omlx` after a git install: the name does not match `git:github.com/joelleibow/pi-omlx`, so nothing is removed.
- The directory moves while the conductor still runs: later briefs and gates read paths that no longer exist.
- Repointing the scripts at `~/.pi/agent/npm/node_modules/pi-omlx`: Joel's local install never lives there, so the scripts read a path that doesn't exist.

## Confidence

medium: The answers to questions 3 through 6 rest on measured evidence. Questions 1 and 2 depend on git-source syntax, repo visibility and the uninstall verb, none of which was verified.

## Challenge claims

1. A README line naming an unpublished npm package is a security exposure, not just a stale line.
2. Repointing the install-path lines leaves them false; deleting them is the only true option.
3. The directory move must wait until after the Marbleization run, not just come last in the tasks.

## Owner decisions

- Joel's copyright line in LICENSE: I would leave it out of this change.

## What would change my mind

- Chidi shows git-source install fails, or the repo is private: then README should say it installs from a local clone until the package is published.
- Eleanor shows the scripts' main job depends on the installed path: then repoint them to the resolved settings source instead of deleting.
- Evidence that pi treats extra named exports from index.ts as extension entries: then the test keeps the literal, with a one-line comment saying why.
