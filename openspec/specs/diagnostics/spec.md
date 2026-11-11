# diagnostics Specification

## Purpose
Defines how a user turns the extension's stderr tracing on, and how the extension labels what it then emits.

## Requirements

### Requirement: Debug Tracing Answers to PI_OMLX_DEBUG

The extension SHALL turn stderr tracing on exactly when the predicate now at `src/debug.ts:18` holds for `PI_OMLX_DEBUG`, and SHALL change nothing else about which values enable tracing. Each emitted line SHALL carry the prefix `[pi-omlx]`, and the extension SHALL NOT read `PI_OMLX_PICKER_DEBUG` or emit `[pi-omlx-picker]`.

#### Scenario: Tracing stays off when the variable is unset

- **WHEN** `PI_OMLX_DEBUG` is unset
- **THEN** the extension writes no diagnostic lines to stderr

#### Scenario: The empty string keeps today's answer

- **WHEN** `PI_OMLX_DEBUG` is the empty string
- **THEN** the extension emits diagnostics exactly when the predicate at `src/debug.ts:18` evaluates true for the empty string today

#### Scenario: A zero keeps today's answer

- **WHEN** `PI_OMLX_DEBUG` is `0`
- **THEN** the extension emits diagnostics exactly when that same predicate evaluates true for `0` today

#### Scenario: Emitted lines carry the new prefix

- **WHEN** the predicate holds for `PI_OMLX_DEBUG` and the extension emits a diagnostic
- **THEN** the line carries the prefix `[pi-omlx]`
- **AND** no emitted line carries the prefix `[pi-omlx-picker]`
