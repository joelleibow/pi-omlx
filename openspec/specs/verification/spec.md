# verification Specification

## Purpose
Defines three things about this repository: the `check` script in `package.json` passing, one installed `@earendil-works/pi-ai` at the version `@earendil-works/pi-coding-agent` pins, and the operator's agent directory a verification run leaves alone.

## Requirements

### Requirement: Check Passes On The pi Versions The Package Declares

The `check` script in `package.json` SHALL exit 0 after `npm ci`, and the `@earendil-works/pi-ai` the repository installs SHALL be the version `@earendil-works/pi-coding-agent` pins.

#### Scenario: The check exits zero

- **WHEN** `npm run check` runs in a working tree whose dependencies came from `npm ci`
- **THEN** the command exits 0

#### Scenario: The repository installs one pi-ai, the one pi pins

- **WHEN** `npm ls @earendil-works/pi-ai --all` runs
- **THEN** every copy it reports carries the same version
- **AND** that version is the one `node_modules/@earendil-works/pi-coding-agent/package.json` pins

### Requirement: No Suppression Stands In For A Type Fix

No tracked non-Markdown file SHALL carry `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` or `biome-ignore`.

#### Scenario: No suppression comment is left behind

- **WHEN** `git grep -nE '@ts-ignore|@ts-expect-error|@ts-nocheck|biome-ignore' -- ':!*.md'` runs from the repository root
- **THEN** it returns no match

### Requirement: Verification Runs Need No Caller-Supplied Agent Directory

A run of `npm run check`, `npm test` or `npx vitest run` SHALL leave the operator's pi agent directory as it found it, and a bare run SHALL be safe in any environment.

#### Scenario: A bare run writes nothing into the operator's agent directory

- **WHEN** `env -u PI_CODING_AGENT_DIR HOME=<empty directory> npx vitest run` runs
- **THEN** the run exits 0
- **AND** `<empty directory>/.pi` does not exist afterwards

#### Scenario: A caller's agent directory is left as it was

- **WHEN** `PI_CODING_AGENT_DIR=<populated directory> npm run check` runs
- **THEN** the run exits 0
- **AND** every file under `<populated directory>` holds the bytes it held before the run
