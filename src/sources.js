// Finds browser profiles on this computer and reads the extensions installed in them.
// Everything here only reads files. Nothing in the user's browser folders is changed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const home = os.homedir();
const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
const macSupport = path.join(home, 'Library', 'Application Support');
const linuxConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
const roamingAppData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

// Where each Chromium-based browser keeps its "User Data" folder, per operating system.
const BROWSER_LOCATIONS = {
  win32: [
    ['Google Chrome', path.join(localAppData, 'Google', 'Chrome', 'User Data')],
    ['Google Chrome Beta', path.join(localAppData, 'Google', 'Chrome Beta', 'User Data')],
    ['Google Chrome Dev', path.join(localAppData, 'Google', 'Chrome Dev', 'User Data')],
    ['Google Chrome Canary', path.join(localAppData, 'Google', 'Chrome SxS', 'User Data')],
    ['Chromium', path.join(localAppData, 'Chromium', 'User Data')],
    ['Microsoft Edge', path.join(localAppData, 'Microsoft', 'Edge', 'User Data')],
    ['Brave', path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data')],
    ['Vivaldi', path.join(localAppData, 'Vivaldi', 'User Data')],
  ],
  darwin: [
    ['Google Chrome', path.join(macSupport, 'Google', 'Chrome')],
    ['Google Chrome Beta', path.join(macSupport, 'Google', 'Chrome Beta')],
    ['Google Chrome Dev', path.join(macSupport, 'Google', 'Chrome Dev')],
    ['Google Chrome Canary', path.join(macSupport, 'Google', 'Chrome Canary')],
    ['Chromium', path.join(macSupport, 'Chromium')],
    ['Microsoft Edge', path.join(macSupport, 'Microsoft Edge')],
    ['Brave', path.join(macSupport, 'BraveSoftware', 'Brave-Browser')],
    ['Vivaldi', path.join(macSupport, 'Vivaldi')],
  ],
  linux: [
    ['Google Chrome', path.join(linuxConfig, 'google-chrome')],
    ['Google Chrome Beta', path.join(linuxConfig, 'google-chrome-beta')],
    ['Google Chrome Dev', path.join(linuxConfig, 'google-chrome-unstable')],
    ['Google Chrome (Flatpak)', path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome')],
    ['Chromium', path.join(linuxConfig, 'chromium')],
    ['Chromium (Snap)', path.join(home, 'snap', 'chromium', 'common', 'chromium')],
    ['Chromium (Flatpak)', path.join(home, '.var', 'app', 'org.chromium.Chromium', 'config', 'chromium')],
    ['Microsoft Edge', path.join(linuxConfig, 'microsoft-edge')],
    ['Brave', path.join(linuxConfig, 'BraveSoftware', 'Brave-Browser')],
    ['Vivaldi', path.join(linuxConfig, 'vivaldi')],
  ],
};

// Where Firefox keeps profiles.ini, per operating system. Firefox Developer Edition and
// Nightly share these folders with regular Firefox.
const FIREFOX_LOCATIONS = {
  win32: [['Firefox', path.join(roamingAppData, 'Mozilla', 'Firefox')]],
  darwin: [['Firefox', path.join(macSupport, 'Firefox')]],
  linux: [
    ['Firefox', path.join(home, '.mozilla', 'firefox')],
    ['Firefox', path.join(linuxConfig, 'mozilla', 'firefox')],
    ['Firefox (Snap)', path.join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox')],
    ['Firefox (Flatpak)', path.join(home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox')],
  ],
};

// Extension install locations that are part of the browser itself, not added by the user.
const COMPONENT_LOCATIONS = new Set([5, 10]);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// A Firefox profile folder has extensions.json or prefs.js; a Chromium one has neither.
export function isFirefoxProfile(dir) {
  return isFile(path.join(dir, 'prefs.js')) || isFile(path.join(dir, 'extensions.json'));
}

// Reads profiles.ini into a list of {section, key: value} objects.
function readIni(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const sections = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = line.match(/^\[(.+)\]$/);
    if (header) sections.push((current = {section: header[1]}));
    else if (current && line.includes('=')) {
      const i = line.indexOf('=');
      current[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return sections;
}

// Lists the profiles named in a Firefox profiles.ini.
export function listFirefoxProfiles(rootDir) {
  const profiles = [];
  const sections = readIni(path.join(rootDir, 'profiles.ini'));
  // [Install...] sections name the profile each Firefox installation really opens.
  const inUse = new Set(sections.filter(s => s.section.startsWith('Install') && s.Default).map(s => s.Default));
  for (const s of sections) {
    if (!/^Profile\d+$/.test(s.section) || !s.Path) continue;
    const full = s.IsRelative === '0' ? s.Path : path.join(rootDir, ...s.Path.split('/'));
    if (!isDir(full)) continue;
    const isDefault = inUse.size ? inUse.has(s.Path) : s.Default === '1';
    profiles.push({dir: path.basename(full), path: full, name: s.Name || path.basename(full), account: '', engine: 'firefox', isDefault});
  }
  // The profile Firefox opens by default first.
  return profiles
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
    .map(({isDefault, ...p}) => ({...p, account: isDefault ? 'The profile Firefox opens' : ''}));
}

// Minimal reader for .xpi files (zip archives), so Firefox add-ons can be listed with their
// names and icons without unpacking them. Returns a function: name -> Buffer or null.
function zipReader(file) {
  let data;
  try {
    data = fs.readFileSync(file);
  } catch {
    return () => null;
  }
  const entries = new Map();
  // The end-of-central-directory record sits in the last 64 KB.
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) !== 0x06054b50) continue;
    let p = data.readUInt32LE(i + 16);
    const count = data.readUInt16LE(i + 10);
    for (let n = 0; n < count && p + 46 <= data.length && data.readUInt32LE(p) === 0x02014b50; n++) {
      const nameLen = data.readUInt16LE(p + 28);
      const name = data.toString('utf8', p + 46, p + 46 + nameLen);
      entries.set(name, {method: data.readUInt16LE(p + 10), size: data.readUInt32LE(p + 20), offset: data.readUInt32LE(p + 42)});
      p += 46 + nameLen + data.readUInt16LE(p + 30) + data.readUInt16LE(p + 32);
    }
    break;
  }
  return name => {
    const e = entries.get(String(name).replace(/^\/+/, ''));
    if (!e || e.size > 4 * 1024 * 1024) return null;
    try {
      const start = e.offset + 30 + data.readUInt16LE(e.offset + 26) + data.readUInt16LE(e.offset + 28);
      const raw = data.subarray(start, start + e.size);
      if (e.method === 0) return Buffer.from(raw);
      if (e.method === 8) return zlib.inflateRawSync(raw);
    } catch {
      // A damaged entry is treated as missing.
    }
    return null;
  };
}

function folderReader(dir) {
  return name => {
    try {
      return fs.readFileSync(path.join(dir, String(name).replace(/^\/+/, '')));
    } catch {
      return null;
    }
  };
}

function parseJson(buffer) {
  if (!buffer) return null;
  try {
    return JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

// Lists the profiles inside one "User Data" folder, using the browser's own profile list.
export function listProfiles(userDataDir) {
  const localState = readJson(path.join(userDataDir, 'Local State'));
  const cache = localState?.profile?.info_cache || {};
  const profiles = [];
  for (const [dir, info] of Object.entries(cache)) {
    if (!isDir(path.join(userDataDir, dir))) continue;
    profiles.push({
      dir,
      path: path.join(userDataDir, dir),
      name: info.name || dir,
      account: info.user_name || '',
      engine: 'chrome',
    });
  }
  // Fall back to scanning the folder when "Local State" is missing or unreadable.
  if (profiles.length === 0 && isDir(userDataDir)) {
    for (const dir of fs.readdirSync(userDataDir)) {
      if (dir === 'Default' || /^Profile \d+$/.test(dir)) {
        profiles.push({dir, path: path.join(userDataDir, dir), name: dir, account: '', engine: 'chrome'});
      }
    }
  }
  const order = d => (d === 'Default' ? -1 : Number(d.replace(/\D/g, '')) || 0);
  return profiles.sort((a, b) => order(a.dir) - order(b.dir));
}

// Finds every supported browser on this computer and its profiles.
export function detectBrowsers() {
  const locations = BROWSER_LOCATIONS[process.platform] || BROWSER_LOCATIONS.linux;
  const found = [];
  for (const [name, userDataDir] of locations) {
    if (!isDir(userDataDir)) continue;
    const profiles = listProfiles(userDataDir);
    if (profiles.length > 0) found.push({name, engine: 'chrome', userDataDir, profiles});
  }
  const seen = new Set();
  for (const [name, rootDir] of FIREFOX_LOCATIONS[process.platform] || FIREFOX_LOCATIONS.linux) {
    const profiles = listFirefoxProfiles(rootDir).filter(p => !seen.has(p.path));
    profiles.forEach(p => seen.add(p.path));
    if (profiles.length === 0) continue;
    // Two Firefox folders on one computer get distinct headings.
    const taken = found.some(g => g.name === name);
    found.push({name: taken ? `${name} (${rootDir})` : name, engine: 'firefox', userDataDir: rootDir, profiles});
  }
  return found;
}

// Accepts either a profile folder or a "User Data" folder typed in by the user.
export function resolveCustomFolder(input) {
  const p = path.resolve(String(input || '').trim().replace(/^~(?=$|[\\/])/, home));
  if (!isDir(p)) return {error: 'That folder does not exist. Check the path and try again.'};
  if (isFirefoxProfile(p)) {
    return {profile: {dir: path.basename(p), path: p, name: path.basename(p), account: '', engine: 'firefox'}};
  }
  if (isDir(path.join(p, 'Extensions')) || fs.existsSync(path.join(p, 'Preferences'))) {
    return {profile: {dir: path.basename(p), path: p, name: path.basename(p), account: '', engine: 'chrome'}};
  }
  const firefoxProfiles = listFirefoxProfiles(p);
  if (firefoxProfiles.length > 0) return {userDataDir: p, engine: 'firefox', profiles: firefoxProfiles};
  const profiles = listProfiles(p);
  if (profiles.length > 0) return {userDataDir: p, engine: 'chrome', profiles};
  if (fs.existsSync(path.join(p, 'manifest.json'))) {
    return {error: 'This is an extension folder, not a browser profile. Add it in the next step instead.'};
  }
  return {error: 'No browser profile was found in that folder. Pick the folder that contains "Extensions" and "Preferences" (Chrome and similar) or "prefs.js" (Firefox).'};
}

// Turns "__MSG_appName__" style placeholders into the real text from the extension's _locales.
function localize(text, read, manifest) {
  if (typeof text !== 'string') return '';
  const match = text.match(/^__MSG_(.+)__$/);
  if (!match) return text;
  const key = match[1].toLowerCase();
  const locales = [manifest.default_locale, 'en', 'en_US', 'en_GB'].filter(Boolean);
  for (const locale of locales) {
    const messages = parseJson(read(`_locales/${locale}/messages.json`));
    if (!messages) continue;
    for (const [k, v] of Object.entries(messages)) {
      if (k.toLowerCase() === key && v?.message) return v.message;
    }
  }
  return text;
}

const ICON_TYPES = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp'};

// Picks a small icon from the manifest and returns it as a data URI the UI can show.
function readIcon(read, manifest) {
  const sets = [manifest.icons, manifest.action?.default_icon, manifest.browser_action?.default_icon];
  for (const set of sets) {
    if (!set) continue;
    let file = typeof set === 'string' ? set : null;
    if (!file) {
      const sizes = Object.keys(set).map(Number).filter(n => n > 0).sort((a, b) => a - b);
      const size = sizes.find(n => n >= 32) ?? sizes[sizes.length - 1];
      file = set[String(size)];
    }
    if (!file) continue;
    const type = ICON_TYPES[path.extname(String(file)).toLowerCase()];
    // Missing icon files are common and harmless.
    const data = read(file);
    if (type && data && data.length < 256 * 1024) return `data:${type};base64,${data.toString('base64')}`;
  }
  return '';
}

// True for an unpacked extension folder, or for a Firefox .xpi file.
export function isExtensionSource(p) {
  return isFile(path.join(p, 'manifest.json')) || (/\.xpi$/i.test(p) && isFile(p));
}

// Reads one extension (an unpacked folder, or a Firefox .xpi file) and describes it for the UI
// and the test engine. extra.engine says which browser it will be tested in.
export function describeExtensionFolder(source, extra = {}) {
  const xpi = /\.xpi$/i.test(source) && isFile(source);
  const read = xpi ? zipReader(source) : folderReader(source);
  const manifest = parseJson(read('manifest.json'));
  if (!manifest) return null;
  if (manifest.theme || manifest.app) return null; // Themes and apps do not run on web pages.
  const engine = extra.engine || (xpi ? 'firefox' : 'chrome');
  const mv = Number(manifest.manifest_version) || 0;
  const name = localize(manifest.name, read, manifest) || extra.name || extra.id || path.basename(source);
  const info = {
    id: extra.id || manifest.browser_specific_settings?.gecko?.id || manifest.applications?.gecko?.id || '',
    name,
    version: String(manifest.version || ''),
    description: localize(manifest.description, read, manifest),
    manifestVersion: mv,
    path: source,
    engine,
    icon: readIcon(read, manifest),
    enabled: extra.enabled ?? true,
    canTest: true,
    note: '',
  };
  if (engine === 'chrome' && mv < 3) {
    info.canTest = false;
    info.note = 'Uses Manifest V2, which current Chrome can no longer run.';
  }
  return info;
}

// Returns the newest version folder inside Extensions/<id>/.
function newestVersionDir(idDir) {
  let best = null;
  for (const v of fs.readdirSync(idDir)) {
    const full = path.join(idDir, v);
    if (!fs.existsSync(path.join(full, 'manifest.json'))) continue;
    const mtime = fs.statSync(full).mtimeMs;
    if (!best || mtime > best.mtime) best = {full, mtime};
  }
  return best?.full || null;
}

function isEnabled(settings) {
  if (!settings) return null;
  if (settings.state === 0) return false;
  const reasons = settings.disable_reasons;
  if (Array.isArray(reasons)) return reasons.length === 0;
  if (typeof reasons === 'number') return reasons === 0;
  return true;
}

// Lists the add-ons in a Firefox profile from its extensions.json, leaving out the ones
// built into Firefox itself.
function listFirefoxExtensions(profilePath) {
  const addons = readJson(path.join(profilePath, 'extensions.json'))?.addons || [];
  const results = [];
  const builtIn = /^app-(builtin|system)/;
  // Firefox also updates some built-in add-ons into the profile; those are not the user's.
  const builtInIds = new Set(addons.filter(a => builtIn.test(a.location || '')).map(a => a.id));
  for (const a of addons) {
    if (a.type !== 'extension' || !a.id || builtInIds.has(a.id)) continue;
    if (builtIn.test(a.location || '') || a.location === 'temporary-addon') continue;
    let source = a.path && (isFile(a.path) || isDir(a.path)) ? a.path : path.join(profilePath, 'extensions', `${a.id}.xpi`);
    if (!isExtensionSource(source)) continue;
    const enabled = !a.userDisabled && !a.appDisabled && !a.softDisabled;
    const info = describeExtensionFolder(source, {id: a.id, enabled, engine: 'firefox', name: a.defaultLocale?.name});
    if (info) results.push(info);
  }
  return results.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Lists the extensions in a browser profile, marking which ones are turned on there.
export function listExtensions(profilePath) {
  if (isFirefoxProfile(profilePath)) return listFirefoxExtensions(profilePath);
  const prefs = readJson(path.join(profilePath, 'Preferences'))?.extensions?.settings || {};
  const secure = readJson(path.join(profilePath, 'Secure Preferences'))?.extensions?.settings || {};
  const settings = {...prefs};
  for (const [id, s] of Object.entries(secure)) settings[id] = {...(settings[id] || {}), ...s};

  const extRoot = path.join(profilePath, 'Extensions');
  const results = new Map();

  for (const [id, s] of Object.entries(settings)) {
    if (!s.path || COMPONENT_LOCATIONS.has(s.location)) continue;
    const dir = path.isAbsolute(s.path) ? s.path : path.join(extRoot, s.path);
    if (!isDir(dir)) continue;
    const info = describeExtensionFolder(dir, {id, enabled: isEnabled(s)});
    if (info) results.set(id, info);
  }

  // Pick up anything in the Extensions folder that the preferences did not mention.
  if (isDir(extRoot)) {
    for (const id of fs.readdirSync(extRoot)) {
      if (results.has(id) || !/^[a-p]{32}$/.test(id)) continue;
      if (settings[id] && COMPONENT_LOCATIONS.has(settings[id].location)) continue;
      const dir = isDir(path.join(extRoot, id)) ? newestVersionDir(path.join(extRoot, id)) : null;
      if (!dir) continue;
      const info = describeExtensionFolder(dir, {id, enabled: isEnabled(settings[id]) ?? true});
      if (info) results.set(id, info);
    }
  }

  return [...results.values()].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
