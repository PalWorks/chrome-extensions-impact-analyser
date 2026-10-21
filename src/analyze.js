// Turns raw measurements into per-extension results and plain-language verdicts.
//
// Method: for every setup and website, take the median of the repeated loads. An extension's
// impact is its median minus the "no extensions" median. A difference only counts when it is
// bigger than the normal run-to-run variation seen with no extensions (a robust standard
// deviation of those loads), so random noise is not reported as a slowdown.

export const METRICS = {
  mainThreadMs: {label: 'Extra work on the page', unit: 'ms', minChange: 15},
  load: {label: 'Page finished loading', unit: 'ms', minChange: 50},
  lcp: {label: 'Main content appeared', unit: 'ms', minChange: 50},
  tbt: {label: 'Page frozen (blocking time)', unit: 'ms', minChange: 20},
  fcp: {label: 'First content appeared', unit: 'ms', minChange: 50},
  pageHeapMB: {label: 'Page memory', unit: 'MB', minChange: 0.5},
  requests: {label: 'Network requests', unit: '', minChange: 2},
  transferKB: {label: 'Data downloaded', unit: 'KB', minChange: 20},
  browserCpuMs: {label: 'Whole-browser CPU (noisy)', unit: 'ms', minChange: 50},
};

// Verdict thresholds. CPU is the extra main-thread work per page load; slowdown is the larger
// of the delays to "finished loading" and "main content appeared".
export const THRESHOLDS = {
  heavy: {cpu: 200, slowdown: 1000},
  moderate: {cpu: 75, slowdown: 300},
  light: {cpu: 25, slowdown: 100},
  faster: {speedup: 300},
};

export const VERDICTS = {
  heavy: {label: 'Heavy impact', rank: 4},
  moderate: {label: 'Noticeable impact', rank: 3},
  light: {label: 'Small impact', rank: 2},
  none: {label: 'No clear impact', rank: 1},
  faster: {label: 'Makes pages faster', rank: 0},
  unknown: {label: 'Not enough data', rank: -1},
};

export function median(values) {
  const v = values.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Robust standard deviation: 1.4826 x median absolute deviation.
function robustSpread(values) {
  const m = median(values);
  if (m == null) return null;
  return 1.4826 * median(values.filter(x => typeof x === 'number').map(x => Math.abs(x - m)));
}

const mean = values => {
  const v = values.filter(x => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function formatMs(ms) {
  const abs = Math.abs(ms);
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)} s` : `${Math.round(abs)} ms`;
}

function describe(result) {
  if (result.verdict === 'unknown') return 'Could not be measured. See the warnings below.';
  const parts = [];
  const {mainThreadMs, load, lcp, memoryMB} = result.headline;
  // Only mention changes big enough to matter; smaller ones are covered by the verdict.
  if (mainThreadMs.significant && mainThreadMs.value >= THRESHOLDS.light.cpu) parts.push(`adds about ${formatMs(mainThreadMs.value)} of work to every page`);
  if (mainThreadMs.significant && mainThreadMs.value <= -THRESHOLDS.light.cpu) parts.push(`saves about ${formatMs(mainThreadMs.value)} of work per page`);
  for (const [entry, what] of [[load, 'makes pages finish loading'], [lcp, 'makes the main content appear']]) {
    if (entry.significant && Math.abs(entry.value) >= THRESHOLDS.light.slowdown) {
      parts.push(`${what} ${formatMs(entry.value)} ${entry.value > 0 ? 'later' : 'sooner'}`);
    }
  }
  if (memoryMB.value >= 5) parts.push(`uses about ${Math.round(memoryMB.value)} MB of memory`);
  if (parts.length === 0) return 'No difference beyond normal run-to-run variation.';
  const text = parts.join(', ').replace(/, ([^,]*)$/, ' and $1');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

export function analyze(data) {
  const {samples, scenarios, urls, launches = []} = data;
  const okSamples = (scenario, url) => samples.filter(s => s.scenario === scenario && s.url === url && s.ok);
  const warnings = [];

  // Sites that never loaded without extensions cannot be compared, so they are left out.
  const usableUrls = urls.filter(url => {
    const ok = okSamples('baseline', url).length > 0;
    if (!ok) warnings.push(`${url} never loaded in the test browser, so it was left out of the results.`);
    return ok;
  });
  for (const url of usableUrls) {
    const statuses = samples.filter(s => s.url === url && s.ok && s.status >= 400);
    if (statuses.length) warnings.push(`${url} answered with an error page (HTTP ${statuses[0].status}) at least once. It may be blocking automated visits.`);
  }

  // Per website: medians and normal variation for "no extensions".
  const baseline = {};
  for (const url of usableUrls) {
    const s = okSamples('baseline', url);
    baseline[url] = {};
    for (const metric of Object.keys(METRICS)) {
      const values = s.map(x => x[metric]);
      baseline[url][metric] = {median: median(values), spread: robustSpread(values) ?? 0};
    }
  }

  const heapByScenario = key => median(launches.filter(l => l.scenario === key).map(l => l.extensionHeapMB)) ?? 0;

  const results = scenarios.filter(s => s.key !== 'baseline').map(scenario => {
    const perUrl = usableUrls.map(url => {
      const s = okSamples(scenario.key, url);
      const failed = samples.filter(x => x.scenario === scenario.key && x.url === url && !x.ok).length;
      const metrics = {};
      for (const metric of Object.keys(METRICS)) {
        const m = median(s.map(x => x[metric]));
        const base = baseline[url][metric];
        metrics[metric] = {
          median: m,
          baseline: base.median,
          delta: m != null && base.median != null ? m - base.median : null,
          // Normal variation: the larger of the spread with and without the extension, and
          // never less than 5% of the typical value, so a few lucky identical runs cannot make
          // a tiny difference look real.
          noise: Math.max(base.spread, robustSpread(s.map(x => x[metric])) ?? 0, Math.abs(base.median ?? 0) * 0.05),
        };
      }
      return {url, runs: s.length, failed, metrics};
    });

    const overall = {};
    for (const [metric, def] of Object.entries(METRICS)) {
      const valid = perUrl.filter(u => u.metrics[metric].delta != null);
      const delta = mean(valid.map(u => u.metrics[metric].delta));
      const noise = mean(valid.map(u => u.metrics[metric].noise)) ?? 0;
      overall[metric] = {
        delta,
        noise,
        significant: delta != null && Math.abs(delta) > Math.max(def.minChange, noise),
      };
    }

    const sig = metric => (overall[metric].significant ? overall[metric].delta : 0);
    const cpu = sig('mainThreadMs');
    const slowLoad = sig('load');
    const slowLcp = sig('lcp');
    const extensionHeap = heapByScenario(scenario.key);
    const memoryMB = Math.max(0, extensionHeap + Math.max(0, overall.pageHeapMB.delta ?? 0));

    let verdict;
    const hasData = perUrl.some(u => u.runs > 0);
    const slowdown = Math.max(slowLoad, slowLcp);
    if (!hasData) verdict = 'unknown';
    // Faster overall: less work and a much earlier finish, even if the main content shifts a little.
    else if (slowLoad <= -THRESHOLDS.faster.speedup && cpu <= 0 && slowLcp < THRESHOLDS.moderate.slowdown) verdict = 'faster';
    else if (cpu >= THRESHOLDS.heavy.cpu || slowdown >= THRESHOLDS.heavy.slowdown) verdict = 'heavy';
    else if (cpu >= THRESHOLDS.moderate.cpu || slowdown >= THRESHOLDS.moderate.slowdown) verdict = 'moderate';
    else if (cpu >= THRESHOLDS.light.cpu || slowdown >= THRESHOLDS.light.slowdown) verdict = 'light';
    else verdict = 'none';

    const result = {
      key: scenario.key,
      label: scenario.label,
      combined: scenario.key === 'combined',
      extensionKeys: scenario.extensionKeys,
      verdict,
      verdictLabel: VERDICTS[verdict].label,
      headline: {
        mainThreadMs: {value: overall.mainThreadMs.delta ?? 0, significant: overall.mainThreadMs.significant},
        load: {value: overall.load.delta ?? 0, significant: overall.load.significant},
        lcp: {value: overall.lcp.delta ?? 0, significant: overall.lcp.significant},
        blockingMs: {value: overall.tbt.delta ?? 0, significant: overall.tbt.significant},
        memoryMB: {value: memoryMB, extensionHeapMB: extensionHeap},
      },
      overall,
      perUrl,
      failedLoads: perUrl.reduce((a, u) => a + u.failed, 0),
    };
    result.summary = describe(result);
    return result;
  });

  const individual = results
    .filter(r => !r.combined)
    .sort((a, b) => VERDICTS[b.verdict].rank - VERDICTS[a.verdict].rank || b.headline.mainThreadMs.value - a.headline.mainThreadMs.value);
  const combined = results.find(r => r.combined) || null;

  for (const ext of data.extensions.filter(e => e.status !== 'ok')) {
    warnings.push(`"${ext.name}" could not be tested: ${ext.error}`);
  }

  // One-paragraph answer for the top of the results.
  const heavy = individual.filter(r => r.verdict === 'heavy' || r.verdict === 'moderate');
  let headline;
  if (individual.length === 0) {
    headline = 'No extension could be measured.';
  } else if (heavy.length === 0) {
    headline = 'None of the tested extensions noticeably slows down these websites.';
  } else {
    const names = heavy.slice(0, 3).map(r => r.label);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    headline = `${heavy.length === 1 ? 'One extension' : `${heavy.length} extensions`} noticeably slow${heavy.length === 1 ? 's' : ''} down these websites: ${list}.`;
  }
  if (combined) headline += ` With all of them switched on together: ${combined.summary.charAt(0).toLowerCase()}${combined.summary.slice(1)}`;

  const extraLoads = samples.filter(s => !s.ok).length;
  if (extraLoads) warnings.push(`${extraLoads} of ${samples.length} page loads failed and were left out.`);

  return {headline, individual, combined, warnings, urls: usableUrls, baseline};
}
