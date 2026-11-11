# Council Synthesis

## Question and Scope

Joel ruled that the package is `pi-omlx` (R1), that it lives in a standalone `joelleibow/pi-omlx` with `PeachlifeAB/pi-omlx-picker` kept as `upstream` (R2), and that the clone directory becomes `~/Projects/pi-omlx` while he edits pi's `packages` entry himself (R3) (`owner-rulings.md`). The council's question is narrower: what does that rename edit, and what does it delete? `proposal.md` left six open questions, and one of its three specs put Markdown requirements in front of a gate that refuses them.

The council worked from `proposal.md` and the three specs; `research-chidi.md` and its Addendum 1, for pi 1.5.2's package identity, loader, git install and named-export behavior; `research-eleanor.md` and its Addendum 1, for the tracked old-name inventory and the two debug scripts; `michael-orientation.md`, an orientation consult and not a gate; `owner-rulings.md`; and the PL4, PL7 and implementation-gate sections of `~/.pi/agent/agents/michael-the-architect.md`.

Neil and Matt each sat three passes. Pass 1 was independent. Passes 2 and 3 cross-examined the other advisor's recommendations, and an advisor's later report holds wherever he says his position moved. Neither advisor read the repository or its tests; where a claim needed code or documentation evidence, the advisor asked for an addendum, and the two Addendum 1 reports carry it.

Publishing `pi-omlx` to npm is outside this change (conductor's brief; `proposal.md`, What This Change Does Not Do), so the council did not weigh it.

## Perspectives & Trade-offs

### What both advisors agreed on

Pass 1 settled six questions the same way for both.

- `README.md:19` installs from `git:github.com/joelleibow/pi-omlx`, and `docs/CONFIGURATION.md:9` uninstalls with that same full source. A git package's identity is `git:host/path`, so a bare `pi-omlx` matches nothing, and `pi uninstall` is a real alias for `pi remove` (`research-chidi.md` Q1.1, Addendum 1 (1)). Nothing names `npm:pi-omlx` before publication: the name is free and unreserved, and the first publisher would own what the README installs (`michael-orientation.md` trap h).
- The `~/.pi/packages/<name>` probes and the `provider-debug.log` reads in `scripts/debug-pi.ts` and `scripts/debug-omlx.ts` are deleted, not repointed: pi 1.5.2 installs managed npm packages under `<agentDir>/npm/node_modules/<name>`, a local package loads where it sits, and nothing writes that log (`michael-orientation.md` trap f; `research-eleanor.md` Addendum 1).
- No alias for `PI_OMLX_PICKER_DEBUG`. It is undocumented and untested (`michael-orientation.md` trap a), and an alias would give one fact two homes.
- `test/index.test.ts:13` imports the singleton key from `index.ts` instead of repeating the literal; pi's loader takes the default factory and ignores named exports beside it (`research-chidi.md` Addendum 1 (2)).
- `LICENSE` is untouched, and the `picker` keyword is deleted with no replacement (`research-chidi.md` Q4.2, Q3.1).
- Every Markdown requirement leaves `specs/` for a docs pass after the implementation gate.
- The directory move happens after the Marbleization run finishes.

The last two began as disagreements. The disputes below are how the advisors reached them.

### Where they disagreed, and where each dispute landed

**Markdown inside `specs/`.** Both advisors proposed spec requirements for the README and CONTRIBUTING edits in pass 1, and both withdrew them in pass 2. PL7 says Markdown documentation is not a task while requiring a task for every requirement, and the implementation gate treats any Markdown file in the diff other than `tasks.md` as a finding, so a requirement about a README deadlocks the two gates (`council-neil-pass2.md` M1; `council-matt-pass2.md` N1, which withdraws Matt's own pass-1 install-line requirement).

**How the naming check is worded.** Matt's pass-2 version was one case-insensitive `git grep` over tracked files with `openspec/` excluded. Neil's M2 added that `*.md` must be excluded as well while the README still carries the old name, and Michael's measurement (22 old-name lines, no false positives in the lockfile) made the grep runnable. Matt's pass 3 then found a hole in his own wording: after a plain find-and-replace, `scripts/debug-pi.ts:18` reads `pi-omlx`, no probe line contains `picker`, and the check passes while the probes survive. A separate scripts requirement answers that (`council-matt-pass3.md` Q1). Neil's pass 3 preferred the resulting division (one grep, one package-name requirement, one scripts requirement) over separate clauses for the keyword, the singleton key and the helper (`council-neil-pass3.md` P1).

**What the diagnostics spec may claim.** Matt's pass 1 wanted the spec to keep "the truthiness rule at `src/debug.ts:18`". Neither advisor had read that line's operator, and `"0"` is truthy as a JS string, so the wording would enshrine an unmeasured rule (`council-neil-pass2.md` M4; `council-matt-pass3.md` Q3). They converged on the predicate staying as it is, with tests pinning unset, the empty string and `0` to whatever it returns today, read from the code during design.

**Which provider scenarios survive.** Matt's pass 2 qualified the first two scenarios and marked them Joel's to observe. Neil rejected that as manual toil for pi's own host runtime, and added that testing only auth-storage leaves vitest green if registration drifts to another id (`council-neil-pass3.md` P2). Matt dropped the Joel-observable version in pass 3 and kept two automated extension-boundary scenarios (`council-matt-pass3.md` Q2). One gap remains: neither advisor verified that `test/index.test.ts` and `test/auth-storage.test.ts` assert the registered id and the credential key today, so design confirms those assertions or the tasks add them.

**Where the helper rename sits.** Matt's N4 split `pickerDebug` → `omlxDebug` out of the variable and prefix rename: renaming an internal symbol is a structure step, tests green before and after, while the variable and prefix change behaviour and need new tests (`council-matt-pass2.md` N4). Neil did not contest it.

## Synthesis & Recommendation

The council recommends this position, and `proposal.md` and the three specs are amended to it.

1. **The install and uninstall instructions name one source.** `README.md:19` becomes `pi install git:github.com/joelleibow/pi-omlx`; `docs/CONFIGURATION.md:9` keeps `pi uninstall` and passes that same full source. Nothing names `npm:pi-omlx` while the package is unpublished (`council-neil-pass1.md` 1; `council-matt-pass2.md` M6).
2. **The scripts lose their dead probes, and that is a behaviour change.** The `~/.pi/packages/<name>` probes and `provider-debug.log` reads go, with nothing in their place, and both scripts keep their session, cache and OMLX diagnostics. debug-pi's timeline loses provider-row matching that never worked. `CONTRIBUTING.md:27` follows in the docs pass (`council-matt-pass3.md` Q1).
3. **The debug variable renames with no alias.** `PI_OMLX_DEBUG` and the prefix `[pi-omlx]`, the predicate at `src/debug.ts:18` unchanged, and new tests covering unset, the empty string and `0`, each pinned to what that predicate returns today (`council-neil-pass2.md` M4; `council-matt-pass3.md` Q3).
4. **The helper renames as structure.** `pickerDebug` becomes `omlxDebug` in a step of its own, separate from the variable and prefix rename (`council-matt-pass2.md` N4).
5. **The test imports the singleton key** as a named export from `index.ts` (`council-neil-pass3.md` P1; `research-chidi.md` Addendum 1 (2)).
6. **`LICENSE` stays untouched, and the `picker` keyword goes with no substitute** (`council-neil-pass1.md` 5–6; `council-matt-pass1.md` 5–6).
7. **Markdown leaves `specs/`.** README, CONTRIBUTING and `docs/CONFIGURATION.md` are written in the docs pass after the implementation gate (`council-neil-pass2.md` M1; `council-matt-pass2.md` N1).
8. **package-identity keeps "Package Name Is pi-omlx"**, checked with `npm pack --dry-run` and with "or published" cut; adds one requirement that no tracked non-Markdown file outside `openspec/` contains `pi-omlx-picker` or `picker`, case-insensitive; and adds one requirement that the scripts neither probe `~/.pi/packages/` nor read a `provider-debug.log`. No separate requirement pins the singleton key's string (`council-neil-pass3.md` P1; `council-matt-pass3.md` Q1).
9. **provider-access keeps the two scenarios this repository can test** (the extension registers its provider under `omlx`; it reads credentials keyed `omlx`) and drops the ones that rest on pi's host runtime. `PROVIDER_KEY` (`src/auth-storage.ts:4`) is the one place the id lives (`council-neil-pass3.md` P2; `council-matt-pass3.md` Q2).
10. **The directory move happens after the Marbleization run finishes**, not inside the implementation tasks, because every brief path and the session's working directory sit under the old absolute path (`council-matt-pass1.md`, Proposal and specs need these changes; `council-neil-pass1.md` risk 2).

Design has four things left to measure, because no advisor settled them:

- What the predicate at `src/debug.ts:18` returns for the empty string and for `0`.
- Whether `test/index.test.ts` and `test/auth-storage.test.ts` already assert the registered id and the credential key.
- Whether registration reads `PROVIDER_KEY` today, which "one place the id lives" needs.
- Whether both scripts still print their session, cache and OMLX sections. The grep checks prove the probes are gone, not that the rest survived.

## Accepted & Rejected Feedback

Adopted:

- Both advisors' pass-1 answers on the install source, the deleted probes, no debug alias, the imported singleton key, the untouched `LICENSE` and the deleted keyword (`council-neil-pass1.md`; `council-matt-pass1.md`).
- Matt's N1 and Neil's M1: no requirement in `specs/` may be about a Markdown file.
- Neil's M2 addition of the `*.md` exclusion, and Matt's pass-3 correction that the probes need their own requirement (`council-matt-pass3.md` Q1).
- Neil's P1, which folds the keyword, the singleton key and the helper into the single grep rather than one clause each.
- Neil's M3 and Matt's pass-1 publish note: "or published" cut, `npm pack --dry-run` as the check.
- Matt's Q3 and Neil's M4: the predicate stays unnamed until design reads it; the tests pin the three edge values.
- Matt's Q2 and Neil's P2: two extension-boundary provider scenarios, no manual live-login verification.
- Matt's N4: the helper rename is its own structure step.
- Matt's N5 and the two Addendum 1 reports, which verified the uninstall alias, the git source form, the named-export behavior, and that both scripts keep a purpose once the probes go.

Rejected or set aside:

- Repointing the scripts at `~/.pi/agent/npm/node_modules/pi-omlx`. Both advisors rejected it in pass 1: Joel's local install never lives there, and the log is never written (`council-neil-pass1.md`, challenge 1; `council-matt-pass1.md` 2).
- A separate requirement per occurrence: the keyword, the singleton key, the helper. Replaced by the single grep (N1, P1). A requirement asserting the key equals `pi-omlx/loaded` fails the deletion test, because the key is process-local and unpersisted (trap b).
- Spec requirements covering the README, CONTRIBUTING and CONFIGURATION edits. Withdrawn by both advisors (M1, N1).
- Marking provider-access's host-runtime scenarios as Joel's to observe. Set aside: PL7 reserves that mark for effects code cannot observe, and this change's two scenarios are testable (`council-neil-pass3.md` P2; `council-matt-pass3.md` Q2).
- "Keep the truthiness rule at `src/debug.ts:18`." Replaced by the unread predicate and measured edge values (M4, Q3).

## Michael's Rulings

None. After pass 3 the advisors disputed nothing, so no claim went to Michael and he ruled on no dispute. Every position in this file is an advisor's, unless it points at one of Joel's rulings in `owner-rulings.md`. `michael-orientation.md` is his orientation consult, which the council used for its traps and its file and line measurements; it settles no dispute and rules on nothing.

Joel's two rulings of 2026-11-11 at the PL2 gate are separate from the council's work and newer than it; they are recorded in `owner-rulings.md` and marked under Owner Decisions Required above.

## Owner Decisions Required

Both were ruled on 2026-11-11 at the PL2 gate; each ruling is in `owner-rulings.md`.

**Repository visibility — ruled: public.** `joelleibow/pi-omlx` was private when the council sat: `gh repo view` reported PRIVATE, an unauthenticated `git ls-remote` failed, `git:github.com/...` clones over HTTPS, and pi handles no credentials of its own (`research-chidi.md` Addendum 1 (1)). The README line is the same either way, so the real choice was visibility, which is user-facing and hard to reverse. Matt recommended making the repository public; if it stayed private, the README says the install works only with GitHub access, for example after `gh auth setup-git` (`council-matt-pass2.md` N3). Neil picked the same public repository and documentation, and offered the SSH form `git:git@github.com:joelleibow/pi-omlx` as the alternative for a private one (`council-neil-pass1.md`, Owner decisions). **Ruled:** public, with the install line unchanged and no access sentence; the same ruling claims the npm name with a `0.0.0-alpha` stub Joel publishes himself (`owner-rulings.md`, "Repository visibility and the npm name (PL2)").

**Joel's copyright line in `LICENSE` — ruled: unchanged.** MIT permits an added line, `Copyright (c) 2026 Joel Leibow`, and requires nothing of the kind (`research-chidi.md` Q4.3). Both advisors would leave it out of this change (`council-neil-pass1.md` 5; `council-matt-pass1.md`, Owner decisions), and `michael-orientation.md` §3.3 defaults to the same. It costs nothing either way and changes nothing else here. **Ruled:** `LICENSE` stays as it is (`owner-rulings.md`, "LICENSE (PL2)").

With visibility public, the docs pass adds no access sentence to the README, which was the only thing either decision reached (`council-matt-pass2.md` N3).

**Out of scope, not decisions.** Both advisors raised two findings that belong to a later change, and neither is part of this one: `scripts/debug-pi.ts:79-97` reads `~/.pi/config.json` where pi 1.5.2 keeps `<agentDir>/settings.json`, and `CONTRIBUTING.md` documents `mise run` tasks (`verify`, `debug:pi`, `debug:omlx`, `smoke:omlx`) with no tracked task definition behind them (`council-neil-pass2.md` and `council-matt-pass2.md`, Out of scope findings, citing `research-eleanor.md` Addendum 1).
