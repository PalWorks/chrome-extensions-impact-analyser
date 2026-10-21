// Writes the results as a self-contained HTML report, a CSV of every page load and a JSON file.

import fs from 'node:fs';
import path from 'node:path';
import {METRICS, THRESHOLDS} from './analyze.js';

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

function signed(value, unit, digits = 0) {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  const n = Number(value.toFixed(digits));
  if (n === 0) return `0${unit ? ' ' + unit : ''}`;
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits})}${unit ? ' ' + unit : ''}`;
}

function time(ms) {
  if (ms == null || !Number.isFinite(ms)) return 'n/a';
  return Math.abs(ms) >= 1000 ? signed(ms / 1000, 's', 1) : signed(ms, 'ms');
}

function cell(entry, formatter) {
  const text = formatter(entry.value);
  return entry.significant === false ? `<span class="muted" title="Within normal variation">${text}</span>` : text;
}

function badge(result) {
  return `<span class="badge v-${esc(result.verdict)}">${esc(result.verdictLabel)}</span>`;
}

function row(result) {
  const h = result.headline;
  return `<tr>
    <th scope="row">${esc(result.label)}</th>
    <td>${badge(result)}</td>
    <td class="num">${cell(h.mainThreadMs, time)}</td>
    <td class="num">${cell(h.load, time)}</td>
    <td class="num">${cell(h.lcp, time)}</td>
    <td class="num">${cell(h.blockingMs, time)}</td>
    <td class="num">${h.memoryMB.value >= 0.5 ? `${Math.round(h.memoryMB.value)} MB` : 'n/a'}</td>
    <td>${esc(result.summary)}</td>
  </tr>`;
}

function detail(result) {
  const keys = ['mainThreadMs', 'load', 'lcp', 'tbt', 'fcp', 'pageHeapMB', 'requests', 'transferKB', 'browserCpuMs'];
  const head = keys.map(k => `<th scope="col">${esc(METRICS[k].label)}</th>`).join('');
  const rows = result.perUrl
    .map(u => {
      const cells = keys
        .map(k => {
          const m = u.metrics[k];
          const unit = METRICS[k].unit;
          const digits = unit === 'MB' ? 1 : 0;
          return `<td class="num">${signed(m.delta, unit, digits)}<div class="sub">${m.median == null ? '' : `${Number(m.median.toFixed(digits)).toLocaleString('en-US')} vs ${Number((m.baseline ?? 0).toFixed(digits)).toLocaleString('en-US')}`}</div></td>`;
        })
        .join('');
      return `<tr><th scope="row" class="url">${esc(u.url)}<div class="sub">${u.runs} good loads${u.failed ? `, ${u.failed} failed` : ''}</div></th>${cells}</tr>`;
    })
    .join('');
  return `<details><summary>${esc(result.label)}: ${esc(result.verdictLabel)}</summary>
    <div class="scroll"><table class="detail"><thead><tr><th scope="col">Website</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="sub">Each cell shows the change versus no extensions, then the median with the extension vs the median without.</p>
  </details>`;
}

export function renderHtml(data) {
  const a = data.analysis;
  const env = data.environment;
  const s = data.settings;
  const when = new Date(data.startedAt);
  const sourceText = data.source?.profileName ? `${data.source.browser || 'Browser'} profile "${data.source.profileName}"` : 'Chosen extension folders';
  const loads = data.samples.length;
  const firefox = data.engine === 'firefox';
  const testBrowser = env.browser || env.chrome || '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chrome FireFox Browser Extensions Impact Analyser report, ${esc(when.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}))}</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--text:#1d1d1b;--muted:#64645f;--line:#e2e2dc;--accent:#1f5fbf;
--heavy:#b3261e;--heavy-bg:#fbe9e7;--moderate:#8a5300;--moderate-bg:#fff1d6;--light:#3d5a1e;--light-bg:#eef5e2;--none:#4a4a46;--none-bg:#ededea;--faster:#0b5c4f;--faster-bg:#ddf3ee;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#20201e;--text:#ececea;--muted:#a3a39d;--line:#34342f;--accent:#8db4ff;
--heavy:#ffb4a9;--heavy-bg:#4a1c17;--moderate:#ffcf86;--moderate-bg:#432c06;--light:#c3df9b;--light-bg:#26331a;--none:#cfcfca;--none-bg:#30302c;--faster:#9ee5d6;--faster-bg:#123a33;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.15rem;margin:32px 0 12px}
.meta,.sub,.muted{color:var(--muted)}.sub{font-size:.8rem}
.answer{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;font-size:1.1rem;margin:20px 0}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card)}
table{border-collapse:collapse;width:100%}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
thead th{font-size:.8rem;color:var(--muted);font-weight:600;white-space:nowrap}
tbody tr:last-child>*{border-bottom:0}
.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.url{max-width:260px;word-break:break-all;font-weight:500}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.8rem;font-weight:600;white-space:nowrap}
.v-heavy{color:var(--heavy);background:var(--heavy-bg)}.v-moderate{color:var(--moderate);background:var(--moderate-bg)}
.v-light{color:var(--light);background:var(--light-bg)}.v-none,.v-unknown{color:var(--none);background:var(--none-bg)}
.v-faster{color:var(--faster);background:var(--faster-bg)}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:8px 0;padding:4px 12px}
details>summary{cursor:pointer;padding:8px 0;font-weight:600}
details .scroll{border:0;border-radius:0}
.detail td,.detail th{font-size:.85rem}
ul{padding-left:20px}li{margin:4px 0}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}dt{color:var(--muted)}dd{margin:0}
a{color:var(--accent)}
@page{size:A4 landscape;margin:14mm 12mm 16mm;@bottom-center{content:"Page " counter(page) " of " counter(pages);font:10px system-ui,sans-serif;color:#666}}
@media print{body{background:#fff;color:#000}details{break-inside:avoid}details:not([open])>*:not(summary){display:block}.scroll{overflow:visible}}
</style>
</head>
<body>
<main>
<h1>Chrome FireFox Browser Extensions Impact Analyser report</h1>
<div class="meta">${esc(when.toLocaleString('en-GB', {dateStyle: 'long', timeStyle: 'short'}))} · ${esc(sourceText)} · ${data.urls.length} website${data.urls.length === 1 ? '' : 's'} · ${s.rounds} rounds · ${loads} page loads</div>

<div class="answer">${esc(a.headline)}</div>

<h2>Results by extension</h2>
<div class="scroll"><table>
<thead><tr><th scope="col">Extension</th><th scope="col">Verdict</th><th scope="col" class="num">Extra work per page</th><th scope="col" class="num">Slower to load</th><th scope="col" class="num">Main content later</th><th scope="col" class="num">Page frozen</th><th scope="col" class="num">Memory</th><th scope="col">In plain words</th></tr></thead>
<tbody>${a.individual.map(row).join('')}${a.combined ? row(a.combined) : ''}</tbody>
</table></div>
<p class="sub">Grey numbers are within the normal run-to-run variation and should not be read as a real difference. Negative numbers mean faster or less.</p>

<h2>What you can do</h2>
<ul>
<li>Remove extensions marked <strong>Heavy</strong> or <strong>Noticeable</strong> that you rarely use.</li>
${firefox
  ? `<li>For ones you need, open <strong>about:addons</strong> in Firefox, choose the add-on, open <strong>Permissions</strong> and turn off <strong>Access your data for all websites</strong>. It then runs only on sites you allow.</li>`
  : `<li>For ones you need, open the extension's details page in your browser and set <strong>Site access</strong> to <strong>On click</strong> or <strong>On specific sites</strong>. It then stops running on every page.</li>`}
<li>Run the test again with your own everyday websites. Impact differs from site to site.</li>
</ul>

${a.warnings.length ? `<h2>Warnings</h2><ul>${a.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

<h2>Per-website details</h2>
${a.individual.map(detail).join('')}${a.combined ? detail(a.combined) : ''}

<h2>How this was measured</h2>
<ul>
<li>Every setup (no extensions, each extension on its own${a.combined ? ', all together' : ''}) ran in its own clean copy of ${firefox ? 'Firefox' : 'Chrome for Testing'}, never in your own browser. Extensions were copied from your profile, so they ran as if freshly installed and signed out.</li>
<li>Each extension first had ${s.warmupSeconds} seconds to finish its first-run work. Each browser start then had ${s.settleSeconds} seconds to settle before measuring.</li>
<li>Each website was loaded ${s.rounds} times per setup with an empty cache, in a fresh random order each round. Pages were watched for ${s.observeSeconds} seconds after loading.</li>
<li>Numbers are the median of the loads, minus the median with no extensions, averaged across websites. A change counts only when it is bigger than the normal run-to-run variation (and at least 5% of the typical value).</li>
<li>Verdicts: <em>Heavy</em> means at least ${THRESHOLDS.heavy.cpu} ms extra work or ${THRESHOLDS.heavy.slowdown / 1000} s slower. <em>Noticeable</em> means at least ${THRESHOLDS.moderate.cpu} ms or ${THRESHOLDS.moderate.slowdown} ms. <em>Small</em> means at least ${THRESHOLDS.light.cpu} ms or ${THRESHOLDS.light.slowdown} ms. <em>Makes pages faster</em> means less work and pages finishing at least ${THRESHOLDS.faster.speedup} ms sooner. <em>Main content later</em> is the change in when the largest text or image appeared.</li>
${firefox
  ? `<li><em>Extra work per page</em> is the extra time the page's main thread was busy, including the add-on's scripts on the page. Firefox does not report this directly, so a tiny timer ran on the page and every delay longer than 10 ms was counted as busy time. <em>Page frozen</em> adds up the part of every delay longer than 50 ms, when the page could not respond to clicks or scrolling.</li>
<li>Memory, data downloaded and whole-browser CPU are not measured in Firefox, because its automation interface does not report them.</li>`
  : `<li><em>Extra work per page</em> is the extra time the page's main thread was busy, including the extension's scripts on the page. <em>Page frozen</em> adds up the part of every task longer than 50 ms, when the page could not respond to clicks or scrolling.</li>
<li>Memory is the extension's own background memory plus any extra memory on the page.</li>`}
<li>Extensions that need you to sign in, or that rely on a desktop app, may do less here than in your normal browser.</li>
</ul>
<dl>
<dt>Test browser</dt><dd>${esc(testBrowser)}${env.headless ? ' (no visible windows)' : ''}${env.sandbox ? '' : ' (sandbox off)'}</dd>
<dt>Computer</dt><dd>${esc(env.platform)}, ${esc(env.cpu)} (${env.cpuCount} threads), ${env.memoryGB} GB memory</dd>
<dt>Websites</dt><dd>${data.urls.map(esc).join('<br>')}</dd>
<dt>Extensions</dt><dd>${data.extensions.map(e => `${esc(e.name)} ${esc(e.version)}${e.id ? ` <span class="sub">(${esc(e.id)})</span>` : ''}`).join('<br>')}</dd>
<dt>Raw data</dt><dd>results.csv (every page load) and results.json, in the same folder as this report.</dd>
</dl>
</main>
</body>
</html>
`;
}

const CSV_COLUMNS = ['scenario', 'extension', 'url', 'round', 'ok', 'status', 'error', 'load', 'domContentLoaded', 'fcp', 'lcp', 'tbt', 'mainThreadMs', 'scriptMs', 'pageHeapMB', 'requests', 'transferKB', 'browserCpuMs'];

export function renderCsv(data) {
  const labels = Object.fromEntries(data.scenarios.map(s => [s.key, s.label]));
  const quote = v => {
    if (v == null) return '';
    const text = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [CSV_COLUMNS.join(',')];
  for (const s of data.samples) {
    lines.push(CSV_COLUMNS.map(c => quote(c === 'extension' ? labels[s.scenario] : s[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

// Folder name for a run, in local time, e.g. 2026-10-21_12-50-03.
export function resultFolderName(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}

export function writeReport(data, dir) {
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(dir, 'results.csv'), renderCsv(data));
  fs.writeFileSync(path.join(dir, 'report.html'), renderHtml(data));
  return path.join(dir, 'report.html');
}
