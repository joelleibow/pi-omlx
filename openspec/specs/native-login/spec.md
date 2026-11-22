# native-login Specification

## Purpose
Defines how `/login` reaches the extension, what it asks for, and what pi stores: a native API-key login on a complete provider, with a base URL and an optional key.

## Requirements

### Requirement: The Extension Declares A Native API-Key Login

The extension SHALL register a complete pi-ai `Provider` for `omlx` whose `auth` carries `apiKey` with `login`, `check` and `resolve`, and SHALL declare no OAuth handler. The provider SHALL supply `getModels`, `stream` and `streamSimple` itself (`research-chidi.md` Q1, Q6).

#### Scenario: `/login omlx` reaches the extension's login

- **WHEN** a user runs `/login omlx`
- **THEN** the extension's `auth.apiKey.login` runs
- **AND** no OAuth flow starts

#### Scenario: The provider is offered as an API-key login

- **WHEN** a user opens `/login` and chooses "Sign in with an API key"
- **THEN** `omlx` is listed

#### Scenario: No account login is offered

- **WHEN** a user opens `/login` and chooses "Sign in with an account"
- **THEN** `omlx` is not listed

### Requirement: The Login Asks For A Base URL And An Optional Key

The login SHALL prompt for a base URL and then for an API key that may be left empty, SHALL normalize the base URL to end in `/v1`, and SHALL reject an empty base URL (`research-eleanor.md`, "Current credential path", item 1; `research-chidi.md` Q1).

#### Scenario: A login with a key

- **WHEN** the login is given a base URL and a key
- **THEN** it returns a credential carrying that URL and that key

#### Scenario: A login with an empty key

- **WHEN** the login is given a base URL and no key
- **THEN** it returns a credential carrying that URL and no key

#### Scenario: A URL without `/v1` gains it

- **WHEN** the login is given `http://127.0.0.1:8000`
- **THEN** the credential carries `http://127.0.0.1:8000/v1`

#### Scenario: A blank base URL is rejected

- **WHEN** the login is given an empty base URL
- **THEN** it fails
- **AND** it stores nothing

### Requirement: The Login Returns The Credential Pi Stores

The login SHALL return an `api_key` credential: the base URL as provider-scoped environment, and the key when one was entered, omitted when none was. pi SHALL persist it under `omlx`; the extension SHALL NOT write `auth.json` (`research-chidi.md` Q1, Q2, Q4; `AGENTS.md`).

#### Scenario: The stored entry is api_key-typed

- **WHEN** a login completes and pi persists it
- **THEN** the `omlx` entry in `auth.json` has type `api_key`
- **AND** it carries the prompted base URL

#### Scenario: A keyless login stores no key

- **WHEN** a login completes with no key
- **THEN** the stored `omlx` entry carries no key

#### Scenario: The extension writes nothing to auth.json

- **WHEN** a login completes
- **THEN** every byte of `auth.json` outside the `omlx` entry is what it was before the login

### Requirement: The Login Leaves The Catalog To Pi

The login SHALL NOT register models and SHALL NOT publish a catalog; the probe described in "The Login Probes The Server Before It Saves" fetches the catalog and discards it, which publishes nothing. pi SHALL refresh `omlx`'s catalog after it persists the credential, and a refresh that fails SHALL leave the stored credential in place (`research-chidi.md` Q2, Q3; addendum `ebf305b8` Q2; `michael-orientation.md` trap ii).

#### Scenario: A login publishes nothing

- **WHEN** a login completes against a server
- **THEN** the extension registers no models and publishes no catalog during the login
- **AND** pi refreshes the catalog after the credential is stored

#### Scenario: A failed refresh keeps the credential

- **WHEN** the login's probe succeeds and the server then fails before pi's post-login refresh
- **THEN** the stored credential stays
- **AND** pi's warning says the catalog could not be refreshed

### Requirement: The Login Probes The Server Before It Saves

The login SHALL fetch the catalog once with the credential it is about to return, apply the same registrable-model rule `refreshModels` applies, and discard the result without publishing, storing or registering anything. A failed request, or a response holding no registrable model, SHALL fail the login with a message naming the cause, and pi SHALL store nothing (`owner-rulings.md`, 2026-11-12 C2; `council.md` C2; `michael-orientation.md` traps ii and iii).

#### Scenario: A reachable server lets the login finish

- **WHEN** the login is given a base URL and the server answers with a registrable model
- **THEN** the probe's result is discarded and the login returns the credential
- **AND** pi refreshes the catalog after it stores the credential

#### Scenario: An unreachable server fails the login

- **WHEN** the base URL names a server that does not answer
- **THEN** the login fails with a message naming the cause
- **AND** pi stores no `omlx` entry

#### Scenario: A rejected key fails the login

- **WHEN** the server refuses the credential the login is about to return
- **THEN** the login fails with a message naming the cause
- **AND** pi stores no `omlx` entry

#### Scenario: A catalog with no registrable model fails the login

- **WHEN** the server answers and no model in the response has positive context and output limits
- **THEN** the login fails with a message naming the cause
- **AND** pi stores no `omlx` entry

#### Scenario: A catalog with one unusable model still lets the login finish

- **WHEN** the response holds one model with positive context and output limits and one without
- **THEN** the login finishes and returns the credential
- **AND** the unusable model is skipped, not treated as a failure

#### Scenario: A keyless probe sends the placeholder bearer

- **WHEN** the login prompts for an API key and none is entered
- **THEN** the probe's request carries `Authorization: Bearer <placeholder>`

#### Scenario: The probe honours the interaction's signal

- **WHEN** the login's interaction aborts while the probe is in flight
- **THEN** the probe stops
- **AND** the login fails without storing a credential

#### Scenario: The probe publishes nothing

- **WHEN** the probe answers with registrable models
- **THEN** pi's model store holds what it held before
- **AND** the provider's model list is unchanged
