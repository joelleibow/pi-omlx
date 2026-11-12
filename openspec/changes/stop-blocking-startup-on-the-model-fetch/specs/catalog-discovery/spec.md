# Spec Delta

## Purpose

Defines what the extension does about the oMLX model catalog at a session's start: pi never waits on the request, a session that starts without a catalog stays as pi left it, and the user is told once per session when the request fails or the catalog lands late.

## ADDED Requirements

### Requirement: Startup Never Waits On The Catalog

The extension's factory SHALL resolve without awaiting any catalog request. Before it resolves, the extension SHALL register the models cached for the resolved base URL, or the login-only provider when no cache covers that URL. The catalog request SHALL continue after the factory resolves, and its result SHALL still register and write the cache. Which credential decides the request, and the cases that make no request, stay as `openspec/specs/credential-resolution/spec.md` states them.

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
- **AND** what it fetches is registered and written to the cache

### Requirement: A Session That Starts Without A Catalog Stays As Pi Left It

When no cached catalog covers the resolved base URL, the extension SHALL register the login-only provider and SHALL NOT choose the session's starting model; pi chooses it without oMLX models. The extension SHALL NOT change that model when the catalog arrives, and SHALL NOT retry pi's starting-model selection. Choosing an oMLX model SHALL be the user's, through pi's model picker, once the catalog has arrived.

#### Scenario: A late catalog does not move the session's model

- **WHEN** a session starts with no cache and the catalog arrives after that
- **THEN** the session's model is the one pi chose without the oMLX catalog
- **AND** the extension did not select a model for the user

#### Scenario: The late catalog is reachable through the model picker

- **WHEN** the catalog a session started without has arrived
- **THEN** its models are registered under the provider id `omlx`
- **AND** the user can choose one from pi's model picker

### Requirement: One Warning Per Session When The Catalog Fails Or Lands Late

The extension SHALL show at most one warning per session, through pi's session UI. The warning fires when a catalog request fails, and it names the resolved base URL and whether cached models or the login-only provider are in use. It also fires when the catalog arrives after startup for a session that started login-only. A warm-cache session SHALL get no warning for a catalog that arrives normally, and no warning SHALL be shown where pi provides no session UI.

#### Scenario: A failed request warns once, naming the URL and the cached models

- **WHEN** a catalog request fails while cached models are registered
- **THEN** one warning names the resolved base URL
- **AND** it says the session is using cached models

#### Scenario: A later success adds no second warning

- **WHEN** the first catalog request of a session fails and a later one succeeds
- **THEN** the session has shown one warning

#### Scenario: A late catalog warns when the session started login-only

- **WHEN** a session starts with no cache and the catalog arrives after startup
- **THEN** one warning names the resolved base URL
- **AND** it says the login-only provider is in use

#### Scenario: A warm cache warns about nothing

- **WHEN** cached models are registered at startup and the catalog arrives after startup without a failed request
- **THEN** no warning is shown

#### Scenario: A run with no UI shows no warning

- **WHEN** pi runs in print or JSON mode, where the session UI ignores what the extension gives it
- **THEN** no warning is shown
- **AND** stderr carries only what `openspec/specs/diagnostics/spec.md` allows
