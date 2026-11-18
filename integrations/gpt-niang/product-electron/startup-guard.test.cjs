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
  loadLastGoodManifest
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
