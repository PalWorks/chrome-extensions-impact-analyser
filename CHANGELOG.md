# Changelog

## Unreleased (2026-10-22T22:05:14+05:30)

* New **Start files** check (run by hand only): downloads the repository as a ZIP, runs the start file on Windows, macOS and Linux, and checks the app starts, finds Chrome and Firefox profiles, and quits. New `test/start-check.js`.
* Documentation set for people and AI agents (2026-10-22T22:16:52+05:30): README restructured (contents, features, quick start, configuration, architecture, project structure, testing, releases); new `AGENTS.md` (with `CLAUDE.md` pointing to it), `CONTRIBUTING.md` (workflow, review checklist, release and rollback steps), `SECURITY.md`, and `docs/` with ARCHITECTURE, DECISIONS, DOMAIN, API, TESTING, LIMITATIONS and ROADMAP. Private vulnerability reporting turned on for the repository.
* The **Start files** check can be limited to chosen systems when started.
* README: disk space needed (about 450 MB, about 770 MB with Firefox) and the **Open Anyway** step for newer macOS versions.

## 0.2.0 (2026-10-22T21:45:34+05:30)

### Firefox and more browsers
* Firefox support: Firefox profiles are found on Windows, macOS and Linux (including Snap and Flatpak) and their add-ons are listed with names and icons. Firefox add-ons are tested in a separate copy of Firefox, downloaded once on first use. Main-thread work and page-frozen time come from a timer on the page; memory, data downloaded and whole-browser CPU are not available in Firefox. New CLI option `--firefox`. (2026-10-21T18:54:49+05:30)
* Renamed to Chrome Firefox Browser Extensions Impact Analyser. Published at https://github.com/PalWorks/chrome-firefox-browser-extensions-impact-analyser (the earlier address redirects). License holder: PalWorks. (2026-10-21T21:17:28+05:30)

### The report
* Sortable columns with clear arrows (a **Sort by** menu on phones), verdict filter chips, and search that opens from an icon. (2026-10-22T12:58:29+05:30)
* Tick boxes with a **Total** row at the top that adds up the ticked extensions, and **Test these together** to measure that exact combination.
* Downloads: PDF and Word (both numbered "Page X of Y"), PNG image and Markdown.
* **Re-test** with a two-step confirmation that states how long it takes and that the computer will be busy. Only one test runs at a time, and the report says so. Progress with a stop button stays visible in the top bar.
* Optional AI assistant (**Ask**): connect Anthropic, OpenAI, Gemini, DeepSeek, Qwen, GLM, Kimi or any OpenAI-compatible service with your own key, checked before it is saved in `.local/ai.json` with owner-only permissions. It reads the results, estimates combinations and suggests tests, which run only after you confirm. New Ask icon. (2026-10-22T21:11:46+05:30)
* Frozen top bar with Reports, Re-test, Search, Ask, Auto/Light/Dark and Save; labels under the icons on phones. (2026-10-22T21:35:28+05:30)
* Phone layout with cards instead of tables; long website addresses shown as site name plus a shortened path; rows line up across cells.
* "How this was measured" and "Test environment" are collapsible sections, open by default. Credits to PalWorks and a link to the source code at the bottom.
* Reports opened from the app are drawn fresh from their data, so older reports get the current design.

### The app
* Home page redesign: frozen top bar with Reports and Auto/Light/Dark (shared with reports), welcome strip, named steps, coloured browser and profile marks, icons on the thoroughness choices, larger test progress, verdict colour strips on results, and a footer with PalWorks credit, source code, problem reporting and licence links. (2026-10-22T20:54:07+05:30)
* Past reports is a sortable table (date, profile and browser, scope, findings) with cards on phones. (2026-10-22T21:24:41+05:30)

### Fixes and maintenance
* On Linux systems that block Chrome's sandbox (such as Ubuntu 24.04), the test browser falls back to running without it instead of stopping with "Target closed". (2026-10-21T17:41:57+05:30)
* New checks: `npm run self-test:firefox`, `npm run test:ai`, and download checks in the Chrome self-test.
* GitHub Actions kept to a minimum: the Windows, macOS and Linux self-test runs only when started by hand or for a release tag. (2026-10-22T21:41:19+05:30)

## 0.1.0 (2026-10-21T13:14:10+05:30)

First version.

* Point-and-click app in the web browser: choose a profile, choose extensions, choose websites, watch progress, read results.
* Finds Chrome, Chrome Beta/Dev/Canary, Chromium, Edge, Brave and Vivaldi profiles on Windows, macOS and Linux, or any profile folder you point to.
* Measures each extension on its own and all together, in separate clean copies of Chrome for Testing, with warm-up, randomised order and repeated loads.
* Verdicts and plain-language summaries, an HTML report (prints with "Page X of Y"), a CSV of every page load and a JSON file.
* Command-line version (`src/cli.js`) and an offline self-test (`npm run self-test`).
* Start files for Windows, macOS and Linux that check Node.js and install everything on first run.
