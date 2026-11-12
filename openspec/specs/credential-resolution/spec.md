# credential-resolution Specification

## Purpose
Defines which credential decides the OMLX base URL, the API key and keyless-ness, and how the model catalog and chat requests are kept on that same one.

## Requirements

### Requirement: One Credential Decides The Base URL And Key

The extension SHALL resolve the base URL and the API key from one credential. A stored `omlx` credential decides both: its own base URL or `DEFAULT_OMLX_BASE_URL`, and its key, which may be empty. `OMLX_BASE_URL` and `OMLX_API_KEY` SHALL apply only when no credential is stored.

#### Scenario: A stored credential outranks both environment variables

- **WHEN** a stored oauth credential holds a base URL and a key and both variables are set
- **THEN** the catalog request goes to the stored URL with the stored key
- **AND** the registration carries that `baseUrl`, `apiKey` `$OMLX_API_KEY` and `authHeader` true

#### Scenario: A stored credential with an empty key registers keyless

- **WHEN** a stored oauth credential holds an empty `access` and `OMLX_API_KEY` is set
- **THEN** the catalog request carries no Authorization header
- **AND** the registration omits `apiKey` and sets `authHeader` false

#### Scenario: A stored api_key with an empty key is not configured

- **WHEN** a stored `api_key` credential holds an empty key and `OMLX_API_KEY` is set
- **THEN** the resolution reports not configured and the extension makes no catalog fetch
- **AND** the login-only provider is registered, with no `apiKey` on it

#### Scenario: A stored credential without a base URL takes the default

- **WHEN** a stored `api_key` credential holds a key and no base URL and `OMLX_BASE_URL` names another server
- **THEN** the catalog request goes to `DEFAULT_OMLX_BASE_URL` with the stored key
- **AND** the registration's `baseUrl` is `DEFAULT_OMLX_BASE_URL`

#### Scenario: The environment supplies both halves when nothing is stored

- **WHEN** nothing is stored and both variables are set
- **THEN** the catalog request goes to the environment's URL with the environment's key as a Bearer credential
- **AND** the registration carries that `baseUrl` with `apiKey` `$OMLX_API_KEY` and `authHeader` true

#### Scenario: Nothing stored and nothing set registers the login-only provider

- **WHEN** nothing is stored and neither variable is set
- **THEN** the resolution reports not configured and the extension makes no catalog fetch
- **AND** the login-only provider is registered

### Requirement: The Catalog And Requests Use The Same Resolution

The extension SHALL fetch the catalog with the credential it registers for requests: one resolution SHALL produce the catalog URL and key and the registered `baseUrl`, `apiKey` and `authHeader`. Keyless-ness SHALL be a property of that credential, derived from an empty key and never from environment variables read at fetch or registration time.

#### Scenario: The poll re-fetches with the stored credential while both variables are set

- **WHEN** a credential is stored, both variables are set, and the ten-minute poll re-fetches
- **THEN** the fetch goes to the stored URL with the stored key
- **AND** the registration keeps the stored `baseUrl` with `apiKey` `$OMLX_API_KEY`

#### Scenario: A login with an empty key returns a keyless credential while an environment key is set

- **WHEN** `/login` completes with an empty key while `OMLX_API_KEY` is set
- **THEN** the credential the login callback returns carries the prompted base URL and an empty key
- **AND** the catalog request made for it carries no Authorization header
- **AND** the registration omits `apiKey`

### Requirement: A Keyless Registration Clears The Previous One

When the extension registers `omlx` keyless, it SHALL call `pi.unregisterProvider` first, so pi cannot inherit an `apiKey` from an earlier keyed registration. The trigger SHALL be the registration shape, not remembered keyed-ness.

#### Scenario: A keyless registration after a keyed one unregisters first

- **WHEN** the extension registers keyless after a keyed registration
- **THEN** `unregisterProvider("omlx")` is called before `registerProvider`
- **AND** the keyless registration omits `apiKey`

#### Scenario: Every keyless registration takes the same path

- **WHEN** a steady-state keyless poll re-registers the provider
- **THEN** it also calls `unregisterProvider` first

### Requirement: A Base URL Alone Stays Unconfigured

With no stored credential and no `OMLX_API_KEY`, `OMLX_BASE_URL` alone SHALL leave the provider unconfigured: the extension SHALL make no catalog fetch and SHALL register the login-only provider. A keyless server is reached with `/login` and an empty key.

#### Scenario: A base URL alone makes no catalog fetch

- **WHEN** only `OMLX_BASE_URL` is set and nothing is stored
- **THEN** the extension makes no catalog fetch
- **AND** the login-only provider is registered

#### Scenario: A keyless server is configured by a login

- **WHEN** `/login` completes with an empty key and a base URL
- **THEN** the catalog fetch goes to that URL with no Authorization header
- **AND** the registration is keyless

### Requirement: The Trace Names The Credential Source

With `PI_OMLX_DEBUG` on, the extension SHALL report which side the resolution took on the existing `provider_registered` line, as `stored` or `environment`. The line SHALL carry no key. The predicate and the `[pi-omlx]` prefix stay as `openspec/specs/diagnostics/spec.md` fixes them.

#### Scenario: A stored credential reports stored

- **WHEN** `PI_OMLX_DEBUG` is set and a stored credential decides the values
- **THEN** the `provider_registered` line carries `source` `stored`
- **AND** the line carries no key

#### Scenario: The environment reports environment

- **WHEN** `PI_OMLX_DEBUG` is set, nothing is stored, and `OMLX_API_KEY` supplies the key
- **THEN** the `provider_registered` line carries `source` `environment`
