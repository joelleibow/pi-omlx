# Contributing

Local development for `pi-omlx`. User config: [docs/CONFIGURATION.md](./docs/CONFIGURATION.md).

## Setup

```sh
npm install
mise run verify
```

A live OMLX server is needed for `mise run smoke:omlx` and `mise run verify:live`.

A bare run of `mise run verify`, `npm run check` or `npm test` is safe. The isolation is wired in `vitest.config.ts`, so every route into the suite gets it ([ARCHITECTURE.md](./ARCHITECTURE.md) §8): your cached model list and `~/.omlx` overlay are left alone, and `PI_CODING_AGENT_DIR` in your shell changes nothing about where a run writes.

## Tasks

Run via [`mise`](https://mise.jdx.dev/):

- `mise run verify` — Biome, TypeScript type checking, unit tests.
- `mise run smoke:omlx` — live OMLX probe: reasoning model, non-thinking model, tool-flow request.
- `mise run verify:live` — typecheck, unit tests, and live smoke (skips Biome; run `mise run verify` first if you want lint coverage).
- `mise run debug:omlx` — OMLX config, model path, template, log, and cache diagnostics. Pass model names after `--` to narrow, e.g. `mise run debug:omlx -- opus sonnet`.
- `mise run debug:pi` — Pi home, config, session, log, and cache diagnostics. Pass `install`, `config`, `sessions`, `logs`, or `cache` after `--`.
- `mise run debug:pi -- timeline <session-id|session-file|iso-time>` — OMLX server events and changed files around a stuck turn. You pass the anchor: a session id, a session file, or an ISO timestamp, with no default. Use `--minutes=N` to set how far past the anchor the window runs (default 3).

### Environment for the scripts

The scripts read their configuration from `process.env` alone: they never consult Pi's saved login, and no file in the clone supplies them. [`direnv`](https://github.com/direnv/direnv) can supply it from an untracked `.envrc` in the clone, so you need not export it by hand each time:

```sh
export OMLX_BASE_URL="http://127.0.0.1:8000/v1"
export OMLX_API_KEY="omlx-..."
# Optional overrides for the live smoke probe.
export OMLX_REASONING_MODEL="<a model your server lists>"
export OMLX_NON_THINKING_MODEL="<a model your server lists>"
```

The two model names are optional: with either unset, the smoke probe picks a reasoning model and a non-thinking one from the server's own model list, and it stops with instructions only when neither the variable nor the server supplies one. `debug:omlx` reads the base URL and the key, and `debug:pi` uses none of the four. With neither the URL nor the key exported, smoke falls back to `http://127.0.0.1:8000/v1` and the key `local-smoke`. Then run `direnv allow`, which direnv asks for once and again after every change to the file. `.gitignore` keeps `.envrc` out of git, so the key stays on your machine. For the extension's own configuration, see [docs/CONFIGURATION.md](./docs/CONFIGURATION.md).

## Triage order

1. Reproduce the stuck turn with `PI_OMLX_DEBUG` set to any non-empty value, `0` included: the extension writes `[pi-omlx] <event> {json}` lines to stderr in the terminal that started Pi, and keeps no log file. A stuck turn shows as a trace that stops after `before_provider_request`. The events are `model_select`, `before_provider_request`, `provider_registered`, `stream_error_normalized`, `stream_simple_entered`, `stream_simple_bypassed` and `stream_throw_normalized`. A catalog fetch also traces through `catalog_status_loaded`, `catalog_status_failed`, `catalog_models_loaded`, `catalog_local_settings_considered`, `catalog_local_settings_read_failed`, `catalog_local_settings_invalid`, `catalog_local_model_settings_missing`, `catalog_local_model_settings_applied`, `catalog_global_settings_loaded` and `catalog_global_settings_failed`, and each notice decision through `catalog_notice`. That decision is `shown`, `held` or `suppressed`; `suppressed` covers both a result that earns no notice and a session that already showed one. The latest `mise run smoke:omlx` proof lives in `log/smoke-test/<iso-timestamp>.json`.
2. Inspect Pi host state: `mise run debug:pi`.
3. Inspect OMLX config and model files: `mise run debug:omlx`.
4. Run live smoke: `mise run smoke:omlx`.
5. Check upstream OMLX repo releases and issues before writing local workarounds.
6. Only then change code.

Most fixes are upstream (OMLX `model_settings.json`, `chat_template.jinja`), not in Pi-side code. New-session-OK plus takeover-broken means session state, not model capacity.

## Failure families

```text
symptom
  ├─ package didn't load, wrong install
  │   └─ pi list
  ├─ stale session, compaction, takeover
  │   └─ mise run debug:pi
  ├─ model alias, model settings, template, rope config, OMLX/HF cache
  │   └─ mise run debug:omlx
  ├─ live model request behavior
  │   └─ mise run smoke:omlx
  ├─ new session good, takeover bad
  │   └─ mise run debug:pi -- sessions, then compare model_settings.json and chat_template.jinja
  ├─ local checks pass but live smoke fails
  │   └─ check upstream OMLX repo, releases, and issues
  └─ model not appearing in Pi /model list
      └─ check OMLX_BASE_URL is reachable, then mise run debug:omlx
```
