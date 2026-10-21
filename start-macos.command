#!/usr/bin/env bash
# Starts Chrome Firefox Browser Extensions Impact Analyser on macOS. Double-click this file in Finder.
cd "$(dirname "$0")" || exit 1

# Finder starts this with a short PATH, so add the usual Node.js install locations.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Chrome Firefox Browser Extensions Impact Analyser needs Node.js version 22.12 or newer."
  echo "Opening the download page. Install the LTS version, then double-click this file again."
  open "https://nodejs.org/"
  read -r -p "Press Enter to close." _
  exit 1
fi

if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'; then
  echo "Your Node.js is version $(node -v). Chrome Firefox Browser Extensions Impact Analyser needs 22.12 or newer."
  echo "Opening the download page. Install the LTS version, then double-click this file again."
  open "https://nodejs.org/"
  read -r -p "Press Enter to close." _
  exit 1
fi

if [ ! -d node_modules/puppeteer ] || [ ! -d .cache/puppeteer/chrome ]; then
  echo "First run: downloading what Chrome Firefox Browser Extensions Impact Analyser needs (about 200 MB). This happens only once."
  if ! npm install --no-audit --no-fund; then
    echo "The download failed. Check your internet connection and double-click this file again."
    read -r -p "Press Enter to close." _
    exit 1
  fi
fi

node src/server.js "$@"
