# pi-omlx

> Seamlessly integrate your local [oMLX](https://github.com/jundot/omlx) models into Pi.

This extension discovers models from a local OMLX server and registers them as native Pi providers.
Switch between your local and remote models effortlessly using Pi's built-in `/model` command.

![pi-omlx demo](./.assets/demo.gif)

## ✨ Features

* Auto discovery: fetches and registers available OMLX models without blocking Pi startup. With no cache, a session starts without OMLX models; the list arrives a moment later, and `/model` switches to one.
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
2. Run `/login omlx` in Pi (or run `/login`, choose **Sign in with an account**, then choose **OMLX**).
3. Enter your OMLX server's base URL, such as `http://localhost:8000`, then its API key. Leave the key empty for a keyless server.
4. Type `/model` to see and select your OMLX models.

The default base URL is `http://127.0.0.1:8000/v1`. A saved login decides the base URL and the API key. `OMLX_BASE_URL` and `OMLX_API_KEY` apply only when nothing is saved, and the URL variable does nothing without the key beside it. A keyless server is reached the way step 3 describes, by leaving the key empty; setting `OMLX_BASE_URL` alone is unsupported.


## ⚙️ Configuration

Env-var overrides, model metadata overlay, and stream timeout knobs are documented in [docs/CONFIGURATION.md](./docs/CONFIGURATION.md).
