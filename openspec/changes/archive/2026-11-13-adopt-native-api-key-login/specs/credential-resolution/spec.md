# Spec Delta

## REMOVED Requirements

### Requirement: One Credential Decides The Base URL And Key

**Reason**: The requirement names the legacy `ProviderConfig` registration fields (`apiKey` `$OMLX_API_KEY`, `authHeader`), which a complete `Provider` does not have (`research-chidi.md` Q1, Q6; `michael-orientation.md` trap i), and its scenario "A stored api_key with an empty key is not configured" contradicts the keyless shape a native login stores (`research-chidi.md` Q4; `michael-orientation.md` trap v).

**Migration**: Replaced by "Pi's Resolve Decides The Base URL, The Key And Keyless-ness" and "A Keyless Login Sends A Placeholder Bearer" below. The stored-first order does not change.

### Requirement: The Catalog And Requests Use The Same Resolution

**Reason**: Its first scenario is the extension's ten-minute poll, which ruling A removes (`owner-rulings.md`), and the resolution now runs in the hooks pi calls (`research-chidi.md` Q2).

**Migration**: Replaced by "The Catalog And Chat Share The One Resolution" below.

### Requirement: A Keyless Registration Clears The Previous One

**Reason**: The inheritance it guards against belongs to the legacy composer: `registerProvider(name, config)` merges defined fields over the previous registration, so a keyless registration could inherit an `apiKey` (`research-chidi.md` Q6). A native provider is registered once and its models are published, so there is no keyless registration shape to clear.

**Migration**: Keyless-ness is now what `resolve` returns for the one provider object; the requirement's tests go with `toProviderConfig`.

## ADDED Requirements

### Requirement: Pi's Resolve Decides The Base URL, The Key And Keyless-ness

The extension SHALL resolve the base URL, the API key and keyless-ness inside the `auth.apiKey.check` and `resolve` hooks pi calls, from the credential pi supplies (`research-chidi.md` Q2). A stored `omlx` credential SHALL decide all three: its own base URL or `DEFAULT_OMLX_BASE_URL`, and its key, which may be absent. `OMLX_BASE_URL` and `OMLX_API_KEY` SHALL apply only when pi supplies no stored credential, as `docs/adr/0001-one-credential-decides-the-omlx-connection.md` fixes the order.

#### Scenario: A stored credential outranks both environment variables

- **WHEN** a stored `api_key` credential holds a base URL and a key and both variables are set
- **THEN** `resolve` returns the stored URL and the stored key
- **AND** the environment is consulted for neither

#### Scenario: A stored login with no key stays keyless while the environment key is set

- **WHEN** a stored credential holds a base URL and no key and `OMLX_API_KEY` is set
- **THEN** `resolve` returns the stored URL and a placeholder key
- **AND** the environment key is not used

#### Scenario: A stored credential without a base URL takes the default

- **WHEN** a stored credential holds a key and no base URL and `OMLX_BASE_URL` names another server
- **THEN** `resolve` returns `DEFAULT_OMLX_BASE_URL` with the stored key

#### Scenario: The environment supplies both halves when nothing is stored

- **WHEN** pi supplies no stored credential and both variables are set
- **THEN** `resolve` returns the environment's URL and the environment's key

#### Scenario: Nothing stored and nothing set is unconfigured

- **WHEN** nothing is stored and neither variable is set
- **THEN** `check` returns nothing
- **AND** no catalog fetch is made for `omlx`

### Requirement: A Keyless Login Sends A Placeholder Bearer

A saved login with no key SHALL count as configured: `check` SHALL report `omlx` configured whenever pi supplies a stored `api_key` credential, keyed or not, and `resolve` SHALL return a placeholder key when the stored credential has none. The catalog request and chat requests SHALL each carry `Authorization: Bearer <placeholder>` (ruling C in `owner-rulings.md`; `research-chidi.md` Q4, addendum `8e4d016f`).

#### Scenario: A keyless login is configured

- **WHEN** a stored credential holds a base URL and no key
- **THEN** `check` reports `omlx` configured
- **AND** the provider's models are available to pi

#### Scenario: The catalog request carries the placeholder bearer

- **WHEN** the catalog is fetched for a keyless login
- **THEN** the request carries `Authorization: Bearer <placeholder>`

#### Scenario: Chat carries the same placeholder

- **WHEN** a chat request is made for a keyless login
- **THEN** the request carries `Authorization: Bearer <placeholder>`

#### Scenario: A keyed login sends its own key

- **WHEN** a stored credential holds a key
- **THEN** the catalog request and the chat request carry that key as the bearer

### Requirement: A Saved Login Of The Old Shape Is Not Configured

A stored `omlx` credential of type `oauth` SHALL resolve as not configured: no catalog fetch and no request SHALL use it (`research-chidi.md` Q5). The extension SHALL NOT rewrite it, SHALL NOT read it as a legacy login, and SHALL NOT register an OAuth handler for `omlx`. The message the extension shows for that state, and the documentation, SHALL name `/logout` then `/login` (ruling B in `owner-rulings.md`).

#### Scenario: An OAuth-shaped entry leaves the provider unconfigured

- **WHEN** a stored `omlx` credential has type `oauth` and nothing else configures the provider
- **THEN** `check` returns nothing
- **AND** no catalog fetch is made

#### Scenario: The extension writes no replacement entry

- **WHEN** the extension runs with an OAuth-shaped entry stored
- **THEN** the `omlx` entry in `auth.json` holds the bytes it held before

#### Scenario: The message names the remedy

- **WHEN** the extension reports the unconfigured state
- **THEN** the message names `/logout` then `/login`

### Requirement: The Catalog And Chat Share The One Resolution

The credential `resolve` returns SHALL be the one pi uses for the catalog refresh and for chat requests: the refresh SHALL take its base URL and key from the credential pi hands `refreshModels`, and SHALL NOT resolve the credential a second time or consult `OMLX_API_KEY` at fetch time (`research-chidi.md` Q2, addendum `ebf305b8` Q1).

#### Scenario: The refresh and the request carry the same URL and key

- **WHEN** a stored credential is keyed and pi refreshes the catalog and then sends a chat request
- **THEN** both carry the stored URL and the stored key

#### Scenario: No second resolution at fetch time

- **WHEN** the catalog refresh runs while `OMLX_API_KEY` is set and a different key is stored
- **THEN** the request carries the stored key

## MODIFIED Requirements

### Requirement: A Base URL Alone Stays Unconfigured

With no stored credential and no `OMLX_API_KEY`, `OMLX_BASE_URL` alone SHALL leave the provider unconfigured: the extension SHALL make no catalog fetch and SHALL leave `omlx` unconfigured. A keyless server is reached with `/login` and an empty key.

#### Scenario: A base URL alone makes no catalog fetch

- **WHEN** only `OMLX_BASE_URL` is set and nothing is stored
- **THEN** the extension makes no catalog fetch
- **AND** `check` reports `omlx` unconfigured

#### Scenario: A keyless server is configured by a login

- **WHEN** `/login` completes with an empty key and a base URL
- **THEN** the catalog fetch goes to that URL with `Authorization: Bearer <placeholder>`
- **AND** `check` reports `omlx` configured

### Requirement: The Trace Names The Credential Source

With `PI_OMLX_DEBUG` on, the extension SHALL report which side the resolution took on the existing `provider_registered` line, as `stored` or `environment`, when it resolves a credential pi asked for. The line SHALL carry no key. The predicate and the `[pi-omlx]` prefix stay as `openspec/specs/diagnostics/spec.md` fixes them.

#### Scenario: A stored credential reports stored

- **WHEN** `PI_OMLX_DEBUG` is set and pi supplies a stored credential
- **THEN** the `provider_registered` line carries `source` `stored`
- **AND** the line carries no key

#### Scenario: The environment reports environment

- **WHEN** `PI_OMLX_DEBUG` is set, nothing is stored, and `OMLX_API_KEY` supplies the key
- **THEN** the `provider_registered` line carries `source` `environment`
