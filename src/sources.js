// Finds browser profiles on this computer and reads the extensions installed in them.
// Everything here only reads files. Nothing in the user's browser folders is changed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = os.homedir();
const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
const macSupport = path.join(home, 'Library', 'Application Support');
const linuxConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');

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
    });
  }
  // Fall back to scanning the folder when "Local State" is missing or unreadable.
  if (profiles.length === 0 && isDir(userDataDir)) {
    for (const dir of fs.readdirSync(userDataDir)) {
      if (dir === 'Default' || /^Profile \d+$/.test(dir)) {
        profiles.push({dir, path: path.join(userDataDir, dir), name: dir, account: ''});
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
    if (profiles.length > 0) found.push({name, userDataDir, profiles});
  }
  return found;
}

// Accepts either a profile folder or a "User Data" folder typed in by the user.
export function resolveCustomFolder(input) {
  const p = path.resolve(String(input || '').trim().replace(/^~(?=$|[\\/])/, home));
  if (!isDir(p)) return {error: 'That folder does not exist. Check the path and try again.'};
  if (isDir(path.join(p, 'Extensions')) || fs.existsSync(path.join(p, 'Preferences'))) {
    return {profile: {dir: path.basename(p), path: p, name: path.basename(p), account: ''}};
  }
  const profiles = listProfiles(p);
  if (profiles.length > 0) return {userDataDir: p, profiles};
  if (fs.existsSync(path.join(p, 'manifest.json'))) {
    return {error: 'This is an extension folder, not a browser profile. Add it in the next step instead.'};
  }
  return {error: 'No browser profile was found in that folder. Pick the folder that contains "Extensions" and "Preferences".'};
}

// Turns "__MSG_appName__" style placeholders into the real text from the extension's _locales.
function localize(text, extDir, manifest) {
  if (typeof text !== 'string') return '';
  const match = text.match(/^__MSG_(.+)__$/);
  if (!match) return text;
  const key = match[1].toLowerCase();
  const locales = [manifest.default_locale, 'en', 'en_US', 'en_GB'].filter(Boolean);
  for (const locale of locales) {
    const messages = readJson(path.join(extDir, '_locales', locale, 'messages.json'));
    if (!messages) continue;
    for (const [k, v] of Object.entries(messages)) {
      if (k.toLowerCase() === key && v?.message) return v.message;
    }
  }
  return text;
}

const ICON_TYPES = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp'};

// Picks a small icon from the manifest and returns it as a data URI the UI can show.
function readIcon(extDir, manifest) {
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
    const full = path.join(extDir, String(file).replace(/^\//, ''));
    const type = ICON_TYPES[path.extname(full).toLowerCase()];
    try {
      const data = fs.readFileSync(full);
      if (type && data.length < 256 * 1024) return `data:${type};base64,${data.toString('base64')}`;
    } catch {
      // Missing icon files are common and harmless.
    }
  }
  return '';
}

// Reads one unpacked extension folder and describes it for the UI and the test engine.
export function describeExtensionFolder(extDir, extra = {}) {
  const manifest = readJson(path.join(extDir, 'manifest.json'));
  if (!manifest) return null;
  if (manifest.theme || manifest.app) return null; // Themes and apps do not run on web pages.
  const mv = Number(manifest.manifest_version) || 0;
  const name = localize(manifest.name, extDir, manifest) || extra.id || path.basename(extDir);
  const info = {
    id: extra.id || '',
    name,
    version: String(manifest.version || ''),
    description: localize(manifest.description, extDir, manifest),
    manifestVersion: mv,
    path: extDir,
    icon: readIcon(extDir, manifest),
    enabled: extra.enabled ?? true,
    canTest: true,
    note: '',
  };
  if (mv < 3) {
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

// Lists the extensions in a browser profile, marking which ones are turned on there.
export function listExtensions(profilePath) {
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
