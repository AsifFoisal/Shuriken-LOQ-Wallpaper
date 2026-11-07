// Shuriken companion service — local application discovery & launcher.
// Binds to 127.0.0.1 only. Launches only applications discovered by the scanner (trusted ids).
import express from 'express';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '1.0.0';
const HOST = '127.0.0.1';
const PORT = Number(process.env.SHURIKEN_PORT || 47811);
const IS_WIN = process.platform === 'win32';

const DATA_ROOT = process.env.APPDATA || path.join(__dirname, '.data');
const DATA_DIR = path.join(DATA_ROOT, 'ShurikenWallpaper');
// One-time migration from the previous name so existing apps, icons and config survive the rename
const LEGACY_DATA_DIR = path.join(DATA_ROOT, 'NexusWallpaper');
if (!fs.existsSync(DATA_DIR) && fs.existsSync(LEGACY_DATA_DIR)) {
  fs.cpSync(LEGACY_DATA_DIR, DATA_DIR, { recursive: true });
  console.log('[shuriken] migrated data from', LEGACY_DATA_DIR);
}
const ICON_DIR = path.join(DATA_DIR, 'icons');
const APPS_FILE = path.join(DATA_DIR, 'apps.json');
const PINS_FILE = path.join(DATA_DIR, 'pins.json');
const POWER_FILE = path.join(DATA_DIR, 'power.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
fs.mkdirSync(ICON_DIR, { recursive: true });

// Thermal mode (Fn+Q power mode). The elevated ShurikenThermalWatch task writes
// the raw mode to thermal.txt on every change. LOQ firmware numbering (verified
// empirically): 1 = quiet, 2 = balance, 3 = performance.
const THERMAL_FILE = path.join(DATA_DIR, 'thermal.txt');
const THERMAL_NAMES = ['custom', 'quiet', 'balance', 'performance'];
const thermal = { supported: false, mode: null, raw: null };
const thermalClients = new Set(); // SSE subscribers, pushed the moment the mode changes
function readThermalFile() {
  try {
    const raw = fs.readFileSync(THERMAL_FILE, 'utf8').trim();
    let next;
    if (raw === 'unsupported') next = { supported: false, mode: null, raw: null };
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) return;
      next = { supported: true, raw: n, mode: THERMAL_NAMES[n] || 'custom' };
    }
    const changed = next.supported !== thermal.supported || next.raw !== thermal.raw;
    Object.assign(thermal, next);
    if (changed) for (const send of thermalClients) send();
  } catch { /* file absent = thermal task not installed */ }
}
readThermalFile();
fs.watch(DATA_DIR, (_evt, fname) => { if (fname === 'thermal.txt') setTimeout(readThermalFile, 50); });
setInterval(readThermalFile, 10000).unref(); // safety net in case fs.watch misses an event

// Extra origins can be allowed with SHURIKEN_ALLOWED_ORIGINS="https://a,https://b"
const EXTRA_ORIGINS = (process.env.SHURIKEN_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ALLOW_ANY = process.env.SHURIKEN_ALLOW_ANY_ORIGIN === '1';
const ID_RE = /^[a-f0-9]{12}$/;

// ------------------------------------------------------------------ state
let apps = readJson(APPS_FILE, { apps: [], lastScan: null });
let pins = readJson(PINS_FILE, { pins: [] });
let power = readJson(POWER_FILE, { script: '' });
let scanning = null;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function publicApp(a) {
  // version the icon URL with the last scan so re-extracted icons bust the browser cache
  const v = apps.lastScan ? Date.parse(apps.lastScan) : 0;
  return {
    id: a.id, name: a.name, source: a.source, kind: a.kind,
    target: a.target, shortcut: a.shortcut, args: a.args, workingDir: a.workingDir,
    location: a.location, iconUrl: a.icon ? `/api/icons/${a.id}?v=${v}` : null,
  };
}
function findApp(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  return apps.apps.find((a) => a.id === id) || null;
}

// ------------------------------------------------------------------ pins (files & folders)
// A pin registers one filesystem path behind a trusted id; launch/reveal keep
// accepting ids only — paths are never taken from the client at launch time.
function pinId(p) {
  // Same derivation as scan.ps1's Get-Id: MD5 of the lowercased path
  return crypto.createHash('md5').update(p.toLowerCase(), 'utf8').digest('hex').slice(0, 12);
}
function findPin(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  return pins.pins.find((p) => p.id === id) || null;
}
function findItem(id) {
  return findApp(id) || findPin(id);
}
function savePins() {
  writeJson(PINS_FILE, pins);
}
function savePower() {
  writeJson(POWER_FILE, power);
}
function publicPin(p) {
  return {
    id: p.id, name: p.name, source: 'pinned', kind: p.kind,
    target: p.path, shortcut: '', args: '', workingDir: '',
    location: p.path,
    iconUrl: p.icon ? `/api/icons/${p.id}?v=${p.addedAt}` : null,
  };
}
function appsPayload() {
  return {
    apps: [...apps.apps.map((a) => publicApp(a)), ...pins.pins.map(publicPin)],
    lastScan: apps.lastScan,
  };
}
function expandEnvVars(p) {
  return p.replace(/%([^%]+)%/g, (m, name) => process.env[name] || m);
}
function normalizePath(raw) {
  let p = String(raw || '').trim().replace(/^"(.*)"$/, '$1'); // strip surrounding quotes
  p = expandEnvVars(p);
  if (!p) throw new Error('Empty path');
  p = path.resolve(p);
  try { p = fs.realpathSync.native(p); } catch { /* verified by the caller */ }
  return p;
}
function extractIcon(p, id) {
  return new Promise((resolve) => {
    if (!IS_WIN) return resolve(false);
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'pin-icon.ps1'), '-Path', p, '-Id', id, '-IconDir', ICON_DIR];
    const ps = spawn('powershell.exe', args, { windowsHide: true });
    let out = '';
    ps.stdout.on('data', (d) => (out += d.toString('utf8')));
    ps.stderr.on('data', (d) => console.warn('[pin-icon]', d.toString()));
    const timer = setTimeout(() => { try { ps.kill(); } catch { /* already gone */ } }, 20000);
    ps.on('error', () => { clearTimeout(timer); resolve(false); });
    ps.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(out.trim()).icon === true); } catch { resolve(false); }
    });
  });
}

// ------------------------------------------------------------------ scanning
function runScan(force = false) {
  if (scanning) return scanning;
  scanning = new Promise((resolve) => {
    if (!IS_WIN) {
      console.warn('[shuriken] Application scanning is only supported on Windows.');
      return resolve(apps);
    }
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'scan.ps1'), '-IconDir', ICON_DIR];
    if (force) args.push('-ForceIcons');
    const ps = spawn('powershell.exe', args, { windowsHide: true });
    let out = '';
    ps.stdout.on('data', (d) => (out += d.toString('utf8')));
    ps.stderr.on('data', (d) => console.warn('[scan]', d.toString()));
    ps.on('close', () => {
      try {
        const raw = JSON.parse(out.trim() || '[]');
        const list = Array.isArray(raw) ? raw : [raw];
        // De-duplicate: by id first, then by normalised name (prefer start menu > desktop > store > registry)
        const rank = { 'startmenu-user': 0, 'startmenu-all': 1, 'desktop-user': 2, 'desktop-public': 3, store: 4, registry: 5 };
        list.sort((a, b) => (rank[a.source] ?? 9) - (rank[b.source] ?? 9));
        const byId = new Map();
        const names = new Set();
        const targets = new Set();
        for (const a of list) {
          if (!a || !a.id || !a.name) continue;
          const n = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const t = (a.kind === 'exe' || a.kind === 'shortcut') && a.target ? a.target.toLowerCase() + '|' + (a.args || '') : null;
          if (byId.has(a.id) || names.has(n) || (t && targets.has(t))) continue;
          byId.set(a.id, a);
          names.add(n);
          if (t) targets.add(t);
        }
        apps = { apps: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)), lastScan: new Date().toISOString() };
        writeJson(APPS_FILE, apps);
        console.log(`[shuriken] scan complete: ${apps.apps.length} applications`);
      } catch (e) {
        console.error('[shuriken] scan parse failed', e);
      }
      resolve(apps);
    });
  }).finally(() => { scanning = null; });
  return scanning;
}

// ------------------------------------------------------------------ launching (no shell, trusted ids only)
function launch(app) {
  const opts = { detached: true, stdio: 'ignore', windowsHide: false };
  let child;
  if (app.kind === 'file' || app.kind === 'folder') {
    if (!app.target || !fs.existsSync(app.target)) throw new Error('Pinned location no longer exists. Remove it and pin the path again.');
    // explorer.exe ShellExecutes the path: files open with their default association,
    // folders open in Explorer, shortcuts honour their target/args/elevation.
    child = spawn('explorer.exe', [app.target], opts);
  } else if (app.kind === 'uwp') {
    if (!/^[\w.\-!]+$/.test(app.target)) throw new Error('Invalid AppID');
    child = spawn('explorer.exe', [`shell:AppsFolder\\${app.target}`], opts);
  } else if (app.shortcut && fs.existsSync(app.shortcut)) {
    // explorer.exe opens .lnk / .url via ShellExecute, honouring args, working dir and elevation settings.
    child = spawn('explorer.exe', [app.shortcut], opts);
  } else if (app.target && fs.existsSync(app.target) && /\.exe$/i.test(app.target)) {
    child = spawn(app.target, [], { ...opts, cwd: app.workingDir && fs.existsSync(app.workingDir) ? app.workingDir : path.dirname(app.target) });
  } else {
    throw new Error('Application file no longer exists. Try rescanning.');
  }
  child.on('error', (e) => console.error('[shuriken] launch error', e.message));
  child.unref();
}

// ------------------------------------------------------------------ server + security
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

function originAllowed(origin) {
  if (!origin) return true; // same-origin / non-browser
  if (ALLOW_ANY) return true;
  if (origin === 'null' || origin.startsWith('file://')) return true; // Lively local file
  if (EXTRA_ORIGINS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch { return false; }
}

app.use((req, res, next) => {
  // Protect against DNS rebinding
  const host = (req.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) return res.status(403).json({ error: 'Forbidden host' });

  const origin = req.headers.origin;
  if (!originAllowed(origin)) {
    console.warn(`[shuriken] rejected origin ${origin} (set SHURIKEN_ALLOWED_ORIGINS to allow)`);
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Shuriken-Client');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);

  // State-changing requests must carry the client header (forces CORS preflight → blocks drive-by CSRF)
  if (req.method !== 'GET' && req.headers['x-shuriken-client'] !== 'shuriken-wallpaper') {
    return res.status(403).json({ error: 'Missing client header' });
  }
  next();
});

// Serve the built wallpaper so Lively can add it as a Web/URL wallpaper
// (http://127.0.0.1:47811/wallpaper). A loopback origin is exempt from the
// Local-Network-Access restrictions that block fetch() from file:// pages.
const DIST_INDEX = path.join(__dirname, '..', 'dist', 'index.html');
app.get(['/wallpaper', '/wallpaper/'], (_req, res) => {
  if (!fs.existsSync(DIST_INDEX)) return res.status(404).send('Wallpaper not built. Run "npm run build" in the project root.');
  res.setHeader('Cache-Control', 'no-cache'); // pick up rebuilds immediately
  res.sendFile(DIST_INDEX);
});

app.get('/api/system/status', (_req, res) => {
  res.json({
    ok: true, version: VERSION, platform: process.platform,
    appCount: apps.apps.length, lastScan: apps.lastScan, scanning: !!scanning,
    thermal: { supported: thermal.supported, mode: thermal.mode },
  });
});

app.get('/api/thermal', (_req, res) => res.json({ ok: true, ...thermal }));

// Live push channel — wallpapers update within ~100ms of an Fn+Q press
app.get('/api/thermal/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = () => { try { res.write(`data: ${JSON.stringify({ ok: true, ...thermal })}\n\n`); } catch { /* closed */ } };
  send();
  thermalClients.add(send);
  const ka = setInterval(send, 25000); // keepalive
  req.on('close', () => { clearInterval(ka); thermalClients.delete(send); });
});

app.get('/api/apps', (_req, res) => {
  res.json(appsPayload());
});

app.post('/api/apps/scan', async (req, res) => {
  await runScan(!!req.body?.forceIcons);
  res.json(appsPayload());
});

app.get('/api/apps/:id', (req, res) => {
  const a = findItem(req.params.id);
  if (!a) return res.status(404).json({ error: 'Unknown application' });
  res.json(findPin(a.id) ? publicPin(a) : publicApp(a));
});

app.post('/api/apps/launch', (req, res) => {
  const found = findItem(req.body?.id);
  if (!found) return res.status(404).json({ error: 'Unknown or untrusted application id' });
  const a = findPin(found.id) ? publicPin(found) : found;
  if (!IS_WIN) return res.status(501).json({ error: 'Launching is only supported on Windows' });
  try {
    launch(a);
    console.log(`[shuriken] launched ${a.name}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/apps/reveal', (req, res) => {
  const found = findItem(req.body?.id);
  if (!found) return res.status(404).json({ error: 'Unknown application' });
  const a = findPin(found.id) ? publicPin(found) : found;
  if (!IS_WIN) return res.status(501).json({ error: 'Only supported on Windows' });
  const p = [a.target, a.shortcut].find((x) => x && fs.existsSync(x));
  if (!p) return res.status(404).json({ error: 'Location not found on disk', location: a.location });
  if (path.parse(p).root === p) spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref();
  else spawn('explorer.exe', [`/select,${p}`], { detached: true, stdio: 'ignore' }).unref();
  res.json({ ok: true, location: p });
});

app.get('/api/icons/:id', (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.sendStatus(400);
  const file = path.join(ICON_DIR, `${req.params.id}.png`);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(file);
});

// ------------------------------------------------------------------ pins (files & folders)
app.post('/api/pins/resolve', async (req, res) => {
  if (!IS_WIN) return res.status(501).json({ error: 'Pinning is only supported on Windows' });
  const paths = req.body?.paths;
  if (!Array.isArray(paths) || !paths.length || paths.length > 25) {
    return res.status(400).json({ error: 'Provide an array of 1-25 paths' });
  }
  const results = [];
  let dirty = false;
  for (const raw of paths.slice(0, 25)) {
    try {
      const p = normalizePath(raw);
      const st = fs.statSync(p); // throws when the path is missing
      const kind = st.isDirectory() ? 'folder' : 'file';
      const id = pinId(p);
      let pin = pins.pins.find((x) => x.id === id);
      if (!pin) {
        const base = path.basename(p);
        pin = { id, name: base || (p.endsWith(':\\') ? p.slice(0, 2) + ' drive' : p), kind, path: p, addedAt: Date.now(), icon: false };
        pins.pins.push(pin);
        dirty = true;
      } else {
        pin.kind = kind;
        pin.path = p;
      }
      const iconFile = path.join(ICON_DIR, id + '.png');
      if (!fs.existsSync(iconFile)) {
        pin.icon = await extractIcon(p, id);
        dirty = true;
      } else if (!pin.icon) {
        pin.icon = true;
        dirty = true;
      }
      results.push({ path: p, ok: true, entry: publicPin(pin) });
    } catch (e) {
      results.push({ path: String(raw), ok: false, error: e.message || 'Could not resolve path' });
    }
  }
  if (dirty) savePins();
  res.json({ results });
});

app.post('/api/pins/remove', (req, res) => {
  const id = req.body?.id;
  if (typeof id !== 'string' || !ID_RE.test(id)) return res.status(400).json({ error: 'Invalid pin id' });
  const before = pins.pins.length;
  pins.pins = pins.pins.filter((p) => p.id !== id);
  const removed = pins.pins.length !== before;
  if (removed) savePins();
  res.json({ ok: true, removed });
});

// ------------------------------------------------------------------ filesystem browsing (picker)
// Quick links must resolve known folders the way Explorer does — OneDrive's
// Known Folder Move redirects Desktop/Documents/Pictures away from %USERPROFILE%.
function knownFolders() {
  if (!IS_WIN) return Promise.resolve(null);
  return new Promise((resolve) => {
    const script = `$r = [ordered]@{
  Desktop   = [Environment]::GetFolderPath('Desktop')
  Documents = [Environment]::GetFolderPath('MyDocuments')
  Pictures  = [Environment]::GetFolderPath('MyPictures')
  Music     = [Environment]::GetFolderPath('MyMusic')
  Videos    = [Environment]::GetFolderPath('MyVideos')
  Downloads = ''
}
$k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders')
if ($k) { $r.Downloads = [string]$k.GetValue('{374DE290-123F-4565-9164-39C4925E467B}', '') }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
ConvertTo-Json $r -Compress`;
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let out = '';
    ps.stdout.on('data', (d) => (out += d.toString('utf8')));
    const timer = setTimeout(() => { try { ps.kill(); } catch { /* already gone */ } }, 6000);
    ps.on('error', () => { clearTimeout(timer); resolve(null); });
    ps.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(out.trim())); } catch { resolve(null); }
    });
  });
}

app.get('/api/fs/roots', async (_req, res) => {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const kf = await knownFolders();
  const guess = (name) => (home ? path.join(home, name) : '');
  const wanted = [
    ['Home', home],
    ['Desktop', kf?.Desktop],
    ['Downloads', kf?.Downloads],
    ['Documents', kf?.Documents],
    ['Pictures', kf?.Pictures],
    ['Music', kf?.Music],
    ['Videos', kf?.Videos],
  ];
  const seen = new Set();
  const quick = [];
  for (const [name, p] of wanted) {
    const real = p || (name === 'Home' ? home : guess(name));
    if (!real || seen.has(real.toLowerCase()) || !fs.existsSync(real)) continue;
    seen.add(real.toLowerCase());
    quick.push({ name, path: real });
  }
  res.json({ drives: await listDrives(), quick });
});

const DRIVE_TYPES = { 2: 'removable', 3: 'fixed', 4: 'network', 5: 'cdrom', 6: 'ramdisk' };
function probeDrives() {
  if (!IS_WIN) return [{ path: '/', label: '', type: 'fixed' }];
  const out = [];
  for (let i = 65; i <= 90; i++) {
    const p = String.fromCharCode(i) + ':\\';
    try { if (fs.existsSync(p)) out.push({ path: p, label: '', type: 'unknown' }); } catch { /* skip */ }
  }
  return out;
}
function listDrives() {
  if (!IS_WIN) return Promise.resolve(probeDrives());
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,DriveType | ConvertTo-Json -Compress',
    ], { windowsHide: true });
    let out = '';
    ps.stdout.on('data', (d) => (out += d.toString('utf8')));
    const timer = setTimeout(() => { try { ps.kill(); } catch { /* already gone */ } }, 6000);
    ps.on('error', () => { clearTimeout(timer); resolve(probeDrives()); });
    ps.on('close', () => {
      clearTimeout(timer);
      try {
        const raw = JSON.parse(out.trim() || '[]');
        const list = Array.isArray(raw) ? raw : [raw];
        const drives = list
          .filter((d) => d.DeviceID)
          .map((d) => ({ path: d.DeviceID.endsWith('\\') ? d.DeviceID : d.DeviceID + '\\', label: d.VolumeName || '', type: DRIVE_TYPES[d.DriveType] || 'unknown' }));
        resolve(drives.length ? drives : probeDrives());
      } catch { resolve(probeDrives()); }
    });
  });
}

// System clutter that only appears at a drive root and is never worth pinning
const ROOT_JUNK = new Set(['$recycle.bin', 'system volume information', 'pagefile.sys', 'swapfile.sys', 'hiberfil.sys', 'dumpstack.log', 'dumpstack.log.tmp']);

app.get('/api/fs/list', (req, res) => {
  let dir;
  try { dir = normalizePath(req.query.dir); } catch { return res.status(400).json({ error: 'Invalid path' }); }
  let st;
  try { st = fs.statSync(dir); } catch { return res.status(404).json({ error: 'Folder not found' }); }
  if (!st.isDirectory()) return res.status(400).json({ error: 'Not a folder' });
  let dirents;
  try { dirents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) {
    return res.status(403).json({ error: `Cannot read folder (${e.code || 'error'})` });
  }
  const isRoot = path.parse(dir).root === dir;
  const entries = [];
  for (const d of dirents) {
    if (isRoot && ROOT_JUNK.has(d.name.toLowerCase())) continue;
    const p = path.join(dir, d.name);
    const isDir = d.isDirectory();
    let size = null;
    if (!isDir) { try { size = fs.statSync(p).size; } catch { /* unreadable — still listed */ } }
    entries.push({ name: d.name, path: p, isDir, size });
  }
  entries.sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  res.json({ dir, parent: isRoot ? null : path.dirname(dir), entries });
});

// ------------------------------------------------------------------ power button (hold-to-shutdown)
// The wallpaper only ever says "trigger the power action" — the script path
// lives server-side in power.json and is registered through /api/power/script.
app.get('/api/power', (_req, res) => {
  res.json({ ok: true, script: power.script || null, configured: !!power.script });
});

app.post('/api/power/script', (req, res) => {
  const raw = req.body?.path;
  if (raw == null || raw === '') {
    power = { script: '' };
    savePower();
    return res.json({ ok: true, script: null });
  }
  if (!IS_WIN) return res.status(501).json({ error: 'Only supported on Windows' });
  let p;
  try { p = normalizePath(raw); } catch (e) { return res.status(400).json({ error: e.message || 'Invalid path' }); }
  if (!/\.(bat|cmd)$/i.test(p)) return res.status(400).json({ error: 'The power-off script must be a .bat or .cmd file' });
  let st;
  try { st = fs.statSync(p); } catch { return res.status(404).json({ error: 'File not found' }); }
  if (!st.isFile()) return res.status(400).json({ error: 'Path is not a file' });
  power = { script: p, updatedAt: Date.now() };
  savePower();
  console.log(`[shuriken] power-off script registered: ${p}`);
  res.json({ ok: true, script: p });
});

app.post('/api/power/off', (req, res) => {
  if (!IS_WIN) return res.status(501).json({ error: 'Only supported on Windows' });
  if (!power.script) return res.status(404).json({ error: 'No power-off script registered — set one in Settings → General' });
  if (!fs.existsSync(power.script)) return res.status(404).json({ error: 'Power-off script no longer exists — re-register it in Settings → General' });
  if (req.body?.dryRun) return res.json({ ok: true, wouldRun: power.script });
  // cmd.exe /c runs the batch; hidden + detached so nothing blocks the companion
  spawn('cmd.exe', ['/c', power.script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  console.log(`[shuriken] power-off script executed: ${power.script}`);
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => res.json(readJson(CONFIG_FILE, null)));

app.put('/api/config', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || !Array.isArray(req.body.decks)) {
    return res.status(400).json({ error: 'Invalid configuration' });
  }
  writeJson(CONFIG_FILE, req.body);
  res.json({ ok: true });
});

app.listen(PORT, HOST, () => {
  console.log(`[shuriken] companion v${VERSION} listening on http://${HOST}:${PORT}`);
  console.log(`[shuriken] data directory: ${DATA_DIR}`);
  if (apps.apps.length === 0) runScan();
});
