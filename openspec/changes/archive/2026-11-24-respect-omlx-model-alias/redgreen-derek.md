# Red/Green Proof — respect-omlx-model-alias

Every check below was run; the reds and greens are quoted from the runs recorded in
`.pi/marbleization/respect-omlx-model-alias/` (`spike-red.log`, `spike-red-verbose.log`,
`spike-green-verbose.log`, `spike-mutations.log`, `spike-mutations-ondebug.log`,
`spike-mutations.py`). Nothing shipped: the work lives in a throwaway copy that is removed.

## How the spike ran

- **Base commit:** `e9aba43` (`main`, workspace at HEAD with `git status` clean except the
  untracked `.pi/` and `openspec/changes/respect-omlx-model-alias/`).
- **The copy:** `/var/folders/bg/vzcr9n991d90wx8q5g5n8jhc0000gn/T/tmp.81IO6M98Nh/pi-omlx`,
  made with `git clone . <copy>/pi-omlx && git checkout e9aba43 && git checkout -b redgreen`,
  then `npm install` **inside the copy** (no `node_modules` link to the original). The original
  checkout was never edited, staged or committed; it only gained this report.
- **Baseline:** `npm run check` in the copy at `e9aba43` —
  `Test Files 13 passed (13) / Tests 108 passed (108)`, Biome and `tsc --noEmit` clean, matching
  the expected baseline.
- **Order of work:** the whole suite of tests was written first on that base (`A2`–`A43`), run
  red (`npx vitest run test/catalog.test.ts test/refresh.test.ts test/index.test.ts` →
  `Tests 39 failed | 45 passed (84)`), then the smallest change `design.md` specifies was built
  (`src/catalog.ts`, `index.ts`) and the same run went
  `Tests 84 passed (84)`. The green build is committed in the copy as `6b04822`.
- **Green gate:** `npm run check` in the copy on the green build —
  `Test Files 13 passed (13) / Tests 147 passed (147)`, Biome and `tsc --noEmit` clean;
  `npx vitest run test/catalog.test.ts` → `59 passed`, `test/refresh.test.ts` → `12 passed`,
  `test/index.test.ts` → `13 passed`. The change creates no file, so the file count stays 13 and
  the test count rises 108 → 147 (39 new tests).
- **Suppressions:** `git diff e9aba43 | grep -E '^\+.*(@ts-ignore|@ts-expect-error|@ts-nocheck|biome-ignore|noqa|type: ignore)'`
  → `none`.
- **Mutations:** each `Shown failing by` in `tasks.md` was applied to the green build with
  `spike-mutations.py`, the one test it must break was run with `-t`, and the file was reverted
  (`git status --porcelain` empty afterwards). Results are quoted per label.
- **No model calls, no network, no live OMLX:** every check runs against a stubbed
  `globalThis.fetch` and fake Pi APIs. Task 7.3 stays Joel's.

Fixture conventions used, as `tasks.md` pins them: every new `fetchModels` test passes an
explicit `modelSettingsPath` named under `inject("isolationRoot")` and never created; every test
that writes an overlay writes it to
`mkdtempSync(join(inject("isolationRoot"), "pi-omlx-"))`; a test that expects the global defaults'
32768/4096 stubs `/admin/api/global-settings` with
`{ sampling: { max_context_window: 32768, max_tokens: 4096 } }`; `L` is
`max_context_window: 1000, max_tokens: 100`. No test writes `<root>/home/.omlx/model_settings.json`
and no test assigns a `process.env` key.

## Checks

### A1 — task 1.1: one post-parse pipeline outside the `try` (pin, no new test)

- **Expectation.** "the `/models/status` fetch and parse stay in the `try` and the `/models` fetch
  and parse stay in the `catch`; one post-parse pipeline runs outside the `try` in the order
  overlay, global defaults, clamp, replacing the two repeated blocks (`src/catalog.ts:302-368`)"
  (`tasks.md` 1.1). A behavior-preserving move is a **pin**, not a red.
- **Pin evidence.** The held tests named by the task pass at base and pass unchanged on the green
  build: `fetchModels applies local OMLX model settings for localhost metadata refinement`,
  `fetchModels falls back to /models when /models/status fails`, `fetchModels times out`
  (base: `✓` in `spike-red-verbose.log`; green: `✓` in `spike-green-verbose.log`), and in
  `test/refresh.test.ts` `the offline phase publishes the stored models and fetches nothing`,
  `a credential the resolution cannot produce throws, fetches nothing and publishes nothing`,
  `an already-aborted signal makes no request`. None of their text was edited.
- **The one behavior the move could have changed, measured.** The design keeps
  `catalog_status_loaded` / `catalog_models_loaded` inside their branch, counting entries
  **before** the collapse. A throwaway check (deleted afterwards) over
  `[a, a, b]` on the status path printed `SPIKE {"apiRoot":"…","count":3}` — parsed entries, not
  the two kept ones. No committed test pins it (`tasks.md` 2.2 says so); see G3.
- **Credit:** `dr-resolve-s3-r1.md C2`, `dr-resolve-s3-r2.md S3-R2-C1`.

### A2 — task 2.1: `parseModelsStatusResponse captures model_alias as modelAlias and omits unset values`

- **Expectation.** R7: "`model_alias` is unset only when absent, `null`, not a string, or `""`. Every
  other string is set: it is published byte-for-byte" (`design.md` R7; spec, "A whitespace-only
  alias publishes verbatim", "A padded alias publishes verbatim").
- **Red.** `AssertionError: Expected values to be strictly deep-equal: … [+ actual - expected]`
  at `test/catalog.test.ts:676:9` — the `"qwen"` and `" qwen "` entries came back without
  `modelAlias` at base.
- **Green.** `✓ parseModelsStatusResponse captures model_alias as modelAlias and omits unset values`.
- **Mutation.** `2.1-drop-status-id-guard` (drop the parser's id guard, making the `{}`, `{ id: "" }`,
  `{ id: 5 }` entries survive) → `Tests 1 failed | 58 skipped`, failing at this test.

### A3 — task 2.2: `parseModelsResponse dedupes` (changed to per-entry extraction)

- **Expectation.** "`parseModelsResponse` (`src/catalog.ts:71-76`) and `parseModelsStatusResponse`
  (`:90-95`) lose the collapse and return per-entry extraction" (`tasks.md` 2.2).
- **Red.** `AssertionError: Expected values to be strictly deep-equal: … [ {` at
  `test/catalog.test.ts:93:9` — base returned `[a, b]`, the test now expects `[a, a, b]`.
- **Green.** `✓ parseModelsResponse dedupes`.
- **Note.** It keeps the name `tasks.md` pins while asserting the opposite; see G1.

### A4 — task 2.2: `fetchModels collapses exact duplicate /models ids and names the discarded id`

- **Expectation.** spec "The fallback collapses exact duplicate ids to the first": "the first is
  published and the second is discarded, as today / **AND** the identity trace names the discarded
  id".
- **Red.** `AssertionError: the fetch emitted no catalog_model_identity` at `:694:15` (no identity
  event exists at base).
- **Green.** `✓ … discarded id`.

### A5 — task 2.2: `fetchModels collapses exact duplicate /models/status ids and names the discarded id`

- **Expectation.** R9 step 1: "Collapses exact duplicate endpoint ids to the first, and records each
  discarded id. The collapse moves here from both parsers" (`design.md` R9).
- **Red.** `AssertionError: the fetch emitted no catalog_model_identity` at `:709:15` — as
  `tasks.md` predicted, base's status parser already collapses, so the red is the missing event.
- **Green.** `✓ …`.
- **Mutation.** `2.2-collapse-models-only` (`if (endpoint === "models" && seen.has(model.id))`) →
  `Tests 1 failed | 58 skipped` here.

### A6 — task 2.2: `fetchModels emits an empty identity event for an empty /models/status list`

- **Expectation.** R11's event shape with `entries: []`, `discardedDuplicates: []`,
  `caseOnlyPairs: []` (`design.md` R11).
- **Red.** `AssertionError: the fetch emitted no catalog_model_identity` at `:722:19`.
- **Green.** `✓ …`.

### A7 — task 2.2/4.2: the kind list in `fetchModels emits catalog debug events for local settings refinement`

- **Expectation.** "`catalog_status_loaded`, `catalog_model_identity`, `catalog_local_settings_considered`,
  `catalog_local_model_settings_applied`, `catalog_overlay_matches`" (`design.md` R12/R13, "The kind
  list at `:344-348` becomes, in order: …"; R11 for the placement).
- **Red.** `AssertionError: Expected values to be strictly deep-equal: … 'catalog_status_loaded',`
  at `:349:10` — base emitted three kinds.
- **Green.** `✓ …` with the five kinds in that order (`catalog_overlay_matches` after `applied`,
  because the overlay event is emitted after its per-model map).

### A8 — task 2.3: `fetchModels publishes a unique status alias as the model id`

- **Expectation.** spec "The status path publishes a unique alias as the id": "that model's published
  Pi `id` is the alias, byte-for-byte".
- **Red.** `AssertionError: Expected values to be strictly deep-equal: + 'Qwen3-dir'` at `:739:9`.
- **Green.** `✓ …`.

### A9 — task 2.3: `fetchModels publishes the endpoint id when model_alias is absent, null, non-string or empty`

- **Expectation.** spec "An unset alias publishes the endpoint id" (R7).
- **Red.** `AssertionError: the fetch emitted no catalog_model_identity` at `:754:22`.
- **Green.** `✓ …` (`["a","b","c","d"]`, every entry `alias: null`).
- **Mutation.** `2.3-parser-keeps-empty-alias` → `Tests 1 failed | 58 skipped`, failing here (the
  `""` entry publishes `""`).

### A10 — task 2.3: `fetchModels publishes a whitespace-only alias verbatim`

- **Expectation.** spec "A whitespace-only alias publishes verbatim": "its published Pi `id` is that
  value, unchanged".
- **Red.** `AssertionError: … + 'w-dir'` at `:766:9`.
- **Green.** `✓ …`.

### A11 — task 2.3: `fetchModels publishes a padded alias verbatim`

- **Expectation.** spec "A padded alias publishes verbatim": "the published Pi `id` carries those
  spaces unchanged"; R11: the event "carries the value unchanged".
- **Red.** `AssertionError: … + 'p-dir'` at `:775:9`.
- **Green.** `✓ …` (`publishedId` and `alias` both `" qwen "`).

### A12 — task 2.4: `fetchModels computes caseOnlyPairs with toLowerCase for ids that differ only by case`

- **Expectation.** R11: "`caseOnlyPairs` … distinct published ids that fold equal under
  `toLowerCase()`, in nested-loop order: for i < j over the kept list, `{ a: ids[i], b: ids[j] }`";
  three variants give three pairs.
- **Red.** `AssertionError: the fetch emitted no catalog_model_identity` at `:791:19`.
- **Green.** `✓ …` (`Foo/foo`, `Foo/FOO`, `foo/FOO`; `discardedDuplicates: []`).
- **Credit:** `dr-resolve-s3-r1.md C4`.

### A13 — task 2.5: `fetchModels declines an alias two entries share, and publishes both endpoint ids`

- **Expectation.** spec "A duplicate alias is declined for both models": "neither is published under
  the alias / **AND** each is published under its own endpoint id".
- **Red.** `AssertionError: the fetch emitted no catalog_model_identity` at `:809:19`.
- **Green.** `✓ …` (ids `["A","B"]`, `declined` `["duplicate_alias","duplicate_alias"]`).

### A14 — task 2.5: `fetchModels declines an alias equal to another entry's endpoint id`

- **Expectation.** spec "An alias equal to another model's directory name is declined".
- **Red.** `… no catalog_model_identity` at `:822:19`.
- **Green.** `✓ …` (`[null, "alias_matches_model_id"]`).

### A15 — task 2.5: `fetchModels declines an alias that differs only by case from another entry's endpoint id`

- **Expectation.** spec "An alias differing from another directory name only by case is declined".
- **Red.** `… no catalog_model_identity` at `:835:19`.
- **Green.** `✓ …`.
- **Mutation.** `2.5-case-sensitive-id-compare` → `Tests 1 failed | 58 skipped`, failing here.

### A16 — task 2.5: `fetchModels declines an alias equal to an exposed-profile id`

- **Expectation.** spec "An alias equal to an exposed-profile id is declined".
- **Red.** `… no catalog_model_identity` at `:848:19`.
- **Green.** `✓ …`.

### A17 — task 2.5: `fetchModels reports alias_matches_model_id when an alias equals another entry's id and another entry's alias`

- **Expectation.** R11: "When an alias matches both another entry's model id and another entry's
  alias, the reason is `alias_matches_model_id`, because OMLX resolves model ids before aliases".
- **Red.** `… no catalog_model_identity` at `:862:19`.
- **Green.** `✓ …` (`["alias_matches_model_id","alias_matches_model_id",null]`).
- **Mutation.** `2.5-alias-match-before-id-match` → `Tests 1 failed | 58 skipped`, failing here
  (`RDY-3`).

### A18 — task 2.5: `fetchModels accepts an alias that differs only by case from its own endpoint id`

- **Expectation.** spec "An alias equal to its own directory name by case is not declined".
- **Red.** `AssertionError: … + 'qwen'` at `:875:9` (base publishes the folder name).
- **Green.** `✓ …` (published id `QWEN`; entry
  `{endpointId: "qwen", directoryName: "qwen", alias: "QWEN", publishedId: "QWEN", declined: null}`).

### A19 — task 2.5: `fetchModels runs the collision check over hidden, profile and limit-less entries`

- **Expectation.** spec "The collision check reads every parsed entry" and "An exposed-profile entry
  keeps its advertised id"; R6: "hidden models, exposed-profile entries and entries with no limits
  included".
- **Red.** `… no catalog_model_identity` at `:908:19`.
- **Green.** `✓ …` (ids unchanged, `declined` `["alias_matches_model_id", null,
  "alias_matches_model_id", null, "duplicate_alias", "duplicate_alias"]`).
- **Mutation.** `2.5-compare-only-limit-holding-entries` → `Tests 1 failed | 58 skipped`, failing
  here (`RDY-6`).

### A20 — task 2.5: `fetchModels publishes a declined model under its endpoint id and succeeds` (**pin**)

- **Expectation.** spec "A declined alias removes no model and fails no refresh".
- **Pin.** Green at base (`✓ …` in `spike-red-verbose.log`): base ignores `model_alias`, so
  `registrableModels(models).map(id)` is already `["A","foo"]`. Its red is the mutation below.
- **Mutation.** `2.5-withhold-declined-entry` (drop declined models from the returned list) →
  `Tests 1 failed | 58 skipped`, failing here.

### A21 — task 2.5: `fetchModels runs the collision check over the collapsed list`

- **Expectation.** R9/R6 order: "R6 runs after the collapse (`design.md:95`)".
- **Red.** `AssertionError: … + 'A'` at `:939:9` (base publishes `["A"]`, never reading the alias).
- **Green.** `✓ …` (`["x"]`, `discardedDuplicates: ["A"]`).
- **Mutation measured, and it does not discriminate.** `2.5-collision-check-over-uncollapsed-list`
  (call `aliasDeclineReason(alias, endpointId, parsed)`) → `Tests 1 passed | 58 skipped`. See G2.

### A22 — task 2.6: `fetchModels records the directory name on the status path` (+ the changed `fetchModels prefers /models/status`)

- **Expectation.** "the identity step sets `directoryName` to the endpoint id on every status entry,
  whether or not an alias publishes" (`tasks.md` 2.6; `design.md` §Module & File Placement,
  "`OmlxModel`").
- **Red.** `fetchModels records the directory name on the status path` →
  `AssertionError: Expected values to be strictly deep-equal: … [` at `:961:9`;
  `fetchModels prefers /models/status` → same at `:173:10`, its expected model lacking
  `directoryName: "x"`.
- **Green.** `✓ …` (`[["qwen","Qwen3-dir"],["plain","plain"]]`) and `✓ fetchModels prefers /models/status`.
- **Mutation.** `2.6-directory-name-only-when-alias-publishes` → `Tests 1 failed | 58 skipped`,
  failing on the `plain` row.
- **Credit:** `dr-resolve-s3-r1.md C1` (three catalog tests change; both are among them).

### A23 — task 3.1: `fetchModels publishes the /models id verbatim and records null directory name and alias`

- **Expectation.** spec "The fallback path publishes the id `/models` returned"; R11:
  "`directoryName: string | null` — … `null` on the /models path"; `alias: string | null` — "null on
  the /models path".
- **Red.** `… no catalog_model_identity` at `:977:15`.
- **Green.** `✓ …` (`[{ id: "qwen", contextWindow: 32768, maxTokens: 4096 }]`).
- **Mutation.** `3.1-status-branch-for-models-endpoint` → `Tests 1 failed | 58 skipped`, failing here.

### A24 — task 3.2: `fetchModels publishes /models ids that differ only by case and names the pair`

- **Expectation.** spec "The fallback publishes ids that differ only by case as reported": "both are
  published as reported / **AND** the identity trace names the pair".
- **Red.** `… no catalog_model_identity` at `:996:19`.
- **Green.** `✓ …` (`["qwen","Qwen"]`, `discardedDuplicates: ["qwen"]`,
  `caseOnlyPairs: [{a:"qwen", b:"Qwen"}]`).
- **Mutation.** `3.2-collapse-keyed-on-lowercase` → `Tests 1 failed | 58 skipped`, failing here.

### A25 — task 3.3: `fetchModels publishes one id for a model both endpoints list`

- **Expectation.** spec "Both endpoints publish one id for the models they share".
- **Red.** `AssertionError: … + 'Qwen3-dir'` at `:1009:9`.
- **Green.** `✓ …` (both runs `["qwen"]`).
- **Mutation.** `3.3-never-publish-the-alias` → `Tests 1 failed | 58 skipped`, failing here.

### A26 — task 4.1: `applyLocalModelSettings matches a status model by its directory name, not its published id`

- **Expectation.** spec "The status path matches the overlay by directory name"; R4 step 1: "A model
  that carries `directoryName` … matches only the entry keyed by that name … and never takes an alias
  step".
- **Red.** `AssertionError: Expected values to be strictly equal: 4096 !== 1024` at `:1026:9` (base
  matches the published id, taking `qwen`'s 4096/512).
- **Green.** `✓ …` (`1024`/`256`).
- **Credit:** `dr-resolve-s5.md RDY-2`.

### A27 — task 4.1: `applyLocalModelSettings gives a status model whose directory key is missing no fields`

- **Expectation.** R4 step 1 + step 4: no key means no alias step and no fields.
- **Red.** `AssertionError: Expected values to be strictly deep-equal: … {` at `:1047:9`.
- **Green.** `✓ …` (deep-equals `[{ id: "qwen", directoryName: "missing-dir" }]`).
- **Mutation.** `4.1-directory-model-takes-the-alias-step` → `Tests 1 failed | 58 skipped`, failing
  here (`RDY-2`).

### A28 — task 4.2: `fetchModels emits catalog_overlay_matches only when an overlay models object was read`

- **Expectation.** spec "The overlay match outcome is traced"; R11:
  `{ publishedId, outcome: "directory_key" | "alias_key" | "ambiguous" | "none", matchedKey, competingKeys }`,
  "once per call … only past its three early returns".
- **Red.** `AssertionError: the fetch emitted no catalog_overlay_matches` at `:1056:19`.
- **Green.** `✓ …` — the status-path miss reads
  `{publishedId:"qwen", outcome:"none", matchedKey:null, competingKeys:[]}` while the identity entry's
  `directoryName` is `"Qwen3-dir"`; the `/models` exact key reads
  `{publishedId:"y", outcome:"directory_key", matchedKey:"y", competingKeys:[]}`; the absent path and
  an overlay without a `models` object emit no such event.
- **Credit:** `dr-resolve-s3-r1.md C7`, `dr-resolve-s5.md RDY-5`.

### A29 — task 4.3: `fetchModels recovers an aliased fallback model's overlay limits through one alias match`

- **Expectation.** spec "The fallback path recovers an aliased model's directory name through one
  alias match" and "The exact key is tried before an alias match"; the measured miss is 32768 at HEAD.
- **Red.** `AssertionError: Expected values to be strictly equal: 32768 !== 131072` at `:1099:9`;
  the exact-key-beside-alias half returned `qwen` at 131072/8192 instead of 4096/512.
- **Green.** `✓ …` (`131072`/`8192` through the alias; `[{ id:"qwen", directoryName:"qwen",
  contextWindow:4096, maxTokens:512 }]` and `{publishedId:"qwen", outcome:"directory_key",
  matchedKey:"qwen", competingKeys:[]}` for the exact key).
- **Mutations.**
  - `4.3-alias-scan-before-the-exact-key` → `Tests 1 failed | 58 skipped`, failing here.
  - `4.3-directory-name-only-on-an-alias-match` → `Tests 1 failed | 58 skipped`, failing here on the
    returned model.
- **Credit:** `dr-resolve-s3-r1.md C5`, `dr-resolve-s5.md RDY-3`.

### A30 — task 4.3: `fetchModels falls through a non-object exact overlay key to an alias match`

- **Expectation.** R4 step 2: "Otherwise it matches the single entry whose `model_alias` is a non-empty
  string equal to the published id byte-for-byte" — a non-object value under the exact key is no
  entry (`asRecord`).
- **Red.** `AssertionError: null 32768 !== 131072` at `:1140:10` (the `null` row; the other three rows
  fail the same way).
- **Green.** `✓ …` (all four rows at 131072/8192; the `null` row's event `outcome: "alias_key"`).
- **Mutation.** `4.3-exact-key-counts-when-defined` (`byModel[model.id] !== undefined`, with an
  `asRecord` guard so it cannot crash) → `Tests 1 failed | 58 skipped`, failing here at the limits.

### A31 — task 4.3: `fetchModels skips a null overlay entry during the alias scan`

- **Expectation.** R4 step 3 and the `asRecord` rule (`design.md`: "counts only when
  `asRecord(value)` is defined").
- **Red.** `AssertionError: Expected values to be strictly equal: 32768 !== 131072` at `:1179:9`.
- **Green.** `✓ …` (`{publishedId:"qwen", outcome:"alias_key", matchedKey:"Qwen3-dir", competingKeys:[]}`).
- **Mutation.** `4.3-alias-read-before-asrecord` →
  `FAIL … reason: TypeError: Cannot read properties of null (reading 'model_alias')` — the crash the
  `asRecord` check exists to prevent, exactly as `tasks.md` 4.3 predicts.

### A32 — task 4.3: `fetchModels applies a stale overlay entry reached through another model's alias and names its key`

- **Expectation.** spec "A stale overlay entry cannot move the published id": "only that entry's
  fields can reach the model it matched / **AND** the trace names the matched key".
- **Red.** `AssertionError: Expected values to be strictly equal: 32768 !== 4096` at `:1205:9`.
- **Green.** `✓ …` (`A-dir`'s 4096/512, id `qwen`, `outcome: "alias_key"`, `matchedKey: "A-dir"`).

### A33 — task 4.3: `fetchModels never takes the published id from the overlay's model_alias` (**pin**)

- **Expectation.** spec "An overlay cannot rename a model": "the published Pi `id` is still the
  endpoint's id".
- **Pin.** Green at base (`✓ …` in `spike-red-verbose.log`): base never reads `model_alias`, so both
  runs already give id `dir` at 2048.
- **Mutation.** `4.3-id-from-the-overlay-alias` → `Tests 1 failed | 58 skipped`, failing here
  (`MICHAEL-S5-1`).

### A34 — task 4.4: `fetchModels applies no overlay fields when two entries share the matching alias`

- **Expectation.** spec "Two overlay entries sharing an alias apply no fields": "neither entry's
  fields apply to that model / **AND** the trace names both competing keys"; R11's `competingKeys`
  in `Object.keys` order.
- **Red.** `AssertionError: the fetch emitted no catalog_overlay_matches` at `:1261:19`.
- **Green.** `✓ …` (32768/4096 kept; `outcome: "ambiguous"`, `competingKeys: ["B-dir","A-dir"]`, and
  `["C-dir","B-dir","A-dir"]` for the three-entry case).
- **Mutation.** `4.4-apply-the-first-competing-entry` → `Tests 1 failed | 58 skipped`, failing on the
  limits (`RDY3-4`).

### A35 — task 4.5: `fetchModels falls back to global defaults when no overlay entry matches`

- **Expectation.** spec "No matching entry applies no fields": "no overlay fields apply / **AND** the
  global defaults and the architectural clamp fill limits as they do today"; and "no match is
  case-insensitive".
- **Red.** `AssertionError: the fetch emitted no catalog_overlay_matches` at `:1317:19`.
- **Green.** `✓ …` (32768/4096 in all three fixtures; `outcome: "none"` for the stale alias and the
  case-only `QWEN`; no event on the absent path).
- **Mutation.** `4.5-alias-compared-ignoring-case` → `Tests 1 failed | 58 skipped`, failing here.

### A36 — task 4.6: `fetchModels ignores an overlay file that parses to null`

- **Expectation.** spec "An overlay file that parses to `null` applies no fields": "no overlay fields
  apply and the refresh succeeds on the endpoint that answered, with no `/models` request after a
  status answer / **AND** the trace records `catalog_local_settings_invalid`".
- **Red.** `Error: unexpected url http://127.0.0.1:9400/v1/models` at `:1360:18` — base throws
  `TypeError` at `settings.models`, so the status path falls back and the stub reports the second
  request. That is the defect's symptom; the test's own assertions are the ids, `calls` and `kinds`.
- **Green.** `✓ …` (`["m"]`, `calls` `["…/models/status"]`, kinds
  `catalog_status_loaded, catalog_model_identity, catalog_local_settings_considered, catalog_local_settings_invalid`).
- **Credit:** `dr-resolve-s3-r2.md S3-R2-C1`.

### A37 — task 5.1: `toProviderModel labels an aliased model by its folder name when no display name is set`

- **Expectation.** spec "An aliased model with no display name is labelled by its directory name";
  R5: `displayName ?? directoryName ?? id`.
- **Red.** `AssertionError: … + 'Qwen3-dir' / - 'qwen'` at `:1384:9` (base's id is the folder name).
- **Green.** `✓ …` (id `qwen`, name `Qwen3-dir`).
- **Credit:** `dr-resolve-s3-r1.md C5`.

### A38 — task 5.1: `toProviderModel prefers a display name over the folder name` (**pin**)

- **Expectation.** spec "A display name displaces the folder name" and "The overlay's display name wins
  over the server's".
- **Pin.** Green at base (`✓ …` in `spike-red-verbose.log`): base already prefers `displayName`, and
  the alias does not reach the label.
- **Mutations.**
  - `5.1-name-chain-order-swapped` (`directoryName ?? displayName ?? id`) → `Tests 1 failed | 58
    skipped`, Fixture A failing.
  - `5.1-overlay-display-name-skipped` → `Tests 1 failed | 58 skipped`, Fixture B failing.
- **Credit:** `dr-resolve-s5-r3.md RDY3-1`.

### A39 — task 5.2: `toProviderModel labels a fallback alias match by the overlay key, and by the published id with no match`

- **Expectation.** spec "The fallback path labels a model by the overlay key its alias matched" and
  "… whose directory name is unknown by its published id".
- **Red.** `AssertionError: … + 'qwen' / - 'Qwen3-dir'` at `:1434:9`.
- **Green.** `✓ …` (`Qwen3-dir` for the alias match; `qwen` for no overlay entry and for the
  shared-alias pair).
- **Mutations.**
  - `5.2-name-chain-drops-the-directory-name` → `Tests 1 failed | 58 skipped`, first half failing.
  - `5.2-first-competing-key-labels-the-model` → `Tests 1 failed | 58 skipped`, second half failing.
- **Credit:** `dr-resolve-s3-r1.md C5, C6`; `dr-resolve-s5.md RDY-4`.

### A40 — task 5.3: `the applied-settings event carries the directory name beside the published id`

- **Expectation.** spec "The applied-settings trace carries both names"; R11: "`before` and `after`
  records carry `directoryName` beside `id`".
- **Red.** `AssertionError: … + undefined / - 'qwen'` at `:1474:9` (no applied event at base).
- **Green.** `✓ …` (both paths: `modelId` `qwen`, `before.id` `qwen`, `before.directoryName`
  `Qwen3-dir`).
- **Mutation.** `5.3-directory-name-set-after-the-entry-applies` → `Tests 1 failed | 58 skipped`,
  failing here. Its second half, the held
  `an overlay entry carrying only unread keys emits no applied event`, stayed **green**; see G2.
- **Credit:** `dr-resolve-s3-r1.md C1`.

### A41 — task 6.1: `the network phase publishes and persists an alias as the model id`

- **Expectation.** spec "A saved default written as the alias starts on that model": "the catalog and
  Pi's persisted store both hold the alias as that model's `id`".
- **Red.** `AssertionError: … + 'Qwen3-dir'` at `test/refresh.test.ts:474:9`.
- **Green.** `✓ …` (`persisted` and `committed` ids `["qwen","plain"]`).
- **Mutations.** `6.1-never-publish-the-alias` → `Tests 1 failed | 11 skipped`; and
  `6.1-id-mapped-from-directory-name` (`id: m.directoryName ?? m.id`) →
  `Tests 1 failed | 11 skipped`. Both fail at this test.
- **Isolation.** The test writes no overlay file and assigns no `process.env` key (`design.md` R13).
- **Credit:** `dr-resolve-s3-r1.md C1`, `dr-resolve-s5-r3.md RDY3-6`.

### A42 — task 6.2: `the offline phase publishes the stored models and fetches nothing` (**pin**)

- **Expectation.** "the offline phase fetches nothing and re-keys nothing" (`tasks.md` 6.2).
- **Pin.** Untouched and green at base and on the green build (`✓` in both verbose logs); the offline
  phase restores `context.stored` without reading any id.

### A43 — task 6.3: `a list miss at thinking level off applies the off controls`

- **Expectation.** R8: "`index.ts`'s hook applies the off controls on a list miss when Pi's thinking
  level is `off`, and leaves the payload alone otherwise".
- **Red.** `AssertionError: Expected values to be strictly deep-equal: + undefined / - {` at
  `test/index.test.ts:601:11` (base returns `undefined`).
- **Green.** `✓ …` (`{ model: "unknown", thinking_budget: 0, chat_template_kwargs: { enable_thinking:
  false } }`), with a populated provider list holding another model.
- **Holds.** `a request for a model in no list is left alone` (level `high`) stays green.
- **Mutation.** `6.3-off-controls-only-when-the-list-is-empty` → `Tests 1 failed | 12 skipped`,
  failing here (`CB-R5-1`).
- **Credit:** `michael-council-rulings.md R8`, `dr-resolve-s5-r3.md RDY3-3`.

### A44 — task 6.4: the login probe counts the same models (no check of its own)

- **Expectation.** spec "The login probe counts the same models": "it counts the same registrable
  models it counted before, because the identity step drops only exact duplicate ids, first kept".
- **No new test**, as the task says: the count is proven where the list is built (`A4`, `A20`, `A24`),
  and `test/login.test.ts` proves only the wiring.
- **Measured holds.** Under `6.4-no-collapse-login-suite-holds`,
  `6.4-collapse-lowercased-login-suite-holds` and `6.4-withhold-declined-login-suite-holds`:
  `Tests 13 passed (13)` each — the login suite stays green under all three mutations, so nothing but
  the three named catalog tests is sensitive to them.

### A45 — task 7.1: `npm run check`

- `npm run check` on the full green build in the copy:
  `Checked 40 files in 13ms. No fixes applied.` → `Test Files 13 passed (13)` /
  `Tests 147 passed (147)`. Biome and `tsc --noEmit` are part of that command chain and both ran.
- Baseline for comparison: `Test Files 13 passed (13)` / `Tests 108 passed (108)` at `e9aba43`.

### A46 — task 7.2: `openspec validate respect-omlx-model-alias --strict`

- Run against the original workspace: `Change 'respect-omlx-model-alias' is valid`, exit 0.

### A47 — task 7.3: Joel's live check

- **Not run, and not runnable here:** no live OMLX server, no built extension, no network. `/model
  <alias>` without the picker, a start on an alias `defaultModel`, and `Ctrl+S` healing a folder-name
  default stay Joel's observation.

## Gaps

1. **`parseModelsResponse dedupes` keeps a name that now asserts the opposite.** `tasks.md` 2.2 and
   `design.md` R12/R13 call it by that name, and the brief pins "same test name", so the spike kept
   it while the assertion became "both `a` entries come back". Touches task 2.2 and `design.md`
   R12/R13. Evidence: A3. The implementation run should rename the test in
   `test/catalog.test.ts` (a test-file edit, not a Markdown one).

2. **Task 2.5's stated mutation for `fetchModels runs the collision check over the collapsed list`
   does not break it.** `tasks.md` 2.5 says "Run R6 over the uncollapsed parsed list; … declines `x`
   as `duplicate_alias` and fails". Measured: `2.5-collision-check-over-uncollapsed-list` →
   `Tests 1 passed | 58 skipped`. A duplicate of the entry under test carries the *same* endpoint id,
   and R6 skips any entry whose endpoint id equals the entry's own (`if (other.id === endpointId)
   continue`), so `parsed` and `collapsed` give identical decline reasons for every entry. The order
   `design.md:95` states ("R6 runs after the collapse") is therefore unobservable: neither this test
   nor any fixture can discriminate, and the test is red at base only through the missing identity
   event. Touches task 2.5 and `design.md` R9/R6. Evidence: A21.

3. **Task 5.3's second mutation claim does not hold.** `tasks.md` 5.3 says setting `directoryName`
   after `applyModelSettingsEntry` also fails
   `an overlay entry carrying only unread keys emits no applied event`. Measured:
   `5.3-directory-name-set-after-the-entry-applies-unread-keys` →
   `Tests 1 passed | 58 skipped`. The applied comparison is `applied` vs `before`, and that mutation
   leaves both without the directory name, so the event stays silent and only 5.3's own test catches
   it. Touches task 5.3. Evidence: A40.

4. **`catalog_status_loaded` / `catalog_models_loaded` counting entries before the collapse has no
   test.** `design.md` R11 states it and `tasks.md` 2.2 explicitly declines a test for a loaded
   event's `count`. Measured once in a throwaway check (`[a, a, b]` → `count: 3`), deleted with the
   copy; nothing in the suite pins it, so a later collapse-inside-the-parser would not be caught.
   Touches `design.md` R11 and task 2.2. Evidence: A1.

5. **"A stream event carries the published id" has no check of its own.** The scenario is proven only
   by construction (the stream readers name the model by `model.id`, which `toProviderModel` sets from
   the published id) plus `A41` for the persisted id. `tasks.md`'s scenario table says so, but no test
   observes a stream event's model name against an alias, so a future change that re-derived the wire
   value from `directoryName` would pass the suite. Touches the `catalog-discovery` scenario and task
   6.1. Evidence: the 147-test green run includes the untouched stream suites, which name ids
   directly.
