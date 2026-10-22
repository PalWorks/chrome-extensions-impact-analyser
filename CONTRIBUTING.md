# Contributing

Last updated: 2026-10-22T22:16:52+05:30

Thank you for helping. This tool is for non-technical people, so changes are judged first by whether they keep it simple, safe and honest about what it measures.

## Getting set up

1. Install Node.js 22.12 or newer.
2. Clone the repository and run `npm install` (downloads Chrome for Testing, about 200 MB, into `.cache/`).
3. Run the app with `node src/server.js`, or `./start-linux.sh`.
4. Run the checks once to see them pass: `npm run test:ai` and `npm run self-test`.

Read [AGENTS.md](AGENTS.md) for the rules and conventions; they apply to people too.

## Making a change

1. **Open an issue first** for anything larger than a small fix, so the approach can be agreed. For UI or UX changes, include a screenshot or mock-up.
2. **Branch** from `main` with a short descriptive name (for example `fix-firefox-snap-profiles`).
3. **Keep the change focused.** Match the surrounding code; no new dependencies without discussion.
4. **Test** as described in [docs/TESTING.md](docs/TESTING.md).
5. **Document**: add a line to `CHANGELOG.md` under "Unreleased" with a timestamp, and update the README or `docs/` if behaviour changed.
6. **Open a pull request** describing what changed, why, and how you checked it.

### Review checklist

* [ ] The user's browser profiles are only read, never written.
* [ ] `npm run test:ai` and `npm run self-test` pass (and `self-test:firefox` if relevant).
* [ ] UI checked at about 360 px and desktop width, light and dark, with no sideways scroll or console errors.
* [ ] User-facing text is plain English and buttons say what they do.
* [ ] No telemetry, no secrets in code or logs, no new push-triggered workflows.
* [ ] CHANGELOG updated with a timestamp.

## Releasing

For maintainers.

1. Make sure `main` is clean and the local checks pass.
2. Move the "Unreleased" CHANGELOG items under a new version heading with the release timestamp.
3. Update `"version"` in `package.json`, then run `npm install --package-lock-only`.
4. Commit ("Release X.Y.Z") and push.
5. Tag and push: `git tag -a vX.Y.Z -m "Version X.Y.Z" && git push origin vX.Y.Z`. This runs `self-test.yml` once on Windows, macOS and Linux.
6. If the start files or install steps changed, also run `gh workflow run start-files.yml`.
7. When the checks pass, publish the release with the CHANGELOG section as notes: `gh release create vX.Y.Z --verify-tag --title "..." --notes-file notes.md`.

### Rolling back

* A bad release: publish a new patch version that reverts the change (`git revert <commit>`), rather than deleting tags people may have downloaded.
* A bad local state: `git checkout -- .` for uncommitted changes; delete `node_modules` and `.cache` and run `npm install` to reinstall the test browsers.
