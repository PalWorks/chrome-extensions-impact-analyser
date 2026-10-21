// Runs the measurements. For every test setup ("no extensions", "one extension on its own",
// "all chosen extensions together") it starts a separate, clean copy of Chrome for Testing,
// loads each test site several times and records how much work the page and browser did.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

export const DEFAULT_SETTINGS = {
  rounds: 5, // How many times each site is loaded for each setup.
  warmupSeconds: 10, // Time given to freshly installed extensions to finish first-run work.
  settleSeconds: 3, // Quiet time after each browser start, before measuring.
  observeSeconds: 3, // How long to keep watching a page after it has loaded.
  pageTimeoutSeconds: 45,
  headless: true, // Run without visible windows, so nothing takes over the screen.
  includeCombined: true, // Also measure all chosen extensions switched on together.
};

export const LIMITS = {
  rounds: [1, 20],
  warmupSeconds: [0, 120],
  settleSeconds: [0, 60],
  observeSeconds: [1, 30],
  pageTimeoutSeconds: [10, 180],
};

const VIEWPORT = {width: 1366, height: 768};

// Injected into every test page before it starts, to record paint timing and long tasks.
const COLLECTOR = `(() => {
  if (window !== window.top || window.__extensionImpact) return;
  const s = window.__extensionImpact = {lcp: 0, longTasks: []};
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) s.lcp = e.startTime;
    }).observe({type: 'largest-contentful-paint', buffered: true});
  } catch {}
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) s.longTasks.push([e.startTime, e.duration]);
    }).observe({type: 'longtask', buffered: true});
  } catch {}
})();`;

export class CancelledError extends Error {
  constructor() {
    super('The test was cancelled.');
    this.name = 'CancelledError';
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new CancelledError());
    }, {once: true});
  });

function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallback), ms))]);
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Clamps user-supplied settings to safe ranges and fills in defaults.
export function normalizeSettings(input = {}) {
  const out = {...DEFAULT_SETTINGS};
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const n = Number(input[key]);
    if (input[key] !== undefined && input[key] !== '' && Number.isFinite(n)) {
      out[key] = Math.min(max, Math.max(min, Math.round(n)));
    }
  }
  if (input.headless !== undefined) out.headless = Boolean(input.headless);
  if (input.includeCombined !== undefined) out.includeCombined = Boolean(input.includeCombined);
  return out;
}

// Accepts "example.com", "www.example.com/page" or a full URL, and returns a full https URL.
export function normalizeUrl(input) {
  let text = String(input || '').trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.href;
  } catch {
    return null;
  }
}

// Rough duration estimate in seconds, used for the "about N minutes" hint before starting.
export function estimateSeconds(extensionCount, urlCount, settings) {
  const s = normalizeSettings(settings);
  const scenarios = 1 + extensionCount + (s.includeCombined && extensionCount > 1 ? 1 : 0);
  const perLoad = 4 + s.observeSeconds;
  const perLaunch = 2 + s.settleSeconds;
  const warmup = urlCount * 5 + scenarios * (perLaunch + s.warmupSeconds + perLoad);
  const rounds = s.rounds * scenarios * (perLaunch + urlCount * perLoad);
  return Math.round(warmup + rounds + extensionCount * s.rounds * 0.5);
}

// Copies an extension into the working folder, leaving out the store's signature folder,
// because Chrome refuses to load a folder whose top-level names start with "_" (except _locales).
function copyExtension(src, dest) {
  fs.cpSync(src, dest, {
    recursive: true,
    dereference: true,
    filter: file => {
      const rel = path.relative(src, file);
      if (!rel || rel.includes(path.sep)) return true;
      return !(rel.startsWith('_') && rel !== '_locales');
    },
  });
}

export async function runBenchmark(request, {onProgress = () => {}, signal} = {}) {
  const settings = normalizeSettings(request.settings);
  const urls = [...new Set((request.urls || []).map(normalizeUrl).filter(Boolean))];
  if (urls.length === 0) throw new Error('Add at least one website to test.');
  const extInput = (request.extensions || []).filter(e => e && e.path);
  if (extInput.length === 0) throw new Error('Choose at least one extension to test.');

  const emit = (type, data) => onProgress({type, ...data});
  const log = (message, level = 'info') => emit('log', {level, message});
  const check = () => {
    if (signal?.aborted) throw new CancelledError();
  };

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-impact-'));
  const startedAt = new Date();
  let noSandbox = false;
  let userAgent = '';
  let chromeVersion = '';

  async function launch(profileDir) {
    const args = [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--no-first-run', '--no-default-browser-check'];
    if (userAgent) args.push(`--user-agent=${userAgent}`);
    if (noSandbox) args.push('--no-sandbox');
    const options = {
      headless: settings.headless,
      pipe: true,
      enableExtensions: true,
      userDataDir: profileDir,
      defaultViewport: VIEWPORT,
      args,
      protocolTimeout: 120_000,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    };
    try {
      return await puppeteer.launch(options);
    } catch (err) {
      // Some Linux systems block Chrome's sandbox. Retry once without it and say so.
      if (process.platform === 'linux' && !noSandbox && /sandbox/i.test(err.message)) {
        noSandbox = true;
        log('This Linux system blocks the Chrome sandbox, so the test browser runs without it.', 'warn');
        return launch(profileDir);
      }
      throw err;
    }
  }

  async function installAll(browser, exts) {
    const errors = [];
    const ids = [];
    for (const ext of exts) {
      try {
        ids.push(await browser.installExtension(ext.workPath));
      } catch (err) {
        errors.push({key: ext.key, message: err.message.replace(/^Protocol error \([^)]*\):\s*/, '')});
      }
    }
    return {ids, errors};
  }

  async function browserCpuMs(session) {
    try {
      const {processInfo} = await session.send('SystemInfo.getProcessInfo');
      return processInfo.reduce((sum, p) => sum + p.cpuTime, 0) * 1000;
    } catch {
      return null;
    }
  }

  // Sums the JavaScript memory used by the extensions' own background pages and workers.
  async function extensionHeapMB(browser, ids) {
    if (ids.length === 0) return 0;
    let total = 0;
    for (const target of browser.targets()) {
      const type = target.type();
      if (type !== 'service_worker' && type !== 'background_page') continue;
      if (!ids.some(id => target.url().startsWith(`chrome-extension://${id}/`))) continue;
      const usage = await withTimeout((async () => {
        const session = await target.createCDPSession();
        try {
          return await session.send('Runtime.getHeapUsage');
        } finally {
          await session.detach().catch(() => {});
        }
      })().catch(() => null), 3000, null);
      if (usage) total += usage.usedSize;
    }
    return total / 1e6;
  }

  // Opens a fresh tab, closes everything else (such as "welcome" tabs opened by extensions),
  // loads the site and returns what was measured.
  async function measure(browser, browserSession, url) {
    const page = await browser.newPage();
    for (const other of await browser.pages()) {
      if (other !== page) await other.close().catch(() => {});
    }
    const sample = {ok: false};
    try {
      const cdp = await page.createCDPSession();
      await cdp.send('Performance.enable');
      await cdp.send('Network.enable');
      await cdp.send('Network.clearBrowserCache');
      await cdp.send('Network.clearBrowserCookies');
      let bytes = 0;
      let requests = 0;
      cdp.on('Network.loadingFinished', e => {
        bytes += e.encodedDataLength || 0;
        requests++;
      });
      cdp.on('Network.loadingFailed', () => requests++);
      await page.evaluateOnNewDocument(COLLECTOR);

      const cpuBefore = await browserCpuMs(browserSession);
      const response = await page.goto(url, {waitUntil: 'load', timeout: settings.pageTimeoutSeconds * 1000});
      sample.status = response ? response.status() : null;
      await sleep(settings.observeSeconds * 1000, signal);
      const cpuAfter = await browserCpuMs(browserSession);

      const {metrics} = await cdp.send('Performance.getMetrics');
      const m = Object.fromEntries(metrics.map(x => [x.name, x.value]));
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
        const s = window.__extensionImpact || {lcp: 0, longTasks: []};
        let tbt = 0;
        // Like Total Blocking Time, but counted from the start of the visit, because work done by
        // extensions before the first paint also freezes the page.
        for (const [, duration] of s.longTasks) tbt += Math.max(0, duration - 50);
        return {
          domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
          load: nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : null,
          fcp,
          lcp: s.lcp || null,
          tbt,
        };
      });

      Object.assign(sample, timing, {
        ok: true,
        mainThreadMs: (m.TaskDuration || 0) * 1000,
        scriptMs: (m.ScriptDuration || 0) * 1000,
        pageHeapMB: (m.JSHeapUsedSize || 0) / 1e6,
        requests,
        transferKB: bytes / 1024,
        browserCpuMs: cpuBefore != null && cpuAfter != null ? cpuAfter - cpuBefore : null,
      });
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      sample.error = err.message.split('\n')[0];
    } finally {
      // Keep one tab open so a visible browser window does not close itself.
      await page.goto('about:blank').catch(() => {});
    }
    return sample;
  }

  try {
    // 1. Copy each extension into a private working folder.
    emit('phase', {message: 'Preparing extensions'});
    const extensions = extInput.map((e, i) => {
      const key = `x${i + 1}`;
      const workPath = path.join(workDir, 'extensions', key);
      const entry = {key, id: e.id || '', name: e.name || path.basename(e.path), version: e.version || '', sourcePath: e.path, workPath, status: 'ok', error: ''};
      try {
        if (!fs.existsSync(path.join(e.path, 'manifest.json'))) throw new Error('No manifest.json in this folder.');
        copyExtension(e.path, workPath);
      } catch (err) {
        entry.status = 'failed';
        entry.error = `Could not copy the extension: ${err.message}`;
      }
      return entry;
    });

    const buildScenarios = () => {
      const usable = extensions.filter(e => e.status === 'ok');
      const list = [{key: 'baseline', label: 'No extensions', extensionKeys: []}];
      for (const e of usable) list.push({key: e.key, label: e.name, extensionKeys: [e.key]});
      if (settings.includeCombined && usable.length > 1) {
        list.push({key: 'combined', label: `All ${usable.length} together`, extensionKeys: usable.map(e => e.key)});
      }
      return list;
    };
    let scenarios = buildScenarios();
    const extByKey = Object.fromEntries(extensions.map(e => [e.key, e]));
    const profileDir = key => path.join(workDir, 'profiles', key);

    const totalUnits = () => scenarios.length + settings.rounds * scenarios.length * urls.length;
    let doneUnits = 0;
    const timerStart = Date.now();
    const tick = message => {
      doneUnits++;
      const elapsed = (Date.now() - timerStart) / 1000;
      const total = totalUnits();
      const remaining = doneUnits > 0 ? (elapsed / doneUnits) * (total - doneUnits) : null;
      emit('progress', {done: doneUnits, total, etaSeconds: remaining == null ? null : Math.round(remaining), message});
    };
    emit('progress', {done: 0, total: totalUnits(), etaSeconds: estimateSeconds(extensions.length, urls.length, settings), message: 'Starting the test browser'});

    // 2. Start the test browser once with no extensions: learn its version and warm up DNS.
    check();
    emit('phase', {message: 'Checking the test browser and your websites'});
    {
      const browser = await launch(profileDir('probe'));
      try {
        chromeVersion = (await browser.version()).replace(/^HeadlessChrome\//, 'Chrome/');
        userAgent = (await browser.userAgent()).replace('HeadlessChrome', 'Chrome');
        const page = await browser.newPage();
        await page.setUserAgent(userAgent);
        for (const url of urls) {
          check();
          try {
            const res = await page.goto(url, {waitUntil: 'load', timeout: Math.min(20, settings.pageTimeoutSeconds) * 1000});
            if (res && res.status() >= 400) log(`${url} answered with HTTP ${res.status()}. Results for it may not reflect a normal visit.`, 'warn');
          } catch (err) {
            if (err instanceof CancelledError) throw err;
            log(`${url} was slow to open on the first visit (${err.message.split('\n')[0]}). Continuing.`, 'warn');
          }
        }
      } finally {
        await browser.close().catch(() => {});
      }
    }
    log(`Test browser: ${chromeVersion}`);

    // 3. Warm-up: install each setup's extensions once and let them finish first-run work
    //    (downloading block lists, building caches) so the measurements see normal use.
    emit('phase', {message: 'Installing and warming up extensions'});
    const warmUp = async scenario => {
      check();
      const exts = scenario.extensionKeys.map(k => extByKey[k]);
      const browser = await launch(profileDir(scenario.key));
      let errors;
      try {
        ({errors} = await installAll(browser, exts));
        if (errors.length === 0) {
          await sleep(settings.warmupSeconds * 1000, signal);
          const page = await browser.newPage();
          await page.goto(urls[0], {waitUntil: 'load', timeout: settings.pageTimeoutSeconds * 1000}).catch(() => {});
          await sleep(1000, signal);
        }
      } finally {
        await browser.close().catch(() => {});
      }
      tick(`Warmed up: ${scenario.label}`);
      return errors;
    };
    // Each extension on its own first, so one that fails to load can be left out.
    for (const scenario of scenarios.filter(s => s.key !== 'combined')) {
      for (const e of await warmUp(scenario)) {
        const ext = extByKey[e.key];
        ext.status = 'failed';
        ext.error = e.message;
        log(`"${ext.name}" could not be loaded: ${e.message}`, 'warn');
      }
    }
    scenarios = buildScenarios();
    if (scenarios.length < 2) throw new Error('None of the chosen extensions could be loaded by the test browser.');
    const combined = scenarios.find(s => s.key === 'combined');
    if (combined) {
      const errors = await warmUp(combined);
      if (errors.length) {
        log(`The extensions could not all be loaded together, so the "all together" test is skipped: ${errors[0].message}`, 'warn');
        scenarios = scenarios.filter(s => s !== combined);
      }
    }
    doneUnits = scenarios.length;

    // 4. Measurement rounds. Setups run in a fresh random order each round, so slow
    //    changes in network speed or computer load affect every setup alike.
    const samples = [];
    const launches = [];
    for (let round = 1; round <= settings.rounds; round++) {
      emit('phase', {message: `Round ${round} of ${settings.rounds}`});
      for (const scenario of shuffle(scenarios)) {
        check();
        const exts = scenario.extensionKeys.map(k => extByKey[k]);
        let browser;
        try {
          browser = await launch(profileDir(scenario.key));
          const {ids, errors} = await installAll(browser, exts);
          if (errors.length) throw new Error(`Extension failed to load: ${errors[0].message}`);
          await sleep(settings.settleSeconds * 1000, signal);
          const browserSession = await browser.target().createCDPSession();
          for (const url of urls) {
            check();
            const sample = await measure(browser, browserSession, url);
            samples.push({scenario: scenario.key, url, round, ...sample});
            if (!sample.ok) log(`${scenario.label} on ${url}: ${sample.error}`, 'warn');
            tick(`${scenario.label}: ${new URL(url).hostname}`);
          }
          launches.push({scenario: scenario.key, round, extensionHeapMB: await extensionHeapMB(browser, ids)});
        } catch (err) {
          if (err instanceof CancelledError) throw err;
          log(`${scenario.label}, round ${round}: ${err.message.split('\n')[0]}`, 'warn');
          for (const url of urls) {
            if (!samples.some(s => s.scenario === scenario.key && s.url === url && s.round === round)) {
              samples.push({scenario: scenario.key, url, round, ok: false, error: err.message.split('\n')[0]});
              tick(`${scenario.label}: ${new URL(url).hostname}`);
            }
          }
        } finally {
          if (browser) await browser.close().catch(() => {});
        }
      }
    }

    return {
      tool: {name: 'Chrome Extensions Impact Analyser', version: request.toolVersion || ''},
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      environment: {
        chrome: chromeVersion,
        platform: `${os.type()} ${os.release()} (${process.arch})`,
        cpu: os.cpus()[0]?.model?.trim() || '',
        cpuCount: os.cpus().length,
        memoryGB: Math.round(os.totalmem() / 1e9),
        headless: settings.headless,
        sandbox: !noSandbox,
      },
      settings,
      source: request.source || null,
      urls,
      extensions: extensions.map(({workPath, ...e}) => e),
      scenarios,
      samples,
      launches,
    };
  } finally {
    fs.rmSync(workDir, {recursive: true, force: true, maxRetries: 5, retryDelay: 500});
  }
}
