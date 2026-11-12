# Spec Delta

## ADDED Requirements

### Requirement: The Cache Follows The Agent Directory

The extension SHALL derive the catalog cache file location from pi's agent directory at each read and at each write, not once when the module loads. A cache write after pi's agent directory changes SHALL land under the new directory, and a cache read after the change SHALL look there.

#### Scenario: A write after the agent directory changes lands under the new directory

- **WHEN** pi's agent directory changes after the extension's catalog module has loaded and the extension then writes the catalog cache
- **THEN** the cache file exists under the new agent directory, holding that write's base URL
- **AND** no cache for that write's base URL is written under the agent directory in force at load

#### Scenario: A read follows the agent directory in force when it runs

- **WHEN** a cached catalog exists under a temporary agent directory and pi's agent directory then changes to one that holds no cache
- **THEN** the cache read made while the first directory was in force reports the models it holds
- **AND** the read made after the change reports no models
