# pi-omlx

> Seamlessly integrate your local [oMLX](https://github.com/jundot/omlx) models into Pi.

This extension discovers models from a local OMLX server and registers them as native Pi providers.
Switch between your local and remote models effortlessly using Pi's built-in `/model` command.

![pi-omlx demo](./.assets/demo.gif)

## ✨ Features

* Auto discovery: Pi fetches your OMLX models at a session's start, after a login and when `/model` opens, never on a timer, and a session's start never waits on the network. A first start with no stored catalog warns once that the session landed on another provider's model.
* Native integration: login uses Pi's standard `/login`, and models use Pi's standard `/model` menu.
* Smart overrides: applies per-request thinking controls based on each model's `thinkingDefault` metadata.

## 📦 Installation

```bash
pi install git:github.com/joelleibow/pi-omlx
```

## 🛠️ Development

* `npm install`
* `npm run check`
* `npm run format`
* `npm test`
* `npm run test:watch`

## 🚀 Quick Start

1. Start your local OMLX server.
2. Run `/login omlx` in Pi (or run `/login`, choose **Sign in with an API key**, then choose **OMLX**).
3. Enter your OMLX server's base URL, such as `http://localhost:8000`, then its API key. Leave the key empty for a keyless server. The login checks the server before it saves, so a wrong URL or a rejected key fails in the dialog and stores nothing.
4. Type `/model` to see and select your OMLX models.

The default base URL is `http://127.0.0.1:8000/v1`. A saved login decides the base URL and the API key. `OMLX_BASE_URL` and `OMLX_API_KEY` apply only when nothing is saved, and the URL variable does nothing without the key beside it. A keyless server is reached the way step 3 describes, by leaving the key empty. oMLX has to accept any bearer for that to work, which holds in two states: a loopback bind with no main API key at all, or a main key plus `skip_api_key_verification` on a loopback bind. Setting `OMLX_BASE_URL` alone is unsupported.

Upgrading from an earlier version? A saved OAuth-style login is no longer read. Run `/logout` and choose **OMLX** in the list it opens, then run `/login omlx` once, and the new login overwrites the old entry.


## ⚙️ Configuration

Env-var overrides, model metadata overlay, and stream timeout knobs are documented in [docs/CONFIGURATION.md](./docs/CONFIGURATION.md).
