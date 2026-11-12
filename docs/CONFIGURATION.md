# Configuration

The normal path is Pi's built-in login: run `/login omlx` (or `/login`, then **Sign in with an account**, then **OMLX**), enter the base URL and API key, then select an OMLX model with `/model`. The rest of this page documents the environment variables that apply when nothing is saved, the optional model metadata overlay, and the stream timeout knob.

## Where credentials live

`/login` writes the base URL and API key to `~/.pi/agent/auth.json` under the `omlx` provider key, as an `oauth`-typed credential — the same file Pi uses for native providers. Use Pi's built-in `/logout` to remove stored OMLX credentials.

`pi uninstall git:github.com/joelleibow/pi-omlx` does not touch `auth.json`. Reinstall picks up where you left off; use `/logout` or delete the `omlx` entry yourself to scrub.

## Environment variables when nothing is saved

A saved login decides the base URL and the API key, for the model list and for chat alike. `OMLX_BASE_URL` and `OMLX_API_KEY` apply only when nothing is saved: CI, a fresh shell, a project you have not logged in to. To use a key in one shell while a login is saved, run `/logout` first.

With nothing saved, the two variables supply both halves:

```sh
export OMLX_BASE_URL="http://10.0.0.5:8000/v1"
export OMLX_API_KEY="omlx-..."
```

`OMLX_API_KEY` alone uses the default base URL, `http://127.0.0.1:8000/v1`. `OMLX_BASE_URL` alone configures nothing: with no API key and no saved login, the provider stays login-only and no model list is fetched.

### Keyless servers

Reach a server that needs no API key with `/login`: enter its base URL and leave the key empty. That works whatever `OMLX_API_KEY` is set to in your shell, because the empty key belongs to the saved login rather than to the environment.

A keyless server addressed by `OMLX_BASE_URL` alone, with no login, is unsupported. Pi has nothing stored to authenticate with, treats the provider as not configured, and chat does not work.

## Model metadata overlay

OMLX's API doesn't return display names, context-window hints, or default thinking budgets. Supply them via a local JSON file and the extension merges them into the catalog before registering the provider.

- Default path: `~/.omlx/model_settings.json`
- Override: `OMLX_MODEL_SETTINGS_PATH=/some/other/path.json`

Optional. Omit to use whatever OMLX returns.

Per-model schema:

```json
{
  "models": {
    "qwen3.6-coder-32b": {
      "display_name": "Qwen3.6 Coder 32B",
      "description": "...",
      "max_tokens": 16000,
      "thinking_budget_enabled": true,
      "thinking_budget_tokens": 8000,
      "chat_template_kwargs": { "enable_thinking": true }
    }
  }
}
```

## Stream timeout

`OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS` (default `120000`) controls how long the stream wrapper waits for the first meaningful body event (text delta, thinking delta, tool-call start, done, or error) after response headers arrive. On timeout the request aborts, retries once, and on the second failure emits an assistant error.

A timeout leaves no trace line of its own; the assistant error above is the only sign of it, and the extension keeps no log file to look in. With `PI_OMLX_DEBUG` set to any non-empty value, `0` included, the trace of a timed-out turn stops after `before_provider_request`; the lines go to stderr as `[pi-omlx] <event> {json}`.
