# Configuration

The normal path is Pi's built-in login: run `/login omlx` (or `/login`, then **Sign in with an API key**, then **OMLX**), enter the base URL and the API key, then select an OMLX model with `/model`. `/login` probes the server once before it saves anything, so a wrong URL or a rejected key fails inside the dialog and stores nothing; the dialog is the only place Pi shows you the cause.

`pi auth login` and `pi auth check` never load extensions, so neither one can sign `omlx` in. Use `/login omlx` inside a session.

The rest of this page documents the environment variables that apply when nothing is saved, the optional model metadata overlay, and the stream timeout knob.

## Where credentials live

`/login` hands Pi the base URL and the API key, and Pi writes them to `~/.pi/agent/auth.json` under the `omlx` provider key as an `api_key`-typed credential: the base URL as the provider-scoped environment, the key when you entered one. That is the same file Pi uses for native providers, and the extension reads the entry without ever writing it. Use Pi's built-in `/logout`, then choose **OMLX** in the list it opens, to remove stored OMLX credentials.

Pi reads a stored key that begins with `$` or `!` as a template or a command. A literal key starting with either character can therefore reach the server as something other than what you typed, and neither the login nor this extension can prevent that.

`pi uninstall git:github.com/joelleibow/pi-omlx` does not touch `auth.json`. Reinstall picks up where you left off; use `/logout` or delete the `omlx` entry yourself to scrub.

### Upgrading from the OAuth-shaped login

Earlier versions stored the `omlx` entry as an `oauth`-typed credential. Pi no longer reads that shape for `omlx`, so a saved login from an earlier version stops working. Run `/logout`, choose **OMLX** in the list it opens, then run `/login omlx` and enter the server URL again; the new login overwrites the entry. The first start after an upgrade also warns you about this once.

## Startup, the model store, and the warnings

Pi keeps the catalog. A successful refresh publishes the models into Pi's model store, `models-store.json` under Pi's agent directory, keyed `omlx`. Pi restores that store before a session exists, so a session starts with the models the last refresh published and never waits on the network; the refresh runs after the session is up. Pi refreshes over the network at a session's start, after a login, when `/model` opens, and at RPC startup, and never on a timer. A model added on the server therefore appears at the next of those triggers and not before.

A failed refresh shows up in `/model` and in the message after a login. A refresh at a session's start reports nothing, which is why the login probes the server before it saves.

The extension's own cache, `~/.pi/agent/cache/omlx-models.json`, is no longer read or written. Nothing deletes it; remove it yourself if you want the space back.

The extension shows at most one warning at a session's start, and never two:

- `oMLX still holds an old OAuth-style login that pi no longer reads; run /logout, choose OMLX, then run /login omlx.`
- `oMLX is configured but pi holds no oMLX models yet, so this session landed on another provider's model; choose one with /model.`

The first one wins when the stored entry is OAuth-shaped. The second appears when `omlx` is configured and Pi holds no `omlx` model, which covers a first start before any refresh has published. A start that holds your models, and a start with nothing configuring `omlx`, show nothing. The warning is a UI notice, so interactive sessions show it above the editor and `-p` and JSON runs show none, because Pi gives the extension no UI there.

If you define `omlx` yourself in Pi's `models.json`, Pi composes that entry above this provider. The login, the check and the resolution stay this extension's.

## Environment variables when nothing is saved

A saved login decides the base URL and the API key, for the model list and for chat alike. `OMLX_BASE_URL` and `OMLX_API_KEY` apply only when nothing is saved: CI, a fresh shell, a project you have not logged in to. To use a key in one shell while a login is saved, run `/logout` first.

With nothing saved, the two variables supply both halves:

```sh
export OMLX_BASE_URL="http://10.0.0.5:8000/v1"
export OMLX_API_KEY="omlx-..."
```

`OMLX_API_KEY` alone uses the default base URL, `http://127.0.0.1:8000/v1`. `OMLX_BASE_URL` alone configures nothing: with no API key and no saved login, the provider stays unconfigured and no model list is fetched.

### Keyless servers

Reach a server that needs no API key with `/login`: enter its base URL and leave the key empty. That works whatever `OMLX_API_KEY` is set to in your shell, because the empty key belongs to the saved login rather than to the environment. The requests then carry `Authorization: Bearer local`, a placeholder that stands in for the key the OpenAI-completions client refuses to send empty.

A keyless login expects oMLX to accept any bearer, which happens in two states: a loopback bind with no main API key configured at all, or a main key configured with `skip_api_key_verification` on, on a loopback bind. oMLX answers before it reads the header in either state, so the placeholder is ignored.

A server that sets only `allow_unauthenticated_inference` still requires its main key on `/v1/models/status`, so the login falls back to `/v1/models`, which reports no limits. The login then fails with `OMLX at <base URL> returned <n> models, none with max_context_window and max_tokens.` The message names the server URL and the model count. That failure happens unless the `~/.omlx` overlay supplies both `max_context_window` and `max_tokens` for at least one model; supplying one of the two is not enough.

A keyless server addressed by `OMLX_BASE_URL` alone, with no login, is unsupported. Pi has nothing stored to authenticate with, treats the provider as not configured, and chat does not work.

## Model metadata overlay

The overlay overrides values in the catalog before the extension publishes it to Pi: the display name, the context window and max-out limits, the thinking default, the reasoning parser and the model type. Supply them in a local JSON file and the extension merges them in.

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

The extension reads those keys and ignores any other key in an entry. `model_type_override` does something only when it is `vlm`, which marks the model as taking images as well as text. `reasoning_parser` selects the chat-template thinking format for `qwen`, `qwen_3_coder`, `llama`, `harmony` and `deepseek_v4`, matched case-insensitively, and any other value falls back to the plain OpenAI format. `chat_template_kwargs.enable_thinking` is read as a fallback for `enable_thinking`.

## Stream timeout

`OMLX_STREAM_FIRST_DELTA_TIMEOUT_MS` (default `120000`) controls how long the stream wrapper waits for the first meaningful body event (text delta, thinking delta, tool-call start, done, or error) after response headers arrive. On timeout the request aborts, retries once, and on the second failure emits an assistant error.

A timeout leaves no trace line of its own; the assistant error above is the only sign of it, and the extension keeps no log file to look in. With `PI_OMLX_DEBUG` set to any non-empty value, `0` included, the trace of a timed-out turn stops after `before_provider_request`; the lines go to stderr as `[pi-omlx] <event> {json}`.
