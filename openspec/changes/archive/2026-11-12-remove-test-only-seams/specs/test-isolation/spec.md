# Spec Delta

## ADDED Requirements

### Requirement: Fixtures Reach Pi's State Through The Agent Directory And Stay Under The Root

The suite SHALL reach pi's stored credential and the extension's catalog cache by setting the agent directory pi resolves, and SHALL use no production export or branch that exists only for a test. Every temporary path a fixture names SHALL be under the isolation root, whether the test creates it or only refers to it.

#### Scenario: A credential fixture reaches the extension through a temporary agent directory

- **WHEN** a test writes a credential file under a temporary agent directory under the isolation root and then drives the extension
- **THEN** the extension resolves that credential

#### Scenario: A second load after a session shutdown needs no reach into production state

- **WHEN** a test drives the extension through `session_shutdown` and then loads the extension again
- **THEN** the extension registers its models again without the test clearing any state the extension keeps

#### Scenario: Every temporary fixture path is under the root

- **WHEN** a test names a temporary path for a fixture
- **THEN** the path is under the isolation root
- **AND** removing the root at the end of the run covers it

#### Scenario: No fixture names the system temporary directory

- **WHEN** `rg -n 'tmpdir' test` runs from the repository root
- **THEN** every match it reports is in `test/isolation/global-setup.ts`
