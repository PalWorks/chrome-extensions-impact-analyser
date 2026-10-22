# Roadmap

Last updated: 2026-10-22T22:16:52+05:30

Possible next steps, roughly in order of value. These are proposals, not commitments; check with the maintainer before starting one, and record the decision in [DECISIONS.md](DECISIONS.md).

## Next

1. **Confirm AI provider presets with live keys.** Try each preset in `AI_PROVIDERS` (`src/ai.js`) and update model names that fail.
2. **First-run experience on real Windows and Mac computers.** Double-click the start files from a downloaded ZIP and note every prompt; improve the README and start-file messages accordingly.
3. **Remember last settings per profile.** Pre-tick the extensions and websites used last time for the same profile.

## Later

4. **Test a saved combination on several sites in one go** from the report's total row, with a comparison against the estimate.
5. **Compare two runs** (before and after removing an extension) side by side.
6. **Optional signed-in testing** by copying an extension's local storage, behind a clear warning about personal data.
7. **Packaged downloads** (for example a single installer per system) so users do not need Node.js.
8. **More languages** for the app and report.

## Not planned

* Sending results anywhere by default, or any telemetry.
* Testing inside the user's everyday browser profile.
* Push-triggered GitHub Actions ([DECISIONS.md](DECISIONS.md), D10).
