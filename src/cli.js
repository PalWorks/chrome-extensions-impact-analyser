#!/usr/bin/env node
// Command-line version, for people who prefer a terminal or want to script runs.

import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {detectBrowsers, listExtensions, describeExtensionFolder, isFirefoxProfile} from './sources.js';
import {runBenchmark, estimateSeconds, CancelledError, DEFAULT_SETTINGS} from './engine.js';
import {analyze} from './analyze.js';
import {writeReport, resultFolderName} from './report.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const HELP = `Chrome FireFox Browser Extensions Impact Analyser ${pkg.version}: measure how much each browser extension slows down web pages.

Usage:
  node src/cli.js --list
  node src/cli.js --profile <profile folder> --url <site> [--url <site> ...] [options]

Choosing what to test:
  --list                  Show the browser profiles found on this computer, then exit.
  --profile <folder>      Profile folder to read extensions from ("Profile Path" in chrome://version,
                          or "Profile Folder" in about:support for Firefox).
  --extensions <ids>      Comma-separated extension IDs to test. Default: every extension turned on in the profile.
  --extension-dir <dir>   Also test an unpacked extension folder (or a Firefox .xpi). Repeat for more.
  --firefox               Test in Firefox. Automatic when --profile is a Firefox profile.
  --url <site>            Website to load. Repeat for more. "example.com" is fine.

Options:
  --rounds <n>            Loads per site for each setup (default ${DEFAULT_SETTINGS.rounds}).
  --warmup <seconds>      First-run time given to each extension (default ${DEFAULT_SETTINGS.warmupSeconds}).
  --settle <seconds>      Quiet time after each browser start (default ${DEFAULT_SETTINGS.settleSeconds}).
  --observe <seconds>     How long to watch each page after it loads (default ${DEFAULT_SETTINGS.observeSeconds}).
  --timeout <seconds>     Give up on a page after this long (default ${DEFAULT_SETTINGS.pageTimeoutSeconds}).
  --show-browser          Show the test browser windows instead of running hidden.
  --no-combined           Skip the "all extensions together" setup.
  --out <folder>          Where to save the report (default: results/<date-time>).
  --help                  Show this help.
`;

let opts;
try {
  ({values: opts} = parseArgs({
    options: {
      list: {type: 'boolean'},
      profile: {type: 'string'},
      extensions: {type: 'string'},
      'extension-dir': {type: 'string', multiple: true},
      firefox: {type: 'boolean'},
      url: {type: 'string', multiple: true},
      rounds: {type: 'string'},
      warmup: {type: 'string'},
      settle: {type: 'string'},
      observe: {type: 'string'},
      timeout: {type: 'string'},
      'show-browser': {type: 'boolean'},
      'no-combined': {type: 'boolean'},
      out: {type: 'string'},
      help: {type: 'boolean', short: 'h'},
    },
  }));
} catch (err) {
  console.error(`${err.message}\n\n${HELP}`);
  process.exit(2);
}

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

if (opts.list) {
  const browsers = detectBrowsers();
  if (browsers.length === 0) console.log('No browser profiles found. Pass --profile with the folder shown as "Profile Path" in chrome://version (or "Profile Folder" in about:support for Firefox).');
  for (const b of browsers) {
    console.log(`\n${b.name}${b.engine === 'firefox' ? ' (tested in Firefox)' : ''}`);
    for (const p of b.profiles) console.log(`  ${p.name}${p.account ? ` (${p.account})` : ''}\n    ${p.path}`);
  }
  process.exit(0);
}

const fail = message => {
  console.error(`${message}\nRun with --help for usage.`);
  process.exit(2);
};

let extensions = [];
let source = null;
let engine = opts.firefox ? 'firefox' : 'chrome';
if (opts.profile) {
  const profilePath = path.resolve(opts.profile);
  if (!fs.existsSync(profilePath)) fail(`Profile folder not found: ${profilePath}`);
  if (isFirefoxProfile(profilePath)) engine = 'firefox';
  const all = listExtensions(profilePath);
  const wanted = opts.extensions ? opts.extensions.split(',').map(s => s.trim()).filter(Boolean) : null;
  if (wanted) {
    for (const id of wanted) if (!all.some(e => e.id === id)) fail(`Extension ${id} is not in that profile.`);
    extensions = all.filter(e => wanted.includes(e.id));
  } else {
    extensions = all.filter(e => e.enabled);
  }
  for (const e of extensions.filter(e => !e.canTest)) console.log(`Skipping "${e.name}": ${e.note}`);
  extensions = extensions.filter(e => e.canTest);
  source = {browser: engine === 'firefox' ? 'Firefox' : '', profileName: path.basename(profilePath), profilePath};
}
for (const dir of opts['extension-dir'] || []) {
  if (/\.xpi$/i.test(dir)) engine = 'firefox';
  const info = describeExtensionFolder(path.resolve(dir), {engine});
  if (!info) fail(`No extension (manifest.json) found in ${dir}`);
  if (!info.canTest) fail(`"${info.name}" cannot be tested: ${info.note}`);
  extensions.push(info);
}
if (extensions.length === 0) fail('Nothing to test. Pass --profile and/or --extension-dir.');
if (extensions.some(e => e.engine && e.engine !== engine)) fail('Chrome extensions and Firefox add-ons cannot be tested in the same run.');
if (!opts.url?.length) fail('Pass at least one --url.');

const settings = {
  rounds: opts.rounds,
  warmupSeconds: opts.warmup,
  settleSeconds: opts.settle,
  observeSeconds: opts.observe,
  pageTimeoutSeconds: opts.timeout,
  headless: !opts['show-browser'],
  includeCombined: !opts['no-combined'],
};
for (const k of Object.keys(settings)) if (settings[k] === undefined) delete settings[k];

const minutes = Math.round(estimateSeconds(extensions.length, opts.url.length, settings) / 60);
console.log(`Testing ${extensions.length} extension(s) on ${opts.url.length} site(s). This takes about ${minutes} minute(s).`);
for (const e of extensions) console.log(`  ${e.name} ${e.version}`);

const controller = new AbortController();
process.on('SIGINT', () => {
  console.log('\nStopping…');
  controller.abort();
});

let lastLine = 0;
try {
  const data = await runBenchmark(
    {urls: opts.url, extensions, engine, settings, source, toolVersion: pkg.version},
    {
      signal: controller.signal,
      onProgress: e => {
        if (e.type === 'phase') console.log(`\n${e.message}`);
        if (e.type === 'log') console.log(`  ${e.level === 'warn' ? 'warning: ' : ''}${e.message}`);
        if (e.type === 'progress' && Date.now() - lastLine > 5000) {
          lastLine = Date.now();
          const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
          console.log(`  ${pct}%${e.etaSeconds > 30 ? `, about ${Math.max(1, Math.round(e.etaSeconds / 60))} min left` : ''}`);
        }
      },
    },
  );
  data.analysis = analyze(data);
  const out = path.resolve(opts.out || path.join(root, 'results', resultFolderName(new Date(data.startedAt))));
  const report = writeReport(data, out);

  console.log(`\n${data.analysis.headline}\n`);
  for (const r of [...data.analysis.individual, ...(data.analysis.combined ? [data.analysis.combined] : [])]) {
    console.log(`  ${r.verdictLabel.padEnd(19)} ${r.label}\n  ${''.padEnd(19)} ${r.summary}`);
  }
  for (const w of data.analysis.warnings) console.log(`  warning: ${w}`);
  console.log(`\nFull report: ${report}`);
} catch (err) {
  if (err instanceof CancelledError) {
    console.log('Cancelled. Nothing was saved.');
    process.exit(130);
  }
  console.error(`\nThe test could not finish: ${err.message}`);
  process.exit(1);
}
