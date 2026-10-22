# Decisions

Last updated: 2026-10-22T22:16:52+05:30

Architecture decision records: why things are the way they are. Read these before changing the area they cover. Newest last.

## D1. Test in Chrome for Testing, not the user's Chrome (2026-10-21)

**Context.** Branded Chrome no longer accepts `--load-extension`, and testing inside the user's own profile would change their data and mix in their history, logins and cache.
**Decision.** Copy each extension's files and load them into Chrome for Testing, downloaded by Puppeteer into the app folder, using Puppeteer's `browser.installExtension` over a pipe connection.
**Consequences.** The user's browser is never touched. Extensions run signed out, so password managers and similar may do less than in real use. Extensions from Edge, Brave and Vivaldi are measured in Chrome for Testing, not in those browsers.

## D2. One clean browser per setup and round, random order (2026-10-21)

**Context.** Network speed and computer load drift during a long run; earlier setups would otherwise look different from later ones.
**Decision.** Every setup gets its own profile folder and a fresh browser start for each round. Setups run in a new random order every round. Cache and cookies are cleared before each page load.
**Consequences.** Slower than reusing one browser, but drift affects every setup alike.

## D3. Medians, a noise limit and fixed verdict thresholds (2026-10-21)

**Context.** Single page loads vary a lot, especially on sites with ads.
**Decision.** Use the median of repeated loads, subtract the no-extension median, and count a difference only when it is larger than the normal variation (a robust standard deviation) and at least 5% of the typical value. Verdict thresholds live in `THRESHOLDS` in `src/analyze.js`.
**Consequences.** Fewer false alarms; small real effects can show as "No clear impact" on Quick runs. The thresholds are a judgement call and are documented as such.

## D4. Local web app with a token, not an Electron app or a browser extension (2026-10-21)

**Context.** Non-technical users on three systems need a point-and-click interface without installing an app bundle.
**Decision.** A small Node.js server on `127.0.0.1` serves plain HTML and JavaScript with no build step. Start files handle Node checks and first-run installs. A random per-start token protects the API; requests with other host names are refused.
**Consequences.** Needs Node.js installed. No code signing, so Windows SmartScreen and macOS Gatekeeper ask once.

## D5. Firefox through WebDriver BiDi and an on-page timer (2026-10-21)

**Context.** Firefox has no DevTools metrics in Puppeteer and no long-task timing.
**Decision.** Drive Puppeteer's pinned Firefox over WebDriver BiDi, install add-ons as temporary add-ons (so signing is not needed), turn off the cache with preferences, and measure main-thread work with a repeating timer injected before the page loads. Memory, data downloaded and browser CPU are reported as not available.
**Consequences.** Firefox and Chrome numbers are not directly comparable; verdicts use the same thresholds. Firefox is downloaded only when first needed.

## D6. Reports are static files that the app can enhance (2026-10-22)

**Context.** Reports must open offline and be shareable, but re-tests, AI and some downloads need the app.
**Decision.** `report.html` contains its data and its own script. When served by the app, it is re-rendered from `results.json` with the app token, which shows the extra features. Without the token those features are hidden.
**Consequences.** Older reports get the current design when opened from the app. The file on disk keeps the design of the version that wrote it.

## D7. The total row adds up single results, and says it is an estimate (2026-10-22)

**Context.** Users ask "what if I keep only A and B?". Real tests of every combination would take too long.
**Decision.** Add up the significant changes of the ticked extensions and show an estimated verdict, plus the measured "all together" result as a reality check, and offer a real test of the exact combination.
**Consequences.** Estimates can be wrong in either direction (in one real run, adding up gave 2.0 s; the measured combination was 1.2 s). The UI says so.

## D8. The AI assistant proposes tests; people start them (2026-10-22)

**Context.** An assistant that can start tests could tie up the computer for many minutes without the user meaning it to.
**Decision.** Bring-your-own-key assistant with three tools. `propose_test` only adds a button; the user must press it and confirm twice. The key is checked with a test message, then saved in `.local/ai.json` with owner-only permissions and never sent to the page.
**Consequences.** One extra click per test. Provider presets may age; every field stays editable.

## D9. Two-step confirmation before any test from a report (2026-10-22)

**Context.** A test makes the computer busy for minutes; one-click starts were too easy to trigger.
**Decision.** Step 1 states the time and the load on the computer; step 2 asks to start. If a test is already running, say so instead of queuing.
**Consequences.** Slightly slower to start, but no accidental runs.

## D10. GitHub Actions only by hand or on release tags (2026-10-22)

**Context.** The maintainer wants minimal GitHub Actions use.
**Decision.** `self-test.yml` runs on `workflow_dispatch` and `v*` tags; `start-files.yml` runs only on `workflow_dispatch` and can be limited to chosen systems. Day-to-day checks run locally.
**Consequences.** Cross-platform problems are caught at release time, not on every push.

## D11. Pin dependency versions (2026-10-21)

**Context.** The tool downloads browsers tied to the Puppeteer version; surprise upgrades would change measurements.
**Decision.** Pin exact versions in `package.json` and choose versions published at least two weeks before adoption.
**Consequences.** Upgrades are deliberate; after one, run both self-tests and update [ARCHITECTURE.md](ARCHITECTURE.md).
