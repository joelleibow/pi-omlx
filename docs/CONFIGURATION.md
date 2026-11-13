# Configuration

The normal path is Pi's built-in login: run `/login omlx` (or `/login`, then **Sign in with an account**, then **OMLX**), enter the base URL and API key, then select an OMLX model with `/model`. The rest of this page documents the environment variables that apply when nothing is saved, the optional model metadata overlay, and the stream timeout knob.

## Where credentials live

`/login` writes the base URL and API key to `~/.pi/agent/auth.json` under the `omlx` provider key, as an `oauth`-typed credential — the same file Pi uses for native providers. Use Pi's built-in `/logout` to remove stored OMLX credentials.

`pi uninstall git:github.com/joelleibow/pi-omlx` does not touch `auth.json`. Reinstall picks up where you left off; use `/logout` or delete the `omlx` entry yourself to scrub.

## Startup, the catalog cache, and the warning

The extension registers what it already has, the cached models or the login-only provider, before Pi chooses the session's starting model, so Pi's startup never waits on the network. The cached models it registers come from `~/.pi/agent/cache/omlx-models.json`, keyed by the resolved base URL.

With no cache for that URL, the session starts on the login-only provider: no OMLX model is available yet, so a saved default OMLX model is not selected, and Pi starts on another provider's model or on none. The list arrives a moment later; choose an OMLX model with `/model`. A cache-less start covers a first run, and any `/login` to a new base URL, because the cache is keyed by the URL the credential resolves to.

A successful catalog fetch writes the cache, and the next start uses it. With no cache, `pi --list-models` lists no OMLX models until a session has fetched and written them.

The extension shows at most one warning per session. A failed load produces one of these, where `<url>` is the resolved base URL and `<n>` the number of cached models in use. For one cached model the text reads `model`, not `models`:

- `oMLX model list unavailable at <url>; using 1 cached model.`
- `oMLX model list unavailable at <url>; using <n> cached models.`
- `oMLX model list unavailable at <url>; using the login-only provider.`

A catalog that arrives after startup warns only when the session started login-only, with this text:

- `oMLX session started login-only; models from <url> are now available; choose one with /model.`

A session that started with cached models and whose list arrives normally shows no warning. The warning is a UI notice, so interactive sessions show it above the editor and `-p` and JSON runs show none, because Pi gives the extension no UI there.

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

The overlay overrides values in the catalog before the extension registers the provider: the display name, the context window and max-out limits, the thinking default, the reasoning parser and the model type. Supply them in a local JSON file and the extension merges them in.

- Default path: `~/.omlx/model_settings.json`
- Override: `OMLX_MODEL_SETTINGS_PATH=/some/other/path.json`

Optional. Omit to use whatever OMLX returns.

Per-model schema:

```json
{
  "models": {
    "qwen3.6-vl-8b": {
      "display_name": "Qwen3.6 VL 8B",
      "max_context_window": 131072,
      "max_tokens": 16000,
      "enable_thinking": true,
      "reasoning_parser": "qwen",
      "model_type_override": "vlm"
    }
  }
}
```

The extension reads those keys and ignores any other key in an entry. `model_type_override` does something only when it is `vlm`, which registers the model as taking images as well as text. `reasoning_parser` selects the chat-template thinking format for `qwen`, `qwen_3_coder`, `llama`, `harmony` and `deepseek_v4`, matched case-insensitively, and any other value falls back to the plain OpenAI format. `chat_template_kwargs.enable_thinking` is read as a fallback for `enable_thinking`.

## Stream timeout

`OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS` (default `120000`) controls how long the stream wrapper waits for the first meaningful body event (text delta, thinking delta, tool-call start, done, or error) after response headers arrive. On timeout the request aborts, retries once, and on the second failure emits an assistant error.

A timeout leaves no trace line of its own; the assistant error above is the only sign of it, and the extension keeps no log file to look in. With `PI_OMLX_DEBUG` set to any non-empty value, `0` included, the trace of a timed-out turn stops after `before_provider_request`; the lines go to stderr as `[pi-omlx] <event> {json}`.
