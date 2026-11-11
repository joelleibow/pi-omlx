# Proposal

## Why

`npm run check` fails at HEAD `c4d51ff`. Joel ruled that it must pass (`owner-rulings.md` §1): "It's incredibly important that we be able to run tests and see them pass. If they don't then something is wrong and we have no idea what." Biome is clean there, and the suite is green. The ten errors belong to `tsc --noEmit` (`research-eleanor.md`, "HEAD typecheck failures"). The rename took "the same ten failures as `c27fba9`" as its typecheck evidence, and it recorded the repair as a separate change (archived rename `design.md`, Non-Goals; `michael-orientation.md` §1). This is that change. Until it lands, every later gate compares failures against the previous ones instead of requiring none.

## What Changes

Joel's second ruling puts this card first. It also says the option text that described the work is Janet's proposal, not a ruling on mechanism: bump pi-ai to `^1.5.2`, switch `src/stream.ts` to a `TranscriptContext`, narrow the provider test (`owner-rulings.md` §2). The research arrives at the same three edits. What each one rests on:

### 1. The devDependency follows pi's pi-ai

`package.json` asks for `@earendil-works/pi-ai@^0.80.9`, and the lockfile resolves 0.80.10 at the top level. `@earendil-works/pi-coding-agent@1.5.2` pins pi-ai at exactly `1.5.2` and carries its own nested copy (`research-chidi.md` §1.1, §1.5; `research-eleanor.md`, "Dependency and TypeScript configuration"). The repository's own install of pi-ai is the dev copy. Two of the ten errors come from that split: `src/provider.ts:35` compares an `AssistantMessageEventStream` from 0.80.10 against the one 1.5.2 declares, and `:37` passes a `Model<Api>` whose `compat` union differs (`research-eleanor.md`, "HEAD typecheck failures"). The devDependency moves to `^1.5.2`. Eleanor measured the result in a scratch copy: `npm ls` dedupes to one 1.5.2, both provider errors go, and two TS2741 arrive at `src/stream.ts:126,209` while the eight TS2339 in `test/provider.test.ts` stay, so the total holds at ten, the number HEAD prints (Michael's PL7 measurement counts ten there; `research-eleanor.md`'s "nine errors remain" miscounts).

pi never loads the dev copy. Its loader maps both `@earendil-works/pi-ai` and `/compat` to pi's own extension view (`research-chidi.md` §1.2). tsc is the dev copy's only consumer. The check goes green exactly when the dev copy matches the one pi runs. `michael-orientation.md` trap (a) and §4 name the cost: nothing in the repository ties the two ranges together, so a dependabot pull request that moves one package turns the check red until someone moves the other.

### 2. `src/stream.ts` takes the context pi now hands it

pi-ai 0.86.0 changed provider-facing stream inputs from `Context` to a normalized `TranscriptContext` (`research-chidi.md` §5). A non-exported unique symbol brands that type, and `normalizeContext()` is the only function that produces one (`research-chidi.md` §2.1–2.2). In the scratch bump, `src/stream.ts:126` and `:209` fail with TS2741: a `Context` carries no brand to supply (`research-eleanor.md`, "Scratch bump measurement"). The production edit changes three type tokens there (`michael-orientation.md` trap c). It has no runtime effect: pi hands the wrapper a `TranscriptContext` already, and the wrapper forwards it unchanged.

### 3. The provider test narrows the model union

pi-coding-agent 1.5.2 types a provider's `models` as `ProviderModelConfig`, a three-member union discriminated on `type`. Only the chat member declares `reasoning` and `compat` (`research-chidi.md` §4.2). `test/provider.test.ts` reads both on the bare union at `:49-53,60,66,72`, which is eight TS2339 (`research-eleanor.md`, "Type use and test inputs"). The chat member's `type` is optional, and pi normalizes an omitted `type` to `"chat"` (`research-chidi.md` §4.2, citing `types.d.ts:1530`). So the narrowing has to admit an entry with no `type` at all. `src/provider.ts` builds exactly those entries (`michael-orientation.md` trap b; `research-chidi.md` §4.3).

### 4. What proves it

The gate is `PI_CODING_AGENT_DIR=<scratch directory> npm run check` exiting 0, with the run and its output recorded (`brief-bambadjan-proposal.md`; `michael-orientation.md` trap d and call #2). The prefix matters, because the scripted check runs vitest against the agent directory it resolves, and Joel ruled that no test run writes there (`owner-rulings.md` §3). Michael ran the prefixed command against a scratch copy of the fix. He measured exit 0, 11 files and 84 tests, and an unchanged `~/.pi/agent/cache/omlx-models.json` (trap d).

Nothing here is **BREAKING**. The extension's behaviour, its provider id and its public surface do not move. The check is a property of the repository.

## What This Change Does Not Do

- The change leaves `.github/dependabot.yml` alone: no grouping of `@earendil-works/*`. Michael's orientation call #1 leaves it out, and the conductor set this change's scope the same way (`brief-bambadjan-proposal.md`). A per-package pull request that splits the two pi packages turns the check red at `src/provider.ts:35,37`. That is the state Joel asked for: something is wrong, and the errors say what.
- pi-ai's compat entry stays. `src/stream.ts:23` takes `openAICompletionsApi` from `/compat`. The 0.80.0 changelog says compat and the loader alias will be removed in a future release, with a migration guide (`research-chidi.md` §5; `michael-orientation.md` trap e). That migration is not this change.
- The tests do not isolate themselves yet. The suite writes `cache/omlx-models.json` under the agent directory it resolves (`michael-orientation.md` §1, citing `src/catalog.ts:567` and `writeCatalogCache`), and a separate card isolates the suite. Until it lands, every run sets `PI_CODING_AGENT_DIR` by hand (`owner-rulings.md` §3).
- Nothing new gets suppressed or cast. The baseline holds zero `@ts-ignore`, `@ts-expect-error` and `biome-ignore` (`michael-orientation.md` trap b). The four `as unknown as` casts in the tests and the two `model as Model<"openai-completions">` casts at `src/stream.ts:125,208` are pre-existing, and they stay. `test/provider.test.ts:94` already dodges the union with `as unknown as Record<string, unknown>`. Copying that shape onto the four assertions would put a cast in place of the fix.
- No Markdown in the diff beyond the change's own `tasks.md`. Michael's implementation gate treats another Markdown file as a finding (`michael-orientation.md` §1). `CONTRIBUTING.md:20` and `README.md:25` mention the check without naming a pi version, so nothing in them goes false.

## Capabilities

### New Capabilities

- `verification`: three subjects, which are the repository's `check` script passing, one installed `@earendil-works/pi-ai` at the version `pi-coding-agent` pins, and the agent directory a verification run may touch (`council.md`, "Michael's Rulings"). It rests on Joel's first and third rulings (`owner-rulings.md` §1, §3), the script at `package.json:15` (`research-eleanor.md`), and the isolation Michael measured (`michael-orientation.md` trap d).

### Modified Capabilities

None. The three living capabilities hold requirements this change does not move: the provider id `omlx`, the `PI_OMLX_DEBUG` variable with its `[pi-omlx]` prefix, and the greps that keep the old name out of code and metadata (`openspec/specs/`; `michael-orientation.md` §1). This change adds no non-Markdown text for the rename's token grep to catch.

## Impact

Files, by kind:

- Metadata: `package.json` for the pi-ai devDependency. `package-lock.json` gets regenerated with `npm install`, not hand-edited, and Eleanor's scratch shows the tree deduping to one 1.5.2 (`research-eleanor.md`).
- Code: `src/stream.ts`, three type tokens (`michael-orientation.md` trap c). `src/provider.ts`, `src/repeat-stop.ts`, `src/stream-writer.ts`, `src/stream-events.ts` and `index.ts` need no edit (`research-eleanor.md`, "Type use and test inputs"; `michael-orientation.md` trap c).
- Tests: `test/provider.test.ts` for the narrowing, and `test/stream.test.ts`, where the two contexts it hands the wrapper get wrapped in `normalizeContext` (`council.md`, Synthesis).

Dependencies: no runtime dependency is added or removed. The pi packages stay in `peerDependencies` with `"*"`, and out of `dependencies`, as pi's docs prescribe and as they already are (`research-chidi.md` §1.4; `michael-orientation.md` §1). Only the devDependency's range moves.

Outside the repository: nothing. The change writes no file under `~/.pi/agent`, and the run's isolation is what keeps that true (`owner-rulings.md` §3).

Risks and checks:

- The green check is a coincidence of two caret ranges resolving to the same number today, and nothing structural ties them (`michael-orientation.md` trap a and §4). This proposal takes Michael's answer. tsc is the detector, the split surfaces as the two `src/provider.ts` errors, and that is "something is wrong and we know what" rather than silence. Dropping the pi-ai devDependency would remove the duplicate by construction, at the cost of leaning on npm's hoisting.
- The rule that this change adds no new cast or `any` is checked on the diff, and `design.md` carries that check rather than a living requirement. The spec's suppression grep cannot see a copied `as unknown as Record<string, unknown>`, so the diff check is what catches it (`michael-orientation.md` trap b; `council-matt-pass1.md`; `council-neil-pass2.md` M4).
- The spec's third requirement holds only while the variable is set by hand. The isolation card turns that precondition into a suite that isolates itself, and modifies the requirement instead of contradicting it (`owner-rulings.md` §3).
- The cache file's modification time can move while pi is running. Michael saw `~/.pi/agent/cache/omlx-models.json` change between observations with no unprefixed run from him (`michael-council-rulings.md`, the aside under his chatModel ruling). `design.md` records the mtime immediately before and after a run, or compares against a copy, so the scenario does not flake.

## Open Questions

None remain. The council answered the four this proposal carried, and Michael ruled the one dispute they left him (`council.md`).

1. **Caret or exact pin.** `^1.5.2` for the pi-ai devDependency, matching pi-coding-agent's caret. An exact pin on pi-ai alone does not stop the drift, because pi-coding-agent pins pi-ai exactly (`council.md`, Synthesis).
2. **Narrowing helper or inline guard.** One throwing `chatModel(m)` helper in `test/provider.test.ts`, which throws unless `m.type === undefined || m.type === "chat"`. `isModelType()` does not accept a config entry (Chidi Addendum 1, TS2345; `council.md`, "Michael's Rulings").
3. **The stream test's mocks.** They keep `Context`, and every context the test hands the wrapper comes from `normalizeContext` (`council.md`, Synthesis).
4. **`src/repeat-stop.ts`.** It keeps `Context` (`council.md`, Synthesis).

The fifth, dependabot grouping, is gone from this list. The conductor's scope settles it, and "What This Change Does Not Do" carries the decision.
