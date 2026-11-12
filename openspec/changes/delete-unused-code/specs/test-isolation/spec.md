# Spec Delta

## ADDED Requirements

### Requirement: Fixtures Reach Pi's State Through The Agent Directory And The Extension Keeps No Load State

The suite SHALL reach pi's stored credential and the extension's catalog cache by setting the agent directory pi resolves, and SHALL use no production export or branch that exists only for a test. Every temporary path a fixture names SHALL be under the isolation root, whether the test creates it or only refers to it. The extension SHALL keep no process-wide load state, so a second load in one process registers its models again without a test clearing anything.

#### Scenario: A credential fixture reaches the extension through a temporary agent directory

- **WHEN** a test writes a credential file under a temporary agent directory under the isolation root and then drives the extension
- **THEN** the extension resolves that credential

#### Scenario: A second load in one process registers again with nothing cleared

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

## REMOVED Requirements

### Requirement: Fixtures Reach Pi's State Through The Agent Directory And Stay Under The Root

**Reason**: Its second scenario drove the extension through `session_shutdown` and then loaded it again, which described the singleton guard cleared on shutdown. Joel ruled the guard, its key and the shutdown clear deleted (owner-rulings §3), so the scenario would describe a mechanism the extension no longer has.

**Migration**: The requirement's text and its other scenarios move unedited into "Fixtures Reach Pi's State Through The Agent Directory And The Extension Keeps No Load State". The shutdown scenario is replaced by one that loads the extension twice in one process, which is what the extension now does. No test gains reach into production state, because production keeps none.
