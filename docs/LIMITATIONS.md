# Known limitations

Last updated: 2026-10-22T22:16:52+05:30

Things the tool cannot do or does imperfectly. Check here before treating one as a new bug, and add to it when you find another.

## Measurement

* **Extensions run signed out.** Only an extension's files are copied, not its settings or logins. Password managers, grammar checkers and similar may do less than in real use.
* **Chromium-family extensions run in Chrome for Testing.** Edge, Brave and Vivaldi extensions are not measured inside those browsers, and their built-in features (such as Brave Shields) are not part of the test.
* **Manifest V2 extensions cannot be tested in Chrome.** Current Chrome cannot run them; they are listed but cannot be ticked. Firefox still runs them.
* **Firefox measures less.** No page memory, data downloaded, browser CPU or extension memory. Main-thread work comes from an on-page timer, which can miss work that runs before the timer starts. Do not compare Chrome and Firefox numbers directly.
* **Native messaging does not work.** Extensions that talk to a desktop app cannot reach it.
* **Not measured:** battery use, and work an extension does in the background when no page is loading.
* **Busy websites are noisy.** News and shopping sites change between loads; Quick (3 rounds) can give different verdicts on repeat runs. Use Standard or Thorough before acting.
* **Some websites block automated visits** or show consent pages, which changes what is measured.
* **The total row is an estimate.** Extensions can add up to more or less when switched on together.
* **Verdict thresholds are a judgement call**, not an industry standard (`THRESHOLDS` in `src/analyze.js`).

## App and platforms

* **Needs Node.js 22.12 or newer.** The start files explain how to get it.
* **No code signing.** Windows SmartScreen and macOS Gatekeeper ask once; on newer macOS the user must use **Open Anyway** in Privacy & Security.
* **Linux sandbox.** On systems that block Chrome's sandbox (such as Ubuntu 24.04), the test browser runs without it and the report says "sandbox off".
* **One test at a time** per app.
* **Disk space.** About 450 MB after the first start, about 770 MB once Firefox has been downloaded, plus results.
* **Report files opened from disk** cannot re-test, use the assistant, or make PDF (except through printing), image or Word files.

## AI assistant

* **Provider presets may be out of date.** Model names and endpoints were set from documentation and have not been tried with live keys; every field is editable.
* **Answers depend on the chosen model** and can be wrong; the assistant is told not to invent numbers and to call its tools first.
* **Data leaves the computer** when the assistant is used: the question, recent chat and a summary of the results go to the chosen service.
