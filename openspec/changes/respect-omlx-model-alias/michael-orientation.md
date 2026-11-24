I couldn't save the report: my role doesn't allow writing files, so the full text is below for the runtime to save at `openspec/changes/respect-omlx-model-alias/michael-orientation.md`.

The fix itself is settled: Pi has to know an aliased model by its alias, because typing `/model <name>` and the saved default model only match on Pi's model ID. That leaves Joel one decision, which name Pi uses for an aliased model, and his own default model is a case where it bites. It is set to the folder name `Qwen3.6-35B-A3B-4bit`. Once the alias becomes the name, Pi won't find it and will start silently on `anthropic/claude-opus-5-5`, until he picks the model again in `/model`. Both research reports missed two things:

- **Pi's virtual models.** They are the only Pi-native way to give one model a second name that resolves, and they still show as extra rows in the picker.
- **A bug in the fallback path.** When OMLX's status endpoint can't be read, the extension already publishes aliases today. It then misses the user's local settings for those models, and the context window shrinks (measured: 32768 instead of 131072).

---

# Michael's Orientation: respect-omlx-model-alias

Pass: orientation (a consult; it approves nothing). Base: `main` at `e9aba43`. Inputs read in full: `plan-context.md`, `owner-rulings.md`, `research-chidi.md`, `research-eleanor.md`, `ARCHITECTURE.md`, `openspec/specs/catalog-discovery/spec.md`, `diagnostics/spec.md`, `verification/spec.md`, and the archived `owner-rulings.md` of every earlier change. Where a claim below rests on something I ran, it says so. Baseline: in my own copy (since removed), `npm run check` was green at this HEAD: 13 files, 108 tests. That count is a measurement at this commit, not a target.

## 1. The decisions that bind this change

| # | Decision | Where it was made | What it requires here |
|---|---|---|---|
| D1 | "models in omlx can be given an alias. if one is present it's likely how the user prefers to refer to the model. using the alias in a /model call or in settings as the default model does not respect the alias as an override of the actual model name." | This change's `owner-rulings.md`, 2026-11-22 (Joel's words) | `/model <alias>` must switch to the model, and `defaultModel: "<alias>"` must start on it. "Override of the actual model name" reads as the alias *replacing* the folder name. The interpretation is §5's question; that the alias must resolve is not in question. |
| D2 | Pi's refresh hook decides when the catalog is fetched. Startup restores the stored catalog with no network. The network refresh never delays a start. Publishing goes through `context.publish`. A failed refresh keeps the old state. A model without limits is skipped, not failed. | Living `catalog-discovery` spec, carrying Joel's ruling A in `archive/2026-11-13-adopt-native-api-key-login/owner-rulings.md` | The alias rule runs inside the existing refresh, adds no fetch and no timer, and never turns one bad entry into a failed refresh. |
| D3 | "Startup never waits on the model fetch, cached or not": a start can land on another provider's model and you switch with `/model`. | `archive/2026-11-12-stop-blocking-startup-on-the-model-fetch/owner-rulings.md`, 2026-11-11 | Any start that uses a stored catalog older than the current alias is accepted behavior (trap T10). Nothing may block startup to fix it. |
| D4 | At most one startup warning (the old-OAuth remedy, or the empty-catalog warning), and "No other extension notice." | Ruling C1, `archive/2026-11-13-adopt-native-api-key-login/owner-rulings.md`; living `catalog-discovery` spec | No new notice for a default that no longer matches. Adding one would reopen C1, which is Joel's call. |
| D5 | The extension never chooses the session's model: no `pi.setModel`, and no re-run of Pi's starting-model selection. | Living `catalog-discovery` spec, "The Extension Never Chooses The Session's Model" | The extension cannot repair a missed default by moving the session. |
| D6 | `/login omlx` probes the catalog with the same registrable-model rule as `refreshModels`. | Ruling C2, same archive | The alias rule must never remove a model, or the login probe's count changes. `src/login.ts:55-66` calls `fetchModels` and `registrableModels`. |
| D7 | The overlay is read-only and optional, and "its only writes are trace lines on stderr". The extension reads `auth.json` and never writes it. | `ARCHITECTURE.md` §4 and §6 (standing records); `AGENTS.md` Traps. The origin is ruling B ("no compatibility reader and no rewrite") and ADR 0002. | No migration of Pi's `settings.json`, session files, `models.json` or `models-store.json`. Pi owns all of them. |
| D8 | Every catalog field has a production reader. The planned restructure is out of scope. | `archive/2026-11-12-delete-unused-code/design.md` decision 1; Joel's ruling in that change's `owner-rulings.md` ("Out of scope: the restructure Joel plans to lead after these cards") | Change #12 deleted `modelAlias` (commit `c1676b2`) *because it had no reader*. That rule bars an unread field, not aliases, so bringing it back with a reader is consistent with it. The change must not take on the module restructure. |
| D9 | Tests never mutate operating functionality. No test-only seams. Fixtures live under `inject("isolationRoot")`. A new `process.env` key goes into `CALLER_ENV_KEYS`. No suppression comments. | `archive/2026-11-11-isolate-the-suite-from-the-agent-directory/owner-rulings.md`; `remove-test-only-seams`; `AGENTS.md`; living `verification` spec | Alias tests write their overlay under the isolation root. `OMLX_MODEL_SETTINGS_PATH` is already listed (`test/isolation/global-setup.ts:17`); no new key is expected. |

**Contract facts these decisions sit on** (measured, not decisions; the traps below cite them):

- **P1. Pi matches the model `id` exactly on the paths the bug names.**
  - `/model <arg>` goes `handleModelCommand` → `findExactModelReferenceMatch`, which compares `model.id.toLowerCase() === lowerText` (Pi 1.6.0 `dist/core/model-resolver.js:156`; 1.5.2 `:157`). It never consults `name`. On a miss it refreshes the catalog and then opens the picker pre-filled with the text (`interactive-mode.js:4490-4531`).
  - `defaultModel` goes `findInitialModel` → `getModel(provider, id)`, a case-sensitive `id ===` compare (`model-resolver.js:398`; pi-ai `models.js:121-123`; 1.5.2 `model-resolver.js:406`). On a miss it falls through silently to `defaultModelPerProvider`, then to the first available model (`:411-424`).
  - The picker's search text is `provider provider/id provider id name` (`model-search.js`, `getModelSelectorSearchText`). `name` is the only searchable field beyond the id.
  - The wire carries `model: model.id` verbatim (pi-ai `api/openai-completions.js:564`).
  - Pi models have no alias field (`types.d.ts`; no `alias` or `hidden` member).
- **P2. OMLX treats the alias as "a custom API-visible name": "`/v1/models` returns the alias, and requests accept both the alias and directory name"** (OMLX 0.8.2 `README.md:221`).
  - `/v1/models` replaces the id with the alias (`server.py:3818-3823`).
  - `/v1/models/status` keeps the folder name as `id` and adds `model_alias` only when it is set (`server.py:3995-3996`).
  - `model_settings.json` is keyed by folder name, with the alias as a field value (`model_settings.py:459`).
  - Request routing order is (`engine_pool.py:2033-2070`):
    1. exact folder name;
    2. case-insensitive folder name;
    3. cluster ID;
    4. exposed-profile ID;
    5. first settings entry whose `model_alias ==` the input, exact.
  - Live, on Joel's server: every status entry carries `model_alias`; `/v1/models` lists only the three aliases; `display_name` is `null` everywhere.

## 2. What the change must not touch or foreclose

- **Credential resolution and Pi's `check`/`resolve` hooks** (ADR 0002, `src/config.ts`, `src/provider.ts:38-72`). This is an identity change, not a connection change.
- **The startup-notice set** (D4, `src/notice.ts`) and the extension's never-choose-the-model stance (D5).
- **Pi's stores.** The extension writes no Pi file (D7). The offline phase keeps publishing exactly what Pi stored (`src/catalog.ts:136-141`, `:216-220`): no re-keying of stored models from the overlay, which would amend the catalog-discovery scenario "A start reads the store".
- **The single registrable rule** (`registrableModels`, `src/catalog.ts:277-285`), the limit precedence (overlay > global defaults > `max_model_len` clamp, `:371-426`), and the status-first, `/models`-fallback order (`:302-368`).
- **What OMLX hides.** `/v1/models/status` lists models marked hidden, and `/v1/models` omits them (`server.py:3825-3840`). The extension publishes hidden models today. That divergence is not this change.
- **Exposed-profile entries.** Status already gives them the advertised `<alias>:<profile>` form with a `source_model_id` and no `model_alias` key (`model_settings.py:1321-1333`, `server.py:3573-3610`, `:3995`). They are not re-aliased, and their overlay lookup is not changed.
- **`scripts/smoke-live-omlx.ts` and `scripts/smoke-model-selection.ts`.** They send status folder names straight to OMLX, which still accepts them (P2). They need no change.
- **Joel's planned restructure** (D8). Placing the new rule must not pre-empt the module layout he intends to lead.

## 3. The traps

- **T1. Putting the alias in the display name does not fix the bug.** `/model <arg>` and `defaultModel` never read `name` (P1). Any design that leaves the folder name as Pi's `id` fails D1 on both paths Joel named.
- **T2. The fallback path already publishes aliases, and it loses the overlay for them.**
  - Measured in my copy: a proxy that 404s `/v1/models/status` and forwards everything else to Joel's live server, then `fetchModels` with his real overlay.
  - Result: the published ids were `Qwen3.6-4bit`, `Qwen3.8-pi-MLX-4bit` and `ThinkingCap-Qwen3.8-MLX-4bit`. No `catalog_local_model_settings_applied` event fired, because the overlay lookup `byModel[model.id]` (`src/catalog.ts:541`) looked for the alias in a file keyed by folder name. `Qwen3.6-4bit` came out at a context window of 32768 (the global default) instead of the overlay's 131072.
  - So today a single failed status request flips Pi's ids from folder names to aliases, and the next successful status refresh flips them back. Each refresh persists its result.
  - This fallback is not hypothetical. `docs/CONFIGURATION.md:57` documents a server that "still requires its main key on `/v1/models/status`, so the login falls back to `/v1/models`", and tells that user to supply limits in the overlay. That advice fails silently for every aliased model.
  - The change must give both endpoints the same ids. On the fallback path, the only way back to the folder-name key is the overlay's own `model_alias` values.
- **T3. Identity comes from the server, never from the overlay.**
  - OMLX routes aliases from its in-memory settings (`engine_pool.py:2066-2070`). `OMLX_MODEL_SETTINGS_PATH` can name a different file, and a hand edit isn't seen until OMLX reloads.
  - An alias read only from the overlay could therefore publish an id OMLX can't route.
  - The overlay may help *find* an entry (T2). It must never *set* the published name.
- **T4. `display_name` and `model_alias` are different OMLX fields.** `display_name` is "Human-readable name for UI display" (`model_settings.py:435`, `:634`). `model_alias` is the "API-visible alternative to the directory name" (`:330`, `:459`). The first maps to Pi's `name` (today's rule, `src/catalog.ts:257`, `:571-572`); the second is a routing name. Mixing them breaks either the label or the wire.
- **T5. A blank alias is unset, but a set alias is never trimmed.**
  - The OMLX admin strips an alias and stores `""` as `None` (`admin/routes.py:3115-3118`).
  - A hand-edited `"  "` is truthy to OMLX (`server.py:3822`, `if ms.model_alias:`), so OMLX advertises and routes it verbatim.
  - Treat whitespace-only as unset (the precedent is the `display_name` blank test, `src/catalog.ts:97`). Publish any other alias byte-for-byte: the wire sends `id` verbatim (P1), and OMLX's alias match is exact (P2 step 5). A trimmed `" qwen "` would not route.
- **T6. A colliding alias would route to the wrong model.**
  - **Duplicate alias** (possible only by hand edit; the admin rejects it at `admin/routes.py:3119-3126`): OMLX routes it to the first settings entry (`engine_pool.py:2066-2070`).
  - **Alias equal to another model's folder name**: steps 1–2 send it to *that other* model (`engine_pool.py:2033-2039`). The admin only checks exact equality (`admin/routes.py:3127-3133`), so an alias differing only by case from another folder name gets past it and then routes to the other model (`_case_insensitive_entry_match`, `engine_pool.py:2004-2013`).
  - **Alias equal to an exposed-profile ID**: step 4 wins.
  - Pi does no duplicate-id check (`rg -i duplicate` over `model-runtime.js`, `provider-composer.js` and `models-store.js` is empty). Two entries with one id would both list, and `getModel` would return the first.
  - The rule must be that a model is published under its alias only when OMLX would route that alias back to it, and otherwise under its folder name. No model is ever dropped (D6). The decision is traced.
  - Status lists every physical model, hidden ones included, so the status path can make the check. Cluster IDs are not visible (unchecked).
- **T7. Profile entries already carry the alias form** (see §2). Applying the alias rule to them would double-alias them.
- **T8. A session that started before the ids changed loses its thinking controls.**
  - Lookups by `model.id` (`index.ts:54-59`, `:38`, `src/stream.ts:140,175,229`) stay consistent while exactly one id is published per model.
  - But a session that started on a stored folder-name model keeps that model object after the refresh re-keys it: `_refreshCurrentModelFromRegistry` only swaps when the id still exists (Pi `agent-session.js:2837-2846`).
  - The wire keeps sending the folder name, and OMLX accepts it (P2 step 1). `index.ts:54-59` then finds no list entry and leaves the payload alone, so with the thinking level at `off` that session no longer writes `enable_thinking: false`.
  - The window is one session per upgrade or alias rename.
- **T9. Every saved reference in Pi is keyed by id, and Joel's own default is a folder name.**
  - Read on this machine: `~/.pi/agent/settings.json` has `defaultProvider: "omlx"` and `defaultModel: "Qwen3.6-35B-A3B-4bit"`. `models-store.json` holds three folder-name ids.
  - `auth.json` holds `anthropic` (OAuth), `omlx` and `openrouter`. A default-model miss therefore lands on `anthropic/claude-opus-5-5`, first in `defaultModelPerProvider` (`model-resolver.js:9-12`, `:415-421`). C1's empty-catalog warning stays quiet, because Pi does hold omlx models.
  - Session restore misses too, with `Could not restore model omlx/<folder>. Using …` (`sdk.js:91-101`). So do `modelThinkingLevels["omlx/<folder>"]`, `models.json` `modelOverrides` and exact `enabledModels` entries (Chidi §1.3; Joel has none of these three).
  - The extension API offers no way to read Pi's settings (`rg settingsManager|defaultModel` over `extensions/types.d.ts` is empty). Reading the file directly would mean copying Pi's global-plus-project merge order, the same kind of copy ADR 0002 rejected for credentials.
- **T10. The first start after any alias change uses the stored list.**
  - Startup restores the stored catalog (D2, D3). The first start after an upgrade or a rename still knows the old names.
  - `/model <new alias>` heals at once: a miss triggers a network refresh (`interactive-mode.js:4511-4531`).
  - `defaultModel` heals at the next start.
- **T11. Messages and traces that name a model need a deliberate choice.** `requirePositive` (`src/catalog.ts:242`), the `catalog_local_model_settings_applied` payload (`:551-557`) and the stream events each name `m.id`. Each must say, on purpose, which name it carries: the folder name is the overlay key, and the published id is what the operator types.
- **T12. Pi has a native way to give a model a second name, and the research missed it.**
  - Chidi reports "no alias concept". Both Pi 1.5.2 and 1.6.0, however, ship virtual models (`docs/virtual-models.md`, `dist/core/virtual-models.js`).
  - They "appear in `/model`, `--model`, scoped models, and settings like any other model" (`virtual-models.md:5`). They are the only Pi-native way to make a second name resolve, and they do not avoid a second picker row.
  - This matters only if Joel picks option 3 in §5.
- **T13. An existing fixture already pairs an alias with a folder-name key.** `test/catalog.test.ts:239-305` keys an overlay entry `"vision-lane"` with `model_alias: "vision"` and asserts only the display name, limits, thinking, parser and type. Whatever the design does with that alias, this fixture's existing assertions must hold or be changed on purpose. A silent edit to an expectation fails the implementation gate.

## 4. The question only Joel can answer

### What name Pi knows an aliased OMLX model by

When a model on the OMLX server has an alias, Pi needs one name for it in `/model`, in the saved default, and in each session's record. The alias has to be one of those names (that's the bug). The open question is what happens to the folder name, and the answer decides what you see in the picker and what happens to anything already saved under the folder name, including your own default today.

**Option 1: the alias is the name, and the folder name stays visible beside it (my pick).**
`/model Qwen3.6-4bit` and a saved default of `Qwen3.6-4bit` work. The picker row reads `Qwen3.6-4bit  Qwen3.6-35B-A3B-4bit` (I measured this with Pi's own label function for all three of your models). Searching the picker by the folder name still finds it. If the model has a display name set in OMLX, the display name takes the folder name's place in the row.
How it goes wrong:
1. Your settings name `Qwen3.6-35B-A3B-4bit` as the default model, as they do today.
2. You update pi-omlx and start pi. That start still works, because pi starts from the list it stored last time.
3. That session's refresh stores the aliases.
4. On your next start, pi can't find `Qwen3.6-35B-A3B-4bit` and silently starts on Claude Opus. No warning appears, because pi does have OMLX models.
5. You open `/model` and pick `Qwen3.6-4bit`. Pi saves the alias as your default, and it stays fixed.

Separately, reopening a session from before the update says `Could not restore model omlx/Qwen3.6-35B-A3B-4bit` and uses your default. Typing `/model Qwen3.6-35B-A3B-4bit` opens the picker filtered to the right model instead of switching straight away.

**Option 2: the alias is the only name, as in OMLX's own model list.**
Same as option 1, but the folder name disappears from pi entirely.
How it goes wrong: steps 1–4 as above. Then:
5. You type `/model Qwen3.6-35B-A3B-4bit` from habit. The picker opens with nothing matching, and you have to remember the alias.

**Option 3: both names work, as two separate picker entries per model.**
Nothing saved under a folder name breaks.
How it goes wrong:
1. You open `/model` and see six OMLX entries for your three models.
2. One session uses the folder-name entry and another uses the alias. Your default, each session's record and any per-model thinking setting split across two entries for one model.
3. On a server whose status endpoint your key can't read (the setup the configuration doc describes), with no local OMLX settings file, pi-omlx learns only the aliases. The folder-name entries vanish at that refresh, and whatever was saved against them misses anyway.

This option also needs a second registration per alias, either a duplicate entry or a pi "virtual model". That needs a prototype before the design can commit to it.

**Why option 1.** It matches your words ("an override of the actual model name") and OMLX's own contract: the alias is "a custom API-visible name", and OMLX's model list shows only the alias. It also makes the two ways pi-omlx reads the server agree. Today a single failed status request already flips your models to their aliases. Keeping the folder name as the label is the only thing in Pi that keeps the old name findable, because the label is the only text Pi searches beyond the id. The cost is the one-time re-pick in step 5. The only alternative that avoids that cost is option 3, and that permanently doubles the picker.

**What this rests on.**
- The `/model` and default-model paths match on the model ID only, and a miss falls through to Claude Opus: Pi 1.6.0 `dist/core/model-resolver.js:156`, `:398`, `:411-424`, `:9-12`.
- The label is the only extra search field: `dist/modes/interactive/model-search.js`.
- Your current default and stored list: read from `~/.pi/agent/settings.json` and `models-store.json` on this machine today.
- OMLX's alias contract: `README.md:221`, `server.py:3818-3823`.
- The fallback flip: measured in my copy against your live server (T2).
- None of these sources is a document the running system has moved past. Every one was read from the installed code or the live server.

## 5. What is settled and what stays open

**Settled (by a decision or by measurement; not for the council to reopen without new evidence):**

1. Whichever option Joel picks, an aliased model's alias becomes a Pi model `id`. A label-only fix cannot meet D1 (T1, P1).
2. The published name comes from the server: status `model_alias` on the status path, and the `/models` `id` on the fallback path. The overlay never sets it (T3).
3. The overlay is looked up by folder name on both paths. On the fallback path the folder name is recovered from the overlay's own `model_alias` values, which closes the T2 overlay miss. That gap is in the behavior this change touches, so it is this change's to close (`AGENTS.md`, "Own the whole change").
4. An alias that OMLX would not route back to its own model (duplicate, equal to another folder name exactly or by case, or equal to a profile ID) publishes under the folder name. No model is dropped and the refresh does not fail (T6, D2, D6). The decision gets a `PI_OMLX_DEBUG` trace.
5. A whitespace-only alias is unset. Any other alias is published verbatim (T5).
6. `display_name`, when set, stays Pi's `name` (T4, today's rule).
7. There is no migration of Pi's files and no `setModel` (D5, D7). There is no new startup notice for a stale default (D4). Reopening C1 is Joel's, and I would not, because detecting the case means copying Pi's settings merge (T9).
8. The one-start lag after an alias change is accepted (D2, D3; T10).
9. The wire sends the published id, which OMLX accepts as either alias or folder name (P2; Chidi live-checked chat completions both ways).
10. The login probe, the registrable rule and the limit precedence are unchanged (D6, §2).

**Open for the council and the design:**

- **The label** (`name`) for an aliased model with no display name: the folder name under option 1, the alias under option 2. This follows from Joel's answer.
- **Where the identity rule lives.** It should be a pure rule over parsed entries that both endpoints, the refresh and the login all pass through, defined once. `src/catalog.ts` already mixes fetch, parse, overlay, defaults, mapping and refresh. The design must place the rule without pre-empting Joel's restructure (D8), and say why the place it picks is a single responsibility.
- **Domain vocabulary** for the two names. OMLX's own terms are "model alias" and "directory name". The design picks one pair and uses it in types, traces and docs.
- **T8.** Whether a session that outlived a re-key losing thinking-off is accepted and recorded as a design risk (my lean), or handled. Handling it needs a folder-to-alias lookup at request time, which is new mechanism.
- **T11.** Which name each message and trace carries.
- **Tests.** Behavioral tests through `fetchModels` with a real overlay file under the isolation root, and through `refreshOmlxCatalog` for the published id and name. The cases are: status path with alias, fallback path with alias and overlay, blank alias, duplicate alias, alias equal to another folder name by case, a profile entry, and the existing T13 fixture. No seams (D9).
- **Docs pass** (Bambadjan, minor by Joel's standing ruling): `docs/CONFIGURATION.md`'s overlay section and its `:57` fallback advice, the README `/model` line, and whether the identity rule earns an ADR.

**Prototypes.** None is needed for option 1 or 2. Either is settled by the measurements above. If Joel picks option 3, I would ask Derek for one before the council:

- **Question.** Can a second name for one OMLX model resolve at startup as `defaultModel` and keep the thinking controls in `index.ts:44-65`? Measure it both ways: as a duplicate physical entry, and as a Pi virtual model routed to the physical one.
- **The result that answers it.**
  - In a throwaway copy, with a scratch `PI_CODING_AGENT_DIR` and a stored catalog: does `defaultModel: "<folder name>"` start on the model before any network refresh?
  - What `ctx.model.id` does `before_provider_request` see under the virtual selection?
  - Does `enable_thinking: false` still reach the payload at the `off` level?
  - Running it needs one chat request to the local OMLX server (a local model call), so it is Joel's call.
- **What changes in the design.**
  - If the virtual model resolves at startup and keeps the thinking controls, the design uses virtual models and the picker shows the folder name as routed.
  - If it doesn't, the design uses duplicate entries and states the split-record cost.
  - If neither resolves before the network refresh, option 3 cannot keep saved folder names working on the first start, and that goes back to Joel.

## 6. What this orientation did not check

- When OMLX added `model_alias` to `/v1/models/status`. An older server without it would publish folder names, which is today's behavior and no regression.
- Cluster deployment IDs as collision sources (T6). They aren't visible to the extension.
- The `/v1/responses` path with an alias, which Chidi read from code but did not run live. The extension uses chat completions only.
- Pi's UI strings in a live session. Every Pi claim above comes from installed source in 1.6.0, with the matching lines spot-checked in 1.5.2.