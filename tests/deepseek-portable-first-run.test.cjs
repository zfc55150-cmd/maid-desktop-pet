'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureFirstRun } = require('../integrations/deepseek-portable/first-run.cjs');

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-first-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'app'), home = path.join(dir, 'home');
  const assets = path.join(root, 'node_modules/dsh-pet/assets');
  const helper = path.join(root, 'node_modules/dsh-pet/runtime/electron-helper');
  fs.mkdirSync(assets, { recursive: true }); fs.mkdirSync(helper, { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../app/electron-helper/pet-appearance-store.js'), path.join(helper, 'pet-appearance-store.js'));
  fs.copyFileSync(path.join(__dirname, '../app/electron-helper/chat-config-store.js'), path.join(helper, 'chat-config-store.js'));
  fs.writeFileSync(path.join(assets, 'config.jsonc'), '{"pets":[{"id":"main","size":462}]}');
  return { root, home, target: path.join(home, 'dsh-pet/main-config.jsonc'), assets };
}
test('first start seeds valid bundled defaults and does not overwrite them', t => {
  const x = setup(t);
  assert.equal(ensureFirstRun(x.root, x.home), true);
  const data = fs.readFileSync(x.target, 'utf8');
  assert.equal(ensureFirstRun(x.root, x.home), false);
  assert.equal(fs.readFileSync(x.target, 'utf8'), data);
});
test('existing corrupt config or any recovery file is never replaced', t => {
  for (const suffix of ['', '.bak', '.last-good.json']) {
    const x = setup(t); fs.mkdirSync(path.dirname(x.target), { recursive: true });
    fs.writeFileSync(x.target + suffix, 'protected');
    assert.equal(ensureFirstRun(x.root, x.home), false);
    assert.equal(fs.readFileSync(x.target + suffix, 'utf8'), 'protected');
    if (suffix) assert.equal(fs.existsSync(x.target), false);
  }
});
test('invalid bundled defaults fail before any user configuration is created', t => {
  const x = setup(t); fs.writeFileSync(path.join(x.assets, 'config.jsonc'), '{"pets":[]}');
  assert.throws(() => ensureFirstRun(x.root, x.home));
  assert.equal(fs.existsSync(x.target), false);
});
