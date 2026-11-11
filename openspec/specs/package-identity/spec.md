# package-identity Specification

## Purpose
Defines the name the package ships under, the files that carry it, and the strings the repository's code and metadata must no longer contain.

## Requirements

### Requirement: Package Name Is pi-omlx

The package's manifest SHALL declare the name `pi-omlx`, and the lockfile's root package entry SHALL carry the same name. A packed tarball SHALL be named for that package, and neither file SHALL contain `pi-omlx-picker`.

#### Scenario: Manifest and lockfile agree

- **WHEN** a reader inspects `package.json` and `package-lock.json`
- **THEN** both declare the package name `pi-omlx`
- **AND** neither file contains `pi-omlx-picker`

#### Scenario: A packed artifact carries the new name

- **WHEN** `npm pack --dry-run` runs
- **THEN** the tarball it reports is named `pi-omlx-<version>.tgz`

### Requirement: No Tracked Code Or Metadata Keeps the Old Tokens

A case-insensitive `git grep` over tracked non-Markdown files, excluding `openspec/`, SHALL find neither `pi-omlx-picker` nor `picker`. The manifest's keywords, the lockfile, the singleton key in `index.ts`, the `pickerDebug` helper, the scripts and the tests all fall under this check.

#### Scenario: The old package name is gone from code and metadata

- **WHEN** `git grep -ni pi-omlx-picker` runs over tracked non-Markdown files outside `openspec/`
- **THEN** it returns no match

#### Scenario: The old product word is gone from code and metadata

- **WHEN** `git grep -ni picker` runs over the same files
- **THEN** it returns no match

### Requirement: Scripts Do Not Probe Paths the Package Does Not Use

The repository's debug scripts SHALL NOT look for a package under `~/.pi/packages/` and SHALL NOT read a `provider-debug.log`: pi 1.5.2 installs managed npm packages under `<agentDir>/npm/node_modules`, and nothing writes that log. Each script SHALL keep its session, cache and OMLX diagnostics.

#### Scenario: No install-path probe remains

- **WHEN** `git grep -nE 'INSTALLED_PACKAGE|PACKAGE_ID|PI_DEBUG_LOG' scripts/` runs
- **THEN** it returns no match

#### Scenario: No provider log read remains

- **WHEN** `git grep -n 'provider-debug.log' scripts/` runs
- **THEN** it returns no match
