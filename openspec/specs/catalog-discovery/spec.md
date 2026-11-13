# catalog-discovery Specification

## Purpose
Defines what the extension does about the oMLX model catalog at a session's start: pi never waits on the request, a session that starts without a catalog stays as pi left it, and the user is told once per session when the request fails or the catalog lands late.

## Requirements

### Requirement: Pi's Refresh Decides When The Catalog Is Fetched

The extension SHALL supply `refreshModels` and SHALL NOT fetch the catalog on a timer. pi calls the hook at a session's start, after a login, when `/model` opens, and at RPC startup, and never on a schedule (`research-chidi.md` addendum `ebf305b8` Q2; ruling A).

#### Scenario: A session start restores the stored catalog without a network request

- **WHEN** a stored catalog covers `omlx` and a session starts
- **THEN** the offline phase publishes it before the session exists
- **AND** no network request is made before the session exists

#### Scenario: A login refreshes the catalog

- **WHEN** a login completes
- **THEN** pi refreshes `omlx`'s catalog with the network allowed

#### Scenario: `/model` refreshes the catalog

- **WHEN** the model picker opens
- **THEN** pi refreshes `omlx`'s catalog with the network allowed

#### Scenario: No timer refreshes the catalog

- **WHEN** a session runs with no login, no `/model` and no restart
- **THEN** the extension makes no catalog request
- **AND** a change on the server appears only at the next of those triggers

### Requirement: A Session Start Waits For No Network Fetch

Only the offline restore phase SHALL run before a session exists. The network refresh SHALL NOT delay a session's start, whether or not a stored catalog covers `omlx` (`research-chidi.md` addendum `ebf305b8` Q2, Q4).

#### Scenario: An unresponsive server does not delay a start with a stored catalog

- **WHEN** a stored catalog covers `omlx` and the server accepts the connection without answering
- **THEN** the session starts with the stored models published
- **AND** it starts without waiting for the request to time out

#### Scenario: An unresponsive server does not delay a start with no stored catalog

- **WHEN** no stored catalog covers `omlx` and the server accepts the connection without answering
- **THEN** the session starts
- **AND** it starts without waiting for the request to time out

#### Scenario: The network refresh continues after the session starts

- **WHEN** the session exists and the network refresh is still running
- **THEN** the models the response holds are published when it answers

### Requirement: The Catalog Lives In Pi's Model Store

The extension SHALL publish a catalog through `context.publish({ persist, update })` and SHALL NOT write a catalog cache of its own. pi SHALL store the published catalog in its model store under pi's agent directory, keyed `omlx`, and SHALL restore it in the offline phase (`research-chidi.md` addendum `ebf305b8` Q1).

#### Scenario: A successful network refresh persists under omlx

- **WHEN** the network phase publishes models
- **THEN** pi's model store holds them under `omlx`
- **AND** no `cache/omlx-models.json` is written

#### Scenario: A start reads the store, not a cache of the extension's

- **WHEN** a session starts and pi's model store holds a catalog for `omlx`
- **THEN** those models are published without a network request

#### Scenario: A failed refresh keeps the stored catalog

- **WHEN** the network phase throws or publishes nothing
- **THEN** the store and the published list hold what they held before

#### Scenario: A response with one model lacking limits publishes the rest

- **WHEN** the network phase's response holds one model with positive context and output limits and one without
- **THEN** the one with limits is published and the other is skipped
- **AND** the skipped one does not count as a failure (`index.ts:324-325` at HEAD filters the same way)

### Requirement: A Refresh That Is Superseded Or Aborted Publishes Nothing

A publish whose refresh was aborted or superseded SHALL write nothing and change nothing: pi rejects it before the store write and before the in-memory swap (`research-chidi.md` addendum `ebf305b8` Q1).

#### Scenario: An aborted refresh publishes nothing

- **WHEN** a refresh's signal aborts before its publish
- **THEN** the store and the published list are unchanged

#### Scenario: A superseded refresh publishes nothing

- **WHEN** a newer refresh of `omlx` starts before an older one publishes
- **THEN** the older one's publish changes nothing

### Requirement: A Session Start Warns At Most Once About The Model It Landed On

At a session's start the extension SHALL show at most one warning. For an OAuth-shaped stored `omlx` entry it SHALL be ruling B's `/logout` then `/login` remedy; otherwise, when `omlx` resolves as configured and pi holds no `omlx` model, it SHALL warn that the session landed on another provider's model and name `/model`. A configured start with models, and an unconfigured start, SHALL show nothing (`owner-rulings.md`, 2026-11-12 C1; `council.md` C1).

#### Scenario: A configured start with no models warns once

- **WHEN** a session starts, `omlx` resolves as configured, and pi holds no `omlx` model
- **THEN** one warning says the session landed on another provider's model
- **AND** it names `/model` as the way to switch
- **AND** that start shows no second warning

#### Scenario: A configured start with models warns about nothing

- **WHEN** a session starts, `omlx` resolves as configured, and pi holds at least one `omlx` model
- **THEN** no warning is shown

#### Scenario: The OAuth-shaped entry takes the warning

- **WHEN** the stored `omlx` entry is `oauth`-typed, whatever `omlx` reports
- **THEN** the only warning names `/logout` then `/login`
- **AND** the landed-model warning is not shown

#### Scenario: An unconfigured start warns about nothing

- **WHEN** nothing configures `omlx`
- **THEN** no warning is shown

#### Scenario: The configured state comes from pi's provider auth status

- **WHEN** the extension decides whether to warn
- **THEN** it treats a defined answer from `getProviderAuth("omlx")` as configured, and a rejection as unconfigured
- **AND** it never reads `hasConfiguredAuth` with a provider id, which takes a model and would report false (`model-registry.js:31-33`; measured in `scratch-michael/has-configured.mjs`)

#### Scenario: The model count is the list pi chose from

- **WHEN** the extension decides whether the start landed on another provider's model
- **THEN** it counts the models `provider.getModels()` serves
- **AND** it reads no catalog list of its own (`research-chidi.md` addendum `ebf305b8` Q4)

#### Scenario: A run with no session UI writes nothing

- **WHEN** the session runs in print or json mode and the warning's state holds
- **THEN** nothing is written to stdout or stderr (`runner.js:132-136`, `print-mode.js:60`)

### Requirement: The Extension Never Chooses The Session's Model

A catalog that arrives after a session started SHALL NOT change the session's model: the extension SHALL NOT call `pi.setModel` and SHALL NOT re-run pi's starting-model selection. The published models SHALL be selectable through pi's model picker (`research-chidi.md` addendum `ebf305b8` Q4, Q6, Q7).

#### Scenario: A catalog arriving after startup moves no model

- **WHEN** a session starts and the catalog is published after that
- **THEN** the extension makes no `setModel` call
- **AND** it does not re-run pi's starting-model selection

#### Scenario: The published models are selectable

- **WHEN** a refresh publishes models for `omlx`
- **THEN** pi's model picker lists them under `omlx`
