# Spec Delta

## Purpose

Defines where the extension's environment comes from: the process it is started in, and never a file.

## ADDED Requirements

### Requirement: The Environment Is The One The Extension Is Started In

The extension SHALL take the environment variables it uses from the process environment it is started in, and SHALL NOT read a file to set them. Which credential decides the base URL and the key stays as `openspec/specs/credential-resolution/spec.md` states it.

#### Scenario: A .env beside index.ts configures nothing

- **WHEN** a copy of `index.ts` and `src/` sits in a directory whose `.env` sets `OMLX_API_KEY` and `OMLX_BASE_URL`, the process environment sets neither, nothing is stored, and the fake pi's catalog answers with the suite's fixture models
- **THEN** importing that copy leaves both keys out of `process.env`
- **AND** running the copy's default export makes no catalog fetch and registers the login-only provider
