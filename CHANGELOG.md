# Changelog

## Unreleased (2026-10-21T17:37:59+05:30)

* New icon for **Ask** (2026-10-22T21:11:46+05:30): "AI" in an open frame with two sparkles, drawn as a scalable icon that follows the light and dark themes.
* App home page redesign (2026-10-22T20:54:07+05:30): frozen app bar with icon, tagline, Reports button and Auto/Light/Dark switch (labels under icons on phones, compact once scrolled); welcome strip on the first step; numbered, named steps; coloured browser and profile marks; icons on the thoroughness choices; larger progress on the test screen; verdict colour strip on result cards; footer with PalWorks credit, source code, problem reporting and licence links, then version and Quit.
* The report uses the same frozen app bar; test progress shows inside it, so it stays visible while scrolling. The theme choice is shared between the app and reports.
* New report (2026-10-22T12:58:29+05:30):
  * Sortable columns with clear arrows (a **Sort by** menu on phones), verdict filter chips, and search that opens from an icon.
  * Tick boxes with a **Total** row at the top that adds up the ticked extensions, plus **Test these together** to measure that exact combination.
  * Downloads: PDF and Word (both numbered "Page X of Y"), PNG image and Markdown.
  * **Re-test** button with a two-step confirmation that states the time it takes and that the computer will be busy. A second test cannot start while one is running, and the report says so. Live progress with a stop button.
  * Optional AI assistant: connect Anthropic, OpenAI, Gemini, DeepSeek, Qwen, GLM, Kimi or any OpenAI-compatible service with your own key (checked, then saved in `.local/ai.json` with owner-only permissions). It reads the results, estimates combinations and suggests tests, which run only after you confirm.
  * Auto, Light and Dark theme switch; icons get labels on phones; tables turn into cards on phones; long website addresses show as site name plus a shortened path; rows line up across cells.
  * "How this was measured" and "Test environment" are collapsible sections, open by default. Credits to PalWorks and a link to the source code at the bottom.
  * Reports opened from the app are drawn fresh from their data, so older reports get the new design too.
* New `npm run test:ai`; the Chrome self-test also checks the PDF, image and Word downloads.
* Renamed to Chrome Extensions Impact Analyser and published at https://github.com/PalWorks/chrome-extensions-impact-analyser
* License holder is now PalWorks.
* Renamed to Chrome Firefox Browser Extensions Impact Analyser, now that it tests Firefox too. The repository moved to https://github.com/PalWorks/chrome-firefox-browser-extensions-impact-analyser (the old address redirects). (2026-10-21T20:55:16+05:30) Spelling set to "Firefox" (2026-10-21T21:17:28+05:30).
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
