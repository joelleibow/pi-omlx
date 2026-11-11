# provider-access Specification

## Purpose
Defines the provider id this extension registers and keys credentials by. The rename leaves the id alone, and every other thing pi keys by provider id follows from these two.

## Requirements

### Requirement: Provider Id Is omlx

The extension SHALL register its provider under the id `omlx` and SHALL read and write credentials keyed `omlx`. `PROVIDER_KEY` (`src/auth-storage.ts:4`) SHALL be the one place that id lives, and neither the package's name nor any form of it SHALL be substituted for the id.

#### Scenario: The extension registers the omlx provider

- **WHEN** the extension's factory registers its provider
- **THEN** the registered id is `omlx`
- **AND** it is the value `PROVIDER_KEY` holds, not the package's name

#### Scenario: Credentials are keyed omlx

- **WHEN** the extension reads or writes stored credentials
- **THEN** the key is `omlx`
- **AND** no key derived from the package's name is read or written
