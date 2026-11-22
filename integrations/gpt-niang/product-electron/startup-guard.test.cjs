'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  recordAttempt,
  markHealthy,
  resetAttempts,
  saveLastGoodManifest,
  loadLastGoodManifest,
  cleanStaleTempFiles
} = require('./app/startup-guard.cjs');

test('startup-guard triggers safe mode after 3 failures within window and resets on healthy or version change', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-startup-guard-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'startup-attempts.json');

  assert.deepEqual(recordAttempt(file, { version: '0.8.40-electron', now: 1000 }), { safeMode: false, failures: 0 });
  assert.deepEqual(recordAttempt(file, { version: '0.8.40-electron', now: 2000 }), { safeMode: false, failures: 1 });
  assert.deepEqual(recordAttempt(file, { version: '0.8.40-electron', now: 3000 }), { safeMode: false, failures: 2 });
  assert.deepEqual(recordAttempt(file, { version: '0.8.40-electron', now: 4000 }), { safeMode: true, failures: 3 });

  markHealthy(file, { version: '0.8.40-electron', now: 5000 });
  assert.deepEqual(recordAttempt(file, { version: '0.8.40-electron', now: 6000 }), { safeMode: false, failures: 0 });

  assert.deepEqual(recordAttempt(file, { version: '0.8.40-electron', now: 7000 }), { safeMode: false, failures: 1 });
  assert.deepEqual(recordAttempt(file, { version: '0.8.41-electron', now: 8000 }), { safeMode: false, failures: 0 });

  resetAttempts(file);
  assert.equal(fs.existsSync(file), false);
});

test('startup-guard expires stale failures outside 10-minute window', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-startup-window-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'startup-attempts.json');

  for (const ts of [1000, 2000, 3000]) {
    recordAttempt(file, { version: '0.8.40-electron', now: ts });
  }
  const afterWindow = recordAttempt(file, { version: '0.8.40-electron', now: 1000 + 11 * 60 * 1000 });
  assert.equal(afterWindow.safeMode, false);
  assert.equal(afterWindow.failures, 0);
});

test('last-good manifest saves once per content hash and validates version and clips', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-last-good-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'manifest-last-good.json');
  const manifest = { states: { frontidle: { frames: 1 } }, transitionClips: {} };

  assert.equal(saveLastGoodManifest(file, { version: '0.8.40-electron', manifest }), true);
  assert.equal(saveLastGoodManifest(file, { version: '0.8.40-electron', manifest }), false);
  assert.deepEqual(loadLastGoodManifest(file, { version: '0.8.40-electron', clips: { frontidle: {} } }), manifest);
  assert.equal(loadLastGoodManifest(file, { version: '0.8.41-electron', clips: { frontidle: {} } }), null);
  assert.equal(loadLastGoodManifest(file, { version: '0.8.40-electron', clips: {} }), null);
});

test('main.cjs records startup attempts before ProductHost init, isolates saveLastGoodManifest errors, and cleans stale temp files', () => {
  const src = fs.readFileSync(path.join(__dirname, 'app/main.cjs'), 'utf8');
  const recordIdx = src.indexOf('startupGuard.recordAttempt(');
  const hostIdx = src.indexOf('new ProductHost(');
  assert.ok(recordIdx > 0 && hostIdx > 0 && recordIdx < hostIdx, 'recordAttempt must precede new ProductHost');
  const configureIdx = src.indexOf('catalog.configure(animation)');
  const catchIdx = src.indexOf('catch(manifestErr)', configureIdx);
  const saveIdx = src.indexOf('startupGuard.saveLastGoodManifest(', configureIdx);
  assert.ok(configureIdx > 0 && catchIdx > configureIdx && saveIdx > catchIdx, 'saveLastGoodManifest must be outside catalog.configure try block');
  assert.match(src, /LAST_GOOD_SAVE_FAILED/);
  assert.match(src, /pauseForSafeMode/);
  assert.match(src, /RENDERER_INIT_TIMEOUT/);
  assert.match(src, /SUPERVISOR_PAUSE_WRITE_FAILED/);

  // Behavioral check: cleanStaleTempFiles removes orphaned atomic .tmp files while preserving active JSON files
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-clean-tmp-'));
  try {
    fs.writeFileSync(path.join(dir, 'startup-attempts.json.1234.abcd-1234.tmp'), 'orphan');
    fs.writeFileSync(path.join(dir, 'runtime.json.tmp'), 'orphan');
    fs.writeFileSync(path.join(dir, 'settings.json'), '{"ok":true}');
    assert.equal(cleanStaleTempFiles(dir), 2);
    assert.equal(fs.existsSync(path.join(dir, 'startup-attempts.json.1234.abcd-1234.tmp')), false);
    assert.equal(fs.existsSync(path.join(dir, 'runtime.json.tmp')), false);
    assert.equal(fs.existsSync(path.join(dir, 'settings.json')), true);

    // Behavioral check: saveLastGoodManifest failure is isolated when catalog.configure succeeds
    const vm = require('node:vm');
    const errors = [];
    let safeMode = null;
    const block = src.slice(src.indexOf('if(guard.safeMode){'), src.indexOf('touch=new TouchResponses('));
    const ctx = {
      guard: { safeMode: false, failures: 0 },
      smoke: false,
      animation: { states: { frontidle: { frames: 1 } } },
      scenes: { clips: { frontidle: {} } },
      lastGoodFile: path.join(dir, 'last-good.json'),
      catalog: { revision: '0.8.41-electron', configure() {}, reset() { throw new Error('should not reset'); } },
      startupGuard: {
        loadLastGoodManifest: () => null,
        saveLastGoodManifest: () => { throw new Error('ENOSPC'); }
      },
      error: code => errors.push(code),
      appendCrashLog: () => {},
      Date,
      String,
      get safeMode() { return safeMode; },
      set safeMode(v) { safeMode = v; }
    };
    vm.createContext(ctx);
    vm.runInContext(block, ctx);
    assert.equal(safeMode, null);
    assert.deepEqual(errors, ['LAST_GOOD_SAVE_FAILED:ENOSPC']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
