# Spec Delta

## ADDED Requirements

### Requirement: The Cache Follows The Agent Directory

The extension SHALL derive the catalog cache file location from pi's agent directory at each read and at each write, not once when the module loads. A cache write after pi's agent directory changes SHALL land under the new directory, and a cache read after the change SHALL look there.

#### Scenario: A write after the agent directory changes lands under the new directory

- **WHEN** pi's agent directory changes after the extension's catalog module has loaded and the extension then writes the catalog cache
- **THEN** the cache file exists under the new agent directory
- **AND** no cache file is written under the agent directory that was in force at load

#### Scenario: A read after the agent directory changes looks in the new directory

- **WHEN** pi's agent directory changes after the extension's catalog module has loaded and the new agent directory holds a cached catalog
- **THEN** the extension reads that catalog
- **AND** a cache file under the agent directory in force at load supplies nothing
