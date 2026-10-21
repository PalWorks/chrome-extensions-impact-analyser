# Changelog

## Unreleased (2026-10-21T17:37:59+05:30)

* Renamed to Chrome FireFox Browser Extensions Impact Analyser and published at https://github.com/PalWorks/chrome-firefox-browser-extensions-impact-analyser
* License holder is now PalWorks.
* Renamed to Chrome FireFox Browser Extensions Impact Analyser, now that it tests Firefox too. The repository moved to https://github.com/PalWorks/chrome-firefox-browser-extensions-impact-analyser (the old address redirects). (2026-10-21T20:55:16+05:30)
* Self-test runs automatically on Windows, macOS and Linux (GitHub Actions) on every push.
* Firefox support (2026-10-21T18:54:49+05:30): Firefox profiles are found on all three systems (including Snap and Flatpak on Linux) and their add-ons are listed with names and icons. Firefox add-ons are tested in a separate copy of Firefox, downloaded once on first use. Main-thread work and page-frozen time come from a timer on the page; memory, data downloaded and whole-browser CPU are not available in Firefox. New `npm run self-test:firefox` and CLI `--firefox`.
* Fix: on Linux systems that block Chrome's sandbox (such as Ubuntu 24.04), the test browser now falls back to running without it instead of stopping with "Target closed". (2026-10-21T17:41:57+05:30)

## 0.1.0 (2026-10-21T13:14:10+05:30)

First version.

* Point-and-click app in the web browser: choose a profile, choose extensions, choose websites, watch progress, read results.
* Finds Chrome, Chrome Beta/Dev/Canary, Chromium, Edge, Brave and Vivaldi profiles on Windows, macOS and Linux, or any profile folder you point to.
* Measures each extension on its own and all together, in separate clean copies of Chrome for Testing, with warm-up, randomised order and repeated loads.
* Verdicts and plain-language summaries, an HTML report (prints with "Page X of Y"), a CSV of every page load and a JSON file.
* Command-line version (`src/cli.js`) and an offline self-test (`npm run self-test`).
* Start files for Windows, macOS and Linux that check Node.js and install everything on first run.
