# Testing

Last updated: 2026-10-22T22:16:52+05:30

The tool measures other software, so its tests check that the measurements themselves are right: an extension built to waste a known amount of time must come out as heavy, and one that does nothing must not.

## Commands

| Command | Needs | What it checks | Time |
|---|---|---|---|
| `npm run test:ai` | Nothing (no key, no internet) | The AI assistant against a pretend service in both API styles: key headers, tool calls and results, test proposals becoming buttons, refused keys explained. | Seconds |
| `npm run self-test` | Chrome for Testing (installed by `npm install`) | Measures the two test extensions on a local page in Chrome for Testing: all 20 page loads succeed, the busy extension is "Heavy impact" with about 300 ms extra work (250 to 450 ms accepted), the idle one is "No clear impact", both together are "Heavy impact". Then makes the PDF, image and Word downloads. | About 2 minutes |
| `npm run self-test:firefox` | Internet on first run (downloads Firefox) | The same measurements in Firefox. | About 2 minutes |
| `node test/start-check.js --port=4777 --expect="Google Chrome,Firefox"` | A running app | The app answers, carries its token, has its test browser, finds the expected profiles, refuses requests without the token, and quits. | Seconds |

Test extensions live in `test/fixtures/`: `busy-extension` burns 300 ms of CPU on every page; `idle-extension` does nothing. Both manifests work in Chrome and Firefox.

## Before sending a change

1. `npm run test:ai`
2. `npm run self-test`
3. If you touched `src/engine.js`, `src/sources.js` or anything Firefox-specific: `npm run self-test:firefox`.
4. If you touched the app or the report: open both in a browser at about 360 px and at desktop width, in light and dark themes, and check there is no sideways scroll and no console errors. Walk the main flow: choose profile, extensions, websites, run, open the report, sort, tick, download.
5. Delete any runs your checks created in `results/`.

Use a spare port (for example `node src/server.js --no-open --port=4790`) so you do not disturb an app someone is already using on 4777.

## GitHub Actions

Kept to a minimum on purpose ([DECISIONS.md](DECISIONS.md), D10).

| Workflow | Starts | Runs |
|---|---|---|
| `self-test.yml` | By hand, or when a `v*` tag is pushed | `test:ai`, `self-test` and `self-test:firefox` on Windows, macOS and Linux |
| `start-files.yml` | By hand only; choose systems with the `systems` input | Downloads the repository as a ZIP, unzips it with the system's own tool, creates a Chrome and a Firefox profile, runs the system's start file, then `test/start-check.js` |

Start one by hand: `gh workflow run start-files.yml -f systems='["windows-latest"]'`.

## Not covered by automated tests

* Double-clicking start files in Finder or Explorer, and the Gatekeeper / SmartScreen prompts.
* Real users' profiles with many extensions, and extensions that need sign-in or a desktop app.
* Live AI services (tests use a pretend service).
* Accuracy against real-world sites, which change from load to load.
