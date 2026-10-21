# Chrome Extensions Impact Analyser

Find out which of your browser extensions slow down web pages.

Chrome Extensions Impact Analyser copies the extensions from your Chrome (or Edge, Brave, Vivaldi, Chromium) or Firefox profile into a separate test browser. It loads the websites you pick with no extensions, with each extension on its own, and with all of them together. Then it tells you, in plain words, which extensions make pages slower, use more memory, or even make pages faster.

Your own browser, profile and data are never changed.

Last updated: 2026-10-21T18:54:49+05:30

## What you get

* A verdict for each extension: **Heavy impact**, **Noticeable impact**, **Small impact**, **No clear impact** or **Makes pages faster**.
* A plain sentence for each, for example: "Adds about 310 ms of work to every page, makes pages finish loading 0.4 s later and uses about 25 MB of memory."
* A full report (`report.html`) with per-website details, plus `results.csv` (every page load) and `results.json` (everything).

## Before you start

You need **Node.js 22.12 or newer**. Get the LTS version from https://nodejs.org/ and install it with the default options.

The first start downloads about 200 MB (the test browser and one library). The first Firefox test downloads about 90 MB more (a separate copy of Firefox). Each happens only once and is stored inside this folder.

## Start it

Download this repository (green **Code** button, then **Download ZIP**) and unzip it. Then:

| System | What to do |
|---|---|
| Windows | Double-click `start-windows.bat`. If Windows SmartScreen warns you, choose **More info**, then **Run anyway**. |
| macOS | Double-click `start-macos.command`. The first time, macOS may block it: right-click the file, choose **Open**, then **Open** again. |
| Linux | Open a terminal in the folder and run `./start-linux.sh`. |

A terminal window opens, and then the app opens in your web browser. Keep the terminal window open while you use the app. To stop, click **Quit Chrome Extensions Impact Analyser** at the bottom of the page or close the terminal window.

## Use it

1. **Choose a browser profile.** All profiles found on your computer are listed. For anything else, use **Use a different folder** and paste the **Profile Path** shown on `chrome://version` (in Firefox: the **Profile Folder** shown on `about:support`).
2. **Choose extensions.** The ones turned on in that profile are already ticked.
3. **Choose websites** and how thorough the test should be. Use sites you visit every day. The page shows how long the test will take.
4. **Wait.** You can keep using your computer, but heavy work such as video calls makes results less precise.
5. **Read the results**, then open the full report.

Past reports stay in the `results` folder and under **Past reports** in the app.

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

These thresholds are a judgement call, not an industry standard. They live in `src/analyze.js` if you want to change them.

## Good to know

* **More rounds and more sites give more reliable results.** News and shopping sites with ads change from one load to the next. The **Quick** setting is fine for spotting big problems; use **Standard** or **Thorough** before acting on small differences.
* **Extensions run signed out.** The test browser gets a copy of each extension's files, not your logins or settings. Extensions that do a lot more once you are signed in (password managers, grammar checkers) may do less in the test than in your real browser.
* **Manifest V2 extensions cannot be tested in Chrome.** Current Chrome no longer runs them, so they are shown but cannot be ticked. Firefox still runs them, so Firefox add-ons can be tested whatever their version.
* **Firefox results measure a little less.** Firefox does not report main-thread work directly, so the tool counts the delays a tiny timer on the page sees. It does not report memory, data downloaded or whole-browser CPU either, so those show as n/a. Verdicts use the same thresholds as Chrome, but do not compare numbers between the two browsers.
* **Chrome-family browsers are tested in Chrome for Testing.** Extensions from Edge, Brave or Vivaldi run in Chrome for Testing, not in that browser itself. Features built into those browsers (such as Brave Shields) are not part of the test.
* **Extensions that need a desktop app** (through native messaging) will not reach that app during the test.
* **What it does not measure:** battery use, and work an extension does in the background when no page is loading.

## Privacy

Everything runs on your computer. The app listens only on `127.0.0.1` and needs a secret token that only its own page knows. The only network traffic is the test browser loading the websites you choose, plus whatever the tested extensions do themselves. There is no telemetry.

## Command line

For scripting or people who prefer a terminal (run `npm install` once first):

```
node src/cli.js --list
node src/cli.js --profile "/path/to/Chrome/Profile 1" --url wikipedia.org --url github.com --rounds 5
node src/cli.js --help
```

## Check that it works on your computer

```
npm run self-test
npm run self-test:firefox
```

The first checks Chrome, the second Firefox (its first run downloads Firefox; after that no internet is needed). Each tests two built-in test extensions against a local page. One burns about 300 ms of CPU on every page and must come out as **Heavy impact**. The other does nothing and must come out as **No clear impact**.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Node.js is too old" or "needs Node.js" | Install the LTS version from https://nodejs.org/, then start again. |
| "The test browser has not been downloaded yet" | Start again while connected to the internet. To start fresh, delete the `node_modules` and `.cache` folders first. |
| A website shows an error or never loads | Some sites block automated visits. Pick a different site. |
| Linux: warning that the sandbox is off | Your system blocks Chrome's sandbox for non-installed browsers. The test still runs; this only affects the test browser. |
| The page says it is out of date | The app was restarted. Reload the page. |

## Uninstall

Delete this folder. Nothing is installed anywhere else, apart from Node.js itself.

## Related work

DebugBear has published large studies of how extensions affect page speed:
https://www.debugbear.com/blog/chrome-extensions-website-performance

## License

MIT. See `LICENSE`.
