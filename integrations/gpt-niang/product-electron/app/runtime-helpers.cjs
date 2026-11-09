'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Electron argv is normally [electron.exe, app/main.cjs, <package root>, --flags...].
// Extra Chromium/Electron switches may appear anywhere, so the root is resolved by
// meaning rather than by a fixed index.
function isRuntimeOrEntry(arg, appDir) {
  const base = path.basename(String(arg)).toLowerCase();
  if (/^(electron|node)(\.exe)?$/.test(base)) return true;
  try {
    const resolved = path.resolve(arg);
    if (resolved === path.resolve(appDir, 'main.cjs')) return true;
    if (process.execPath && resolved === path.resolve(process.execPath)) return true;
  } catch {}
  return base === 'main.cjs';
}

function resolvePackageRoot(argv = process.argv, appDir = __dirname) {
  const args = Array.isArray(argv) ? argv.map(a => String(a ?? '')) : [];
  const fallback = path.resolve(appDir, '..');
  const explicit = args.find(a => a.startsWith('--root='));
  if (explicit && explicit.slice(7).trim()) {
    return {root: path.resolve(explicit.slice(7).trim()), source: 'explicit', fallback};
  }
  for (let i = 1; i < args.length; i++) {
    const arg = args[i].trim();
    if (!arg || arg.startsWith('-') || isRuntimeOrEntry(arg, appDir)) continue;
    return {root: path.resolve(arg), source: 'positional', fallback};
  }
  return {root: fallback, source: 'default', fallback};
}

function loadProductConfig(argv = process.argv, appDir = __dirname, readJson = defaultReadJson) {
  const resolved = resolvePackageRoot(argv, appDir);
  const tried = [path.join(resolved.root, 'product.json')];
  const cfg = readJson(tried[0]);
  if (cfg) return {root: resolved.root, cfg, source: resolved.source};
  throw new Error('PRODUCT_PACKAGE_REQUIRED: product.json not readable at ' + tried.join(', '));
}

function defaultReadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}

// Fake fixtures for isolated --test-only runs; mirrors verify-release.cjs.
function createFakeQuotaSeed(now = Date.now()) {
  return {ok: true, queryOk: true, accountKey: 'FAKE-HIDDEN-ACCOUNT', observedAt: now, windows: [
    {label: '5小时', remaining: 71, used: 29, resetsAt: now / 1000 + 20000},
    {label: '每周', remaining: 42, used: 58, resetsAt: now / 1000 + 200000}
  ]};
}

function ensureTestStateSeed(dataDir, now = Date.now()) {
  fs.mkdirSync(dataDir, {recursive: true});
  const defaults = {
    'status.json': createFakeQuotaSeed(now),
    'settings.json': {scale: 1.4, followHost: false, desktopTopmost: false, soundOn: false, clickCardsEnabled: true, autoQuoteEnabled: false, dragonAnimationEnabled: true, dragonCodexEnabled: true, characterId: 'gpt-dragon', unknownProtectedTest: 'keep-me'},
    'pet-form.json': {version: 1, form: 'full', autoBubble: true},
    'experience-preferences.json': {version: 1, idleRhythm: 'natural', quietUntil: 0},
    'quotes.json': {version: 1, quotes: ['隔离语录甲', '隔离语录乙', '隔离语录丙']}
  };
  const created = [];
  for (const [name, value] of Object.entries(defaults)) {
    const file = path.join(dataDir, name);
    if (!fs.existsSync(file)) { fs.writeFileSync(file, JSON.stringify(value)); created.push(name); }
  }
  return created;
}

module.exports = {resolvePackageRoot, loadProductConfig, createFakeQuotaSeed, ensureTestStateSeed};
