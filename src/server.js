#!/usr/bin/env node
// Small local web server for the point-and-click interface. It only listens on this computer
// (127.0.0.1) and every API call needs a secret token that only the served page knows.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer';
import {detectBrowsers, listExtensions, describeExtensionFolder, resolveCustomFolder, isExtensionSource} from './sources.js';
import {runBenchmark, normalizeSettings, normalizeUrl, estimateSeconds, CancelledError, DEFAULT_SETTINGS, LIMITS} from './engine.js';
import {analyze} from './analyze.js';
import {writeReport, resultFolderName} from './report.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = path.join(root, 'ui');
const resultsDir = path.join(root, 'results');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const token = crypto.randomBytes(24).toString('hex');
const args = process.argv.slice(2);
const noOpen = args.includes('--no-open') || process.env.EXTENSION_IMPACT_NO_OPEN === '1';
const portArg = Number(args.find(a => a.startsWith('--port='))?.split('=')[1]);

const DEFAULT_URLS = ['https://en.wikipedia.org/wiki/Web_browser', 'https://www.bbc.com/news', 'https://github.com/trending'];

// Opens a web address or folder with the computer's default app.
export function openExternal(target) {
  let cmd;
  let cmdArgs;
  if (process.platform === 'win32') {
    const isUrl = /^https?:\/\//.test(target);
    cmd = isUrl ? 'rundll32' : 'explorer.exe';
    cmdArgs = isUrl ? ['url.dll,FileProtocolHandler', target] : [target];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    cmdArgs = [target];
  } else {
    cmd = 'xdg-open';
    cmdArgs = [target];
  }
  try {
    const child = spawn(cmd, cmdArgs, {detached: true, stdio: 'ignore'});
    child.on('error', () => {});
    child.unref();
  } catch {
    // Nothing else to do; the address is also printed in the terminal.
  }
}

async function browserStatus() {
  try {
    const exe = await puppeteer.executablePath();
    if (exe && fs.existsSync(exe)) return {ready: true, path: exe};
  } catch {
    // Fall through to "not ready".
  }
  return {ready: false, message: 'The test browser has not been downloaded yet. Close this window and run the start file again while connected to the internet.'};
}

// ---- Run state, shared with every open page through server-sent events ----

const state = {
  running: false,
  phase: '',
  progress: null,
  logs: [],
  lastRun: null,
  error: null,
};
let controller = null;
const clients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

function listReports() {
  if (!fs.existsSync(resultsDir)) return [];
  const out = [];
  for (const id of fs.readdirSync(resultsDir)) {
    const file = path.join(resultsDir, id, 'results.json');
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      out.push({
        id,
        startedAt: data.startedAt,
        headline: data.analysis?.headline || '',
        extensions: data.extensions?.length || 0,
        sites: data.urls?.length || 0,
        profile: data.source?.profileName || '',
      });
    } catch {
      // Skip unreadable result folders.
    }
  }
  return out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

function summaryFor(id, data) {
  const pick = r => r && {key: r.key, label: r.label, verdict: r.verdict, verdictLabel: r.verdictLabel, summary: r.summary, headline: r.headline, failedLoads: r.failedLoads};
  return {
    id,
    reportUrl: `/reports/${id}/report.html`,
    headline: data.analysis.headline,
    individual: data.analysis.individual.map(pick),
    combined: pick(data.analysis.combined),
    warnings: data.analysis.warnings,
    sites: data.urls.length,
    rounds: data.settings.rounds,
    engine: data.engine || 'chrome',
  };
}

async function startRun(body) {
  const urls = (body.urls || []).map(normalizeUrl).filter(Boolean);
  const extensions = (body.extensions || [])
    .filter(e => e && typeof e.path === 'string' && isExtensionSource(e.path))
    .map(e => ({id: String(e.id || ''), name: String(e.name || ''), version: String(e.version || ''), path: e.path}));
  if (extensions.length === 0) throw Object.assign(new Error('Choose at least one extension to test.'), {status: 400});
  if (urls.length === 0) throw Object.assign(new Error('Add at least one website to test.'), {status: 400});

  const id = resultFolderName();
  controller = new AbortController();
  Object.assign(state, {running: true, phase: 'Starting', progress: null, logs: [], error: null});
  broadcast('state', state);

  const onProgress = event => {
    if (event.type === 'phase') state.phase = event.message;
    if (event.type === 'progress') state.progress = event;
    if (event.type === 'log') {
      state.logs.push({level: event.level, message: event.message, at: Date.now()});
      if (state.logs.length > 300) state.logs.shift();
    }
    broadcast(event.type, event);
  };

  (async () => {
    try {
      const data = await runBenchmark(
        {urls, extensions, engine: body.engine === 'firefox' ? 'firefox' : 'chrome', settings: body.settings, source: body.source || null, toolVersion: pkg.version},
        {onProgress, signal: controller.signal},
      );
      data.analysis = analyze(data);
      writeReport(data, path.join(resultsDir, id));
      state.lastRun = summaryFor(id, data);
      broadcast('done', state.lastRun);
    } catch (err) {
      const cancelled = err instanceof CancelledError;
      state.error = cancelled ? null : err.message;
      broadcast(cancelled ? 'cancelled' : 'failed', {message: cancelled ? 'The test was cancelled. Nothing was saved.' : err.message});
      if (!cancelled) console.error(err);
    } finally {
      state.running = false;
      controller = null;
      broadcast('state', state);
    }
  })();
  return {id};
}

// ---- HTTP plumbing ----

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8'};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 1_000_000) {
        reject(Object.assign(new Error('Request too large.'), {status: 413}));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Invalid request.'), {status: 400}));
      }
    });
    req.on('error', reject);
  });
}

let port;

async function handle(req, res) {
  // Refuse requests addressed to any other host name, which blocks DNS-rebinding attacks.
  const host = req.headers.host || '';
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, {error: 'Forbidden'});

  const url = new URL(req.url, `http://${host}`);
  const p = url.pathname;

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    const html = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8').replace('__TOKEN__', token);
    return send(res, 200, html, MIME['.html']);
  }
  if (req.method === 'GET' && /^\/(app\.js|styles\.css|icon\.svg|favicon\.ico)$/.test(p)) {
    const file = path.join(uiDir, p === '/favicon.ico' ? 'icon.svg' : p.slice(1));
    return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)]);
  }
  const report = p.match(/^\/reports\/([\w-]+)\/(report\.html|results\.csv|results\.json)$/);
  if (req.method === 'GET' && report) {
    const file = path.join(resultsDir, report[1], report[2]);
    if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
    return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)]);
  }

  if (!p.startsWith('/api/')) return send(res, 404, 'Not found', 'text/plain');
  const given = req.headers['x-token'] || url.searchParams.get('token');
  if (given !== token) return send(res, 403, {error: 'This page is out of date. Reload it.'});

  if (req.method === 'GET' && p === '/api/events') {
    res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive'});
    res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }

  if (req.method === 'GET' && p === '/api/init') {
    return send(res, 200, {
      version: pkg.version,
      platform: process.platform,
      browser: await browserStatus(),
      browsers: detectBrowsers(),
      defaults: {urls: DEFAULT_URLS, settings: DEFAULT_SETTINGS, limits: LIMITS},
      state,
      reports: listReports(),
    });
  }

  if (req.method !== 'POST') return send(res, 405, {error: 'Method not allowed'});
  const body = await readBody(req);

  switch (p) {
    case '/api/extensions': {
      const profilePath = String(body.profilePath || '');
      if (!fs.existsSync(profilePath)) return send(res, 404, {error: 'That profile folder no longer exists.'});
      return send(res, 200, {extensions: listExtensions(profilePath)});
    }
    case '/api/custom-profile':
      return send(res, 200, resolveCustomFolder(body.path));
    case '/api/extension-folder': {
      const dir = path.resolve(String(body.path || '').trim());
      const engine = body.engine === 'firefox' ? 'firefox' : 'chrome';
      if (engine === 'chrome' && /\.xpi$/i.test(dir)) return send(res, 200, {error: 'That is a Firefox add-on. Choose a Firefox profile in step 1 to test it.'});
      const info = isExtensionSource(dir) ? describeExtensionFolder(dir, {id: '', engine}) : null;
      if (!info) return send(res, 200, {error: engine === 'firefox' ? 'No add-on was found there. Pick the folder that contains manifest.json, or an .xpi file.' : 'No extension was found there. Pick the folder that contains manifest.json.'});
      return send(res, 200, {extension: info});
    }
    case '/api/estimate':
      return send(res, 200, {seconds: estimateSeconds(Number(body.extensions) || 1, Number(body.urls) || 1, normalizeSettings(body.settings))});
    case '/api/run':
      if (state.running) return send(res, 409, {error: 'A test is already running.'});
      return send(res, 200, await startRun(body));
    case '/api/cancel':
      controller?.abort();
      return send(res, 200, {ok: true});
    case '/api/open-folder': {
      const id = String(body.id || '');
      const dir = /^[\w-]+$/.test(id) ? path.join(resultsDir, id) : resultsDir;
      fs.mkdirSync(dir, {recursive: true});
      openExternal(dir);
      return send(res, 200, {ok: true});
    }
    case '/api/quit':
      send(res, 200, {ok: true});
      controller?.abort();
      setTimeout(() => process.exit(0), state.running ? 3000 : 200);
      return;
    default:
      return send(res, 404, {error: 'Not found'});
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    if (!res.headersSent) send(res, err.status || 500, {error: err.message});
  });
});

function listen(wanted) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(wanted, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

try {
  port = await listen(Number.isInteger(portArg) && portArg > 0 ? portArg : 4777);
} catch (err) {
  if (err.code !== 'EADDRINUSE') throw err;
  port = await listen(0);
}

const address = `http://127.0.0.1:${port}/`;
console.log(`\nChrome Extensions Impact Analyser ${pkg.version} is running.`);
console.log(`Open this address in your browser if it did not open by itself:\n\n  ${address}\n`);
console.log('Keep this window open while you use it. Close it, or press Ctrl+C, to stop.\n');
if (!noOpen) openExternal(address);

const stop = () => {
  controller?.abort();
  setTimeout(() => process.exit(0), controller ? 3000 : 0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
