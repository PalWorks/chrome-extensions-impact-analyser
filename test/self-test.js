#!/usr/bin/env node
// End-to-end check that the measurements work on this computer, with no internet needed.
// Pass --firefox to check the Firefox path instead of Chrome (the first run downloads Firefox).
// It serves a small test page locally and measures two test extensions:
//   busy-extension burns about 300 ms of CPU on every page, so it must come out as "Heavy".
//   idle-extension does nothing, so it must come out as "No clear impact".

import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {runBenchmark} from '../src/engine.js';
import {analyze} from '../src/analyze.js';
import {writeReport} from '../src/report.js';
import {renderPdf, renderPng, renderDocx} from '../src/export.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures');
const engine = process.argv.includes('--firefox') ? 'firefox' : 'chrome';

const PAGE = `<!doctype html><html><head><title>Self-test page</title></head><body>
<h1>Chrome Firefox Browser Extensions Impact Analyser self-test</h1>
${'<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>'.repeat(200)}
<script>let x = 0; for (let i = 0; i < 2e6; i++) x += i; document.title += ' ' + x;</script>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
  res.end(PAGE);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
const expect = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures++;
};

try {
  const data = await runBenchmark(
    {
      urls: [url],
      engine,
      extensions: [
        {name: 'Self-test: busy extension', path: path.join(fixtures, 'busy-extension')},
        {name: 'Self-test: idle extension', path: path.join(fixtures, 'idle-extension')},
      ],
      settings: {rounds: 5, warmupSeconds: 1, settleSeconds: 1, observeSeconds: 1, includeCombined: true},
    },
    {
      onProgress: e => {
        if (e.type === 'phase') console.log(`... ${e.message}`);
        if (e.type === 'log') console.log(`    ${e.level === 'warn' ? 'warning: ' : ''}${e.message}`);
      },
    },
  );
  data.analysis = analyze(data);
  const report = writeReport(data, path.join(os.tmpdir(), `extension-impact-self-test-${engine}`));

  const busy = data.analysis.individual.find(r => r.label.includes('busy'));
  const idle = data.analysis.individual.find(r => r.label.includes('idle'));
  const extra = busy?.headline.mainThreadMs.value ?? 0;
  console.log(`\nTest browser: ${data.environment.browser}`);
  expect(data.samples.every(s => s.ok), `all ${data.samples.length} page loads succeeded`);
  expect(busy?.verdict === 'heavy', `busy extension verdict is "Heavy impact" (got "${busy?.verdictLabel}")`);
  expect(extra > 250 && extra < 450, `busy extension adds about 300 ms of work (measured ${Math.round(extra)} ms)`);
  expect(idle?.verdict === 'none', `idle extension verdict is "No clear impact" (got "${idle?.verdictLabel}")`);
  expect(data.analysis.combined?.verdict === 'heavy', 'both together are "Heavy impact"');

  // The report's downloads: PDF and image come from the HTML report, Word from the data.
  const pdf = await renderPdf(report);
  expect(pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 10_000, `PDF download works (${Math.round(pdf.length / 1024)} KB)`);
  const png = await renderPng(report, 'dark');
  expect(png.subarray(1, 4).toString() === 'PNG' && png.length > 10_000, `image download works (${Math.round(png.length / 1024)} KB)`);
  const docx = await renderDocx(data);
  expect(docx.subarray(0, 2).toString() === 'PK' && docx.length > 5_000, `Word download works (${Math.round(docx.length / 1024)} KB)`);
  console.log(`\nReport: ${report}`);
} finally {
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
