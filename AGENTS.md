# AGENTS.md

Last updated: 2026-10-22T22:16:52+05:30

Instructions for AI coding agents (and people) working on this repository. Read this first, then the file in "Where to find what" that matches your task.

## The project in one paragraph

A local, point-and-click tool that measures how much each browser extension slows down web pages. A Node.js server on `127.0.0.1` reads the user's Chrome-family or Firefox profile (read only), copies the chosen extensions into separate test browsers (Chrome for Testing or Firefox) driven by Puppeteer, loads websites with and without each extension, and writes a report with plain-language verdicts. Target users are non-technical people on Windows, macOS and Linux.

## Where to find what

| Task | Read |
|---|---|
| How the parts fit together | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Why something is the way it is | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Terms, measurements and verdict rules | [docs/DOMAIN.md](docs/DOMAIN.md) |
| Server endpoints and settings | [docs/API.md](docs/API.md) |
| Tests and what they prove | [docs/TESTING.md](docs/TESTING.md) |
| Known gaps (do not "fix" these by accident) | [docs/LIMITATIONS.md](docs/LIMITATIONS.md) |
| Ideas for what comes next | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Workflow, releases, style | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Secrets and privacy | [SECURITY.md](SECURITY.md) |
| What changed when | [CHANGELOG.md](CHANGELOG.md) |

## Commands

```
npm install                  # first time; downloads Chrome for Testing into .cache/
node src/server.js           # the app (add --no-open --port=4790 for a spare instance)
node src/cli.js --help       # command-line version
npm run test:ai              # AI assistant against a pretend service
npm run self-test            # Chrome measurements and downloads (about 2 minutes)
npm run self-test:firefox    # Firefox measurements (downloads Firefox once)
```

## Rules

### Always
* Keep the user's browsers untouched: read profiles, never write to them; copy extensions before loading them.
* Run `npm run test:ai` and `npm run self-test` locally before pushing. Add `self-test:firefox` when engine, profile reading or Firefox code changes.
* Check UI changes at about 360 px and at desktop width, in light and dark themes: no sideways scroll, no console errors, tap targets at least 40 px.
* Update `CHANGELOG.md` (and README or `docs/` when behaviour changes) with an ISO 8601 timestamp to the second, taken from the system clock (`date --iso-8601=seconds`).
* Write user-facing text in plain English for non-technical people: short sentences, specific button labels, no jargon.
* Delete any runs your checks created in `results/`.

### Ask first
* **Sweeping UI or UX changes** (a redesign, a layout restructure, a whole-section change): build a preview and get approval before changing the app or the report. Small, named edits can go straight in.
* **Starting a GitHub Actions run.** Workflows run only by hand or on release tags; do not add push-triggered workflows.
* Adding a dependency, upgrading Puppeteer or the pinned browsers, or changing verdict thresholds.
* Creating tags or releases, or anything else outward-facing.

### Never
* Add telemetry or send data anywhere by default.
* Print, log or commit an AI key; `.local/` is git-ignored and must stay so.
* Let the AI assistant start a test on its own; it may only propose one (`propose_test`).
* Use a dependency version published less than two weeks ago; pin exact versions.
* Disturb an app the user is running on port 4777; use a spare port for checks.

## Code conventions

* Plain JavaScript ES modules, Node.js 22.12+, no build step, no framework, no TypeScript.
* Two-space indent, single quotes, semicolons, `const` by default, small functions.
* Comments explain *why* in full sentences; match the density of the surrounding code.
* `ui/` and the report's page script build HTML with template strings; escape every value with `esc()`.
* The report (`src/report.js`) is a template literal: inside its `<script>`, backslashes must be doubled (`\\.`, `\\n`).
* Errors shown to users say what went wrong and how to fix it.

## Safety notes for automated agents

* `results/` holds the user's own runs; never delete runs you did not create.
* Killing processes: match by command line carefully. A pattern like `pkill -f e2e.mjs` also matches the shell running it.
* The app server reads its code at start; restart it after editing `src/` before checking in a browser.
