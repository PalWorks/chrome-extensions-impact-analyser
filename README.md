# Chrome Firefox Browser Extensions Impact Analyser

**Find out which of your browser extensions slow down web pages.** Point and click, on Windows, macOS and Linux. Your own browser is never changed.

[![Release](https://img.shields.io/github/v/release/PalWorks/chrome-firefox-browser-extensions-impact-analyser)](https://github.com/PalWorks/chrome-firefox-browser-extensions-impact-analyser/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 22.12+](https://img.shields.io/badge/node-%3E%3D22.12-339933.svg)](https://nodejs.org/)
![Windows, macOS, Linux](https://img.shields.io/badge/runs%20on-Windows%20%7C%20macOS%20%7C%20Linux-555.svg)

Last updated: 2026-10-22T22:16:52+05:30

## Contents

* [Overview](#overview)
* [Features](#features)
* [Quick start](#quick-start)
* [Use it](#use-it)
* [The report](#the-report)
* [AI assistant (optional)](#ai-assistant-optional)
* [How it measures](#how-it-measures)
* [Good to know](#good-to-know)
* [Command line](#command-line)
* [Configuration](#configuration)
* [Architecture](#architecture)
* [Project structure](#project-structure)
* [Testing](#testing)
* [Releases](#releases)
* [Privacy and security](#privacy-and-security)
* [Troubleshooting](#troubleshooting)
* [Roadmap](#roadmap)
* [Contributing](#contributing)
* [Uninstall](#uninstall)
* [License and acknowledgements](#license-and-acknowledgements)

## Overview

Extensions run on almost every page you open, and some of them make pages noticeably slower. Browsers do not tell you which ones.

This tool copies the extensions from your Chrome (or Edge, Brave, Vivaldi, Chromium) or Firefox profile into a separate test browser. It loads the websites you pick with no extensions, with each extension on its own, and with all of them together, several times each. Then it tells you, in plain words, which extensions make pages slower, use more memory, or even make pages faster.

It is for anyone who wonders whether an extension is worth keeping, no technical knowledge needed.

## Features

* **A verdict for each extension:** **Heavy impact**, **Noticeable impact**, **Small impact**, **No clear impact** or **Makes pages faster**, with a plain sentence such as "Adds about 310 ms of work to every page, makes pages finish loading 0.4 s later and uses about 25 MB of memory."
* **Safe by design:** your browser, profile and data are only read. Tests run in separate copies of Chrome for Testing or Firefox.
* **Finds your profiles** in Chrome (including Beta, Dev and Canary), Edge, Brave, Vivaldi, Chromium and Firefox (including Snap and Flatpak on Linux), or any folder you point to.
* **A full report** you can sort, filter and search, with per-website numbers, and download as PDF, image, Word or Markdown.
* **What-if totals:** tick the extensions you would keep to see their added-up effect, then test that exact combination for real.
* **Re-test** any report with one button (after a two-step confirmation that tells you how long it takes).
* **Optional AI assistant** that answers questions about your results using your own key for Anthropic, OpenAI, Gemini, DeepSeek, Qwen, GLM, Kimi or any OpenAI-compatible service.
* **Light and dark themes**, phone-friendly layout, and a command-line version for scripting.
* **No telemetry.** Everything runs on your computer.

## Quick start

You need **Node.js 22.12 or newer**. Get the LTS version from https://nodejs.org/ and install it with the default options.

Download the latest version from the **Releases** page (https://github.com/PalWorks/chrome-firefox-browser-extensions-impact-analyser/releases, choose **Source code (zip)**), or use the green **Code** button, then **Download ZIP**. Unzip it. Then:

| System | What to do |
|---|---|
| Windows | Double-click `start-windows.bat`. If Windows SmartScreen warns you, choose **More info**, then **Run anyway**. |
| macOS | Double-click `start-macos.command`. The first time, macOS blocks it because it was downloaded from the internet. Right-click the file, choose **Open**, then **Open** again. If there is no **Open** button (newer macOS versions), open **System Settings**, go to **Privacy & Security**, scroll down and click **Open Anyway** next to the message about `start-macos.command`. |
| Linux | Open a terminal in the folder and run `./start-linux.sh`. |

A terminal window opens, and then the app opens in your web browser. Keep the terminal window open while you use the app. To stop, click **Quit the app** at the bottom of the page or close the terminal window.

The first start downloads about 200 MB (a separate copy of Chrome made for testing, plus a few libraries). Unpacked, that takes about 450 MB of disk space. The first Firefox test downloads about 90 MB more (a separate copy of Firefox), about 320 MB unpacked. Each happens only once and is stored inside this folder; deleting the folder removes it all.

## Use it

The bar at the top of the app stays on screen. **Reports** opens your past reports, and **Auto**, **Light** and **Dark** set the colour theme (Auto follows your device; the choice also applies to reports).

1. **Choose a browser profile.** All profiles found on your computer are listed. For anything else, use **Use a different folder** and paste the **Profile Path** shown on `chrome://version` (in Firefox: the **Profile Folder** shown on `about:support`).
2. **Choose extensions.** The ones turned on in that profile are already ticked.
3. **Choose websites** and how thorough the test should be: **Quick** (3 loads per site), **Standard** (5) or **Thorough** (9). Use sites you visit every day. The page shows how long the test will take.
4. **Wait.** You can keep using your computer, but heavy work such as video calls makes results less precise.
5. **Read the results**, then open the full report.

Past reports stay in the `results` folder. **Reports** in the app lists them in a table (date, profile, scope and findings) that you can sort.

## The report

The bar at the top stays on screen while you scroll, as it does in the app. Its buttons, from left to right:

| Button | What it does |
|---|---|
| Reports | Opens the list of past reports in the app. |
| Re-test | Runs the same test again. It first shows how long it takes and that your computer will be busy, then asks once more before starting. If a test is already running, it says so instead. |
| Search | Opens a search box that filters extensions and websites. |
| Ask | Opens the AI assistant (see below). |
| Auto, Light, Dark | Colour theme. Auto follows your device. |
| Save | Downloads the report as PDF, image (PNG), Word (.docx, which Google Docs also opens) or Markdown. PDF and Word pages are numbered "Page X of Y". |

In the results table:

* Click a column name to sort. On a phone, use **Sort by**.
* Use the chips to show only one verdict, for example **Heavy impact**.
* Tick the extensions you would keep. The **Total** row at the top adds up their effects and gives an estimated verdict. Adding up is only an estimate, so the row also offers **Test these together**, which runs a real test of just those extensions.
* Red means slower or more, green means faster or less, grey is within normal run-to-run variation.
* Click an extension's name to jump to its numbers for each website.

A report opened straight from the `results` folder still sorts, filters, searches and saves as Markdown or (through the print window) PDF. Re-test, the AI assistant, and image and Word downloads need the app running: open the report from **Reports** in the app.

## AI assistant (optional)

**Ask** lets you ask questions such as "What if I keep only Bitwarden and Ghostery?" or "Is this slow on every website?". The assistant reads the results, adds up effects, and can suggest a new test. A suggested test only runs if you press its button and confirm; the assistant then explains the new results.

You need a key from an AI service. The form fills in the endpoint and model for Anthropic, OpenAI, Google Gemini, DeepSeek, Alibaba Qwen, Zhipu GLM and Moonshot Kimi, and accepts any other OpenAI-compatible service, including a local one such as Ollama. Every field can be edited, because services rename their models from time to time. The key is checked with a short test message before it is saved.

* The key is saved only on this computer, in `.local/ai.json` inside this folder (readable only by you on macOS and Linux). **Remove saved key** deletes it.
* When you ask a question, your question and a summary of the results are sent to the service you chose. Nothing is sent anywhere until you connect a service and ask.

## How it measures

* Every setup runs in its own clean copy of **Chrome for Testing** (or of **Firefox**, for a Firefox profile). Your everyday browser is not used.
* Each extension is installed once and given time to finish its first-run work (for example, downloading block lists). That way, the measurements show normal use.
* Each website is loaded several times per setup with an empty cache, in a new random order each round, so changes in network speed affect every setup alike.
* For every load it records: main-thread work on the page (this includes the extensions' scripts on the page), when the page finished loading, when the main content appeared, time the page was frozen, memory, requests and data downloaded.
* The result for an extension is its median minus the median with no extensions, averaged across websites. A difference counts only when it is bigger than the normal run-to-run variation, and at least 5% of the typical value.

Verdict thresholds:

| Verdict | Extra work per page | or slower by |
|---|---|---|
| Heavy impact | 200 ms or more | 1 s or more |
| Noticeable impact | 75 ms or more | 300 ms or more |
| Small impact | 25 ms or more | 100 ms or more |
| Makes pages faster | less work, and finishes at least 300 ms sooner | |

These thresholds are a judgement call, not an industry standard. They live in `src/analyze.js` if you want to change them. The full rules are in [docs/DOMAIN.md](docs/DOMAIN.md).

## Good to know

* **More rounds and more sites give more reliable results.** News and shopping sites with ads change from one load to the next. The **Quick** setting is fine for spotting big problems; use **Standard** or **Thorough** before acting on small differences.
* **Extensions run signed out.** The test browser gets a copy of each extension's files, not your logins or settings. Extensions that do a lot more once you are signed in (password managers, grammar checkers) may do less in the test than in your real browser.
* **Manifest V2 extensions cannot be tested in Chrome.** Current Chrome no longer runs them, so they are shown but cannot be ticked. Firefox still runs them, so Firefox add-ons can be tested whatever their version.
* **Firefox results measure a little less.** Firefox does not report main-thread work directly, so the tool counts the delays a tiny timer on the page sees. It does not report memory, data downloaded or whole-browser CPU either, so those show as n/a. Verdicts use the same thresholds as Chrome, but do not compare numbers between the two browsers.
* **Chrome-family browsers are tested in Chrome for Testing.** Extensions from Edge, Brave or Vivaldi run in Chrome for Testing, not in that browser itself. Features built into those browsers (such as Brave Shields) are not part of the test.
* **Extensions that need a desktop app** (through native messaging) will not reach that app during the test.
* **What it does not measure:** battery use, and work an extension does in the background when no page is loading.

More in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Command line

For scripting or people who prefer a terminal (run `npm install` once first):

```
node src/cli.js --list
node src/cli.js --profile "/path/to/Chrome/Profile 1" --url wikipedia.org --url github.com --rounds 5
node src/cli.js --extension-dir ./my-extension --url example.com --rounds 3
node src/cli.js --help
```

A run prints progress, then a summary, and saves the same report as the app (example, shortened, with made-up extension names):

```
Testing 2 extension(s) on 2 site(s). This takes about 6 minute(s).
...
One extension noticeably slows down these websites: Example Blocker.

  Heavy impact        Example Blocker
                      Adds about 302 ms of work to every page and makes pages finish loading 307 ms later.
  No clear impact     Example Helper
                      No difference beyond normal run-to-run variation.

Full report: results/2026-10-22_20-52-53/report.html
```

Firefox profiles are detected automatically; `--firefox` forces Firefox for `--extension-dir` add-ons.

## Configuration

There are no configuration files to edit. Everything is chosen in the app or with command-line options.

| Setting | Where | Default |
|---|---|---|
| Rounds, warm-up, settle and observe times, page timeout, "all together" test, visible browser windows | **Advanced settings** on the websites step, or CLI options | 5 rounds, 10 s warm-up, 3 s settle, 3 s observe, 45 s timeout |
| Port | `node src/server.js --port=4790` | 4777 (a free port if busy) |
| Do not open a browser tab on start | `--no-open`, or environment variable `EXTENSION_IMPACT_NO_OPEN=1` | Opens one |
| Where test browsers are stored | `.puppeteerrc.cjs` | `.cache/puppeteer` inside this folder |
| AI service | **Ask** in a report | None |

## Architecture

A single Node.js process serves the app on `127.0.0.1`, reads profiles from disk, drives the test browsers with Puppeteer (DevTools protocol for Chrome for Testing, WebDriver BiDi for Firefox), analyses the page loads and writes reports. There is no build step, database or cloud service.

**Tech stack:** Node.js 22 (ES modules), Puppeteer 25.12.0, @puppeteer/browsers 3.2.3, docx 9.9.0, Chrome for Testing 154, Firefox 156, plain HTML, CSS and JavaScript for the app.

Details, a diagram and the data flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Why it is built this way: [docs/DECISIONS.md](docs/DECISIONS.md). The local HTTP API: [docs/API.md](docs/API.md).

## Project structure

| Path | What it holds |
|---|---|
| `start-linux.sh`, `start-macos.command`, `start-windows.bat` | Start files: check Node.js, install on first run, start the app |
| `src/server.js` | Local web server for the app, reports, downloads, re-tests and the AI assistant |
| `src/engine.js` | Runs the tests in Chrome for Testing or Firefox and records every page load |
| `src/analyze.js` | Turns page loads into medians, noise limits and verdicts |
| `src/report.js` | The HTML report (with its page script), CSV and JSON |
| `src/export.js` | PDF, PNG and Word downloads |
| `src/ai.js` | The AI assistant: providers, saved key, tools |
| `src/sources.js` | Finds browser profiles and reads their extensions |
| `src/cli.js` | Command-line version |
| `ui/` | The app's pages (plain HTML, CSS and JavaScript, no build step) |
| `test/` | Self-test, AI test, start check and test extensions |
| `docs/` | Architecture, decisions, domain, API, testing, limitations, roadmap |
| `results/` | Your reports (not in the repository) |

## Testing

```
npm run self-test
npm run self-test:firefox
npm run test:ai
```

The first checks Chrome, the second Firefox (its first run downloads Firefox; after that no internet is needed). Each tests two built-in test extensions against a local page. One burns about 300 ms of CPU on every page and must come out as **Heavy impact**. The other does nothing and must come out as **No clear impact**. The Chrome self-test also checks the PDF, image and Word downloads. `test:ai` checks the AI assistant against a pretend AI service, with no key or internet needed.

The same checks run on Windows, macOS and Linux in GitHub Actions, but only when started by hand from the Actions tab or when a release tag (for example `v0.2.0`) is pushed. A second check, **Start files**, runs only by hand: it downloads the repository as a ZIP like a user would, runs each system's start file, and checks the app comes up, finds Chrome and Firefox profiles, and quits. More in [docs/TESTING.md](docs/TESTING.md).

## Releases

Versions are published on the Releases page with notes from [CHANGELOG.md](CHANGELOG.md). There is nothing to deploy: users download a release and run the start file. The release steps are in [CONTRIBUTING.md](CONTRIBUTING.md#releasing).

## Privacy and security

Everything runs on your computer. The app listens only on `127.0.0.1` and needs a secret token that only its own page knows. The only network traffic is the test browser loading the websites you choose, plus whatever the tested extensions do themselves, plus the AI service if you choose to use the assistant. There is no telemetry.

How keys are stored and how to report a security problem: [SECURITY.md](SECURITY.md).

## Troubleshooting

| Problem | Fix |
|---|---|
| "Node.js is too old" or "needs Node.js" | Install the LTS version from https://nodejs.org/, then start again. |
| "The test browser has not been downloaded yet" | Start again while connected to the internet. To start fresh, delete the `node_modules` and `.cache` folders first. |
| A website shows an error or never loads | Some sites block automated visits. Pick a different site. |
| Linux: warning that the sandbox is off | Your system blocks Chrome's sandbox for non-installed browsers. The test still runs; this only affects the test browser. |
| The page says it is out of date | The app was restarted. Reload the page. |
| The AI assistant says the key was refused, or the model was not found | Check the key belongs to the service you chose. Services rename models; open **Change AI service** and type the current model name from the service's own documentation. |
| The first Firefox test stops while downloading Firefox | Check your internet connection and start the test again. The download continues from scratch and happens only once. |

## Roadmap

Ideas for what comes next, such as confirming the AI presets with live keys and comparing two runs side by side, are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). AI coding agents should read [AGENTS.md](AGENTS.md) first.

## Uninstall

Delete this folder. Nothing is installed anywhere else, apart from Node.js itself. That also deletes any saved AI key.

## License and acknowledgements

MIT. See [LICENSE](LICENSE). Copyright PalWorks.

Made by PalWorks: https://palworks.ai

Built on [Puppeteer](https://pptr.dev/), [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/), Mozilla Firefox and [docx](https://docx.js.org/). DebugBear's studies of how extensions affect page speed were a useful reference: https://www.debugbear.com/blog/chrome-extensions-website-performance
