# Spec Delta

## Purpose

Defines three things about this repository: the `check` script in `package.json` passing, one installed `@earendil-works/pi-ai` at the version `@earendil-works/pi-coding-agent` pins, and the agent directory a verification run may touch.

## ADDED Requirements

### Requirement: Check Passes On The pi Versions The Package Declares

The `check` script in `package.json` SHALL exit 0 after `npm ci`, and the `@earendil-works/pi-ai` the repository installs SHALL be the version `@earendil-works/pi-coding-agent` pins.

#### Scenario: The check exits zero

- **WHEN** `PI_CODING_AGENT_DIR=<scratch directory> npm run check` runs in a working tree whose dependencies came from `npm ci`
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

### Requirement: Verification Runs Leave The Operator's Agent Directory Alone

When `PI_CODING_AGENT_DIR` names a directory outside `~/.pi/agent`, a run of `npm run check` or of any part of it SHALL leave `~/.pi/agent/cache/omlx-models.json` neither created nor modified. The suite writes that file under the agent directory it resolves, so until it isolates itself, the variable is the isolation.

#### Scenario: The cache file keeps its modification time

- **WHEN** `PI_CODING_AGENT_DIR=<scratch directory> npm run check` runs while `~/.pi/agent/cache/omlx-models.json` exists
- **THEN** that file's modification time is unchanged after the run

#### Scenario: A cache file that was absent stays absent

- **WHEN** `PI_CODING_AGENT_DIR=<scratch directory> npm run check` runs while `~/.pi/agent/cache/omlx-models.json` does not exist
- **THEN** the file does not exist after the run
