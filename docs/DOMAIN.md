# Domain and glossary

Last updated: 2026-10-22T22:16:52+05:30

The ideas the tool works with, the words used for them in code and on screen, and the rules that turn page loads into verdicts.

## Entities

| Term | In code | Meaning |
|---|---|---|
| Profile | `source.profilePath` | A browser's user profile folder on disk. Chromium: a folder such as `Default` inside "User Data". Firefox: a folder listed in `profiles.ini`. |
| Engine | `engine` (`chrome` or `firefox`) | Which test browser runs the extensions. Chromium-family profiles use `chrome`; Firefox profiles use `firefox`. |
| Extension | `extensions[]` with `key` `x1`, `x2` ... | One extension or add-on chosen for the test. `sourcePath` is where it was read from; it is copied before use. |
| Setup (scenario) | `scenarios[]` | A browser configuration that is measured: `baseline` (no extensions), one per extension (key `x1` ...), and `combined` (all chosen extensions together). |
| Round | `round` | One pass over every setup and website. Setups run in a new random order each round. |
| Page load (sample) | `samples[]` | One website loaded once in one setup in one round, with its measurements. |
| Run | `results/<date-time>/` | A complete test: settings, samples, analysis and the files written from them. |
| Report | `report.html` | The page that presents a run. |

## Measurements (per page load)

| Key | Shown as | Meaning |
|---|---|---|
| `mainThreadMs` | Extra work | Time the page's main thread was busy, including extension scripts on the page. |
| `load` | Slower to load / Finished loading | When the page's `load` event finished. |
| `lcp` | Main content later | When the largest text or image appeared. |
| `fcp` | First content | When anything first appeared. |
| `tbt` | Page frozen | Time the page could not respond: the part of every task (Chrome) or timer gap (Firefox) beyond 50 ms. |
| `pageHeapMB` | Page memory | JavaScript memory on the page (Chrome only). |
| `requests`, `transferKB` | Requests, Data | Network requests and bytes for the page (bytes in Chrome only). |
| `browserCpuMs` | Browser CPU | CPU time of all browser processes during the load (Chrome only, noisy). |

## Rules

1. **Delta.** For each setup and website: median of its page loads minus the baseline median.
2. **Noise.** The larger of the baseline's and the setup's robust spread (1.4826 × median absolute deviation), and never less than 5% of the baseline median.
3. **Significant.** The average delta across websites is significant when it is larger than both the average noise and the metric's minimum change (`minChange` in `METRICS`).
4. **Verdict.** From significant changes only, with `slowdown` = the larger of the `load` and `lcp` deltas:

| Verdict | Key | Rule |
|---|---|---|
| Heavy impact | `heavy` | Extra work at least 200 ms, or slowdown at least 1 s |
| Noticeable impact | `moderate` | Extra work at least 75 ms, or slowdown at least 300 ms |
| Small impact | `light` | Extra work at least 25 ms, or slowdown at least 100 ms |
| Makes pages faster | `faster` | Load at least 300 ms sooner, no extra work, and main content not more than 300 ms later |
| No clear impact | `none` | None of the above |
| Not enough data | `unknown` | No successful page loads |

5. **Memory shown for an extension** = its own background heap plus any extra page memory (Chrome only).
6. **Total row** = sum of significant deltas of the ticked extensions, with a verdict from the same rules, marked as an estimate.

## Thoroughness

| Name | Rounds | Use |
|---|---|---|
| Quick | 3 | Spotting big problems. Unstable on ad-heavy sites. |
| Standard | 5 | Default. |
| Thorough | 9 | Before acting on small differences. |
