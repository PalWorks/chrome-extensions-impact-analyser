#!/usr/bin/env node
// Checks that an app started by one of the start files is up and working: waits for the page,
// reads the app's secret token from it, asks the app what it found, then quits the app.
// Used by the "Start files" GitHub check; also handy by hand:
//   node test/start-check.js --port=4777 --expect="Google Chrome,Firefox"

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const port = Number(arg('port') || 4777);
const expect = (arg('expect') || '').split(',').map(s => s.trim()).filter(Boolean);
const waitMinutes = Number(arg('wait') || 12);
const base = `http://127.0.0.1:${port}`;

let failures = 0;
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures++;
};

// The first start installs everything, so the app can take several minutes to answer.
const started = Date.now();
let html = null;
while (Date.now() - started < waitMinutes * 60_000) {
  try {
    const res = await fetch(`${base}/`, {signal: AbortSignal.timeout(5000)});
    if (res.ok) {
      html = await res.text();
      break;
    }
  } catch {
    // Not up yet.
  }
  await new Promise(r => setTimeout(r, 5000));
}
check(!!html, `the app answered at ${base}/ after ${Math.round((Date.now() - started) / 1000)} s`);
if (!html) process.exit(1);

const token = html.match(/<meta name="token" content="([^"]+)"/)?.[1];
check(!!token && token !== '__TOKEN__', 'the page carries its secret token');
const init = await fetch(`${base}/api/init`, {headers: {'x-token': token}}).then(r => r.json());
check(init.browser?.ready === true, `the test browser is installed${init.browser?.path ? ` (${init.browser.path})` : ''}`);
const found = (init.browsers || []).map(b => `${b.name}: ${b.profiles.length} profile(s)`);
console.log(`      browsers found: ${found.join('; ') || 'none'}`);
for (const name of expect) {
  check((init.browsers || []).some(b => b.name === name && b.profiles.length > 0), `finds the ${name} profile`);
}
const denied = await fetch(`${base}/api/init`).then(r => r.status);
check(denied === 403, 'refuses requests without the token');

await fetch(`${base}/api/quit`, {method: 'POST', headers: {'x-token': token, 'content-type': 'application/json'}, body: '{}'}).catch(() => {});
await new Promise(r => setTimeout(r, 1500));
const stopped = await fetch(`${base}/`, {signal: AbortSignal.timeout(3000)}).then(() => false, () => true);
check(stopped, 'Quit stops the app');

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
