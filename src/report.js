// Writes the results as a self-contained HTML report, a CSV of every page load and a JSON file.
// The HTML report works on its own (sort, filter, search, Markdown download, theme switch). When
// the app serves it, it also gets a token that unlocks re-testing, PDF/image/Word downloads and
// the AI assistant.

import fs from 'node:fs';
import path from 'node:path';
import {METRICS, THRESHOLDS, VERDICTS} from './analyze.js';
import {AI_PROVIDERS} from './ai.js';

export const BRAND = {name: 'PalWorks', site: 'https://palworks.ai', repo: 'https://github.com/PalWorks/chrome-firefox-browser-extensions-impact-analyser'};
const TITLE = 'Chrome Firefox Browser Extensions Impact Analyser report';

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

const ICON = {
  retest: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  ask: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M9 9.5h6M9 12.5h4" stroke-linecap="round"/></svg>',
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.6 6.6 0 0 0 10.7 10.7z"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 20h14"/></svg>',
};

// An icon button. The label shows under the icon on phones (where there is no hover tooltip)
// and is the accessible name everywhere.
const iconButton = (attrs, icon, label, short = label) =>
  `<button type="button" class="icon" ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${icon}<span class="lbl" aria-hidden="true">${esc(short)}</span></button>`;

// A sortable column heading: the whole heading is the button, with a clear arrow that shows
// the current order (both directions faint when the column is not the sort key).
const SORT_ICON = '<svg class="arrows" viewBox="0 0 16 16" aria-hidden="true"><path class="up" d="M8 2.5 12 7H4z"/><path class="down" d="M8 13.5 4 9h8z"/></svg>';
const sortHead = (key, label, numeric = false, sorted = false) =>
  `<th scope="col"${numeric ? ' class="num"' : ''} aria-sort="${sorted ? 'descending' : 'none'}"><button type="button" class="sort" data-sort="${key}">${numeric ? SORT_ICON : ''}<span>${esc(label)}</span>${numeric ? '' : SORT_ICON}</button></th>`;

// Data the page script needs, kept small: no raw page loads.
function pageData(data) {
  const a = data.analysis;
  const pick = r => r && {
    key: r.key, label: r.label, combined: r.combined, verdict: r.verdict, verdictLabel: r.verdictLabel, summary: r.summary,
    extensionKeys: r.extensionKeys,
    headline: r.headline,
    overall: Object.fromEntries(Object.entries(r.overall).map(([k, v]) => [k, {delta: v.delta, significant: v.significant}])),
    perUrl: r.perUrl.map(u => ({url: u.url, runs: u.runs, failed: u.failed, metrics: Object.fromEntries(Object.entries(u.metrics).map(([k, m]) => [k, {median: m.median, baseline: m.baseline, delta: m.delta}]))})),
  };
  return {
    title: TITLE,
    startedAt: data.startedAt,
    engine: data.engine || 'chrome',
    source: data.source,
    urls: data.urls,
    settings: data.settings,
    environment: data.environment,
    extensions: data.extensions.map(e => ({key: e.key, name: e.name, version: e.version, id: e.id, status: e.status})),
    headline: a.headline,
    warnings: a.warnings,
    individual: a.individual.map(pick),
    combined: pick(a.combined),
    metrics: METRICS,
    thresholds: THRESHOLDS,
    verdicts: VERDICTS,
    providers: AI_PROVIDERS.map(({id, name, endpoint, model, keys, note}) => ({id, name, endpoint, model, keys, note})),
    brand: BRAND,
  };
}

export function renderHtml(data, {appToken = '', reportId = ''} = {}) {
  const d = pageData(data);
  const when = new Date(data.startedAt);
  const firefox = d.engine === 'firefox';
  const sourceText = d.source?.profileName ? `${d.source.browser || 'Browser'} profile “${d.source.profileName}”` : 'Chosen extension folders';
  const loads = data.samples.length;
  const s = d.settings;
  const env = d.environment;
  // Embedded as JSON for the page script; "<" is escaped so the data cannot close the tag.
  const json = JSON.stringify(d).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${appToken ? `<meta name="app-token" content="${esc(appToken)}">\n<meta name="report-id" content="${esc(reportId)}">` : ''}
<title>${esc(TITLE)}, ${esc(when.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}))}</title>
<script>try{const t=localStorage.getItem('report-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}</script>
<style>
:root{--bg:#f6f6f3;--card:#fff;--text:#1c1c1a;--muted:#61615c;--line:#e0e0d9;--accent:#1f5fbf;--accent-text:#fff;--accent-soft:#e6eefb;--focus:#1f5fbf;
--heavy:#b3261e;--heavy-bg:#fbe9e7;--moderate:#8a5300;--moderate-bg:#fff1d6;--light:#3d5a1e;--light-bg:#eef5e2;--none:#4a4a46;--none-bg:#ededea;--faster:#0b5c4f;--faster-bg:#ddf3ee;--shadow:0 1px 2px rgba(0,0,0,.06);color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#151514;--card:#1f1f1d;--text:#ececea;--muted:#a5a59f;--line:#34342f;--accent:#8db4ff;--accent-text:#0d1b33;--accent-soft:#1d2a40;--focus:#8db4ff;
--heavy:#ffb4a9;--heavy-bg:#4a1c17;--moderate:#ffcf86;--moderate-bg:#432c06;--light:#c3df9b;--light-bg:#26331a;--none:#cfcfca;--none-bg:#30302c;--faster:#9ee5d6;--faster-bg:#123a33;--shadow:none;color-scheme:dark}}
:root[data-theme=dark]{--bg:#151514;--card:#1f1f1d;--text:#ececea;--muted:#a5a59f;--line:#34342f;--accent:#8db4ff;--accent-text:#0d1b33;--accent-soft:#1d2a40;--focus:#8db4ff;
--heavy:#ffb4a9;--heavy-bg:#4a1c17;--moderate:#ffcf86;--moderate-bg:#432c06;--light:#c3df9b;--light-bg:#26331a;--none:#cfcfca;--none-bg:#30302c;--faster:#9ee5d6;--faster-bg:#123a33;--shadow:none;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,sans-serif}
[hidden]{display:none!important}
main{max-width:1200px;margin:0 auto;padding:20px 16px 32px}
h1{font-size:1.5rem;line-height:1.25;margin:0 0 6px}
h2{font-size:1.15rem;margin:0}
.meta,.sub,.muted{color:var(--muted)}.sub{font-size:.8rem}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:6px}
.top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;justify-content:space-between}
.top .title{flex:1 1 420px;min-width:0}
.top .tools{display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:8px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.btn:hover{border-color:var(--muted)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-text)}
.btn.danger{color:var(--heavy)}
.btn:disabled{opacity:.6;cursor:default}
.icon{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:44px;height:44px;padding:0;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font:inherit;cursor:pointer}
.icon svg{width:20px;height:20px;flex:none}
.icon .lbl{display:none}
.icon:hover{border-color:var(--muted)}
.icon[aria-expanded=true]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.icon.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-text)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card)}
.seg .icon{border:0;border-radius:0}
.seg .icon+.icon{border-left:1px solid var(--line)}
.seg .icon[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}
.menu{position:relative}
.menu>summary{list-style:none}.menu>summary::-webkit-details-marker{display:none}
.menu .panel{position:absolute;right:0;top:calc(100% + 6px);z-index:20;min-width:270px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.menu .panel button{display:flex;flex-direction:column;align-items:flex-start;width:100%;min-height:44px;padding:8px 10px;border:0;border-radius:8px;background:none;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.menu .panel button:hover,.menu .panel button:focus-visible{background:var(--accent-soft)}
.menu .panel .sub{font-weight:400}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}
.panelbox{margin:16px 0;padding:16px}
.panelbox h2{margin-bottom:6px}
.panelbox .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.facts{margin:10px 0 0;padding-left:20px}
.runbar{margin:16px 0;padding:14px 16px}
.runbar .row{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between}
.bar{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin:10px 0 6px}
.bar>span{display:block;height:100%;width:0;background:var(--accent);transition:width .4s}
.answer{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;font-size:1.05rem;margin:18px 0;box-shadow:var(--shadow)}
.section{margin-top:28px}
.section-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px}
.controls{padding:10px 0;display:flex;flex-wrap:wrap;gap:10px;align-items:center;border-bottom:1px solid var(--line)}
.search{flex:1 1 100%;min-width:0}
.search input,.panelbox input,.panelbox select{width:100%;min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font:inherit}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;min-height:40px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:.9rem;cursor:pointer;white-space:nowrap}
.chip[aria-pressed=true]{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);font-weight:600}
.chip .n{color:var(--muted);font-weight:400;margin-left:4px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%}
/* Every cell starts its first line on the same 22px line box, so checkboxes, names, badges and
   numbers in one row line up. */
th,td{padding:12px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;line-height:22px}
thead th{font-size:.78rem;line-height:18px;color:var(--muted);font-weight:600;vertical-align:middle;padding-top:8px;padding-bottom:8px}
tbody tr:last-child>*{border-bottom:0}
.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
th .sort{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;gap:4px;align-items:center;min-height:36px;padding:4px 8px;margin:0 -8px;border-radius:8px;color:var(--muted);font-weight:600}
th .sort:hover{background:var(--accent-soft);color:var(--text)}
th .sort:focus-visible{outline:2px solid var(--focus);outline-offset:0}
th.num .sort{justify-content:flex-end;text-align:right}
th .sort span{max-width:9em;white-space:normal;line-height:16px}
.arrows{width:16px;height:16px;flex:none;fill:currentColor}
.arrows path{opacity:.3}
th[aria-sort=ascending] .sort,th[aria-sort=descending] .sort{color:var(--accent)}
th[aria-sort=ascending] .arrows .up,th[aria-sort=descending] .arrows .down{opacity:1}
th[aria-sort=ascending] .arrows .down,th[aria-sort=descending] .arrows .up{opacity:0}
.sortby{display:none;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)}
.sortby select{min-height:40px;padding:6px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font:inherit}
table.results tbody#rows tr:hover>*{background:color-mix(in srgb,var(--accent-soft) 45%,transparent)}
.ext-name a{color:inherit;text-decoration:none}
.ext-name a:hover{text-decoration:underline}
.up-bad{color:var(--heavy);font-weight:600}.down-good{color:var(--faster);font-weight:600}
.pick{width:44px;padding-right:0}
.pick input{display:block;width:18px;height:18px;margin:2px 0 0;accent-color:var(--accent);cursor:pointer}
thead .pick input{margin:0}
.ext-name{font-weight:600;min-width:140px;max-width:220px}
.ext-name .sub{display:block;font-weight:400;line-height:18px}
td.plain{min-width:190px}
.badge{display:inline-block;vertical-align:top;padding:0 10px;border-radius:999px;font-size:.8rem;line-height:22px;font-weight:600;white-space:nowrap}
.v-heavy{color:var(--heavy);background:var(--heavy-bg)}.v-moderate{color:var(--moderate);background:var(--moderate-bg)}
.v-light{color:var(--light);background:var(--light-bg)}.v-none,.v-unknown{color:var(--none);background:var(--none-bg)}
.v-faster{color:var(--faster);background:var(--faster-bg)}
.est{display:block;font-size:.7rem;line-height:16px;margin-top:2px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
tr.sum>*{background:var(--accent-soft);border-bottom:2px solid var(--accent)}
tr.total>*{background:var(--accent-soft)}
tr.sum .plain .btn{margin-top:8px;min-height:36px;padding:6px 12px;font-size:.85rem}
.dim{color:var(--muted)}
.empty{padding:20px;text-align:center}
.legend{margin:8px 0 0}
details.ext{margin:8px 0}
details.ext>summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:12px 16px;min-height:48px}
details.ext>summary::-webkit-details-marker{display:none}
details.ext>summary::before{content:"›";width:10px;font-size:1.3rem;line-height:22px;transition:transform .15s;color:var(--muted)}
details.ext[open]>summary::before{transform:rotate(90deg)}
details.ext>summary .name{font-weight:600;line-height:22px}
details.ext>summary .one{flex-basis:100%;color:var(--muted);font-size:.85rem;padding-left:22px}
.detail td,.detail th{font-size:.85rem;line-height:20px}
.detail th:first-child,.detail td:first-child{position:sticky;left:0;background:var(--card);z-index:1;width:240px;max-width:240px;box-shadow:1px 0 0 var(--line)}
.site{display:flex;flex-direction:column;min-width:0}
.site a{font-weight:600;text-decoration:none;color:var(--text)}
.site a:hover{text-decoration:underline}
.site .path{color:var(--muted);font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.delta{font-weight:600}
.pos{color:var(--heavy)}.neg{color:var(--faster)}
.field{display:block;font-size:.85rem;font-weight:600;margin:12px 0 4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.inline{display:flex;gap:8px;margin-top:12px}.inline input{flex:1;min-width:0}
.hint{font-size:.8rem;color:var(--muted);margin-top:4px}
.error{color:var(--heavy)}
.log{display:flex;flex-direction:column;gap:8px;margin-top:12px;max-height:420px;overflow-y:auto}
.msg{padding:10px 12px;border-radius:12px;max-width:85%;white-space:pre-wrap;overflow-wrap:anywhere}
.msg.me{align-self:flex-end;background:var(--accent);color:var(--accent-text)}
.msg.ai{align-self:flex-start;background:var(--bg);border:1px solid var(--line)}
.msg .btn{margin-top:8px;white-space:normal}
.ex{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.pill{font-size:.85rem;padding:6px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--line);color:var(--text);cursor:pointer;min-height:36px}
details.info{margin-top:28px;padding:4px 16px}
details.info>summary{cursor:pointer;font-weight:600;font-size:1.05rem;padding:12px 0;min-height:44px}
ul{padding-left:20px}li{margin:4px 0}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0 0 12px}dt{color:var(--muted)}dd{margin:0;min-width:0;overflow-wrap:anywhere}
footer{max-width:1200px;margin:0 auto;padding:16px 16px calc(32px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line);color:var(--muted);font-size:.85rem;display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:space-between}
footer a{color:var(--muted);font-weight:600}
.toast{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:calc(100vw - 32px);background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:.9rem;z-index:50}
/* Phones: icons get labels, tables become cards. */
@media (max-width:720px){
  h1{font-size:1.25rem}
  .top .tools{width:100%;display:grid;grid-template-columns:repeat(var(--tools,7),1fr);gap:4px}
  .top .tools .seg{grid-column:span 3;display:grid;grid-template-columns:repeat(3,1fr)}
  .icon{width:100%;height:auto;min-height:52px;padding:6px 2px}
  .icon .lbl{display:block;font-size:.66rem;font-weight:600;line-height:1}
  .menu>summary.icon{width:100%}
  .menu .panel{right:0;left:auto;width:min(320px,calc(100vw - 32px))}
  .controls{position:static}
  .grid2{grid-template-columns:1fr}
  .chips{flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px;width:100%}
  .sortby{display:flex;width:100%}.sortby select{flex:1}
  .msg{max-width:100%}
  table.results thead{display:none}
  table.results,table.results tbody,table.results tr,table.results td,table.results th{display:block;width:100%}
  table.results tr{position:relative;border-bottom:1px solid var(--line);padding:12px 14px 12px 48px;display:grid;grid-template-columns:1fr 1fr;gap:6px 12px}
  table.results tr>*{background:none!important;border:0!important;padding:0;text-align:left}
  table.results tr.sum,table.results tr.total{background:var(--accent-soft)}
  table.results tr.sum{border-bottom:2px solid var(--accent)}
  table.results td.pick{position:absolute;left:14px;top:12px;width:auto}
  table.results tbody:last-child tr:last-child{border-bottom:0}
  table.results .ext-name{grid-column:1/-1;max-width:none;font-size:1rem}
  table.results td.v,table.results td.plain,table.results .wide{grid-column:1/-1}
  table.results td.plain{color:var(--muted);font-size:.9rem}
  table.results td.num::before{content:attr(data-label);display:block;font-size:.72rem;line-height:16px;color:var(--muted);font-weight:600}
  .detail thead{display:none}
  .detail,.detail tbody,.detail tr,.detail td,.detail th{display:block;width:100%}
  .detail tr{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;padding:12px 14px;border-bottom:1px solid var(--line)}
  .detail th:first-child,.detail td:first-child{position:static;width:auto;max-width:none;grid-column:1/-1;box-shadow:none;padding:0}
  .detail td{border:0;padding:0;text-align:left}
  .detail td.num::before{content:attr(data-label);display:block;font-size:.72rem;line-height:16px;color:var(--muted);font-weight:600}
  .site .path{max-width:100%}
  dl{grid-template-columns:1fr}dt{margin-top:6px}
}
@page{size:A4 landscape;margin:14mm 12mm 16mm;@bottom-center{content:"Page " counter(page) " of " counter(pages);font:10px system-ui,sans-serif;color:#666}}
@media print{.controls,.tools,.panelbox,.runbar,.pick,#run-picked{display:none!important}body{background:#fff;color:#000}details{break-inside:avoid}details>*{display:block}.scroll{overflow:visible}main{max-width:none}}
.snapshot .controls,.snapshot .tools,.snapshot .panelbox,.snapshot .runbar,.snapshot .pick,.snapshot #run-picked{display:none!important}
</style>
</head>
<body>
<main>
<div class="top">
  <div class="title">
    <h1>${esc(TITLE)}</h1>
    <div class="meta">${esc(when.toLocaleString('en-GB', {dateStyle: 'long', timeStyle: 'short'}))} · ${esc(sourceText)} · ${d.urls.length} website${d.urls.length === 1 ? '' : 's'} · ${s.rounds} rounds · ${loads} page loads</div>
  </div>
  <div class="tools" id="tools">
    ${iconButton('id="retest" data-app aria-expanded="false" aria-controls="confirm"', ICON.retest, 'Run this test again', 'Re-test')}
    ${iconButton('id="search-toggle" aria-expanded="false" aria-controls="search-row"', ICON.search, 'Search', 'Search')}
    ${iconButton('id="ask-toggle" data-app aria-expanded="false" aria-controls="ask"', ICON.ask, 'Ask about this report', 'Ask')}
    <div class="seg" role="group" aria-label="Colour theme">
      ${iconButton('data-theme-set="auto" aria-pressed="true"', ICON.auto, 'Match my device', 'Auto')}
      ${iconButton('data-theme-set="light" aria-pressed="false"', ICON.light, 'Light', 'Light')}
      ${iconButton('data-theme-set="dark" aria-pressed="false"', ICON.dark, 'Dark', 'Dark')}
    </div>
    <details class="menu" id="dl-menu">
      <summary class="icon primary" aria-label="Download" title="Download">${ICON.download}<span class="lbl" aria-hidden="true">Save</span></summary>
      <div class="panel" role="menu">
        <button type="button" data-dl="pdf" role="menuitem">PDF<span class="sub" id="pdf-sub">For printing and sharing. Pages are numbered.</span></button>
        <button type="button" data-dl="png" data-app role="menuitem">Image (.png)<span class="sub">The whole report as one picture, for chats and slides.</span></button>
        <button type="button" data-dl="docx" data-app role="menuitem">Word (.docx)<span class="sub">Editable document. Google Docs opens it too.</span></button>
        <button type="button" data-dl="md" role="menuitem">Markdown (.md)<span class="sub">Plain text with tables. Good for notes and GitHub.</span></button>
      </div>
    </details>
  </div>
</div>

<section class="card panelbox" id="confirm" hidden aria-live="polite"></section>
<section class="card runbar" id="runbar" hidden aria-live="polite"></section>

<section class="card panelbox" id="ask" hidden aria-labelledby="h-ask">
  <div id="ask-setup" hidden>
    <h2 id="h-ask">Ask about this report</h2>
    <p class="sub">An AI assistant answers from these results and can suggest a new test. Connect an AI service once. Your key is saved only on this computer and sent only to the service you choose.</p>
    <div class="grid2">
      <div><label class="field" for="ai-provider">AI service</label><select id="ai-provider"></select><div class="hint" id="ai-note"></div></div>
      <div><label class="field" for="ai-model">Model</label><input id="ai-model" type="text" autocomplete="off" spellcheck="false"></div>
    </div>
    <label class="field" for="ai-endpoint">Endpoint</label>
    <input id="ai-endpoint" type="url" inputmode="url" autocomplete="off" spellcheck="false">
    <label class="field" for="ai-key">API key</label>
    <div class="inline" style="margin-top:0"><input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key"><button type="button" class="btn" id="ai-show">Show</button></div>
    <div class="hint" id="ai-get"></div>
    <div class="actions"><button type="button" class="btn primary" id="ai-save">Check and connect</button><button type="button" class="btn" id="ai-cancel">Not now</button></div>
  </div>
  <div id="ask-chat" hidden>
    <h2>Ask about this report</h2>
    <p class="sub" id="ai-using"></p>
    <div class="log" id="chat-log" aria-live="polite"></div>
    <div class="inline"><input id="ai-q" type="text" placeholder="For example: what if I keep only Bitwarden and Ghostery?" aria-label="Your question" autocomplete="off"><button type="button" class="btn primary" id="ask-send">Ask</button></div>
    <div class="ex" id="ask-examples"></div>
    <div class="actions"><button type="button" class="btn" id="ai-change">Change AI service</button><button type="button" class="btn danger" id="ai-forget">Remove saved key</button></div>
  </div>
</section>

<div class="answer">${esc(d.headline)}</div>

<div class="controls">
  <div class="search" id="search-row" role="search" hidden><input id="q" type="search" placeholder="Search extensions or websites" aria-label="Search extensions or websites" autocomplete="off"></div>
  <div class="chips" id="chips" role="group" aria-label="Show only"></div>
  <label class="sortby">Sort by <select id="sortby">
    <option value="verdict:-1">Biggest impact first</option>
    <option value="mainThreadMs:-1">Most extra work</option>
    <option value="load:-1">Slowest to load</option>
    <option value="blockingMs:-1">Most frozen time</option>
    ${firefox ? '' : '<option value="memoryMB:-1">Most memory</option>'}
    <option value="label:1">Name (A to Z)</option>
  </select></label>
</div>

<section class="section" aria-labelledby="h-results">
  <div class="section-head"><h2 id="h-results">Results by extension</h2><span class="sub" id="shown"></span></div>
  <div class="card scroll"><table class="results" id="results">
    <thead><tr>
      <th scope="col" class="pick"><input type="checkbox" id="pick-all" checked aria-label="Tick all extensions"></th>
      ${sortHead('label', 'Extension')}
      ${sortHead('verdict', 'Verdict', false, true)}
      ${sortHead('mainThreadMs', 'Extra work per page', true)}
      ${sortHead('load', 'Slower to load', true)}
      ${sortHead('lcp', 'Main content later', true)}
      ${sortHead('blockingMs', 'Page frozen', true)}
      ${firefox ? '' : sortHead('memoryMB', 'Memory', true)}
      <th scope="col">In plain words</th>
    </tr></thead>
    <tbody id="sum"></tbody>
    <tbody id="rows"></tbody>
    <tbody id="total"></tbody>
  </table>
  <div class="empty" id="none" hidden>No extension matches. <button type="button" class="btn" id="clear">Show all</button></div>
  </div>
  <p class="sub legend">Tick the extensions you would keep: the top row adds up their effects. <span class="up-bad">Red</span> means slower or more, <span class="down-good">green</span> means faster or less, grey is within normal run-to-run variation. Click a column name to sort; click an extension to see its per-website numbers.</p>
</section>

<section class="section" aria-labelledby="h-sites">
  <div class="section-head"><h2 id="h-sites">Per-website details</h2><button type="button" class="btn" id="expand">Expand all</button></div>
  <div id="details"></div>
  <p class="sub">Each number is the change versus no extensions. Below it: the median with the extension vs without.</p>
</section>

${d.warnings.length ? `<section class="section"><h2>Warnings</h2><ul>${d.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></section>` : ''}

<details class="card info" open>
<summary>How this was measured</summary>
<ul>
<li>Every setup (no extensions, each extension on its own${d.combined ? ', all together' : ''}) ran in its own clean copy of ${firefox ? 'Firefox' : 'Chrome for Testing'}, never in your own browser. Extensions were copied from your profile, so they ran as if freshly installed and signed out.</li>
<li>Each extension first had ${s.warmupSeconds} seconds to finish its first-run work. Each browser start then had ${s.settleSeconds} seconds to settle before measuring.</li>
<li>Each website was loaded ${s.rounds} times per setup with an empty cache, in a fresh random order each round. Pages were watched for ${s.observeSeconds} seconds after loading.</li>
<li>Numbers are the median of the loads, minus the median with no extensions, averaged across websites. A change counts only when it is bigger than the normal run-to-run variation (and at least 5% of the typical value).</li>
<li>Verdicts: <em>Heavy</em> means at least ${THRESHOLDS.heavy.cpu} ms extra work or ${THRESHOLDS.heavy.slowdown / 1000} s slower. <em>Noticeable</em> means at least ${THRESHOLDS.moderate.cpu} ms or ${THRESHOLDS.moderate.slowdown} ms. <em>Small</em> means at least ${THRESHOLDS.light.cpu} ms or ${THRESHOLDS.light.slowdown} ms. <em>Makes pages faster</em> means less work and pages finishing at least ${THRESHOLDS.faster.speedup} ms sooner.</li>
${firefox
  ? '<li><em>Extra work per page</em> is the extra time the page\'s main thread was busy, including the add-on\'s scripts. Firefox does not report this directly, so a tiny timer ran on the page and every delay longer than 10 ms was counted as busy time. Memory, data downloaded and whole-browser CPU are not available in Firefox.</li>'
  : '<li><em>Extra work per page</em> is the extra time the page\'s main thread was busy, including the extension\'s scripts. <em>Page frozen</em> adds up the part of every task longer than 50 ms. Memory is the extension\'s own background memory plus any extra memory on the page.</li>'}
<li>The total row adds up single-extension results. Extensions can add up to more or less when switched on together, so test a combination before relying on it.</li>
<li>Extensions that need you to sign in, or that rely on a desktop app, may do less here than in your normal browser.</li>
</ul>
</details>

<details class="card info" open>
<summary>Test environment</summary>
<dl>
<dt>Test browser</dt><dd>${esc(env.browser || env.chrome)}${env.headless ? ' (no visible windows)' : ''}${env.sandbox ? '' : ' (sandbox off)'}</dd>
<dt>Computer</dt><dd>${esc(env.platform)}, ${esc(env.cpu)} (${env.cpuCount} threads), ${env.memoryGB} GB memory</dd>
<dt>Websites</dt><dd>${d.urls.map(u => `<a href="${esc(u)}" rel="noopener" target="_blank">${esc(u)}</a>`).join('<br>')}</dd>
<dt>Extensions</dt><dd>${d.extensions.map(e => `${esc(e.name)} ${esc(e.version)}${e.id ? ` <span class="sub">(${esc(e.id)})</span>` : ''}`).join('<br>')}</dd>
<dt>Raw data</dt><dd>results.csv (every page load) and results.json, in the same folder as this report.</dd>
</dl>
</details>
</main>
<footer>
  <span>Made by <a href="${BRAND.site}" target="_blank" rel="noopener">${BRAND.name} (palworks.ai)</a></span>
  <span>Free and open source: <a href="${BRAND.repo}" target="_blank" rel="noopener">source code on GitHub</a></span>
</footer>
<script type="application/json" id="data">${json}</script>
<script>
(() => {
const D = JSON.parse(document.getElementById('data').textContent);
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const TOKEN = document.querySelector('meta[name=app-token]')?.content || '';
const REPORT_ID = document.querySelector('meta[name=report-id]')?.content || '';
const firefox = D.engine === 'firefox';
const time = ms => {
  if (ms == null || !isFinite(ms)) return 'n/a';
  const a = Math.abs(ms), sign = ms > 0.5 ? '+' : ms < -0.5 ? '−' : '';
  return a >= 1000 ? sign + (a / 1000).toFixed(1) + ' s' : sign + Math.round(a) + ' ms';
};
const num = (v, unit, digits = 0) => {
  if (v == null || !isFinite(v)) return 'n/a';
  const n = Number(v.toFixed(digits));
  return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits}) + (unit ? ' ' + unit : '');
};
const minutes = sec => sec < 60 ? 'less than a minute' : sec < 5400 ? 'about ' + Math.round(sec / 60) + ' minutes' : 'about ' + Math.floor(sec / 3600) + ' h ' + Math.round((sec % 3600) / 60) + ' min';
const toast = text => {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
};
async function api(path, body) {
  const res = await fetch(path, {method: body === undefined ? 'GET' : 'POST', headers: {'x-token': TOKEN, 'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong (' + res.status + '). Try again.');
  return data;
}

// Features that need the app (re-test, AI, PDF/image/Word) are hidden when the file is opened
// straight from disk.
if (!TOKEN) {
  document.querySelectorAll('[data-app]').forEach(el => el.hidden = true);
  $('#tools').style.setProperty('--tools', '5');
  $('#pdf-sub').textContent = 'Opens the print window. Choose "Save as PDF". Pages are numbered.';
}

// ---- theme ----
const applyTheme = mode => {
  if (mode === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = mode;
  document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === mode)));
  try { mode === 'auto' ? localStorage.removeItem('report-theme') : localStorage.setItem('report-theme', mode); } catch {}
};
applyTheme(document.documentElement.dataset.theme || 'auto');
document.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themeSet)));

// ---- results table: sort, filter, search, tick to total ----
const S = {q: '', verdict: 'all', sort: 'verdict', dir: -1};
const PICK = new Set(D.individual.map(r => r.key));
const rank = v => D.verdicts[v].rank;
const sortValue = (r, key) => {
  if (key === 'label') return r.label.toLowerCase();
  if (key === 'verdict') return rank(r.verdict) * 1e6 + r.headline.mainThreadMs.value;
  return r.headline[key]?.value ?? -Infinity;
};
const tone = v => v > 0.5 ? 'up-bad' : v < -0.5 ? 'down-good' : '';
const cell = (entry, label, fmt) => '<td class="num" data-label="' + label + '">' + (entry.significant === false ? '<span class="dim" title="Within normal variation">' + fmt(entry.value) + '</span>' : '<span class="' + tone(entry.value) + '">' + fmt(entry.value) + '</span>') + '</td>';
const row = (r, total) => '<tr' + (total ? ' class="total"' : '') + '>' +
  '<td class="pick">' + (total ? '' : '<input type="checkbox" data-pick="' + r.key + '"' + (PICK.has(r.key) ? ' checked' : '') + ' aria-label="Keep ' + esc(r.label) + '">') + '</td>' +
  '<th scope="row" class="ext-name"><a href="#d-' + r.key + '" data-open="' + r.key + '">' + esc(r.label) + '</a>' + (total ? '<span class="sub">Measured with all switched on together</span>' : '') + '</th>' +
  '<td class="v"><span class="badge v-' + r.verdict + '">' + esc(r.verdictLabel) + '</span></td>' +
  cell(r.headline.mainThreadMs, 'Extra work', time) + cell(r.headline.load, 'Slower to load', time) +
  cell(r.headline.lcp, 'Main content later', time) + cell(r.headline.blockingMs, 'Page frozen', time) +
  (firefox ? '' : '<td class="num" data-label="Memory">' + (r.headline.memoryMB.value >= 0.5 ? Math.round(r.headline.memoryMB.value) + ' MB' : 'n/a') + '</td>') +
  '<td class="plain">' + esc(r.summary) + '</td></tr>';
const matches = r => (S.verdict === 'all' || r.verdict === S.verdict) &&
  (!S.q || r.label.toLowerCase().includes(S.q) || r.perUrl.some(u => u.url.toLowerCase().includes(S.q)));

function renderChips() {
  const counts = {};
  D.individual.forEach(r => counts[r.verdict] = (counts[r.verdict] || 0) + 1);
  const order = ['heavy', 'moderate', 'light', 'none', 'faster', 'unknown'].filter(v => counts[v]);
  $('#chips').innerHTML = '<button type="button" class="chip" data-v="all" aria-pressed="' + (S.verdict === 'all') + '">All<span class="n">' + D.individual.length + '</span></button>' +
    order.map(v => '<button type="button" class="chip" data-v="' + v + '" aria-pressed="' + (S.verdict === v) + '">' + esc(D.verdicts[v].label) + '<span class="n">' + counts[v] + '</span></button>').join('');
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => { S.verdict = c.dataset.v; update(); }));
}
function renderRows() {
  const list = D.individual.filter(matches).sort((a, b) => {
    const x = sortValue(a, S.sort), y = sortValue(b, S.sort);
    return (x < y ? -1 : x > y ? 1 : 0) * S.dir;
  });
  $('#rows').innerHTML = list.map(r => row(r)).join('');
  $('#sortby').value = [...$('#sortby').options].some(o => o.value === S.sort + ':' + S.dir) ? S.sort + ':' + S.dir : $('#sortby').value;
  document.querySelectorAll('[data-pick]').forEach(c => c.addEventListener('change', () => {
    c.checked ? PICK.add(c.dataset.pick) : PICK.delete(c.dataset.pick);
    renderSum();
  }));
  renderSum();
  $('#total').innerHTML = D.combined && S.verdict === 'all' && !S.q ? row(D.combined, true) : '';
  $('#none').hidden = list.length > 0;
  $('#shown').textContent = list.length === D.individual.length ? D.individual.length + ' extensions' : 'Showing ' + list.length + ' of ' + D.individual.length;
  document.querySelectorAll('#results thead th').forEach(th => {
    const b = th.querySelector('.sort');
    if (b) th.setAttribute('aria-sort', b.dataset.sort === S.sort ? (S.dir > 0 ? 'ascending' : 'descending') : 'none');
  });
}
document.querySelectorAll('#results .sort').forEach(b => b.addEventListener('click', () => {
  if (S.sort === b.dataset.sort) S.dir = -S.dir; else { S.sort = b.dataset.sort; S.dir = b.dataset.sort === 'label' ? 1 : -1; }
  renderRows();
}));
$('#sortby').addEventListener('change', e => { const [k, dir] = e.target.value.split(':'); S.sort = k; S.dir = Number(dir); renderRows(); });
$('#results').addEventListener('click', e => {
  const a = e.target.closest('[data-open]');
  if (!a) return;
  e.preventDefault();
  const d = document.getElementById('d-' + a.dataset.open);
  if (d) { d.open = true; d.scrollIntoView({behavior: 'smooth', block: 'start'}); d.querySelector('summary').focus({preventScroll: true}); }
});
$('#q').addEventListener('input', e => { S.q = e.target.value.trim().toLowerCase(); update(); });
$('#clear').addEventListener('click', () => { S.q = ''; S.verdict = 'all'; $('#q').value = ''; update(); });

const sig = (r, k) => (r.overall[k]?.significant ? r.overall[k].delta : 0);
function estVerdict(cpu, slow) {
  const T = D.thresholds;
  if (cpu >= T.heavy.cpu || slow >= T.heavy.slowdown) return 'heavy';
  if (cpu >= T.moderate.cpu || slow >= T.moderate.slowdown) return 'moderate';
  if (cpu >= T.light.cpu || slow >= T.light.slowdown) return 'light';
  return 'none';
}
function renderSum() {
  const chosen = D.individual.filter(r => PICK.has(r.key));
  const n = chosen.length, all = n === D.individual.length;
  $('#pick-all').checked = all;
  $('#pick-all').indeterminate = n > 0 && !all;
  if (!n) {
    $('#sum').innerHTML = '<tr class="sum"><td class="pick"></td><th scope="row" class="ext-name wide" colspan="' + (firefox ? 7 : 8) + '">Total<span class="sub">Tick extensions to add up their effects.</span></th></tr>';
    return;
  }
  const add = k => chosen.reduce((s, r) => s + sig(r, k), 0);
  const cpu = add('mainThreadMs'), load = add('load'), lcp = add('lcp'), tbt = add('tbt');
  const mem = chosen.reduce((s, r) => s + (r.headline.memoryMB.value || 0), 0);
  const v = estVerdict(cpu, Math.max(load, lcp));
  const measured = all && D.combined ? ' Measured with all ' + n + ' on together: ' + time(D.combined.headline.mainThreadMs.value) + ' of work (last row).' : '';
  $('#sum').innerHTML = '<tr class="sum"><td class="pick"></td>' +
    '<th scope="row" class="ext-name">Total of ' + n + ' ticked<span class="sub">Added up from single tests</span></th>' +
    '<td class="v"><span class="badge v-' + v + '">' + esc(D.verdicts[v].label) + '</span><span class="est">Estimate</span></td>' +
    [[cpu, 'Extra work'], [load, 'Slower to load'], [lcp, 'Main content later'], [tbt, 'Page frozen']].map(([v, l]) => '<td class="num" data-label="' + l + '"><span class="' + tone(v) + '">' + time(v) + '</span></td>').join('') +
    (firefox ? '' : '<td class="num" data-label="Memory">' + Math.round(mem) + ' MB</td>') +
    '<td class="plain">Extensions can add up to more or less when switched on together.' + measured +
    (all || !TOKEN ? '' : '<br><button type="button" class="btn" id="run-picked">Test these ' + n + ' together</button>') + '</td></tr>';
  $('#run-picked')?.addEventListener('click', () => askToRun({
    title: 'Test these ' + n + ' extensions together?',
    extensionKeys: chosen.flatMap(r => r.extensionKeys), names: chosen.map(r => r.label), urls: [], rounds: D.settings.rounds,
  }));
}
$('#pick-all').addEventListener('change', e => {
  D.individual.forEach(r => e.target.checked ? PICK.add(r.key) : PICK.delete(r.key));
  renderRows();
});

// ---- per-website details ----
const KEYS = ['mainThreadMs', 'load', 'lcp', 'tbt', 'fcp', 'pageHeapMB', 'requests', 'transferKB', 'browserCpuMs']
  .filter(k => !(firefox && ['pageHeapMB', 'transferKB', 'browserCpuMs'].includes(k)));
const short = {mainThreadMs: 'Extra work', load: 'Finished loading', lcp: 'Main content', tbt: 'Page frozen', fcp: 'First content', pageHeapMB: 'Page memory', requests: 'Requests', transferKB: 'Data', browserCpuMs: 'Browser CPU'};
function site(url) {
  let host = url, rest = '';
  try { const u = new URL(url); host = u.hostname.replace(/^www\\./, ''); rest = (u.pathname + u.search).replace(/^\\/$/, ''); } catch {}
  return '<div class="site"><a href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(url) + '">' + esc(host) + '</a>' + (rest ? '<span class="path" title="' + esc(url) + '">' + esc(rest) + '</span>' : '') + '</div>';
}
function detail(r) {
  const q = S.q;
  const urls = r.perUrl.filter(u => !q || r.label.toLowerCase().includes(q) || u.url.toLowerCase().includes(q));
  const head = KEYS.map(k => '<th scope="col" class="num">' + esc(short[k]) + '</th>').join('');
  const rows = urls.map(u => '<tr><th scope="row">' + site(u.url) + '<span class="sub">' + u.runs + ' good loads' + (u.failed ? ', ' + u.failed + ' failed' : '') + '</span></th>' + KEYS.map(k => {
    const m = u.metrics[k], unit = D.metrics[k].unit, digits = unit === 'MB' ? 1 : 0;
    const cls = m.delta > 0 ? 'pos' : m.delta < 0 ? 'neg' : '';
    const fmt = unit === 'ms' ? time(m.delta) : num(m.delta, unit, digits);
    return '<td class="num" data-label="' + esc(short[k]) + '"><span class="delta ' + cls + '">' + fmt + '</span><div class="sub">' + (m.median == null ? '' : Number(m.median.toFixed(digits)).toLocaleString('en-US') + ' vs ' + Number((m.baseline ?? 0).toFixed(digits)).toLocaleString('en-US')) + '</div></td>';
  }).join('') + '</tr>').join('');
  return '<details class="card ext" id="d-' + r.key + '" data-key="' + r.key + '"><summary><span class="name">' + esc(r.label) + '</span><span class="badge v-' + r.verdict + '">' + esc(r.verdictLabel) + '</span><span class="one">' + esc(r.summary) + '</span></summary>' +
    '<div class="scroll"><table class="detail"><thead><tr><th scope="col">Website</th>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div></details>';
}
function renderDetails() {
  const open = new Set([...document.querySelectorAll('details.ext[open]')].map(x => x.dataset.key));
  const list = [...D.individual.filter(matches), ...(D.combined && S.verdict === 'all' && !S.q ? [D.combined] : [])];
  $('#details').innerHTML = list.map(detail).join('') || '<div class="card empty">No extension matches.</div>';
  document.querySelectorAll('details.ext').forEach(x => { if (open.has(x.dataset.key)) x.open = true; });
}
$('#expand').addEventListener('click', e => {
  const all = [...document.querySelectorAll('details.ext')];
  const openAll = all.some(x => !x.open);
  all.forEach(x => x.open = openAll);
  e.target.textContent = openAll ? 'Collapse all' : 'Expand all';
});

// ---- search toggle ----
$('#search-toggle').addEventListener('click', () => {
  const box = $('#search-row'), open = box.hidden;
  box.hidden = !open;
  $('#search-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('#q').focus();
  else if (S.q) { $('#q').value = ''; S.q = ''; update(); }
});

// ---- running tests: confirmation in two steps, then live progress ----
const RUN = {running: false, phase: '', progress: null, followUp: null, startedHere: false};
function closeConfirm() { $('#confirm').hidden = true; $('#retest').setAttribute('aria-expanded', 'false'); }
function busyNotice() {
  const p = RUN.progress;
  const left = p?.etaSeconds != null ? ', ' + minutes(p.etaSeconds) + ' left' : '';
  $('#confirm').innerHTML = '<h2>A test is already running</h2><p>' + esc(RUN.phase || 'Testing') + left + '. Only one test can run at a time, so wait for it to finish, or stop it first.</p>' +
    '<div class="actions"><button type="button" class="btn primary" id="c-close">OK</button></div>';
  $('#confirm').hidden = false;
  $('#c-close').addEventListener('click', closeConfirm);
  $('#c-close').focus();
}
// spec: {title, extensionKeys, names, urls, rounds, followUp}
async function askToRun(spec) {
  if (RUN.running) return busyNotice();
  const box = $('#confirm');
  const exts = spec.extensionKeys.length;
  const urls = spec.urls.length ? spec.urls : D.urls;
  let seconds = null;
  try { seconds = (await api('/api/estimate', {extensions: exts, urls: urls.length, settings: {...D.settings, rounds: spec.rounds}})).seconds; } catch {}
  const list = spec.names.length > 6 ? spec.names.slice(0, 6).map(esc).join(', ') + ' and ' + (spec.names.length - 6) + ' more' : spec.names.map(esc).join(', ');
  box.innerHTML = '<h2>' + esc(spec.title) + '</h2>' +
    '<ul class="facts"><li><b>Takes ' + (seconds == null ? 'several minutes' : minutes(seconds)) + '.</b> ' + exts + ' extension' + (exts === 1 ? '' : 's') + ' (' + list + ') on ' + urls.length + ' website' + (urls.length === 1 ? '' : 's') + ', ' + spec.rounds + ' loads each.</li>' +
    '<li><b>Keeps your computer busy.</b> Test browsers open and close in the background the whole time. Other apps may feel slower, and heavy work such as video calls makes the results less precise.</li>' +
    '<li>This report stays as it is. The new results get their own report.</li></ul>' +
    '<div class="actions"><button type="button" class="btn primary" id="c-next">Continue</button><button type="button" class="btn" id="c-no">Cancel</button></div>';
  box.hidden = false;
  box.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  $('#c-no').addEventListener('click', closeConfirm);
  $('#c-next').addEventListener('click', () => {
    box.innerHTML = '<h2>Start the test now?</h2><p>Your computer will be busy for ' + (seconds == null ? 'several minutes' : minutes(seconds)) + '. You can stop the test at any time.</p>' +
      '<div class="actions"><button type="button" class="btn primary" id="c-go">Yes, start the test</button><button type="button" class="btn" id="c-no2">Cancel</button></div>';
    $('#c-no2').addEventListener('click', closeConfirm);
    $('#c-go').focus();
    $('#c-go').addEventListener('click', async () => {
      $('#c-go').disabled = true; $('#c-go').textContent = 'Starting…';
      try {
        await api('/api/rerun', {id: REPORT_ID, extensionKeys: spec.extensionKeys, urls: spec.urls, rounds: spec.rounds});
        RUN.followUp = spec.followUp || null;
        RUN.startedHere = true;
        closeConfirm();
      } catch (err) {
        if (/already running/i.test(err.message)) return busyNotice();
        box.innerHTML = '<h2>The test could not start</h2><p class="error">' + esc(err.message) + '</p><div class="actions"><button type="button" class="btn" id="c-close">Close</button></div>';
        $('#c-close').addEventListener('click', closeConfirm);
      }
    });
  });
  $('#c-next').focus();
}
$('#retest').addEventListener('click', () => {
  if (!$('#confirm').hidden) return closeConfirm();
  $('#retest').setAttribute('aria-expanded', 'true');
  const keys = D.individual.flatMap(r => r.extensionKeys);
  askToRun({title: 'Run this test again?', extensionKeys: keys, names: D.individual.map(r => r.label), urls: [], rounds: D.settings.rounds});
});

function renderRunbar() {
  const bar = $('#runbar');
  if (!RUN.running) return;
  const p = RUN.progress;
  const pct = p?.total ? Math.round((p.done / p.total) * 100) : 0;
  bar.hidden = false;
  bar.innerHTML = '<div class="row"><b>' + (RUN.startedHere ? 'Your new test is running' : 'A test is running') + '</b><span class="sub">' + (p?.etaSeconds != null ? minutes(p.etaSeconds) + ' left' : 'Starting…') + '</span></div>' +
    '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>' +
    '<div class="row"><span class="sub">' + esc(RUN.phase || '') + '</span><button type="button" class="btn danger" id="rb-stop">Stop test</button></div>';
  $('#rb-stop').addEventListener('click', () => {
    bar.querySelector('.row:last-child').innerHTML = '<span>Stop the test? What it has done so far is not kept.</span><span><button type="button" class="btn danger" id="rb-yes">Yes, stop it</button> <button type="button" class="btn" id="rb-no">Keep running</button></span>';
    $('#rb-yes').addEventListener('click', () => api('/api/cancel', {}).catch(err => toast(err.message)));
    $('#rb-no').addEventListener('click', renderRunbar);
  });
}
function runFinished(kind, info) {
  RUN.running = false;
  const bar = $('#runbar');
  bar.hidden = false;
  if (kind === 'done') {
    bar.innerHTML = '<div class="row"><span><b>New results are ready.</b> ' + esc(info.headline || '') + '</span><a class="btn primary" href="' + esc(info.reportUrl) + '">Open new report</a></div>';
    if (RUN.followUp) { const f = RUN.followUp; RUN.followUp = null; followUpAsk(f, info.id); }
  } else {
    bar.innerHTML = '<div class="row"><span>' + esc(info.message || 'The test stopped.') + '</span><button type="button" class="btn" id="rb-close">Close</button></div>';
    $('#rb-close').addEventListener('click', () => bar.hidden = true);
  }
  RUN.startedHere = false;
}
if (TOKEN) {
  const ev = new EventSource('/api/events?token=' + encodeURIComponent(TOKEN));
  ev.addEventListener('state', e => {
    const s = JSON.parse(e.data);
    if (s.running) { RUN.running = true; RUN.phase = s.phase; RUN.progress = s.progress; renderRunbar(); }
    else if (RUN.running && !s.running) RUN.running = false;
  });
  ev.addEventListener('phase', e => { RUN.phase = JSON.parse(e.data).message; RUN.running = true; renderRunbar(); });
  ev.addEventListener('progress', e => { RUN.progress = JSON.parse(e.data); RUN.running = true; renderRunbar(); });
  ev.addEventListener('done', e => runFinished('done', JSON.parse(e.data)));
  ev.addEventListener('failed', e => runFinished('failed', JSON.parse(e.data)));
  ev.addEventListener('cancelled', e => runFinished('cancelled', JSON.parse(e.data)));
}

// ---- ask about this report ----
const AI = {config: null, history: []};
$('#ai-provider').innerHTML = D.providers.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
function fillProvider() {
  const p = D.providers.find(x => x.id === $('#ai-provider').value);
  $('#ai-endpoint').value = p.endpoint;
  $('#ai-model').value = p.model;
  $('#ai-note').textContent = p.note;
  $('#ai-get').innerHTML = p.keys ? 'No key yet? Get one at <a href="' + esc(p.keys) + '" target="_blank" rel="noopener">' + esc(new URL(p.keys).hostname) + '</a>.' : '';
}
$('#ai-provider').addEventListener('change', fillProvider);
fillProvider();
$('#ai-show').addEventListener('click', () => {
  const k = $('#ai-key'), show = k.type === 'password';
  k.type = show ? 'text' : 'password';
  $('#ai-show').textContent = show ? 'Hide' : 'Show';
});
const top3 = D.individual.slice(0, 2).map(r => r.label.split(/\\s[-–(]/)[0]);
$('#ask-examples').innerHTML = ['Which one should I remove first?', top3.length === 2 ? 'What if I keep only ' + top3[0] + ' and ' + top3[1] + '?' : '', D.individual[0] ? 'Is ' + D.individual[0].label.split(/\\s[-–(]/)[0] + ' slow on every website?' : '']
  .filter(Boolean).map(q => '<button type="button" class="pill">' + esc(q) + '</button>').join('');
document.querySelectorAll('#ask-examples .pill').forEach(p => p.addEventListener('click', () => { $('#ai-q').value = p.textContent; $('#ai-q').focus(); }));
function showAsk() {
  const connected = !!AI.config?.connected;
  $('#ask-setup').hidden = connected; $('#ask-chat').hidden = !connected;
  if (connected) $('#ai-using').textContent = 'Using ' + AI.config.providerName + ', model ' + AI.config.model + '. Questions and these results are sent to that service.';
}
$('#ask-toggle').addEventListener('click', async () => {
  const box = $('#ask'), open = box.hidden;
  box.hidden = !open;
  $('#ask-toggle').setAttribute('aria-expanded', String(open));
  if (!open) return;
  if (!AI.config) { try { AI.config = await api('/api/ai/config'); } catch { AI.config = {connected: false}; } }
  showAsk();
  (AI.config.connected ? $('#ai-q') : $('#ai-provider')).focus();
});
$('#ai-cancel').addEventListener('click', () => { $('#ask').hidden = true; $('#ask-toggle').setAttribute('aria-expanded', 'false'); });
$('#ai-save').addEventListener('click', async () => {
  const btn = $('#ai-save');
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    AI.config = await api('/api/ai/config', {provider: $('#ai-provider').value, endpoint: $('#ai-endpoint').value, model: $('#ai-model').value, key: $('#ai-key').value});
    $('#ai-key').value = '';
    showAsk(); $('#ai-q').focus();
  } catch (err) {
    $('#ai-get').innerHTML = '<span class="error">' + esc(err.message) + '</span>';
  } finally {
    btn.disabled = false; btn.textContent = 'Check and connect';
  }
});
$('#ai-change').addEventListener('click', () => {
  const c = AI.config;
  if (c?.provider) { $('#ai-provider').value = c.provider; fillProvider(); $('#ai-endpoint').value = c.endpoint; $('#ai-model').value = c.model; }
  $('#ask-setup').hidden = false; $('#ask-chat').hidden = true;
  $('#ai-get').textContent = 'Paste the key again to switch.';
});
$('#ai-forget').addEventListener('click', async () => {
  if ($('#ai-forget').dataset.sure !== '1') { $('#ai-forget').dataset.sure = '1'; $('#ai-forget').textContent = 'Press again to remove the key'; return; }
  try { AI.config = await api('/api/ai/forget', {}); toast('The saved key was removed from this computer.'); } catch (err) { toast(err.message); }
  $('#ai-forget').dataset.sure = ''; $('#ai-forget').textContent = 'Remove saved key';
  showAsk();
});
function addMsg(who, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + who;
  el.textContent = text;
  $('#chat-log').appendChild(el);
  el.scrollIntoView({block: 'nearest'});
  return el;
}
function addActions(el, actions) {
  for (const a of actions.filter(a => a.type === 'run')) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn primary';
    b.textContent = 'Run this test: ' + a.extensionNames.join(', ') + (a.urls.length ? ' on ' + a.urls.join(', ') : '');
    b.addEventListener('click', () => askToRun({title: 'Run the test the assistant suggested?', extensionKeys: a.extensionKeys, names: a.extensionNames, urls: a.urls, rounds: a.rounds, followUp: true}));
    el.appendChild(document.createElement('br'));
    el.appendChild(b);
  }
}
async function send(question, reportId, hidden) {
  if (!hidden) addMsg('me', question);
  const wait = addMsg('ai', 'Thinking…');
  $('#ask-send').disabled = true;
  try {
    const r = await api('/api/ai/ask', {id: reportId, question, history: AI.history});
    wait.textContent = r.answer;
    addActions(wait, r.actions || []);
    AI.history.push({role: 'user', content: question}, {role: 'assistant', content: r.answer});
  } catch (err) {
    wait.textContent = err.message;
    wait.classList.add('error');
  } finally {
    $('#ask-send').disabled = false;
  }
}
function followUpAsk(_, newId) {
  $('#ask').hidden = false; $('#ask-toggle').setAttribute('aria-expanded', 'true'); showAsk();
  send('The test you suggested has finished. Explain the new results briefly, and compare them with what we discussed.', newId, true);
}
const ask = () => {
  const q = $('#ai-q').value.trim();
  if (!q) { $('#ai-q').focus(); return; }
  $('#ai-q').value = '';
  send(q, REPORT_ID);
};
$('#ask-send').addEventListener('click', ask);
$('#ai-q').addEventListener('keydown', e => { if (e.key === 'Enter') ask(); });

// ---- downloads ----
function markdown() {
  const L = [];
  const t = (rows, head) => ['| ' + head.join(' | ') + ' |', '|' + head.map((_, i) => i ? ' ---: ' : ' --- ').join('|') + '|', ...rows.map(r => '| ' + r.map(c => String(c).replace(/\\|/g, '\\\\|')).join(' | ') + ' |')].join('\\n');
  L.push('# ' + D.title, '', new Date(D.startedAt).toLocaleString('en-GB', {dateStyle: 'long', timeStyle: 'short'}) + ' · ' + D.urls.length + ' websites · ' + D.settings.rounds + ' rounds', '', '> ' + D.headline, '', '## Results by extension', '');
  const all = [...D.individual, ...(D.combined ? [D.combined] : [])];
  L.push(t(all.map(r => [r.label, r.verdictLabel, time(r.headline.mainThreadMs.value), time(r.headline.load.value), time(r.headline.lcp.value), time(r.headline.blockingMs.value), r.summary]), ['Extension', 'Verdict', 'Extra work', 'Slower to load', 'Main content later', 'Page frozen', 'In plain words']), '');
  L.push('## Per-website details', '');
  for (const r of all) {
    L.push('### ' + r.label + ' (' + r.verdictLabel + ')', '');
    L.push(t(r.perUrl.map(u => [u.url, ...KEYS.map(k => D.metrics[k].unit === 'ms' ? time(u.metrics[k].delta) : num(u.metrics[k].delta, D.metrics[k].unit, D.metrics[k].unit === 'MB' ? 1 : 0))]), ['Website', ...KEYS.map(k => short[k])]), '');
  }
  if (D.warnings.length) L.push('## Warnings', '', ...D.warnings.map(w => '- ' + w), '');
  L.push('## Test environment', '', '- Test browser: ' + (D.environment.browser || D.environment.chrome), '- Computer: ' + D.environment.platform + ', ' + D.environment.cpu, '- Websites: ' + D.urls.join(', '), '');
  L.push('---', '', 'Made by ' + D.brand.name + ' (' + D.brand.site + '). Free and open source: ' + D.brand.repo, '');
  return L.join('\\n');
}
function saveBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const base = 'extension-impact-report-' + D.startedAt.slice(0, 10);
const effectiveTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', async () => {
  $('#dl-menu').open = false;
  const kind = b.dataset.dl;
  if (kind === 'md') { saveBlob(base + '.md', new Blob([markdown()], {type: 'text/markdown'})); toast('Saved ' + base + '.md'); return; }
  if (!TOKEN) { window.print(); return; }
  toast('Preparing ' + base + '.' + kind + '…');
  try {
    const res = await fetch('/reports/' + REPORT_ID + '/report.' + kind + '?theme=' + effectiveTheme(), {headers: {'x-token': TOKEN}});
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not make the file (' + res.status + ').');
    saveBlob(base + '.' + kind, await res.blob());
    toast('Saved ' + base + '.' + kind);
  } catch (err) { toast(err.message); }
}));
document.addEventListener('click', e => { const m = $('#dl-menu'); if (m.open && !m.contains(e.target)) m.open = false; });

function update() { renderChips(); renderRows(); renderDetails(); }
update();
})();
</script>
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
