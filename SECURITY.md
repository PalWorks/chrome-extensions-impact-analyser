# Security and privacy

Last updated: 2026-10-22T22:16:52+05:30

## Reporting a problem

Please report security problems privately through GitHub's **Report a vulnerability** button on the repository's **Security** tab, rather than in a public issue. Include what you found, how to reproduce it, and the version (shown at the bottom of the app). The maintainer will reply there.

## How the tool protects users

* **Local only.** The app's server listens on `127.0.0.1`, so other computers cannot reach it.
* **Token.** Each start creates a random token that only the app's own pages receive. Every API call and every PDF, image or Word download needs it.
* **Host check.** Requests addressed to any host other than `127.0.0.1:<port>` or `localhost:<port>` are refused, which blocks DNS-rebinding attacks from websites.
* **Read-only profiles.** Browser profiles are only read. Extensions are copied into a temporary folder before they run, and the folder is deleted afterwards.
* **Separate test browsers.** Tests run in Chrome for Testing or a separate Firefox with fresh temporary profiles, never in the user's browser.
* **No telemetry.** The only network traffic is the test browsers loading the chosen websites, whatever the tested extensions do themselves, the one-time browser downloads, and the AI service if the user connects one.

## Secrets: the AI key

* The key is entered in the report's **Ask** panel and sent only to the local server.
* The server checks it with a short test message, then saves it in `.local/ai.json` inside the app folder with owner-only permissions (`600`) on macOS and Linux.
* The key is never sent back to the page, never logged, and never included in reports or downloads.
* `.local/` is git-ignored. **Remove saved key** in the app, or deleting the app folder, removes it.
* When the user asks a question, the question, recent chat and a compact summary of the results are sent to the chosen AI service. No profile paths or page-load data beyond that summary are sent.

## For contributors

* Never commit keys, tokens or personal data. Test with the pretend AI service in `test/ai-test.js`.
* Escape every value inserted into HTML (`esc()`), including extension names, which come from third-party manifests.
* Keep new endpoints behind the token check, and keep the server bound to `127.0.0.1`.
* Treat extension files as untrusted: they are copied and loaded only into the test browsers.
