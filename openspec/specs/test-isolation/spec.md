# test-isolation Specification

## Purpose
Defines how the suite keeps itself away from the operator's pi state: what every run isolates, when the isolation root is removed, and the guard that fails a run when the isolation escapes.

## Requirements

### Requirement: The Isolation Root Is Removed When The Run Ends

The isolation root SHALL be created fresh for each run and removed when the run ends, whether its tests passed or failed, so no run reads what an earlier run left behind.

#### Scenario: A finished run leaves no isolation root

- **WHEN** a run of `npm test` finishes
- **THEN** no directory named `pi-omlx-test-*` remains in the system temporary directory

#### Scenario: A failing run still removes its root

- **WHEN** a run finishes with at least one failing test
- **THEN** no directory named `pi-omlx-test-*` remains in the system temporary directory

### Requirement: A Guard Fails The Run When The Isolation Escapes

The suite SHALL check, before any test runs, that pi's agent directory, `homedir()` and the overlay path all resolve under the isolation root, and SHALL fail the run when one does not, naming every path that escaped.

#### Scenario: A missing isolation fails the run

- **WHEN** the isolation is removed and `npm test` runs
- **THEN** the run fails
- **AND** its output names the escaped path

#### Scenario: A path beside the root is reported as escaped

- **WHEN** the guard is given a path beside the isolation root rather than under it
- **THEN** it reports that path as escaped

### Requirement: Every Run Isolates Itself From Operator State And Caller Environment

Every run of the suite SHALL resolve pi's agent directory and the extension's `~/.omlx` overlay under a per-run isolation root, a directory the run creates under the system temporary directory, before any test file is imported, overriding a value the caller supplies. A run's outcome SHALL NOT depend on the operator's files or on the caller's environment.

#### Scenario: The operator's overlay does not decide the run

- **WHEN** `HOME` holds `~/.omlx/model_settings.json` with an entry for the suite's fixture model `real-model` and `npm test` runs
- **THEN** the run exits 0

#### Scenario: A caller's exported overlay path does not decide the run

- **WHEN** the caller exports `OMLX_MODEL_SETTINGS_PATH` naming a file with an entry for `real-model` and `npm test` runs
- **THEN** the run exits 0

### Requirement: Fixtures Reach Pi's State Through The Agent Directory And Stay Under The Root

The suite SHALL reach pi's stored credential and the extension's catalog cache by setting the agent directory pi resolves, and SHALL use no production export or branch that exists only for a test. Every temporary path a fixture names SHALL be under the isolation root, whether the test creates it or only refers to it.

#### Scenario: A credential fixture reaches the extension through a temporary agent directory

- **WHEN** a test writes a credential file under a temporary agent directory under the isolation root and then drives the extension
- **THEN** the extension resolves that credential

#### Scenario: A second load after a session shutdown needs no reach into production state

- **WHEN** a test drives the extension through `session_shutdown` and then loads the extension again
- **THEN** the extension registers its models again without the test clearing any state the extension keeps

#### Scenario: A second load in one process registers again with no shutdown first

- **WHEN** a test loads the extension a second time in the same process
- **THEN** the extension registers its models again
- **AND** the test clears nothing the extension keeps

#### Scenario: Every temporary fixture path is under the root

- **WHEN** a test names a temporary path for a fixture
- **THEN** the path is under the isolation root
- **AND** removing the root at the end of the run covers it

#### Scenario: No fixture names the system temporary directory

- **WHEN** `rg -n 'tmpdir' test` runs from the repository root
- **THEN** every match it reports is in `test/isolation/global-setup.ts`
