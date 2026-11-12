# AGENTS.md

pi-omlx is a Pi extension that discovers the models on a local OMLX server and registers them as a native Pi provider. The shape of the system is in `ARCHITECTURE.md`; the decisions are in `docs/adr/`.

## Commands

| Command | Does |
|---|---|
| `npm run check` | Biome, a type check, and the whole suite. The gate before a commit. |
| `npm run typecheck` | The type check alone. |
| `npx vitest run test/<file>.test.ts` | One suite file, while you work. |

Dependencies come from `npm install`. [CONTRIBUTING.md](./CONTRIBUTING.md) also names `mise` tasks, for verification and for the live probes; no task definition is tracked in the repository, so run the commands above. A bare run is safe: the suite isolates itself on every run (see [ARCHITECTURE.md](./ARCHITECTURE.md) §8), so no command needs an environment prefix.

## Conventions

- Markdown documentation lives in `docs/`, decisions in `docs/adr/`, and the system's shape in `ARCHITECTURE.md`. This file carries commands, conventions and traps only.
- New tests reach the credential store through the agent directory, never through a test-only seam. The seams that exist are another card's work.
- Add any new path a test reads outside the repository to the guard's list in `test/isolation/worker-setup.ts`; the run will not notice it escaping otherwise.
- No suppressions: `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` and `biome-ignore` are forbidden by the repository's `verification` spec.

## Traps

- The suite overrides `HOME` and `PI_CODING_AGENT_DIR` and clears the extension's own environment keys, so exporting one of them for a run changes nothing: `PI_OMLX_DEBUG=1 npm test` traces nothing. A test that needs its own agent directory sets it inside the test, as `test/index.test.ts` does.
- The extension reads Pi's `auth.json` and never writes it. Storing a login is Pi's job, so code that writes a credential there is wrong even when it makes a test pass.
- The credential resolution restates pi-ai's order and carries a `shortcut:` comment naming that mirror. Re-check it when the Pi version moves, and read `docs/adr/0001-one-credential-decides-the-omlx-connection.md` before changing which credential wins.
- `readLastCatalogCache` has no callers. It is kept deliberately for a later change, not forgotten.
