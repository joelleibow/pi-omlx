# AGENTS.md

pi-omlx is a Pi extension that discovers the models on a local OMLX server and registers them as a native Pi provider. The shape of the system is in `ARCHITECTURE.md`; the decisions are in `docs/adr/`.

## Commands

| Command | Does |
|---|---|
| `PI_CODING_AGENT_DIR=<scratch dir> npm run check` | Biome, a type check, and the whole suite. The gate before a commit. |
| `PI_CODING_AGENT_DIR=<scratch dir> npm run typecheck` | The type check alone. |
| `PI_CODING_AGENT_DIR=<scratch dir> npx vitest run test/<file>.test.ts` | One suite file, while you work. |

Dependencies come from `npm install`. [CONTRIBUTING.md](./CONTRIBUTING.md) also names `mise` tasks, for verification and for the live probes; no task definition is tracked in the repository, so run the commands above.

## Conventions

- Markdown documentation lives in `docs/`, decisions in `docs/adr/`, and the system's shape in `ARCHITECTURE.md`. This file carries commands, conventions and traps only.
- New tests reach the credential store through the agent directory, never through a test-only seam. The seams that exist are another card's work.
- No suppressions: `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` and `biome-ignore` are forbidden by the repository's `verification` spec.

## Traps

- Every command above carries `PI_CODING_AGENT_DIR`, and it is not optional: a bare run writes its catalog cache into the operator's own agent directory. CONTRIBUTING.md states the consequence and the living `verification` spec states the rule.
- The extension reads Pi's `auth.json` and never writes it. Storing a login is Pi's job, so code that writes a credential there is wrong even when it makes a test pass.
- The credential resolution restates pi-ai's order and carries a `shortcut:` comment naming that mirror. Re-check it when the Pi version moves, and read `docs/adr/0001-one-credential-decides-the-omlx-connection.md` before changing which credential wins.
- `readLastCatalogCache` has no callers. It is kept deliberately for a later change, not forgotten.
