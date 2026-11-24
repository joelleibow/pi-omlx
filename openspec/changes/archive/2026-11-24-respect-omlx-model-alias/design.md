# Design

## Context

`proposal.md` states the problem, the cost Joel accepted and what this change excludes. This document adds only what is needed to build it.

**Pi's side.** Pi matches a model by `id` alone on both paths the bug names: `/model <arg>` through `findExactModelReferenceMatch`, ignoring case and taking the first listed match when one provider holds several (`model-resolver.js:155-156`, `:172-173`), and a stored `defaultModel` through `getModel`, byte-for-byte (`model-resolver.js:398`). `name` is consulted only by fuzzy and picker paths, and the picker searches provider, id and name and nothing else (`research-chidi.md` §1.2). Pi's model type has no alias field (§1.1). The wire sends `model.id` verbatim (§1.4).

**OMLX's side.** `/v1/models/status` keeps the directory name as `id` and adds `model_alias` when the base model has one (`server.py:3995-3996`). `/v1/models` lists the alias in place of the id (`server.py:3818-3823`). A request is resolved against folder names first, then profile ids, then aliases, so both names route (`engine_pool.py:2033-2070`). `model_settings.json` is keyed by directory name, with the alias as a field value (`research-chidi.md` §2). OMLX line citations in this change are to 0.8.2, the version researched (`research-chidi.md:8`); 0.8.3, installed on 2026-11-23, keeps the behavior of every cited path, at different line numbers.

**The code that has to change.**

- `src/catalog.ts` owns OMLX-to-Pi translation. `fetchModels` fetches and parses `/models/status` inside a `try` and `/models` inside the `catch`, and each branch repeats the same overlay-then-defaults-then-clamp block (`catalog.ts:302-368`). The overlay is looked up as `byModel[model.id]` (`catalog.ts:541`). `toProviderModel` maps `id: m.id` and `name: m.displayName ?? m.id`; `OmlxModel` carries no directory name and no alias (`research-eleanor.md`, "Pi model mapping and refresh/storage", "Fetch ordering and fallback").
- `index.ts` shapes the request: `before_provider_request` finds the session's model in the provider list by id (`index.ts:44-65`; the lookup at `:54-56` and the early return at `:59`) and writes the thinking controls only when it finds one.
- `src/debug.ts`'s `omlxDebug` redacts and truncates top-level string values only (`src/debug.ts:14-20`), so a nested record keeps an exact alias.

The decisions that bind the change are `michael-orientation.md` §1 (D1–D9) and `council.md` R1–R15. This design adds no decision to them, only mechanism, and it names where each ruling lands.

## Goals / Non-Goals

**Goals:**

- Pi knows an aliased OMLX model by its alias, on the status path and the `/models` fallback, so `/model <alias>` and a saved default of the alias resolve (`council.md` R3, R6).
- The published id is chosen in one rule in one place, stated once in `specs/catalog-discovery/spec.md` (`council.md` R9, R10).
- The folder name stays Pi's display label wherever OMLX sets no `display_name`, so the old name stays searchable in the picker (`council.md` R5).
- An aliased model on the fallback path keeps its local overlay, closing the measured miss (32768 instead of 131072) (`michael-orientation.md` T2; `council.md` R4).
- A session that outlives the id re-key keeps honoring an explicit `off` thinking level (`council.md` R8).
- Every identity and overlay decision is readable on stderr from one event per fetch (`council.md` R11).
- Tests prove the published and persisted `id`; Joel watches Pi's own resolution on his server (`council.md` R12).

**Non-Goals:**

- No second registration per model: no duplicate entry and no Pi virtual model, so the picker keeps one row per model (`michael-orientation.md` T12; `council.md` R1).
- No migration of Pi's `settings.json`, session records, `models.json` or `models-store.json`, and no re-keying in the offline phase (D7; `council.md` R14).
- No startup warning for a saved default that no longer matches: the at-most-one-warning rule stands and detecting the case would mean copying Pi's settings merge (D4; `michael-orientation.md` T9).
- No module restructure of `src/catalog.ts`. The restructure Joel plans to lead stays out of scope (D8; `council.md` R9).
- No documentation edits in this change; `docs/CONFIGURATION.md`, the README and the `diagnostics` citation are the docs pass (`council.md` R15).
- No change to credential resolution or Pi's `check`/`resolve` hooks (ADR 0002), to the registrable-model rule or what `/login omlx` counts (D6), to limit precedence, to the status-first fetch order, to hidden-model handling, or to exposed-profile overlay lookup.
- No test that drives Pi's resolver: Pi's package exports only `"."` and `"./rpc-entry"`, so the interactive and startup paths are not importable (`council.md` R12).
- No re-probe of the status endpoint, no withholding of colliding models, no failing a refresh and no required overlay (`council.md` R3).

## Module & File Placement

| File | Layer | What changes | Single responsibility |
|---|---|---|---|
| `src/catalog.ts` | OMLX adapter (infra edge) | One module-private identity function; one shared post-parse pipeline outside the `try`; `OmlxModel` gains `directoryName?: string` and `modelAlias?: string`; the overlay lookup and its top-level read; the events | Turns OMLX's two endpoints and the local overlay into the catalog Pi publishes, and nothing else |
| `index.ts` | Pi hook layer | The list-miss branch of `before_provider_request` at level `off`; the comment at `:57-58` | Shapes a request from the session's model; it holds no catalog names |
| `src/debug.ts` | Shared utility | Nothing | Emits and redacts stderr diagnostics |
| `src/login.ts`, `src/provider.ts`, `src/stream.ts`, `src/notice.ts` | Pi-facing | Nothing | They keep working against one `id` per model |
| `test/catalog.test.ts`, `test/refresh.test.ts`, `test/index.test.ts`, `test/stream.test.ts` | Tests | New and updated cases (R8, R9, R11, R13) | Prove behavior through `fetchModels`, `refreshOmlxCatalog` and the hook |

**No new file.** The identity rule is one function inside `src/catalog.ts`, which already owns OMLX-to-Pi translation and is the module `refreshOmlxCatalog` and the login probe both reach (`src/login.ts:55-66`). A new module would have to import the parser's model shape to do its work or duplicate it, and it would pre-empt the restructure D8 keeps out of scope. The zoom-out standard requires a new file to name a responsibility the existing module cannot own; this one has no such responsibility.

**No new export.** The function's only caller is the shared pipeline in `fetchModels`. An export whose only other consumers are tests fails the "a consumer for every new export" gate, so the tests reach the rule through `fetchModels` and `refreshOmlxCatalog` (`council.md` R9).

**No `shortcut:` comment.** The rule has no known limit to record; a comment presuming the restructure's shape would record one that does not exist (`council.md` R9; zoom-out standard §3).

**`OmlxModel`.** `id` holds the published Pi id, and each field has one writer:

- `parseModelsStatusResponse` stays raw extraction. It leaves `id` as the endpoint id and sets `modelAlias` when `model_alias` is a string other than `""` — R7's unset rule applied as field extraction, the way the `display_name` check at `catalog.ts:97-98` already is.
- `parseModelsResponse` sets neither new field.
- The identity step (R9) is the only writer of the published `id`. On the status path it also sets `directoryName` to the endpoint id on every entry, and replaces `id` with `modelAlias` when R6 accepts it.
- When a model reaches the overlay pass without `directoryName` (every `/models` entry), the pass is its only writer: a match under R4 step 2 sets it to the matched key on the model before the entry's fields are applied, so the applied-settings before/after comparison never reports it and R9's intent holds. No match leaves it absent.

`toProviderModel`'s `name` becomes `displayName ?? directoryName ?? id`, the one home of R5's label rule; `id: m.id` is unchanged, and `registrableModels`, `index.ts` and the stream readers stay untouched. The two fields use OMLX's own vocabulary — "directory name" and "model alias" — and each has a production reader (D8):

- `directoryName?: string` is read by the overlay lookup (R4 step 1), and by the label in `toProviderModel`. It is absent on the `/models` path until a match sets it.
- `modelAlias?: string` is read by the identity step's R6 check and by the identity event's `alias` field, which is what makes a decline auditable and shows padding exactly. It is absent on the fallback path, whose endpoint reports no alias field.

**The pipeline.** The status fetch and parse stay in the `try`; the `/models` fetch and parse stay in the `catch`; one post-parse pipeline runs outside the `try`, in order: identity (both paths; R6's declines on the status path only), overlay, global defaults, clamp. This collapses the duplicated blocks at `catalog.ts:302-368`. Moving the overlay and defaults outside the `try` is safe because neither step throws on bad input: `applyLocalModelSettings` catches its own read errors (`catalog.ts:517-529`) and `applyApiGlobalDefaultsIfNeeded` catches everything but an abort (`catalog.ts:398-414`), which both sites rethrow (`council.md` R9). One overlay value breaks that today: a file that parses to JSON `null` passes the read `try` and throws a `TypeError` at `settings.models` (`catalog.ts:531`), so the status path fires `catalog_status_failed`, requests `/models`, and the refresh fails anyway. The overlay pass reads the file's top level through `asRecord` (`catalog.ts:605-609`), so that file takes the existing `catalog_local_settings_invalid` branch (`catalog.ts:532-537`) like every other file without a `models` object, and the refresh proceeds with no overlay fields (spec, "An overlay file that parses to `null` applies no fields").

**`resolveLocalModelSettingsPath` stays put.** `test/isolation/worker-setup.ts:4,15` imports it from where it is (`council.md` R9).

**Dependency direction.** `index.ts` and `src/provider.ts` sit above the adapter and call into it; `src/catalog.ts` imports nothing from them. The identity rule is pure and stays inside the adapter, so no Pi-facing module learns a second name.

## Decisions

### R9 — One pure, module-private identity rule, run once per response

One module-private function runs once per fetch, on both paths, as the first step of the shared pipeline. It is pure and non-throwing. Its input is the parsed entries in response order, duplicates included, and the answering endpoint, `"status"` or `"models"`; it returns the collapsed list and the `catalog_model_identity` details (R11): a record per kept entry, `discardedDuplicates` and `caseOnlyPairs`. In order, it:

1. Collapses exact duplicate endpoint ids to the first, and records each discarded id. The collapse moves here from both parsers (`catalog.ts:71-76`, `:90-95`), which become per-entry extraction, and this step is the only producer of `discardedDuplicates` (R11).
2. On `status`, applies R6 over the collapsed list and writes each entry's `id` and `directoryName` (`Module & File Placement`, `OmlxModel`). On `models`, it leaves every `id` as returned and writes no new field.
3. On both paths, computes `caseOnlyPairs` over the published ids.
4. Returns those details. `fetchModels` emits them once through `opts.onDebug` right after the call, so the function takes no `onDebug` and stays pure.

Alternatives weighed:

- A `src/identity.ts` module: rejected by D8 and the zoom-out standard's new-file test.
- An exported function so tests can call it directly: rejected; the tests would be testing a private step, and the export has no production reader.
- A per-entry check inside the status parser: rejected because the collision rule needs the whole list, and the parser sees one entry at a time.

### R6/R3 — What runs where, and over which population

- **Status path.** An alias publishes only when it is set and does not equal, ignoring case, any other parsed entry's endpoint id or `model_alias`. The comparison runs once against the original name sets, over the complete list after exact duplicates collapse: hidden models, exposed-profile entries and entries with no limits included. OMLX routes against every entry its settings hold, while the extension filters some of them out of the catalog, so a check run after filtering would let a hidden model's alias stay routable while nothing showed the collision (`michael-orientation.md` T6).
- **Fallback path.** The published id is the `/models` id. There is no decline, because the rule has nothing to compare against: the endpoint has already replaced the directory name with the alias. Exact duplicate ids collapse to the first entry in the identity step, first kept, as the parsers did before (`catalog.ts:71-76`); ids differing only by case all publish, and the identity event names each such pair.

Alternatives weighed: re-probing status (a new fetch, barred by D2, and it fails on the documented server), withholding colliding models (barred by D6), failing the refresh (barred by D2), requiring an overlay (breaks the documented setup, and the overlay never sets identity per T3) (`council.md` R3).

### R4 — How the overlay entry is found

1. A model that carries `directoryName` (every status entry, because the identity step sets it) matches only the entry keyed by that name, exactly as today (`catalog.ts:540-544`), and never takes an alias step.
2. A model without one (every `/models` entry) matches the entry keyed by its published id. Otherwise it matches the single entry whose `model_alias` is a non-empty string equal to the published id byte-for-byte.
3. Two or more alias matches apply no fields, and the trace names the competing keys.
4. No match applies no fields; the global defaults and the architectural clamp fill limits as today.

`applyLocalModelSettings` keeps its signature and receives no endpoint; whether `directoryName` is present is the only discriminator.

The order follows OMLX's own routing, folder name before alias (`engine_pool.py:2033-2070`). A match applies every field the overlay applies today, with today's precedence: the fields `applyModelSettingsEntry` reads (`catalog.ts:564-596`), on either path. On the `/models` path the matched key also becomes the model's `directoryName` (`Module & File Placement`, `OmlxModel`), which is how it reaches the label. A match never supplies the id (T3).

Alternatives weighed: the first entry in file order, which would depend on `JSON.parse` key order matching Python dict order, and which `~/Projects/AGENTS.md`'s "strict and loud at contract boundaries … rather than silent fallback guesses" rules out; a case-insensitive match step, which OMLX does not perform for aliases; and rejecting the model, which D6 forbids.

### R5 — How the label is chosen

The order is stated once, in `specs/catalog-discovery/spec.md`, "The Folder Name Is The Display Label Where No Display Name Is Set". Three steps supply it: the parse sets `displayName` from a non-blank server `display_name` (`catalog.ts:97-98`); the overlay pass replaces it with a non-blank overlay value (`catalog.ts:571-572`); and `toProviderModel` maps Pi's `name` to `displayName ?? directoryName ?? id`, which is the rule's one home (`Module & File Placement`, `OmlxModel`). Searchability follows from that order: the folder name is findable in the picker exactly when it is the label.

Alternatives weighed: leaving the published id as the label when no display name is set, which drops the folder name from the picker and loses what Joel's Option 1 keeps; and appending the folder name to the label or to Pi's search text, which Pi offers no field for beyond `name` and which Joel's Option 1 rules out as a second name.

### R7 — Which aliases publish verbatim

`model_alias` is unset only when absent, `null`, not a string, or `""`. Every other string is set: it is published byte-for-byte when R6 accepts it, and otherwise the entry publishes its endpoint id.

Alternatives weighed: the blank-value precedent used for `display_name` (`catalog.ts:97`), which trims before testing. Applying it here would treat `"  "` as unset on the status path, publishing the directory name, while `/models` still lists `"  "` as the id, because both endpoints treat any non-empty string as set (`server.py:3822`, `:3995`); that is the id flip this change removes. Declining padded aliases would work only where the folder name is known and would break a `defaultModel` written byte-for-byte. A "typeable alias" criterion has no closed boundary.

### R11 — Exact event names and fields

All of it goes through `omlxDebug`, so it rides the existing `PI_OMLX_DEBUG` predicate and the `[pi-omlx]` prefix the `diagnostics` capability already requires. Values are nested so `omlxDebug`'s top-level redaction (`src/debug.ts:14-20`) cannot truncate an alias.

**`catalog_model_identity`** — one per fetch, emitted by `fetchModels`, so both the refresh and the login probe emit it:

```ts
{
  endpoint: "status" | "models",
  // one per entry the identity step keeps, in response order; a collapsed duplicate appears only in `discardedDuplicates` (spec, 'The Identity And Overlay Decisions Are Traceable')
  entries: Array<{
    endpointId: string,
    directoryName: string | null,   // the entry's endpoint id on the status path, written by the identity step from that id, not read back from the model field; null on the /models path, which does not report it
    alias: string | null,           // null on the /models path, which reports no alias field
    publishedId: string,
    declined: null | "duplicate_alias" | "alias_matches_model_id",
  }>,
  discardedDuplicates: string[],          // endpoint ids the identity step collapsed, on either endpoint
  caseOnlyPairs: Array<{ a: string; b: string }>,  // distinct published ids that fold equal under toLowerCase(), in nested-loop order: for i < j over the kept list, { a: ids[i], b: ids[j] }; [] when none
}
```

`declined` is a closed set of two, and both members are what an operator triages with: the alias matched another entry's alias, or another entry's model id — the directory name on the status path, which includes an exposed-profile entry's `<alias>:<profile>` id. When an alias matches both another entry's model id and another entry's alias, the reason is `alias_matches_model_id`, because OMLX resolves model ids before aliases (`engine_pool.py:2033-2070`). `catalog_status_loaded` and `catalog_models_loaded` keep their places, emitted inside each branch right after that branch's parse (`catalog.ts:310-313`, `:349-352`), and they now count entries before the collapse. The offline phase emits no identity event, because it fetches nothing.

**`catalog_overlay_matches`** — emitted by `applyLocalModelSettings` through its existing `onDebug` parameter, once per call, after its per-model map — that is, only past its three early returns (`catalog.ts:515`, `:528`, `:537` at HEAD), when an overlay `models` object was read. Its signature and its `OmlxModel[]` return stay unchanged; `fetchModels` calls it once, so the event is once per fetch. A missing, unreadable or invalid overlay emits none, because `catalog_local_settings_considered`, `catalog_local_settings_read_failed` or `catalog_local_settings_invalid` already says why.

```ts
{
  entries: Array<{
    publishedId: string,
    outcome: "directory_key" | "alias_key" | "ambiguous" | "none",
    matchedKey: string | null,
    competingKeys: string[],
  }>,
}
```

`matchedKey` is the overlay key that supplied fields, or `null`. `entries` follow the order of the models the pass receives. An exact key reports `directory_key` on either path, and a single alias match reports `alias_key`. `competingKeys` is `[]` unless the outcome is `ambiguous`, when it lists every matching key in `Object.keys` order of the overlay's `models` object (file order for keys that are not integer-like). The model's directory name lives in `catalog_model_identity` and in the applied event's `before`/`after`.

**`catalog_local_model_settings_applied`** is unchanged in code. Its `before` and `after` records carry `directoryName` beside `id`, because the directory name is set before the comparison on both paths (`Module & File Placement`, `OmlxModel`), and `modelId` is the published id, so a match still reads as the pair a user knows both halves of.

**Messages.** No message changes. Stream events keep naming the model by `model.id`, which is now the published id by construction, and that is the value sent on the wire.

**Every `m.id` consumer in the repository**, and what this change does to it (`michael-orientation.md` T11; `research-eleanor.md`, "Other consumers / diagnostics"):

| Consumer | Where | This change |
|---|---|---|
| Parse dedupe key | `src/catalog.ts:71-76` | Moves into the identity step; still keyed on the endpoint id, first kept |
| Overlay lookup `byModel[model.id]` | `src/catalog.ts:541` | Now looks up the directory name, by R4's field-presence rule |
| `registrableModels` limit filter | `src/catalog.ts:277-285` | Unchanged; it reads limits only |
| `requirePositive` message | `src/catalog.ts:242` | Unchanged; unreachable from the refresh and the login, because `toProviderModel` runs only over `registrableModels` (`catalog.ts:155-166`, `:277-285`), and `m.id` is the published id by construction |
| `catalog_local_model_settings_applied` | `src/catalog.ts:551-557` | Code unchanged; `before` and `after` carry `directoryName` beside `id`, and `modelId` is the published id |
| `toProviderModel`'s `id: m.id` and `name` | `src/catalog.ts` | `id: m.id` is unchanged and `m.id` is now the published id; `name` maps per R5 |
| Request hook's list lookup | `index.ts:54-59` | Code unchanged; the miss branch changes per R8 |
| `model_select` diagnostic | `index.ts` | Unchanged; names the published id |
| Stream and stream-event metadata | `src/stream.ts:140,175,229`, `src/stream-events.ts` | Unchanged; names the published id, which is the wire value |
| Login probe's count | `src/login.ts:55-66` | Unchanged; counts registrable models |
| Startup notice's model count | `src/notice.ts` | Unchanged; counts provider models |
| `scripts/debug-omlx.ts` | `scripts/` | Untouched; it prints the settings file, not the catalog |

Alternatives weighed: a collision-only trace plus a separate padded-alias event, which puts one fact in two places and leaves the overlay miss invisible, the way T2 went unnoticed; and extra fields on the existing refresh-failed event, which is unnecessary because the overlay event already shows the miss in the same run (`council.md` R11).

### R8 — The outliving session

`index.ts`'s hook applies the off controls on a list miss when Pi's thinking level is `off`, and leaves the payload alone otherwise. The comment at `index.ts:57-58` is rewritten to that contract. It reads no stale `reasoning` and carries no alias or directory knowledge.

Why the old boundary falls: `before_provider_request`'s "a model absent from every list — do nothing" rule never contemplated a model the provider itself published falling out of the list mid-session. Pi keeps the stale object when its id leaves the registry (`agent-session.js:2837-2847`), so this change creates the case, and `~/Projects/AGENTS.md`'s own-the-whole-change rule rules out accepting it. Writing off only when Pi's own level is off honors the level Pi displays, because Pi clamps the level to `off` for a model whose reasoning is false and forces reasoning true when a level is requested. Measured in a throwaway copy: the off-only branch and the critic's `ctx.model.reasoning` read produce identical payloads in 12 of 12 reasoning × level cases (`council.md` R8).

Alternatives weighed: accepting and recording the risk, which was the orientation's lean and is ruled out above; reading `ctx.model.reasoning`; and matching the stale model by name, which adds alias knowledge to the hook for no measured difference.

### R12/R13 — What the tests prove, and with which fixtures

Pi's own resolution is proven by asserting the catalog's `id` and the list Pi persisted, never by a test that imports Pi's resolver: the interactive and startup paths are not importable from the installed package, and a test of a library's matching behavior is not this change's to own (`council.md` R12). The end-to-end proof is Joel's two live checks (`Migration Plan`).

Overlay behavior is proven through `fetchModels` with an explicit `modelSettingsPath` in a per-test directory under `inject("isolationRoot")`, including the fallback case with an alias, an overlay and overlay limits. Publication and persistence are proven through `refreshOmlxCatalog` with no overlay. No test writes the HOME-derived `<root>/home/.omlx/model_settings.json` and no test assigns an environment key per test: the isolation root is one directory per run shared by every worker, so a file there would leak into every parallel refresh test that expects no overlay (`council.md` R13).

**The existing tests that change, each measured:**

- `parseModelsResponse dedupes` (`test/catalog.test.ts:84-90`), renamed `parseModelsResponse returns duplicate ids for the identity step to collapse`: the parser now returns both `a` entries. The collapse is asserted through `fetchModels` on the `/models` path, with `catalog_model_identity` naming the discarded `a`.
- `fetchModels prefers /models/status` (`:145-181`): the expected model gains `directoryName: "x"`.
- The kind list at `:344-348` becomes, in order: `catalog_status_loaded`, `catalog_model_identity`, `catalog_local_settings_considered`, `catalog_local_model_settings_applied`, `catalog_overlay_matches`.

**The existing tests that hold, each with its reason:**

- The two `parseModelsStatusResponse` shape tests (`:97-139`): their input has no `model_alias`.
- The `vision-lane` test (`:240-307`): it calls `applyLocalModelSettings` with `[{ id: "vision-lane" }]`, with no server entry and no `directoryName`, so R4 step 2's exact key matches before `model_alias: "vision"` is consulted.
- The unread-keys test (`:356-381`): its model `[{ id: "quiet-lane" }]` carries no `directoryName`, so R4 step 2's exact key matches and the pass sets `directoryName` before the comparison, which stays silent.
- The `/models` fallback test (`:392-429`): it reads no overlay.

Alias publishing, the label, the overlay match and the identity event are new tests through `fetchModels` and `refreshOmlxCatalog` (R12, R13), plus one new parser test: `model_alias` is captured as `modelAlias`, and R7's unset values are not, and one stream test pinning that a stream event names the model by `model.id`, not its label (R11, 'Messages'). `council.md` R9's obligation at Stage 5 covers the rest: every scenario in the delta maps to a failing-first test with observable assertions.

### Rejected shapes

| Shape | Ruled out by |
|---|---|
| A second registration per model: duplicate entry or Pi virtual model | `council.md` R1, `michael-orientation.md` T12; it doubles the picker and splits per-model records |
| A startup warning when the saved default no longer matches | D4, C1; `michael-orientation.md` T9 |
| Migrating or rewriting Pi's stored ids | D7; `council.md` R14 |
| Trimming or case-folding the published id to make it friendlier | R7; a normalised value does not route under OMLX's exact alias match |
| Matching the alias case-insensitively anywhere | R6, R4; OMLX resolves aliases exactly |

## Risks / Trade-offs

- **The fallback cannot see what `/models` hides.** A server that requires its main key on `/models/status` (`docs/CONFIGURATION.md:57`) with a hand-edited settings file holding two entries under one alias: `/models` lists both rows with the same id, the identity step keeps one, and the other model is invisible on that path until status answers. → Mitigation: the status path is tried first on every refresh and its decline makes both ids stable there; `catalog_model_identity` names the discarded duplicate; the docs pass tells that server's user what the fallback cannot see. With no overlay match, the fallback labels an aliased model by its alias (R5), not its folder name, so a `--model <folder>` or non-glob `enabledModels` pattern that matched the label stops matching after a fallback refresh until status answers again (the proposal's BREAKING bullet, "while the label is the folder name").
- **Cluster ids and profile ids the fallback cannot see.** A model reached through an OMLX cluster deployment id, or an alias that collides with a profile id, is checked on the status path and not checked at all on the fallback, because `/models` lists neither a cluster id nor a profile's base id. → Mitigation: none is added; the status path is the authority whenever it answers, and the identity event records which endpoint answered.
- **A fallback alias that differs only by case from another model's folder name reaches the other model.** OMLX's admin accepts alias `Qwen` on folder `Qwen-A` beside folder `qwen`, because its folder-name check is exact (`admin/routes.py:3127-3133`). With status down, `/models` lists `Qwen` and `qwen`, and both publish. `Qwen` takes `Qwen-A`'s overlay entry through its alias, so it gets that label and those limits, but OMLX resolves `Qwen` to folder `qwen` by its case-insensitive folder step before any alias (`engine_pool.py:2037-2039`). Meanwhile `/model qwen` matches both ids ignoring case and selects the first listed. → Mitigation: the status path declines the alias (R6), so both ids are stable whenever status answers, and `caseOnlyPairs` names the pair on the fallback.
- **A stale overlay moves another model's fields.** The overlay names alias `qwen` for model A, OMLX later gives `qwen` to model B, and B inherits A's output limit, thinking flags and parser. → Mitigation: `catalog_overlay_matches` names the matched key, which is the triage path back to the entry; no validation is added, because the overlay is read-only and OMLX's memory is the authority on identity (T3).
- **A padded alias cannot be typed into `/model`.** With an alias of `" qwen "`, `/model  qwen ` trims to `qwen`, finds no exact match and opens the picker filtered to the model; the row is selectable, and only a `defaultModel` written byte-for-byte resolves directly. → Mitigation: stated as a boundary in the spec; the identity event shows the exact value; no trimmed duplicate id is minted, since OMLX would not route it.
- **An alias can equal another configured provider's model id.** An OMLX alias is a client-facing name, so it may equal, ignoring case, an id another configured provider serves, such as cerebras's `gpt-oss-120b` (`model-resolver.js:26`). Pi's exact match is not provider-scoped. A bare `/model <alias>` is then ambiguous: `selectReference` returns `ambiguous` (`model-resolver.js:154-181`, Pi 1.6.0), `findExactModelReferenceMatch` returns nothing (`:108-111`), and Pi opens the picker filtered to both rows (`interactive-mode.js:4495-4509`). It does so even after the catalog refresh it runs on a miss (see "The first start after an upgrade or rename uses the stored list").

  The other two paths fail differently:
  - `--model <alias>` fails with Pi's "ambiguous across providers" error when both providers are authenticated (`model-resolver.js:338-352`);
  - a non-glob `enabledModels` entry scopes both models and warns that it "matches several providers" (`:277-289`).

  A stored `defaultModel` is unaffected, because `getModel` looks up within one provider (`:398`).

  → Mitigation: `/model omlx/<alias>`, `--model omlx/<alias>` and an `enabledModels` entry of `omlx/<alias>` resolve to the OMLX model through the provider prefix. No check is added, because the extension sees only its own provider's list, and declining the alias would break the provider-scoped default that works. The docs pass names the prefixed form.
- **A session that outlives the re-key at a level other than `off` loses the model's thinking controls.** It started on the folder-name model, the refresh re-keys to the alias, Pi keeps the stale object, the list miss leaves the payload alone, and OMLX's own thinking default applies instead of the model's controls. → Mitigation: `off` is honored, which is the one level whose omission contradicts what Pi displays; the window is one session per upgrade or alias rename; the next session start resolves the published id.
- **Joel's saved default misses on every start until he saves the alias.** His `defaultModel` is `Qwen3.6-35B-A3B-4bit`; after the first refresh that persists aliases, each start cannot find it and silently lands on `anthropic/claude-opus-5-5`, with no warning, because Pi does hold `omlx` models. → Mitigation: the proposal's BREAKING bullet, the README and `docs/CONFIGURATION.md` in the docs pass (`council.md` R15), and Joel's live check (`tasks.md` 7.3). The residual is real: it is silent until he presses `Ctrl+S` on the alias row once.
- **The first start after an upgrade or rename uses the stored list.** The start restores the stored list, which holds the old names. The session-start network refresh then runs in the background and publishes and persists the aliases when it completes (`catalog-discovery`, "The network refresh continues after the session starts", "A successful network refresh persists under omlx"). A `/model <new alias>` typed before then misses the cached list; Pi refreshes every catalog, waiting up to 15 s, and retries the exact match (`interactive-mode.js:4511-4542`, Pi 1.6.0), so the command switches after a brief "Refreshing model catalogs…" status. With `enabledModels` set, Pi matches only the scoped list fixed at startup (`interactive-mode.js:4516-4517`; `main.js:458`), so in that session the alias opens the picker instead, and from the next start the scoped list is built from the refreshed store. A `defaultModel` already written as the alias resolves from the next start. → Accepted by D2/D3; no step may block startup to fix it.
- **A parsed-model assertion breaks on the two new fields.** Any test comparing a parsed model by exact shape fails the moment the fields exist. → Mitigation: the list above names every existing test that changes, with its measured reason, and `council.md` R9's Stage 5 obligation maps each to a failing-first test rather than a silent edit.

## Migration Plan

**Deployment.** One release. The first status refresh after the upgrade re-keys ids to the aliases; the offline phase keeps publishing exactly what Pi stored (`catalog-discovery`, "A start reads the store, not a cache of the extension's"). No environment variable, configuration file or secret is added, and nothing in Pi's files or the OMLX overlay is rewritten by the extension (D7).

**Rollback.** Reverting re-keys ids to directory names at the reverting release's first status refresh. An alias saved as the default then misses on every start until the folder name is saved as the default — `Ctrl+S` on the folder-name row in `/model`, or an edit to `settings.json`. Nothing is migrated in either direction, and Pi's stored data is not damaged (`council.md` R14).

**Hand-offs outside the coder's tasks.**

- **Joel, before acceptance:** he watches it work on his own server; the checks are `tasks.md` 7.3, ticked by the conductor with his words (`council.md` R12; `~/Projects/AGENTS.md`, "Nothing is done on an application change until Joel has watched it work").
- **Bambadjan, docs pass after the implementation gate:** the follow-ups `council.md` R15 records. The `diagnostics` spec cites the predicate at `src/debug.ts:18`; it sits at `:15`. The README and `docs/CONFIGURATION.md` gain the `Ctrl+S` recovery note. `CONFIGURATION.md`'s overlay section and its `:57` fallback advice take R4's matching rule. The README's `/model` line names the `omlx/<alias>` form for an alias another configured provider also serves (Risks, "An alias can equal another configured provider's model id"). `CONTRIBUTING.md:43`'s list of catalog trace events gains `catalog_model_identity` and `catalog_overlay_matches`. The pass also added `docs/adr/0003-the-published-id-is-the-servers-alias.md`, the `AGENTS.md` trap that points to it, and `ARCHITECTURE.md`'s Catalog and overlay bullets and its glossary entries "Published id" and "Directory name". None of it blocks the change.
