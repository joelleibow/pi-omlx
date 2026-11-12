# Spec Delta

## Purpose

Defines where the extension's environment comes from: the process it is started in, and never a file.

## ADDED Requirements

### Requirement: The Environment Is The One The Extension Is Started In

The extension SHALL take the environment variables it uses from the process environment it is started in, and SHALL NOT read a file to set them: no module SHALL load a `.env` or any other file into `process.env`. Which credential decides the base URL and the key stays as `openspec/specs/credential-resolution/spec.md` states it.

#### Scenario: A .env beside index.ts configures nothing

- **WHEN** a `.env` beside `index.ts` sets `OMLX_BASE_URL` and `OMLX_API_KEY`, the process environment sets neither, and no credential is stored
- **THEN** the resolution reports not configured and the extension makes no catalog fetch
- **AND** the login-only provider is registered

#### Scenario: No variable from a file reaches the process

- **WHEN** the extension's entry module finishes loading in a directory holding a `.env`
- **THEN** `process.env` carries no key that only that file sets
