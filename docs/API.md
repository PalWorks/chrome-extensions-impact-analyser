# Local HTTP API

Last updated: 2026-10-22T22:16:52+05:30

The app's server (`src/server.js`) listens on `127.0.0.1` only, on port 4777 by default (or `--port=<n>`; if the port is busy, a free one). It is meant for the app's own pages, not as a public API, and may change between versions.

## Rules for every request

* The `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`; anything else gets `403`.
* Every `/api/` call needs the token from the served page: header `x-token: <token>` (or `?token=` for server-sent events). The token is random per start and appears in `index.html` as `<meta name="token">` and in served reports as `<meta name="app-token">`.
* Request and response bodies are JSON. Errors come back as `{"error": "plain explanation"}` with a 4xx or 5xx status.

## Pages and files

| Method and path | Token | Returns |
|---|---|---|
| `GET /` | No | The app (`ui/index.html` with the token filled in) |
| `GET /app.js`, `/styles.css`, `/icon.svg` | No | App assets |
| `GET /reports/<id>/report.html` | No | The report, re-rendered from `results.json` with the token |
| `GET /reports/<id>/results.csv`, `results.json` | No | Raw data |
| `GET /reports/<id>/report.pdf` | Yes | PDF ("Page X of Y") |
| `GET /reports/<id>/report.png?theme=light\|dark` | Yes | Full-page image |
| `GET /reports/<id>/report.docx` | Yes | Word document ("Page X of Y") |

## API

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/init` | | `{version, platform, browser: {ready, path}, browsers: [{name, engine, userDataDir, profiles}], defaults, state, reports}` |
| `GET /api/events` | | Server-sent events: `state`, `phase`, `progress` (`{done, total, etaSeconds, message}`), `log`, `done` (report summary with `id`, `reportUrl`), `failed`, `cancelled` |
| `POST /api/extensions` | `{profilePath}` | `{extensions: [...]}` for that profile |
| `POST /api/custom-profile` | `{path}` | A profile, a list of profiles, or `{error}` |
| `POST /api/extension-folder` | `{path, engine}` | `{extension}` for an unpacked folder or Firefox `.xpi`, or `{error}` |
| `POST /api/estimate` | `{extensions, urls, settings}` | `{seconds}` |
| `POST /api/run` | `{extensions: [{id, name, version, path}], urls, engine, settings, source}` | `{id}`; `409` if a test is running |
| `POST /api/rerun` | `{id, extensionKeys?, urls?, rounds?}` | `{id}` for a new run built from report `id`; `409` if a test is running |
| `POST /api/cancel` | `{}` | `{ok: true}` |
| `POST /api/open-folder` | `{id?}` | Opens the report folder (or `results`) in the file manager |
| `POST /api/quit` | `{}` | Stops the app |
| `GET /api/ai/config` | | `{connected, provider, providerName, model, endpoint}` (never the key) |
| `POST /api/ai/config` | `{provider, endpoint, model, key}` | Checks the key with a test message, saves it, returns the public config; `400` with the reason if refused |
| `POST /api/ai/forget` | `{}` | Deletes the saved key |
| `POST /api/ai/ask` | `{id, question, history}` | `{answer, actions}`; an action `{type: "run", extensionKeys, extensionNames, urls, rounds}` becomes a button in the report |

## Settings

`settings` accepts these keys; values are clamped to the limits.

| Key | Default | Limits |
|---|---|---|
| `rounds` | 5 | 1 to 20 |
| `warmupSeconds` | 10 | 0 to 120 |
| `settleSeconds` | 3 | 0 to 60 |
| `observeSeconds` | 3 | 1 to 30 |
| `pageTimeoutSeconds` | 45 | 10 to 180 |
| `headless` | true | |
| `includeCombined` | true | |

## Example

```
TOKEN=$(curl -s http://127.0.0.1:4777/ | sed -n 's/.*name="token" content="\([^"]*\)".*/\1/p')
curl -s -H "x-token: $TOKEN" http://127.0.0.1:4777/api/init | head -c 300
```
