# Changelog

## Unreleased (2026-10-21T17:37:59+05:30)

* Renamed to Chrome Extensions Impact Analyser and published at https://github.com/PalWorks/chrome-extensions-impact-analyser
* License holder is now PalWorks.
* Self-test runs automatically on Windows, macOS and Linux (GitHub Actions) on every push.

## 0.1.0 (2026-10-21T13:14:10+05:30)

First version.

* Point-and-click app in the web browser: choose a profile, choose extensions, choose websites, watch progress, read results.
* Finds Chrome, Chrome Beta/Dev/Canary, Chromium, Edge, Brave and Vivaldi profiles on Windows, macOS and Linux, or any profile folder you point to.
* Measures each extension on its own and all together, in separate clean copies of Chrome for Testing, with warm-up, randomised order and repeated loads.
* Verdicts and plain-language summaries, an HTML report (prints with "Page X of Y"), a CSV of every page load and a JSON file.
* Command-line version (`src/cli.js`) and an offline self-test (`npm run self-test`).
* Start files for Windows, macOS and Linux that check Node.js and install everything on first run.
