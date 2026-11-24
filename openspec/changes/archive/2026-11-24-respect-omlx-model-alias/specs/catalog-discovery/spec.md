# Spec Delta — catalog-discovery

## ADDED Requirements

### Requirement: The Server Decides Each Model's Published Id

The extension SHALL publish each parsed entry under the id its endpoint supplies, and SHALL use OMLX's `model_alias` instead only on `/models/status`, only when the alias is set, and only when no other parsed entry carries it, ignoring case, as an endpoint id or alias. Pi matches only `id` on `/model <arg>`, ignoring case, and on a stored `defaultModel`, exactly; it never reads `name`, so an alias resolves only as the id (`research-chidi.md` §1.2; `michael-orientation.md` T3).

#### Scenario: The status path publishes a unique alias as the id

- **WHEN** `/models/status` answers with an entry whose `model_alias` is set and no other parsed entry carries it, ignoring case, as an endpoint id or an alias
- **THEN** that model's published Pi `id` is the alias, byte-for-byte (`server.py:3995-3996`, `research-chidi.md` §2)

#### Scenario: An unset alias publishes the endpoint id

- **WHEN** an entry's `model_alias` is absent, `null`, not a string, or `""`
- **THEN** its published Pi `id` is the endpoint id (`council.md` R7)

#### Scenario: A whitespace-only alias publishes verbatim

- **WHEN** an entry's `model_alias` is only whitespace, and no other parsed entry carries it, ignoring case, as an endpoint id or an alias
- **THEN** its published Pi `id` is that value, unchanged (`council.md` R7; `server.py:3995-3996`)

#### Scenario: A padded alias publishes verbatim

- **WHEN** an entry's `model_alias` has leading or trailing spaces and other non-space characters, and no other parsed entry carries it, ignoring case, as an endpoint id or an alias
- **THEN** the published Pi `id` carries those spaces unchanged (`server.py:3822`; `council.md` R7)

#### Scenario: A duplicate alias is declined for both models

- **WHEN** two parsed status entries carry the same `model_alias`, ignoring case
- **THEN** neither is published under the alias
- **AND** each is published under its own endpoint id (`michael-orientation.md` T6)

#### Scenario: An alias equal to another model's directory name is declined

- **WHEN** an entry's alias equals another parsed status entry's endpoint id
- **THEN** the aliased model is published under its own endpoint id (`research-chidi.md` §2 routing order; `michael-orientation.md` T6)

#### Scenario: An alias differing from another directory name only by case is declined

- **WHEN** an entry's alias differs from another parsed status entry's endpoint id only by case
- **THEN** the aliased model is published under its own endpoint id (`engine_pool.py:2004-2013`, `:2033-2039`; `michael-orientation.md` T6)

#### Scenario: An alias equal to an exposed-profile id is declined

- **WHEN** an entry's alias equals an exposed-profile id in the same response
- **THEN** the aliased model is published under its own endpoint id (`research-chidi.md` §2 routing order; `michael-orientation.md` T6)

#### Scenario: An alias equal to its own directory name by case is not declined

- **WHEN** an entry's alias differs only by case from that entry's own endpoint id and collides with nothing else
- **THEN** it is published under the alias (`council.md` R6)

#### Scenario: The collision check reads every parsed entry

- **WHEN** the entry holding the alias the check compares against is hidden from `/models`, an exposed-profile entry, or missing limits
- **THEN** the aliased model is still published under its own endpoint id
- **AND** that other entry is still published as the server reported it (`michael-orientation.md` T6; `council.md` R6)

#### Scenario: An exposed-profile entry keeps its advertised id

- **WHEN** an entry is an exposed-profile entry carrying its `<alias>:<profile>` id and no `model_alias`
- **THEN** its published Pi `id` is the endpoint id (`michael-orientation.md` T7)

#### Scenario: A declined alias removes no model and fails no refresh

- **WHEN** a model is published under its endpoint id because its alias was declined
- **THEN** that model is still published
- **AND** the refresh succeeds (`council.md` R3, R6)

#### Scenario: The fallback path publishes the id `/models` returned

- **WHEN** `/models/status` cannot be read and `/models` answers with an entry whose `id` is the alias
- **THEN** that model's published Pi `id` is the value `/models` returned, whatever the local overlay says (`server.py:3818-3823`; `michael-orientation.md` T3)

#### Scenario: The fallback collapses exact duplicate ids to the first

- **WHEN** `/models` returns two entries with the same `id`
- **THEN** the first is published and the second is discarded, as today
- **AND** the identity trace names the discarded id (`src/catalog.ts:71-76`; `council.md` R3, R11)

#### Scenario: The fallback publishes ids that differ only by case as reported

- **WHEN** `/models` returns two ids differing only by case
- **THEN** both are published as reported
- **AND** the identity trace names the pair (`council.md` R3, R11)

#### Scenario: Both endpoints publish one id for the models they share

- **WHEN** two refreshes of the same server succeed, one on `/models/status` and one on `/models`
- **THEN** every model both endpoints list, whose alias the status path accepts, is published under the same id in both (`michael-orientation.md` T2; `council.md` R3)

#### Scenario: A saved default written as the alias starts on that model

- **WHEN** Pi's stored catalog already holds a model whose `id` is the alias, from a refresh that persisted
- **AND** `defaultModel` names that alias
- **THEN** the catalog and Pi's persisted store both hold the alias as that model's `id`
- **AND** Pi's exact `id` lookup resolves the default to it and never falls through to another provider's model (`research-chidi.md` §1.2; `michael-orientation.md` P1; `council.md` R2, R12)

#### Scenario: `/model <alias>` switches without opening the picker

- **WHEN** a user types `/model <alias>`, the catalog and Pi's persisted store hold that alias as a model `id`, and no other configured provider has a model whose `id` equals it, ignoring case
- **THEN** Pi's exact-match path selects the model rather than opening the picker pre-filled (`research-chidi.md` §1.2; `council.md` R12)

#### Scenario: A padded alias reaches the picker instead of switching

- **WHEN** a model's published id carries leading or trailing spaces and the user types `/model <that value>`
- **THEN** Pi trims the argument, finds no exact match, and opens the picker filtered to the model instead of switching
- **AND** a `defaultModel` holding the value byte-for-byte resolves (`council.md` R7)

#### Scenario: The overlay cannot rename a model

- **WHEN** the local overlay names an alias for a model the server does not alias
- **THEN** the published Pi `id` is still the endpoint's id
- **AND** the overlay applies its fields and never the published id (`michael-orientation.md` T3; `council.md` R4)

#### Scenario: The login probe counts the same models

- **WHEN** `/login omlx` probes the catalog after this change
- **THEN** it counts the same registrable models it counted before, because the identity step drops only exact duplicate ids, first kept, as the parsers did before (`src/login.ts:55-66`; `council.md` R3)

### Requirement: The Folder Name Is The Display Label Where No Display Name Is Set

The extension SHALL set Pi's `name` from a non-blank `display_name` — the overlay's over the server's — otherwise from the model's directory name when it is known, otherwise from the published id. A blank `display_name` is ignored on either side, as today. The label SHALL NOT be derived from the alias, because `display_name` is a UI name and `model_alias` is a routing name (`owner-rulings.md`, 2026-11-22, Option 1; `council.md` R5; `michael-orientation.md` T4).

#### Scenario: An aliased model with no display name is labelled by its directory name

- **WHEN** a status entry carries an alias and no non-blank `display_name`
- **THEN** Pi's `name` for it is the raw directory name (`owner-rulings.md`, 2026-11-22, Option 1)

#### Scenario: The fallback path labels a model by the overlay key its alias matched

- **WHEN** `/models` answers, the model has an alias, and one overlay entry's `model_alias` matches it
- **THEN** Pi's `name` for it is that entry's key, because that key is its directory name (`council.md` R5)

#### Scenario: The fallback path labels an aliased model whose directory name is unknown by its published id

- **WHEN** `/models` answers, the model has an alias, and no overlay entry matches it
- **THEN** Pi's `name` for it is the published id (`council.md` R5)

#### Scenario: A display name displaces the folder name

- **WHEN** an entry carries both an alias and a non-blank `display_name`, from the server or the overlay
- **THEN** Pi's `name` for it is that `display_name` (`michael-orientation.md` T4)

#### Scenario: The overlay's display name wins over the server's

- **WHEN** the server and the overlay both set a non-blank `display_name`
- **THEN** Pi's `name` is the overlay's (`src/catalog.ts:97-98`, `:571-572`)

#### Scenario: A model without an alias is labelled as it is today

- **WHEN** an entry carries no alias
- **THEN** Pi's `name` is its `display_name`, or the directory name when no display name is set (`src/catalog.ts:257`)

#### Scenario: The folder name is findable in the picker exactly when it is the label

- **WHEN** a user searches the picker for an aliased model's folder name
- **THEN** the model matches when the folder name is its label
- **AND** it does not match on that text when a `display_name` took the label (`research-chidi.md` §1.2; `council.md` R5)

### Requirement: The Overlay Is Matched Through The Directory Name On Both Paths

The extension SHALL match a `model_settings.json` entry by the model's directory name: on `/models/status` by the entry keyed by the endpoint id; on `/models` by a key equal to the published id, else by the single entry whose `model_alias` equals that id byte-for-byte. Two or more alias matches SHALL apply no fields and be traced, and no match is case-insensitive. A match applies the entry's fields and never the published id (`michael-orientation.md` T2, T3; `council.md` R4).

#### Scenario: The status path matches the overlay by directory name

- **WHEN** `/models/status` answers and the overlay keys the entry by its directory name
- **THEN** that entry's fields apply, as they do today (`src/catalog.ts:541`)

#### Scenario: The fallback path matches a key equal to the published id

- **WHEN** `/models/status` fails, `/models` answers, and the overlay keys an entry by the id `/models` returned
- **THEN** that entry's fields apply (`council.md` R4)

#### Scenario: The fallback path recovers an aliased model's directory name through one alias match

- **WHEN** `/models/status` fails, `/models` answers with an alias id, and exactly one overlay entry's `model_alias` equals that id
- **THEN** that entry's fields apply to the model
- **AND** the context window and output limit come from the overlay rather than from the global defaults (`michael-orientation.md` T2; `council.md` R4)

#### Scenario: The exact key is tried before an alias match

- **WHEN** one overlay entry is keyed by the published id and a different entry's `model_alias` also equals it
- **THEN** the entry keyed by the published id supplies the fields, because OMLX resolves a directory name before an alias (`engine_pool.py:2033-2070`; `council.md` R4)

#### Scenario: Two overlay entries sharing an alias apply no fields

- **WHEN** two overlay entries carry the same `model_alias` and that value equals a model's published id
- **THEN** neither entry's fields apply to that model
- **AND** the trace names both competing keys and the model (`council.md` R4, R11)

#### Scenario: No matching entry applies no fields

- **WHEN** neither a directory-name key nor an alias match exists for a model
- **THEN** no overlay fields apply
- **AND** the global defaults and the architectural clamp fill limits as they do today

#### Scenario: An overlay file that parses to `null` applies no fields

- **WHEN** the overlay file's whole content is the JSON value `null`
- **THEN** no overlay fields apply and the refresh succeeds on the endpoint that answered, with no `/models` request after a status answer
- **AND** the trace records `catalog_local_settings_invalid`, as for any file without a `models` object (`src/catalog.ts:531-537`)

#### Scenario: An alias match never changes the published id

- **WHEN** an overlay entry is reached through its `model_alias` value
- **THEN** the published Pi `id` is still the one the endpoint reported (`michael-orientation.md` T3)

#### Scenario: A stale overlay entry cannot move the published id

- **WHEN** the overlay names a `model_alias` that the server no longer serves under that model
- **THEN** the published id stays the server's, and only that entry's fields can reach the model it matched
- **AND** the trace names the matched key as the path back to the entry (`council.md` R4)

### Requirement: The Identity And Overlay Decisions Are Traceable

For each fetch the extension SHALL emit one `onDebug` identity event carrying one structured record per kept entry — endpoint id, directory name or `null`, alias or `null`, published id, and a decline reason from a closed set — plus the endpoint ids the identity step collapsed as exact duplicates and the published ids that differ only by case (`michael-orientation.md` T11; `council.md` R11). Every line SHALL ride the existing `PI_OMLX_DEBUG` predicate and `[pi-omlx]` prefix.

#### Scenario: A fetch emits one identity event naming every entry the collapse keeps

- **WHEN** a refresh or a login probe parses a response
- **THEN** one debug event carries a record per kept entry, in response order, with its endpoint id, directory name or `null`, alias or `null`, published id, and decline reason
- **AND** a declined alias names its ground from the closed set (`council.md` R11)

#### Scenario: The identity event shows the exact alias values

- **WHEN** an alias carries padding or differs only by case
- **THEN** the event carries the value unchanged, because it is a structured field rather than a truncated string (`src/debug.ts:14-20`; `council.md` R11)

#### Scenario: The exact duplicates the identity step collapses appear in the identity event

- **WHEN** the identity step collapses a duplicate endpoint id, on either endpoint
- **THEN** the event names the discarded id in its duplicates list and gives it no entry record (`council.md` R11)

#### Scenario: The overlay match outcome is traced

- **WHEN** the overlay pass runs over a model
- **THEN** its outcome is recorded as a directory-name key, an alias match with the matched key, an ambiguity, or no match (`council.md` R11)

#### Scenario: The applied-settings trace carries both names

- **WHEN** an overlay entry's fields are applied to a model whose directory name differs from its published id
- **THEN** `catalog_local_model_settings_applied` carries the directory name and the published id (`src/catalog.ts:551-557`; `council.md` R11)

#### Scenario: A stream event carries the published id

- **WHEN** the extension emits a stream event for a model
- **THEN** the model is named by its published id, which is the value sent on the wire (`research-chidi.md` §1.4; `council.md` R11)

#### Scenario: No tracing happens without the predicate

- **WHEN** `PI_OMLX_DEBUG` is unset
- **THEN** none of these events is emitted (`diagnostics`, "Debug Tracing Answers to PI_OMLX_DEBUG")
