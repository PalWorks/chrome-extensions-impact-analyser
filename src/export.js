// Turns a saved report into PDF, PNG and Word files. PDF and PNG are made by opening the HTML
// report in the test browser (Chrome for Testing); Word is built directly from the results.

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, PageOrientation,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import {METRICS, THRESHOLDS} from './analyze.js';
import {BRAND} from './report.js';

async function launch() {
  const options = {headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false};
  try {
    return await puppeteer.launch(options);
  } catch (err) {
    // Same fallback as the test engine, for Linux systems that block Chrome's sandbox.
    if (process.platform === 'linux') return puppeteer.launch({...options, args: ['--no-sandbox']});
    throw err;
  }
}

async function withPage(htmlFile, fn) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlFile).href, {waitUntil: 'load'});
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
  }
}

// The report's own print styles add "Page X of Y" at the bottom of every page.
export function renderPdf(htmlFile) {
  return withPage(htmlFile, async page => {
    await page.emulateMediaType('print');
    return Buffer.from(await page.pdf({preferCSSPageSize: true, printBackground: true}));
  });
}

export function renderPng(htmlFile, theme = 'light') {
  return withPage(htmlFile, async page => {
    await page.setViewport({width: 1280, height: 900, deviceScaleFactor: 1});
    await page.evaluate(t => {
      document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light';
      document.documentElement.classList.add('snapshot');
    }, theme);
    return Buffer.from(await page.screenshot({fullPage: true, type: 'png'}));
  });
}

// ---- Word ----

const ms = v => {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const a = Math.abs(v);
  const sign = v > 0.5 ? '+' : v < -0.5 ? '−' : '';
  return a >= 1000 ? `${sign}${(a / 1000).toFixed(1)} s` : `${sign}${Math.round(a)} ms`;
};
const amount = (v, unit, digits = 0) => {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const n = Number(v.toFixed(digits));
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits})}${unit ? ` ${unit}` : ''}`;
};

const thin = {style: BorderStyle.SINGLE, size: 4, color: 'D9D9D2'};
const borders = {top: thin, bottom: thin, left: thin, right: thin};

function cell(text, {bold = false, header = false, right = false, shade = null} = {}) {
  return new TableCell({
    borders,
    margins: {top: 60, bottom: 60, left: 80, right: 80},
    shading: header ? {type: ShadingType.CLEAR, fill: 'EDEDE8', color: 'auto'} : shade ? {type: ShadingType.CLEAR, fill: shade, color: 'auto'} : undefined,
    children: [new Paragraph({alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({text: String(text), bold: bold || header, size: header ? 18 : 19})]})],
  });
}

function table(head, rows, numeric) {
  return new Table({
    width: {size: 100, type: WidthType.PERCENTAGE},
    rows: [
      new TableRow({tableHeader: true, children: head.map((h, i) => cell(h, {header: true, right: numeric(i)}))}),
      ...rows.map(r => new TableRow({cantSplit: true, children: r.cells.map((c, i) => cell(c, {right: numeric(i), bold: i === 0, shade: r.shade}))})),
    ],
  });
}

const p = (text, opts = {}) => new Paragraph({spacing: {after: 120}, ...opts, children: [new TextRun({text, ...(opts.run || {})})]});
const h = (text, level) => new Paragraph({heading: level, spacing: {before: 240, after: 120}, children: [new TextRun(text)]});

export async function renderDocx(data) {
  const a = data.analysis;
  const firefox = data.engine === 'firefox';
  const env = data.environment;
  const when = new Date(data.startedAt);
  const all = [...a.individual, ...(a.combined ? [a.combined] : [])];
  const head = ['Extension', 'Verdict', 'Extra work', 'Slower to load', 'Main content later', 'Page frozen', ...(firefox ? [] : ['Memory'])];
  const rows = all.map(r => ({
    shade: r.combined ? 'E6EEFB' : null,
    cells: [r.label, r.verdictLabel, ms(r.headline.mainThreadMs.value), ms(r.headline.load.value), ms(r.headline.lcp.value), ms(r.headline.blockingMs.value), ...(firefox ? [] : [r.headline.memoryMB.value >= 0.5 ? `${Math.round(r.headline.memoryMB.value)} MB` : 'n/a'])],
  }));
  const keys = ['mainThreadMs', 'load', 'lcp', 'tbt', 'fcp', 'pageHeapMB', 'requests', 'transferKB'].filter(k => !(firefox && ['pageHeapMB', 'transferKB'].includes(k)));

  const children = [
    new Paragraph({heading: HeadingLevel.TITLE, spacing: {after: 120}, children: [new TextRun('Chrome Firefox Browser Extensions Impact Analyser report')]}),
    p(`${when.toLocaleString('en-GB', {dateStyle: 'long', timeStyle: 'short'})} · ${data.source?.profileName ? `${data.source.browser || 'Browser'} profile "${data.source.profileName}"` : 'Chosen extension folders'} · ${data.urls.length} websites · ${data.settings.rounds} rounds · ${data.samples.length} page loads`, {run: {color: '61615C', size: 19}}),
    p(a.headline, {run: {size: 24}}),
    h('Results by extension', HeadingLevel.HEADING_1),
    table(head, rows, i => i >= 2),
    p('Numbers are the change versus no extensions. Negative numbers mean faster or less.', {run: {color: '61615C', size: 17}}),
    h('Per-website details', HeadingLevel.HEADING_1),
  ];
  for (const r of all) {
    children.push(h(`${r.label}: ${r.verdictLabel}`, HeadingLevel.HEADING_2), p(r.summary, {run: {color: '61615C', size: 19}}));
    children.push(table(
      ['Website', ...keys.map(k => METRICS[k].label)],
      r.perUrl.map(u => ({cells: [u.url, ...keys.map(k => (METRICS[k].unit === 'ms' ? ms(u.metrics[k].delta) : amount(u.metrics[k].delta, METRICS[k].unit, METRICS[k].unit === 'MB' ? 1 : 0)))]})),
      i => i >= 1,
    ));
  }
  if (a.warnings.length) {
    children.push(h('Warnings', HeadingLevel.HEADING_1), ...a.warnings.map(w => new Paragraph({bullet: {level: 0}, children: [new TextRun(w)]})));
  }
  const s = data.settings;
  children.push(
    h('How this was measured', HeadingLevel.HEADING_1),
    ...[
      `Every setup ran in its own clean copy of ${firefox ? 'Firefox' : 'Chrome for Testing'}, never in your own browser. Extensions ran as if freshly installed and signed out.`,
      `Each extension had ${s.warmupSeconds} seconds of first-run time; each website was loaded ${s.rounds} times per setup with an empty cache, in a random order each round.`,
      'Numbers are the median of the loads minus the median with no extensions, averaged across websites. A change counts only when it is bigger than normal run-to-run variation.',
      `Heavy means at least ${THRESHOLDS.heavy.cpu} ms extra work or ${THRESHOLDS.heavy.slowdown / 1000} s slower; Noticeable ${THRESHOLDS.moderate.cpu} ms or ${THRESHOLDS.moderate.slowdown} ms; Small ${THRESHOLDS.light.cpu} ms or ${THRESHOLDS.light.slowdown} ms.`,
    ].map(t => new Paragraph({bullet: {level: 0}, children: [new TextRun(t)]})),
    h('Test environment', HeadingLevel.HEADING_1),
    ...[
      `Test browser: ${env.browser || env.chrome || ''}`,
      `Computer: ${env.platform}, ${env.cpu} (${env.cpuCount} threads), ${env.memoryGB} GB memory`,
      `Websites: ${data.urls.join(', ')}`,
      `Extensions: ${data.extensions.map(e => `${e.name} ${e.version}`).join(', ')}`,
    ].map(t => new Paragraph({bullet: {level: 0}, children: [new TextRun(t)]})),
    p(`Made by ${BRAND.name} (palworks.ai). Free and open source: ${BRAND.repo}`, {spacing: {before: 360}, run: {color: '61615C', size: 18}}),
  );

  const doc = new Document({
    creator: 'Chrome Firefox Browser Extensions Impact Analyser',
    title: 'Extension impact report',
    styles: {default: {document: {run: {font: 'Calibri', size: 21}}}},
    sections: [{
      properties: {page: {size: {orientation: PageOrientation.LANDSCAPE}, margin: {top: 900, bottom: 900, left: 900, right: 900}}},
      footers: {
        default: new Footer({children: [new Paragraph({alignment: AlignmentType.CENTER, children: [
          new TextRun({children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 17, color: '666666'}),
        ]})]}),
      },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

export function exportFileName(data, ext) {
  return `extension-impact-report-${String(data.startedAt).slice(0, 10)}.${ext}`;
}

export function readRun(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
}
