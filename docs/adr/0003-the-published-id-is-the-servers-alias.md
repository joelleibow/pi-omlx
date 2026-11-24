# 0003 The published id is the server's alias

**Status:** Accepted

## Context

Pi matches a model by its id and by nothing else: `/model <argument>` compares the id, ignoring case, and a stored default compares it byte for byte. The display name is consulted only by the picker and the fuzzy paths. An OMLX model may carry an alias, and the alias is the name the server routes and the name a user types, so a model registered under its folder name is reachable only by the name the user did not choose.

The extension registered every model under its folder name. An aliased model therefore answered to neither `/model <alias>` nor a saved default of the alias, and the alias field was dropped on the way in. The server's own `/models` endpoint lists the alias in place of the folder name, so the two endpoints disagreed about what a model is called as well.

The choice is what name a model carries across the extension's boundary into Pi. It cannot be deferred to the display field: a second name there is invisible to both matching paths.

## Decision

A model's published id is the name the server gives it. On `/models/status` that is the alias when the alias is set and no other entry claims it, ignoring case, as a model id or an alias; otherwise the folder name. On the `/models` fallback it is the id that endpoint returned. A collision declines to the folder name rather than dropping the model, because OMLX resolves model ids before aliases.

The folder name stays Pi's display label wherever the server sets no display name and the catalog holds the folder name, so the model stays findable in the picker by the name its folder carries. The status endpoint reports the folder name; the fallback endpoint reports only the alias, so there the label is the alias unless an overlay entry supplies the folder name. The metadata overlay keeps matching on the folder name, which is the key OMLX's own settings file uses; on the fallback path it finds an aliased model through the id the endpoint reported, or through an entry whose `model_alias` is that id.

Nothing is migrated. Pi's settings, session records, model store and `models.json` keep whatever they already hold.

## Consequences

`/model <alias>` and a saved default of the alias both resolve, on either endpoint, and a model keeps one id across a refresh that switches endpoints.

The cost lands on users who already saved the folder name. A saved default, a session record, a `models.json` override or a glob `enabledModels` entry written under the folder name stops resolving after the first refresh that publishes the alias. A saved default misses on every start until the alias is saved as the default, with `Ctrl+S` in `/model` or an edit to `settings.json`; `/model <alias>` and pressing Enter switch only the current session. No warning is added, because the extension's at-most-one startup warning is spent on the case where Pi holds no catalog at all.

A session that outlives the re-key keeps the model object Pi held, and its id no longer matches the refreshed list. The request hook applies the `off` controls on that miss, which is the one level whose omission contradicts what Pi displays; at any other level the server's own thinking default applies for the rest of the session.

An alias that equals another configured provider's model id makes a bare `/model <alias>` ambiguous, because Pi's exact match is not scoped to a provider. The provider-scoped form, `/model omlx/<alias>`, resolves it. Declining the alias instead would break the saved default that works, so collisions are decided only against the server's own names.

The fallback cannot see what `/models` hides. A server that refuses its main key on `/models/status` lists two settings entries sharing an alias as two rows with one id, so the second model is invisible there until status answers, and a folder-name-keyed overlay entry does not match until the alias names it. The status path is the authority whenever it answers, and the identity trace records which endpoint answered.
