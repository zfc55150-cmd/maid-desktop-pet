'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const GN = path.resolve(__dirname, '../integrations/gpt-niang/product-electron');
const helpers = require(path.join(GN, 'app/runtime-helpers.cjs'));
const appDir = path.join(GN, 'app');

test('C3: package root ignores extra Electron switches and honours --root', () => {
  const root = path.resolve('/pkg/root');
  const main = path.join(appDir, 'main.cjs');
  assert.equal(helpers.resolvePackageRoot(['electron.exe', main, root, '--test-only'], appDir).root, root);
  assert.equal(helpers.resolvePackageRoot(['electron.exe', '--disable-gpu', main, '--smoke', root], appDir).root, root);
  const explicit = helpers.resolvePackageRoot(['electron.exe', main, '/other', '--root=' + root], appDir);
  assert.equal(explicit.root, root);
  assert.equal(explicit.source, 'explicit');
  const fallback = helpers.resolvePackageRoot(['electron.exe', main, '--test-only'], appDir);
  assert.equal(fallback.root, path.resolve(appDir, '..'));
  assert.equal(fallback.source, 'default');
});

test('C3: missing product.json reports every attempted path', () => {
  const missing = path.join(os.tmpdir(), 'gpt-missing-root-' + process.pid);
  assert.throws(() => helpers.loadProductConfig(['electron.exe', path.join(appDir, 'main.cjs'), missing], appDir, () => null),
    err => err.message.startsWith('PRODUCT_PACKAGE_REQUIRED') && err.message.includes(path.join(missing, 'product.json')));
});

test('T3: isolated test state is seeded only where files are missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-seed-'));
  try {
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({scale: 2}));
    const created = helpers.ensureTestStateSeed(dir);
    assert(created.includes('status.json'));
    assert(!created.includes('settings.json'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))).scale, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'status.json'))).accountKey, 'FAKE-HIDDEN-ACCOUNT');
    assert.deepEqual(helpers.ensureTestStateSeed(dir), []);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// Run the production persistPosition() source in isolation.
function persistFixture({hostFrame, settingsUpdate, followHost = true}) {
  const main = fs.readFileSync(path.join(appDir, 'main.cjs'), 'utf8');
  const source = main.slice(main.indexOf('function persistPosition('), main.indexOf('async function command('));
  const errors = [], saved = [];
  const context = {
    win: {getBounds: () => ({x: 10, y: 20, width: 300, height: 300})},
    product: {prefs: () => ({followHost}), update: patch => saved.push({follow: patch}), settings: {update: settingsUpdate || (patch => saved.push({free: patch}))}},
    native: {hostFrame}, expected: 300, error: code => errors.push(code)
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.persistPosition();
  return {errors, saved};
}

test('C1: unavailable host frame falls back to a normal save with a precise code', () => {
  for (const hostFrame of [() => null, () => { throw new Error('native gone'); }]) {
    const r = persistFixture({hostFrame});
    assert.deepEqual(r.errors, ['POSITION_HOSTFRAME_UNAVAILABLE']);
    assert.equal(r.saved.length, 1);
    assert.equal(JSON.stringify(r.saved[0].free), JSON.stringify({desktopLeft: 10, desktopTop: 20, desktopCanvasPixels: 300}));
  }
});

test('C1: save failures keep the real message and only conflicts use the conflict code', () => {
  const failed = persistFixture({hostFrame: () => ({found: false}), settingsUpdate: () => { throw new Error('EACCES'); }});
  assert.deepEqual(failed.errors, ['POSITION_SAVE_FAILED:EACCES']);
  const conflict = persistFixture({hostFrame: () => ({found: false}), settingsUpdate: () => { throw new Error('SETTINGS_CHANGED'); }});
  assert.deepEqual(conflict.errors, ['POSITION_SAVE_CONFLICT:SETTINGS_CHANGED']);
  const found = persistFixture({hostFrame: () => ({found: true, x: 0, y: 0, width: 1000, height: 800, dpi: 96})});
  assert.deepEqual(found.errors, []);
  assert.equal(found.saved[0].follow.anchor, 'free');
});

test('T2: close records step timings and arms a 10 s fallback exit', () => {
  const main = fs.readFileSync(path.join(appDir, 'main.cjs'), 'utf8');
  const close = main.slice(main.indexOf('async function close('), main.indexOf("app.on('before-quit'"));
  for (const step of ["mark('windows')", "mark('product')", "mark('flush')"]) assert(close.includes(step), step);
  assert.match(close, /setTimeout\(\(\)=>\{stats\.closeTimedOut=true;[\s\S]*process\.exit\(exitCode\);\},10000\)/);
});
