# Spec Delta

## REMOVED Requirements

### Requirement: Every Run Isolates Itself From Operator State

**Reason**: One clause in it, "It SHALL keep the `.env` beside `index.ts` from reaching the run's environment", and the scenario that asserted it describe a file nothing reads any more. This change deletes the loader at `src/dotenv.ts` and its call in `index.ts`, so no input can make that scenario fail, and a test that cannot fail proves nothing (Michael's ruling, on Joel's rule).

**Migration**: Replaced by "Every Run Isolates Itself From Operator State And Caller Environment" in this delta's ADDED section. That requirement keeps the isolation root, the operator's overlay and the caller's overlay path unchanged; only the `.env` clause and its scenario are gone. The capability's two other requirements do not change.

## ADDED Requirements

### Requirement: Every Run Isolates Itself From Operator State And Caller Environment

Every run of the suite SHALL resolve pi's agent directory and the extension's `~/.omlx` overlay under a per-run isolation root, a directory the run creates under the system temporary directory, before any test file is imported, overriding a value the caller supplies. A run's outcome SHALL NOT depend on the operator's files or on the caller's environment.

#### Scenario: The operator's overlay does not decide the run

- **WHEN** `HOME` holds `~/.omlx/model_settings.json` with an entry for the suite's fixture model `real-model` and `npm test` runs
- **THEN** the run exits 0

#### Scenario: A caller's exported overlay path does not decide the run

- **WHEN** the caller exports `OMLX_MODEL_SETTINGS_PATH` naming a file with an entry for `real-model` and `npm test` runs
- **THEN** the run exits 0
