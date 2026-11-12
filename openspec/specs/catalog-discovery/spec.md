# catalog-discovery Specification

## Purpose
Defines what the extension does about the oMLX model catalog at a session's start: pi never waits on the request, a session that starts without a catalog stays as pi left it, and the user is told once per session when the request fails or the catalog lands late.

## Requirements

### Requirement: Startup Never Waits On The Catalog

The extension's factory SHALL resolve without awaiting any catalog request. Before it resolves, the extension SHALL register the models cached for the resolved base URL, or the login-only provider when no cache covers that URL. The catalog request SHALL continue after the factory resolves. Which credential decides the request, and the cases that make no request, stay as `openspec/specs/credential-resolution/spec.md` states them.

#### Scenario: An unresponsive server does not delay a cached start

- **WHEN** a stored credential resolves to a base URL whose cache holds models with positive limits, and the server accepts the connection without answering
- **THEN** the factory resolves with those cached models registered
- **AND** it resolves without waiting for the request to time out

#### Scenario: A session with no cache starts login-only

- **WHEN** the resolved base URL holds no cache
- **THEN** the factory resolves with the login-only provider registered
- **AND** no catalog result was awaited before it resolved

#### Scenario: The catalog request continues after startup

- **WHEN** the factory has resolved for a configured credential
- **THEN** the extension still requests the catalog
- **AND** the models the response holds with positive `contextWindow` and `maxTokens` are registered and written to the cache

### Requirement: A Session That Starts Without A Catalog Stays As Pi Left It

When no cached catalog covers the resolved base URL, the extension SHALL register the login-only provider and SHALL NOT choose the session's starting model. When the catalog arrives, the extension SHALL NOT change that model: it SHALL NOT call `pi.setModel`, and it SHALL NOT re-run pi's starting-model selection. The arrived models SHALL be registered under `omlx`, so the user can choose one through pi's model picker.

#### Scenario: A late catalog moves no model

- **WHEN** a session starts with no cache and the catalog arrives after that
- **THEN** the extension makes no `setModel` call for the arrived models
- **AND** it does not re-run pi's starting-model selection

#### Scenario: The late catalog registers under omlx

- **WHEN** the catalog arrives for a session that started with the login-only provider
- **THEN** `registerProvider` is called with the id `omlx` and the fetched models

### Requirement: One Warning Per Session When The Catalog Fails Or Lands Late

The extension SHALL show at most one warning per session, only through pi's `ctx.ui.notify`, and SHALL write nothing to stderr beyond what `openspec/specs/diagnostics/spec.md` allows. The warning fires when the catalog fails to load, a response with no registrable model counting as a failure, naming the resolved base URL and whether cached models or the login-only provider are in use. It fires for a late catalog only when the session started login-only.

#### Scenario: A failed request warns once, naming the URL and the cached models

- **WHEN** a catalog request fails while cached models are registered
- **THEN** one warning names the resolved base URL
- **AND** it says the session is using cached models

#### Scenario: A failure with no cache names the login-only provider

- **WHEN** a catalog request fails while the login-only provider is registered
- **THEN** one warning names the resolved base URL
- **AND** it says the login-only provider is in use

#### Scenario: A response with nothing registrable counts as a failure

- **WHEN** the server answers 200 with no model holding positive `contextWindow` and `maxTokens`
- **THEN** one warning is shown for that load
- **AND** no cache is written for it

#### Scenario: A failure before the session starts still warns

- **WHEN** a catalog request fails before `session_start` fires for the session
- **THEN** the session shows one warning once it starts

#### Scenario: A later success adds no second warning

- **WHEN** the first catalog request of a session fails and a later one succeeds
- **THEN** the session has shown one warning

#### Scenario: A late catalog warns when the session started login-only

- **WHEN** a session starts with no cache and the catalog arrives after startup
- **THEN** one warning names the resolved base URL
- **AND** it says the session started with the login-only provider
- **AND** it says the models from that URL are now available

#### Scenario: A warm cache warns about nothing

- **WHEN** cached models are registered at startup and the catalog arrives after startup without a failed load
- **THEN** no warning is shown

#### Scenario: An unconfigured credential warns about nothing

- **WHEN** no credential is configured, so no catalog request is made
- **THEN** no warning is shown for the session

#### Scenario: A run with no session UI writes nothing extra

- **WHEN** a warning fires while pi runs in print or JSON mode
- **THEN** the extension writes nothing to stderr that `openspec/specs/diagnostics/spec.md` does not allow

### Requirement: A Fetch That Outlives Its Session Changes Nothing

A catalog fetch that resolves after its session ended SHALL change nothing: it SHALL NOT register a provider, SHALL NOT write the cache and SHALL NOT warn. The session's end SHALL stop the poll's own fallback as well as the fetch's result.

#### Scenario: A fetch resolving after shutdown registers nothing and caches nothing

- **WHEN** a session shuts down with a catalog fetch pending and that fetch then resolves
- **THEN** no `registerProvider` call follows the shutdown
- **AND** the cache file is not written

#### Scenario: A fetch resolving after shutdown warns nobody

- **WHEN** a session shuts down with a catalog fetch pending and that fetch then resolves
- **THEN** no `notify` call follows the shutdown
