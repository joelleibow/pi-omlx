# Spec Delta

## MODIFIED Requirements

### Requirement: No Tracked Code Or Metadata Keeps the Old Tokens

A case-insensitive `git grep` over tracked non-Markdown files, excluding `openspec/`, SHALL find neither `pi-omlx-picker` nor `picker`.

#### Scenario: The old package name is gone from code and metadata

- **WHEN** `git grep -ni pi-omlx-picker` runs over tracked non-Markdown files outside `openspec/`
- **THEN** it returns no match

#### Scenario: The old product word is gone from code and metadata

- **WHEN** `git grep -ni picker` runs over the same files
- **THEN** it returns no match
