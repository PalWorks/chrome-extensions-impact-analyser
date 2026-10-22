// Chrome Firefox Browser Extensions Impact Analyser: the point-and-click front end. Plain JavaScript, no build step.

const TOKEN = document.querySelector('meta[name=token]').content;
const app = document.getElementById('app');

const S = {
  init: null,
  screen: 'loading',
  browsers: [], // Detected browsers plus any folder the user typed in.
  profile: null, // {browserName, engine, profilePath, name, account}
  extensions: null, // Extensions of the chosen profile.
  extensionsFor: '',
  extraExtensions: [], // Unpacked folders added by hand.
  selected: new Set(), // Selected extension folder paths.
  urls: [],
  rounds: 5,
  advanced: {},
  run: {phase: '', progress: null, logs: []},
  result: null,
  failure: '',
  notice: '',
  confirmCancel: false,
  stopped: false,
};

// ---------- helpers ----------

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {'x-token': TOKEN, 'content-type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}). Try again.`);
  return data;
}

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`extension-impact:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`extension-impact:${key}`, JSON.stringify(value));
    } catch {
      // Storage can be blocked; remembering choices is only a convenience.
    }
  },
};

// Same rules as the server: "example.com" becomes "https://example.com/".
function normalizeUrl(input) {
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

function aboutDuration(seconds) {
  if (seconds == null) return '';
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `about ${hours} h ${rest} min`;
}

function signedTime(ms) {
  if (ms == null || !Number.isFinite(ms)) return 'n/a';
  const abs = Math.abs(ms);
  const sign = ms > 0.5 ? '+' : ms < -0.5 ? '−' : '';
  return abs >= 1000 ? `${sign}${(abs / 1000).toFixed(1)} s` : `${sign}${Math.round(abs)} ms`;
}

function stepper(n) {
  const names = ['Profile', 'Extensions', 'Websites'];
  const items = names.map((t, i) => {
    const k = i + 1;
    const cls = k < n ? 'done' : k === n ? 'now' : '';
    return `<li class="${cls}"${k === n ? ' aria-current="step"' : ''}><span class="n">${k < n ? '✓' : k}</span><span class="t">${t}</span></li>`;
  });
  return `<ol class="steps" aria-label="Step ${n} of 3">${items.join('')}</ol>`;
}

// Small, friendly colour marks: one per browser, and one per profile from its name.
const BROWSER_COLOURS = {chrome: '#1a73e8', edge: '#0f7c8c', brave: '#d9480f', vivaldi: '#c92a2a', chromium: '#3b5bdb', firefox: '#e8590c'};
const AVATAR_COLOURS = ['#1f5fbf', '#6a3fd1', '#12857a', '#c2410c', '#b91c5c', '#4d7c0f', '#0e7490', '#7c3aed'];
const WINDOW_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/></svg>';
function browserColour(name) {
  const n = name.toLowerCase();
  const key = Object.keys(BROWSER_COLOURS).find(k => n.includes(k === 'chrome' ? 'chrome' : k));
  return BROWSER_COLOURS[n.includes('chromium') ? 'chromium' : key] || '#61615c';
}
function avatar(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const letters = String(name).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return `<span class="avatar" aria-hidden="true" style="background:${AVATAR_COLOURS[h % AVATAR_COLOURS.length]}">${esc(letters)}</span>`;
}
const HERO_ICONS = {
  safe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  plain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13"/></svg>',
  browsers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
};
const SEG_ICONS = {
  3: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  5: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
  9: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
};

function go(screen, {replace = false} = {}) {
  S.screen = screen;
  S.confirmCancel = false;
  const entry = {screen};
  if (replace) history.replaceState(entry, '');
  else history.pushState(entry, '');
  render();
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', e => {
  if (S.init?.state?.running || S.screen === 'run') {
    history.pushState({screen: 'run'}, '');
    return;
  }
  S.screen = e.state?.screen || 'profile';
  render();
});

const allExtensions = () => [...(S.extensions || []), ...S.extraExtensions];
const selectedExtensions = () => allExtensions().filter(e => S.selected.has(e.path));

// ---------- screens ----------

function renderProfile() {
  const groups = S.browsers;
  const current = S.profile?.profilePath;
  const list = groups
    .map(
      g => `<h2 class="group"><span class="gicon" style="background:${browserColour(g.name)}">${WINDOW_ICON}</span>${esc(g.name)} <span class="count">· ${g.profiles.length} profile${g.profiles.length === 1 ? '' : 's'}</span></h2><div class="choice-list">${g.profiles
        .map(
          p => `<label class="choice">
            <input type="radio" name="profile" value="${esc(p.path)}" data-browser="${esc(g.name)}" ${p.path === current ? 'checked' : ''}>
            ${avatar(p.name)}
            <span class="body"><span class="title">${esc(p.name)}</span>${p.account ? `<span class="sub">${esc(p.account)}</span>` : ''}</span>
          </label>`,
        )
        .join('')}</div>`,
    )
    .join('');
  const placeholder = {
    win32: 'C:\\Users\\you\\AppData\\Local\\Google\\Chrome\\User Data\\Default',
    darwin: '/Users/you/Library/Application Support/Google/Chrome/Default',
  }[S.init.platform] || '/home/you/.config/google-chrome/Default';

  return `<section class="hero" aria-label="About this tool">
    <h2>Is an extension slowing you down?</h2>
    <p>Pick a browser profile, and we measure every extension in it on real websites.</p>
    <ul>
      <li>${HERO_ICONS.safe}Your browser is never changed</li>
      <li>${HERO_ICONS.plain}Plain-language verdicts</li>
      <li>${HERO_ICONS.browsers}Chrome, Edge, Brave, Vivaldi, Firefox</li>
    </ul>
  </section>
  ${stepper(1)}
  <h1>Which browser profile do you want to check?</h1>
  <p class="lead">We copy its extensions into a separate test browser. Your own browser and its data are not changed.</p>
  ${groups.length ? list : '<div class="notice warn">No Chrome, Edge, Brave, Vivaldi or Firefox profile was found on this computer. Enter the profile folder below.</div>'}
  <details class="more" ${groups.length ? '' : 'open'}>
    <summary>Use a different folder</summary>
    <label class="field" for="custom-path">Profile folder</label>
    <div class="input-row">
      <input id="custom-path" type="text" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">
      <button type="button" class="btn" id="custom-find">Find</button>
    </div>
    <div class="hint" id="custom-hint">To find it, open <b>chrome://version</b> in the browser and copy the <b>Profile Path</b>. In Firefox, open <b>about:support</b> and copy the <b>Profile Folder</b>.</div>
  </details>
  <div class="actions"><button type="button" class="btn primary" id="next" ${current ? '' : 'disabled'}>Next: choose extensions</button></div>`;
}

function setProfile(group, p) {
  const engine = p.engine || group.engine || 'chrome';
  // Extensions added by hand only work in the browser they were made for.
  if (S.profile && S.profile.engine !== engine) S.extraExtensions = [];
  S.profile = {browserName: group.name, engine, profilePath: p.path, name: p.name, account: p.account};
}

function bindProfile() {
  app.querySelectorAll('input[name=profile]').forEach(input =>
    input.addEventListener('change', () => {
      const group = S.browsers.find(g => g.name === input.dataset.browser);
      const p = group.profiles.find(x => x.path === input.value);
      setProfile(group, p);
      store.set('profile', p.path);
      app.querySelector('#next').disabled = false;
    }),
  );
  const find = async () => {
    const input = app.querySelector('#custom-path');
    const hint = app.querySelector('#custom-hint');
    if (!input.value.trim()) {
      input.setAttribute('aria-invalid', 'true');
      hint.innerHTML = '<span class="error">Paste the folder path first.</span>';
      return;
    }
    hint.textContent = 'Looking…';
    try {
      const r = await api('/api/custom-profile', {path: input.value});
      if (r.error) {
        input.setAttribute('aria-invalid', 'true');
        hint.innerHTML = `<span class="error">${esc(r.error)}</span>`;
        return;
      }
      const group = r.profile
        ? {name: 'Other folder', engine: r.profile.engine, profiles: [r.profile]}
        : {name: `Folder: ${r.userDataDir}`, engine: r.engine, profiles: r.profiles};
      S.browsers = [...S.browsers.filter(g => g.name !== group.name), group];
      setProfile(group, group.profiles[0]);
      render();
    } catch (err) {
      hint.innerHTML = `<span class="error">${esc(err.message)}</span>`;
    }
  };
  app.querySelector('#custom-find').addEventListener('click', find);
  app.querySelector('#custom-path').addEventListener('keydown', e => e.key === 'Enter' && find());
  app.querySelector('#next').addEventListener('click', () => go('extensions'));
}

function extRow(e) {
  const icon = e.icon ? `<img src="${esc(e.icon)}" alt="" width="28" height="28">` : '<span class="noicon" aria-hidden="true"></span>';
  const sub = [e.version ? `Version ${e.version}` : '', e.note].filter(Boolean).join(' · ');
  return `<label class="choice" data-name="${esc(e.name.toLowerCase())}">
    <input type="checkbox" value="${esc(e.path)}" ${S.selected.has(e.path) ? 'checked' : ''} ${e.canTest ? '' : 'disabled'}>
    ${icon}
    <span class="body"><span class="title">${esc(e.name)}</span><span class="sub">${esc(sub)}</span></span>
  </label>`;
}

function renderExtensions() {
  const head = `${stepper(2)}<h1>Which extensions should we test?</h1>`;
  if (S.extensions === null) {
    return `${head}<p class="lead">Reading the extensions in “${esc(S.profile?.name)}”…</p><div class="card skeleton" aria-hidden="true"></div>`;
  }
  const on = allExtensions().filter(e => e.enabled);
  const off = allExtensions().filter(e => !e.enabled);
  const testable = allExtensions().filter(e => e.canTest);
  const count = selectedExtensions().length;
  const empty = allExtensions().length === 0;

  return `${head}
  <p class="lead">The ones turned on in “${esc(S.profile.name)}” are already ticked. Each is tested on its own, then all together.</p>
  ${S.notice ? `<div class="notice error">${esc(S.notice)}</div>` : ''}
  ${empty ? '<div class="notice info">This profile has no extensions. Go back and pick another profile, or add an extension folder below.</div>' : ''}
  ${testable.length > 1 ? `<div class="toolbar">
    ${testable.length > 8 ? '<input type="search" id="filter" placeholder="Search extensions" aria-label="Search extensions" autocomplete="off">' : ''}
    <button type="button" class="link" id="all">Select all on</button>
    <button type="button" class="link" id="none">Clear</button>
    <span class="count" id="count">${count} selected</span>
  </div>` : ''}
  ${on.length ? `<div class="choice-list" id="on-list">${on.map(extRow).join('')}</div>` : ''}
  ${off.length ? `<details class="more" ${on.length ? '' : 'open'}><summary>Turned off in your browser (${off.length})</summary><div class="choice-list">${off.map(extRow).join('')}</div></details>` : ''}
  <details class="more">
    <summary>Add an extension folder (for developers)</summary>
    <label class="field" for="ext-path">${S.profile?.engine === 'firefox' ? 'Folder that contains manifest.json, or an .xpi file' : 'Folder that contains manifest.json'}</label>
    <div class="input-row">
      <input id="ext-path" type="text" autocomplete="off" spellcheck="false">
      <button type="button" class="btn" id="ext-add">Add</button>
    </div>
    <div class="hint" id="ext-hint"></div>
  </details>
  <div class="actions">
    <button type="button" class="btn" id="back">Back</button>
    <button type="button" class="btn primary" id="next" ${count ? '' : 'disabled'}>Next: choose websites</button>
  </div>`;
}

async function loadExtensions() {
  const forPath = S.profile.profilePath;
  try {
    const r = await api('/api/extensions', {profilePath: forPath});
    if (S.profile?.profilePath !== forPath) return;
    S.extensions = r.extensions;
    S.extensionsFor = forPath;
    S.selected = new Set(r.extensions.filter(e => e.enabled && e.canTest).map(e => e.path));
    for (const e of S.extraExtensions) S.selected.add(e.path);
  } catch (err) {
    S.extensions = [];
    S.notice = err.message;
  }
  if (S.screen === 'extensions') render();
}

function bindExtensions() {
  if (S.extensions === null) return;
  const update = () => {
    const n = selectedExtensions().length;
    const count = app.querySelector('#count');
    if (count) count.textContent = `${n} selected`;
    app.querySelector('#next').disabled = n === 0;
  };
  app.querySelectorAll('input[type=checkbox]').forEach(box =>
    box.addEventListener('change', () => {
      if (box.checked) S.selected.add(box.value);
      else S.selected.delete(box.value);
      update();
    }),
  );
  app.querySelector('#all')?.addEventListener('click', () => {
    allExtensions().filter(e => e.enabled && e.canTest).forEach(e => S.selected.add(e.path));
    render();
  });
  app.querySelector('#none')?.addEventListener('click', () => {
    S.selected.clear();
    render();
  });
  app.querySelector('#filter')?.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    app.querySelectorAll('.choice').forEach(row => (row.hidden = q && !row.dataset.name.includes(q)));
  });
  const add = async () => {
    const input = app.querySelector('#ext-path');
    const hint = app.querySelector('#ext-hint');
    if (!input.value.trim()) {
      input.setAttribute('aria-invalid', 'true');
      hint.innerHTML = '<span class="error">Paste the folder path first.</span>';
      return;
    }
    try {
      const r = await api('/api/extension-folder', {path: input.value, engine: S.profile?.engine || 'chrome'});
      if (r.error) {
        input.setAttribute('aria-invalid', 'true');
        hint.innerHTML = `<span class="error">${esc(r.error)}</span>`;
        return;
      }
      const ext = {...r.extension, enabled: true, note: r.extension.note || 'Added by hand'};
      if (!allExtensions().some(e => e.path === ext.path)) S.extraExtensions.push(ext);
      if (ext.canTest) S.selected.add(ext.path);
      render();
    } catch (err) {
      hint.innerHTML = `<span class="error">${esc(err.message)}</span>`;
    }
  };
  app.querySelector('#ext-add').addEventListener('click', add);
  app.querySelector('#ext-path').addEventListener('keydown', e => e.key === 'Enter' && add());
  app.querySelector('#back').addEventListener('click', () => history.back());
  app.querySelector('#next').addEventListener('click', () => go('sites'));
}

const THOROUGHNESS = [
  {rounds: 3, title: 'Quick', sub: '3 loads per site'},
  {rounds: 5, title: 'Standard', sub: 'Recommended'},
  {rounds: 9, title: 'Thorough', sub: 'Most precise'},
];

function settingsForRun() {
  return {...S.advanced, rounds: S.rounds};
}

function renderSites() {
  const limits = S.init.defaults.limits;
  const a = S.advanced;
  const num = (key, label) => `<div><label class="field" for="adv-${key}">${label}</label>
    <input id="adv-${key}" type="number" inputmode="numeric" min="${limits[key][0]}" max="${limits[key][1]}" value="${esc(a[key])}" data-key="${key}"></div>`;
  const rows = S.urls
    .map((u, i) => `<li><span class="u">${esc(u)}</span><button type="button" class="link" data-remove="${i}" aria-label="Remove ${esc(u)}">Remove</button></li>`)
    .join('');

  return `${stepper(3)}
  <h1>Which websites should we test on?</h1>
  <p class="lead">Use sites you visit every day. Busy sites show differences best.</p>
  ${S.notice ? `<div class="notice warn">${esc(S.notice)}</div>` : ''}
  ${S.urls.length ? `<ul class="url-list">${rows}</ul>` : '<div class="notice info">Add at least one website to test on.</div>'}
  <label class="field" for="url-input">Add a website</label>
  <div class="input-row">
    <input id="url-input" type="url" inputmode="url" autocomplete="url" placeholder="example.com" spellcheck="false">
    <button type="button" class="btn" id="url-add">Add</button>
  </div>
  <div class="hint" id="url-hint"></div>

  <h2>How thorough?</h2>
  <div class="segmented" role="radiogroup" aria-label="How thorough">
    ${THOROUGHNESS.map(t => `<label><input type="radio" name="rounds" value="${t.rounds}" ${S.rounds === t.rounds ? 'checked' : ''}>${SEG_ICONS[t.rounds]}<span class="t">${t.title}</span><span class="s">${t.sub}</span></label>`).join('')}
  </div>
  <p class="hint" id="estimate"></p>

  <details class="more">
    <summary>Advanced settings</summary>
    <div class="grid2">
      ${num('warmupSeconds', 'Warm-up time per extension (seconds)')}
      ${num('settleSeconds', 'Quiet time after each browser start (seconds)')}
      ${num('observeSeconds', 'Watch each page after it loads (seconds)')}
      ${num('pageTimeoutSeconds', 'Give up on a slow page after (seconds)')}
    </div>
    <label class="check"><input type="checkbox" id="adv-combined" ${a.includeCombined ? 'checked' : ''}><span>Also test all chosen extensions switched on together</span></label>
    <label class="check"><input type="checkbox" id="adv-visible" ${a.headless ? '' : 'checked'}><span>Show the test browser windows<br><span class="small muted">Windows will open and close many times and may pop up over your work.</span></span></label>
  </details>

  <div class="notice info small">While the test runs you can keep using your computer, but heavy work like video calls makes the results less precise. Keep the computer awake.</div>
  <div class="actions">
    <button type="button" class="btn" id="back">Back</button>
    <button type="button" class="btn primary" id="start" ${S.urls.length ? '' : 'disabled'}>Start test</button>
  </div>`;
}

let estimateTimer;
function refreshEstimate() {
  clearTimeout(estimateTimer);
  estimateTimer = setTimeout(async () => {
    const el = app.querySelector('#estimate');
    if (!el) return;
    try {
      const {seconds} = await api('/api/estimate', {extensions: selectedExtensions().length, urls: S.urls.length || 1, settings: settingsForRun()});
      const n = selectedExtensions().length;
      el.textContent = `Testing ${n} extension${n === 1 ? '' : 's'} on ${S.urls.length} site${S.urls.length === 1 ? '' : 's'} takes ${aboutDuration(seconds)}.`;
      const start = app.querySelector('#start');
      if (start) start.textContent = `Start test (~${Math.max(1, Math.round(seconds / 60))} min)`;
    } catch {
      el.textContent = '';
    }
  }, 150);
}

function bindSites() {
  const input = app.querySelector('#url-input');
  const hint = app.querySelector('#url-hint');
  const add = () => {
    const url = normalizeUrl(input.value);
    if (!url) {
      input.setAttribute('aria-invalid', 'true');
      hint.innerHTML = '<span class="error">That does not look like a website address. Try something like example.com.</span>';
      return;
    }
    if (!S.urls.includes(url)) S.urls.push(url);
    store.set('urls', S.urls);
    S.notice = '';
    render();
    app.querySelector('#url-input').focus();
  };
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    const url = normalizeUrl(input.value);
    hint.textContent = input.value.trim() && url ? `Will test: ${url}` : '';
  });
  input.addEventListener('keydown', e => e.key === 'Enter' && add());
  app.querySelector('#url-add').addEventListener('click', add);
  app.querySelectorAll('[data-remove]').forEach(btn =>
    btn.addEventListener('click', () => {
      S.urls.splice(Number(btn.dataset.remove), 1);
      store.set('urls', S.urls);
      render();
    }),
  );
  app.querySelectorAll('input[name=rounds]').forEach(r =>
    r.addEventListener('change', () => {
      S.rounds = Number(r.value);
      store.set('rounds', S.rounds);
      refreshEstimate();
    }),
  );
  app.querySelectorAll('input[data-key]').forEach(field =>
    field.addEventListener('change', () => {
      const [min, max] = S.init.defaults.limits[field.dataset.key];
      const n = Math.min(max, Math.max(min, Math.round(Number(field.value))));
      S.advanced[field.dataset.key] = Number.isFinite(n) ? n : S.init.defaults.settings[field.dataset.key];
      field.value = S.advanced[field.dataset.key];
      refreshEstimate();
    }),
  );
  app.querySelector('#adv-combined').addEventListener('change', e => {
    S.advanced.includeCombined = e.target.checked;
    refreshEstimate();
  });
  app.querySelector('#adv-visible').addEventListener('change', e => (S.advanced.headless = !e.target.checked));
  app.querySelector('#back').addEventListener('click', () => history.back());
  app.querySelector('#start').addEventListener('click', startRun);
  refreshEstimate();
}

async function startRun() {
  const btn = app.querySelector('#start');
  btn.disabled = true;
  btn.textContent = 'Starting…';
  // Reset before the request: progress events can arrive before the request returns.
  S.run = {phase: 'Starting', progress: null, logs: []};
  try {
    await api('/api/run', {
      extensions: selectedExtensions().map(e => ({id: e.id, name: e.name, version: e.version, path: e.path})),
      urls: S.urls,
      engine: S.profile?.engine || 'chrome',
      settings: settingsForRun(),
      source: S.profile ? {browser: S.profile.browserName, profileName: S.profile.name, profilePath: S.profile.profilePath} : null,
    });
    S.notice = '';
    if (S.screen !== 'run') go('run');
  } catch (err) {
    S.notice = err.message;
    render();
  }
}

function renderRun() {
  return `<h1>Testing your extensions</h1>
  <p class="lead">You can keep using your computer. Leave this tab open; closing it does not stop the test.</p>
  <div class="card run-card">
    <span class="small muted"><span class="pulse" aria-hidden="true"></span>Testing in the background</span>
    <span class="big" id="pct">0%</span>
    <div class="progress" role="progressbar" aria-label="Test progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="bar"></div></div>
    <div class="progress-meta"><span id="phase"></span><span id="eta">Working out how long this takes…</span></div>
    <p id="current" class="small muted" style="margin:4px 0 0"></p>
  </div>
  <details class="more"><summary>Show activity log</summary><pre class="log" id="log"></pre></details>
  <div class="actions" id="run-actions">${runActions()}</div>`;
}

function runActions() {
  if (S.confirmCancel) {
    return `<div class="inline-confirm" style="width:100%">
      <span>Stop now? Nothing measured so far is kept.</span>
      <button type="button" class="btn" id="keep">Keep testing</button>
      <button type="button" class="btn danger" id="cancel-yes">Stop the test</button>
    </div>`;
  }
  return '<button type="button" class="btn" id="cancel">Cancel test</button>';
}

function bindRun() {
  const actions = app.querySelector('#run-actions');
  const rebind = () => {
    actions.innerHTML = runActions();
    actions.querySelector('#cancel')?.addEventListener('click', () => {
      S.confirmCancel = true;
      rebind();
    });
    actions.querySelector('#keep')?.addEventListener('click', () => {
      S.confirmCancel = false;
      rebind();
    });
    actions.querySelector('#cancel-yes')?.addEventListener('click', async e => {
      e.target.disabled = true;
      e.target.textContent = 'Stopping…';
      await api('/api/cancel', {}).catch(() => {});
    });
  };
  rebind();
  updateRun();
}

function updateRun() {
  if (S.screen !== 'run') return;
  const p = S.run.progress;
  const pct = p && p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  const bar = app.querySelector('#bar');
  if (!bar) return;
  bar.style.width = `${pct}%`;
  bar.parentElement.setAttribute('aria-valuenow', String(pct));
  app.querySelector('#pct').textContent = `${pct}%`;
  if (p?.etaSeconds != null) app.querySelector('#eta').textContent = `${aboutDuration(p.etaSeconds).replace(/^./, c => c.toUpperCase())} left`;
  app.querySelector('#phase').textContent = S.run.phase || '';
  app.querySelector('#current').textContent = p?.message || '';
  const log = app.querySelector('#log');
  log.innerHTML = S.run.logs.map(l => `<span class="${l.level === 'warn' ? 'warn' : ''}">${esc(l.message)}</span>`).join('\n') || 'Nothing to report yet.';
}

function figures(r) {
  const h = r.headline;
  const mem = h.memoryMB.value >= 0.5 ? `${Math.round(h.memoryMB.value)} MB` : 'n/a';
  return `<div class="figures">
    <span>Extra work per page <b>${signedTime(h.mainThreadMs.value)}</b></span>
    <span>Slower to load <b>${h.load.significant ? signedTime(h.load.value) : 'no change'}</b></span>
    ${S.result?.engine === 'firefox' ? '' : `<span>Memory <b>${mem}</b></span>`}
  </div>`;
}

function resultCard(r) {
  return `<div class="card result vb-${esc(r.verdict)}${r.combined ? ' combined' : ''}">
    <span class="name">${esc(r.label)}</span>
    <span class="badge v-${esc(r.verdict)}">${esc(r.verdictLabel)}</span>
    <span class="summary">${esc(r.summary)}</span>
    ${figures(r)}
  </div>`;
}

function renderDone() {
  const r = S.result;
  const anyHeavy = r.individual.some(x => x.verdict === 'heavy' || x.verdict === 'moderate');
  return `<h1>Results</h1>
  <div class="card answer">${esc(r.headline)}</div>
  ${r.individual.map(resultCard).join('')}
  ${r.combined ? `<h2>All together</h2>${resultCard({...r.combined, combined: true})}` : ''}
  ${r.warnings.length ? `<div class="notice warn small"><b>Worth knowing</b><br>${r.warnings.map(esc).join('<br>')}</div>` : ''}
  ${anyHeavy ? `<div class="notice info small"><b>Next step:</b> remove heavy extensions you rarely use. ${r.engine === 'firefox'
    ? 'For ones you need, open <b>about:addons</b>, choose the add-on, open <b>Permissions</b> and turn off access to all websites, so it runs only where you allow it.'
    : 'For ones you need, open the extension\'s details in your browser and set <b>Site access</b> to <b>On click</b>, so it stops running on every page.'}</div>` : ''}
  <div class="actions three">
    <button type="button" class="btn" id="folder">Show files</button>
    <button type="button" class="btn" id="again">Test again</button>
    <a class="btn primary" href="${esc(r.reportUrl)}" target="_blank" rel="noopener">Open full report</a>
  </div>`;
}

function bindDone() {
  app.querySelector('#folder').addEventListener('click', () => api('/api/open-folder', {id: S.result.id}).catch(() => {}));
  app.querySelector('#again').addEventListener('click', () => go('sites'));
}

function renderFailed() {
  return `<h1>The test could not finish</h1>
  <div class="notice error">${esc(S.failure)}</div>
  <p class="muted">Check your internet connection and that the websites open normally, then try again. The activity log below may say more.</p>
  <details class="more"><summary>Show activity log</summary><pre class="log">${S.run.logs.map(l => esc(l.message)).join('\n') || 'Nothing was logged.'}</pre></details>
  <div class="actions"><button type="button" class="btn primary" id="retry">Back to websites</button></div>`;
}

// Past reports as a table: newest first by default, sortable by date, size and findings.
const PAST_SORT = {key: 'date', dir: -1};
const FOLDER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>';
const PAST_ARROWS = '<svg class="arrows" viewBox="0 0 16 16" aria-hidden="true"><path class="up" d="M8 2.5 12 7H4z"/><path class="down" d="M8 13.5 4 9h8z"/></svg>';
const severity = r => (r.verdicts?.heavy || 0) * 1000 + (r.verdicts?.moderate || 0) * 30 + (r.verdicts?.light || 0);

function findings(r) {
  const v = r.verdicts || {};
  const parts = [['heavy', 'Heavy'], ['moderate', 'Noticeable'], ['light', 'Small'], ['faster', 'Faster']]
    .filter(([k]) => v[k])
    .map(([k, label]) => `<span class="badge v-${k}">${v[k]} ${label}</span>`);
  return parts.length ? parts.join(' ') : '<span class="badge v-none">No clear impact</span>';
}

function renderPast() {
  const reports = [...S.init.reports].sort((a, b) => {
    const val = {date: x => String(x.startedAt), extensions: x => x.extensions, findings: severity}[PAST_SORT.key];
    const x = val(a), y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * PAST_SORT.dir;
  });
  const head = (key, label, cls = '') => `<th scope="col" class="${cls}" aria-sort="${PAST_SORT.key === key ? (PAST_SORT.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sort" data-sort="${key}">${cls === 'num' ? PAST_ARROWS : ''}<span>${label}</span>${cls === 'num' ? '' : PAST_ARROWS}</button></th>`;
  const rows = reports
    .map(r => {
      const d = new Date(r.startedAt);
      return `<tr>
        <td data-label="Tested"><b>${esc(d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}))}</b><span class="sub">${esc(d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}))}</span></td>
        <td data-label="Profile" class="prof"><b>${esc(r.profile || 'Extension folders')}</b>${r.browser ? `<span class="sub">${esc(r.browser)}</span>` : ''}</td>
        <td data-label="Scope" class="scope">${r.extensions} extension${r.extensions === 1 ? '' : 's'}<span class="sub">${r.sites} website${r.sites === 1 ? '' : 's'}${r.rounds ? `, ${r.rounds} rounds` : ''}</span></td>
        <td data-label="Findings" class="find"><div class="badges">${findings(r)}</div><span class="sub clamp" title="${esc(r.headline)}">${esc(r.headline)}</span></td>
        <td class="act"><a class="btn primary small-btn" href="/reports/${esc(r.id)}/report.html" target="_blank" rel="noopener">Open report</a>
          <button type="button" class="icon" data-folder="${esc(r.id)}" aria-label="Show files" title="Show files">${FOLDER_ICON}<span class="lbl" aria-hidden="true">Files</span></button></td>
      </tr>`;
    })
    .join('');
  return `<h1>Past reports</h1>
  <p class="lead">${reports.length ? `${reports.length} report${reports.length === 1 ? '' : 's'} on this computer. Open one to sort, filter, re-test or download it.` : ''}</p>
  ${reports.length
    ? `<div class="card table-card"><table class="past">
        <thead><tr>${head('date', 'Tested')}<th scope="col">Profile</th>${head('extensions', 'Scope')}${head('findings', 'Findings')}<th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
    : '<div class="notice info">No reports yet. Run your first test and its report appears here.</div>'}
  <div class="actions"><button type="button" class="btn primary" id="new">${reports.length ? 'Start a new test' : 'Run your first test'}</button></div>`;
}

function bindPast() {
  app.querySelector('#new').addEventListener('click', () => go(S.profile ? 'extensions' : 'profile'));
  app.querySelectorAll('[data-folder]').forEach(b => b.addEventListener('click', () => api('/api/open-folder', {id: b.dataset.folder}).catch(() => {})));
  app.querySelectorAll('.past .sort').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.sort;
    PAST_SORT.dir = PAST_SORT.key === key ? -PAST_SORT.dir : -1;
    PAST_SORT.key = key;
    app.innerHTML = renderPast();
    bindPast();
    app.querySelector(`.past .sort[data-sort="${key}"]`)?.focus();
  }));
}

function renderBlocked() {
  return `<h1>One more step</h1><div class="notice warn">${esc(S.init.browser.message)}</div>`;
}

function renderStopped() {
  return `<h1>Chrome Firefox Browser Extensions Impact Analyser has stopped</h1><p class="lead">You can close this tab. To use it again, run the start file.</p>`;
}

function render() {
  if (S.stopped) {
    app.innerHTML = renderStopped();
    return;
  }
  if (!S.init) return;
  if (!S.init.browser.ready) {
    app.innerHTML = renderBlocked();
    return;
  }
  const past = document.getElementById('past-link');
  past.classList.toggle('on', S.screen === 'past');
  if (S.screen === 'past') past.setAttribute('aria-current', 'page');
  else past.removeAttribute('aria-current');
  switch (S.screen) {
    case 'profile':
      app.innerHTML = renderProfile();
      bindProfile();
      break;
    case 'extensions':
      if (!S.profile) return go('profile', {replace: true});
      if (S.extensionsFor !== S.profile.profilePath) {
        S.extensions = null;
        S.extensionsFor = S.profile.profilePath;
        S.notice = '';
        loadExtensions();
      }
      app.innerHTML = renderExtensions();
      bindExtensions();
      break;
    case 'sites':
      if (selectedExtensions().length === 0) return go(S.profile ? 'extensions' : 'profile', {replace: true});
      app.innerHTML = renderSites();
      bindSites();
      break;
    case 'run':
      app.innerHTML = renderRun();
      bindRun();
      break;
    case 'done':
      if (!S.result) return go('profile', {replace: true});
      app.innerHTML = renderDone();
      bindDone();
      break;
    case 'failed':
      app.innerHTML = renderFailed();
      app.querySelector('#retry').addEventListener('click', () => go(selectedExtensions().length ? 'sites' : 'profile'));
      break;
    case 'past':
      app.innerHTML = renderPast();
      bindPast();
      break;
    default:
      app.innerHTML = '<div class="card skeleton" aria-hidden="true"></div>';
  }
}

// ---------- live updates from the server ----------

function connectEvents() {
  const events = new EventSource(`/api/events?token=${encodeURIComponent(TOKEN)}`);
  events.addEventListener('state', e => {
    const st = JSON.parse(e.data);
    if (S.init) S.init.state = st;
    if (st.running) {
      S.run.phase = st.phase;
      S.run.progress = st.progress;
      S.run.logs = st.logs;
      if (S.screen !== 'run') go('run', {replace: true});
      else updateRun();
    }
  });
  events.addEventListener('phase', e => {
    S.run.phase = JSON.parse(e.data).message;
    updateRun();
  });
  events.addEventListener('progress', e => {
    S.run.progress = JSON.parse(e.data);
    updateRun();
  });
  events.addEventListener('log', e => {
    const l = JSON.parse(e.data);
    S.run.logs.push(l);
    updateRun();
  });
  events.addEventListener('done', e => {
    S.result = JSON.parse(e.data);
    api('/api/init').then(d => (S.init.reports = d.reports)).catch(() => {});
    go('done', {replace: true});
  });
  events.addEventListener('failed', e => {
    S.failure = JSON.parse(e.data).message;
    go('failed', {replace: true});
  });
  events.addEventListener('cancelled', e => {
    S.notice = JSON.parse(e.data).message;
    go(selectedExtensions().length ? 'sites' : 'profile', {replace: true});
  });
}

// ---------- start ----------

// Colour theme: Auto follows the device. Shared with the reports, which use the same key.
function applyTheme(mode) {
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === mode)));
  try {
    if (mode === 'auto') localStorage.removeItem('eia-theme');
    else localStorage.setItem('eia-theme', mode);
  } catch {
    // Remembering the theme is only a convenience.
  }
}
applyTheme(document.documentElement.dataset.theme || 'auto');
// A shadow under the header once the page has scrolled, so it reads as floating.
const appbar = document.querySelector('.appbar');
const onScroll = () => appbar.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, {passive: true});
onScroll();
document.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themeSet)));

document.getElementById('past-link').addEventListener('click', async () => {
  if (S.screen === 'run') return;
  try {
    S.init.reports = (await api('/api/init')).reports;
  } catch {
    // Show what we already have.
  }
  go('past');
});

const quit = document.getElementById('quit');
quit.addEventListener('click', async () => {
  if (S.init?.state?.running && quit.dataset.armed !== '1') {
    quit.dataset.armed = '1';
    quit.textContent = 'A test is running. Click again to stop it and quit';
    return;
  }
  await api('/api/quit', {}).catch(() => {});
  S.stopped = true;
  render();
});

(async () => {
  try {
    S.init = await api('/api/init');
  } catch (err) {
    app.innerHTML = `<div class="notice error">${esc(err.message)}</div>`;
    return;
  }
  document.getElementById('version').textContent = `Version ${S.init.version}`;
  S.browsers = S.init.browsers;
  S.advanced = {...S.init.defaults.settings};
  delete S.advanced.rounds;
  S.urls = store.get('urls', S.init.defaults.urls).map(normalizeUrl).filter(Boolean);
  S.rounds = THOROUGHNESS.some(t => t.rounds === store.get('rounds', 5)) ? store.get('rounds', 5) : 5;

  // Pre-select the last used profile, or the only one if there is just one.
  const all = S.browsers.flatMap(g => g.profiles.map(p => ({g, p})));
  const remembered = all.find(x => x.p.path === store.get('profile', '')) || (all.length === 1 ? all[0] : null);
  if (remembered) setProfile(remembered.g, remembered.p);

  // Reports link here with #past to open the list of past reports.
  const wantPast = location.hash === '#past';
  if (wantPast) history.replaceState(null, '', '/');
  go(S.init.state.running ? 'run' : wantPast ? 'past' : 'profile', {replace: true});
  if (S.init.state.running) {
    S.run = {phase: S.init.state.phase, progress: S.init.state.progress, logs: S.init.state.logs};
    updateRun();
  }
  connectEvents();
})();
