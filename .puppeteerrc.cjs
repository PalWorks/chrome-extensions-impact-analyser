const {join} = require('path');

// Keep the test browser inside this folder, so deleting the folder removes everything.
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
  // The headless shell cannot run extensions, so there is no point downloading it.
  'chrome-headless-shell': {skipDownload: true},
};
