# Spec Delta

## ADDED Requirements

### Requirement: Fixtures Reach Pi's State Through The Agent Directory And Stay Under The Root

The suite SHALL reach pi's stored credential and the extension's catalog cache by setting the agent directory pi resolves, and SHALL use no production export or branch that exists only for a test. Every temporary directory a test creates for a fixture SHALL be created under the isolation root, so the run's removal covers it.

#### Scenario: A credential fixture reaches the extension through the agent directory

- **WHEN** a test writes a credential file under the isolation root's agent directory and then drives the extension
- **THEN** the extension resolves that credential
- **AND** no path outside that agent directory supplies it

#### Scenario: A second load after a session shutdown needs no reach into production state

- **WHEN** a test drives the extension through `session_shutdown` and then loads the extension again
- **THEN** the extension registers its models again without the test clearing any state the extension keeps

#### Scenario: A temporary fixture directory is created under the root

- **WHEN** a test creates a temporary directory for a fixture
- **THEN** the directory is under the isolation root
- **AND** the end of the run removes it with the root
