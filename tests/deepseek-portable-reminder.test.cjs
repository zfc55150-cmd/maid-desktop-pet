'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkOnce } = require('../integrations/deepseek-portable/release-reminder.cjs');
const { checkOnce: checkInstalledOnce } = require('../app/electron-helper/release-reminder.js');
const { checkReleaseNotice } = require('../integrations/gpt-niang/product-electron/services/release-notice.cjs');

const version = 'v1.0.3';
const asset = { name: `DeepSeekActionPet-${version}-win-x64.zip`, state: 'uploaded', size: 100 };
const release = { tag_name: version, draft: false, prerelease: false, assets: [asset],
  html_url: 'https://example.invalid/' };

function options(t, payload = release) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    stateFile: path.join(root, 'release-reminder.json'),
    localTag: 'v1.0.2', checkRelease: checkReleaseNotice, show: () => true,
    now: () => 1794200000000,
    fetchImpl: async () => ({ ok: true, status: 200, headers: {}, json: async () => payload })
  };
}

test('portable release reminder waits until it can show, then suppresses the same version across launches', async t => {
  const opts = options(t);
  let attempts = 0, queries = 0;
  const fetch = opts.fetchImpl;
  opts.fetchImpl = (...args) => { queries++; return fetch(...args); };
  opts.show = (tag, url) => {
    assert.equal(tag, version);
    assert.equal(url, `https://github.com/zfc55150-cmd/maid-desktop-pet/releases/tag/${version}`);
    return ++attempts > 1;
  };
  assert.equal(await checkOnce(opts), false);
  assert.equal(await checkOnce(opts), true);
  assert.equal(await checkOnce(opts), false);
  assert.equal(attempts, 2);
  assert.equal(queries, 1);
});

test('portable release reminder ignores drafts, prereleases and releases without a finished DeepSeek ZIP', async t => {
  for (const payload of [{ ...release, draft: true }, { ...release, prerelease: true },
    { ...release, assets: [{ ...asset, state: 'new' }] },
    { ...release, assets: [{ ...asset, name: 'GPTNiang-v0.8.22-electron-win-x64.zip' }] }]) {
    const opts = options(t, payload);
    opts.show = () => assert.fail('An incomplete release must not show a notice');
    assert.equal(await checkOnce(opts), false);
  }
});

test('portable release reminder skips when disabled, stays silent offline and recovers next day', async t => {
  const opts = options(t);
  fs.writeFileSync(opts.stateFile, '{"enabled":false}');
  assert.equal(await checkOnce({ ...opts, fetchImpl: () => assert.fail('disabled') }), false);
  fs.rmSync(opts.stateFile);
  assert.equal(await checkOnce({ ...opts, fetchImpl: async () => { throw new Error('offline'); },
    show: () => assert.fail('offline') }), false);
  assert.equal(await checkOnce({ ...opts, now: () => opts.now() + 86400001 }), true);
});

test('portable release reminder stays silent when its embedded release is already current', async t => {
  const opts = options(t);
  assert.equal(await checkOnce({ ...opts, localTag: version, show: () => assert.fail('current') }), false);
});

test('installed reminder ignores GPT-only releases and announces the DeepSeek package once', async t => {
  const opts = options(t, { ...release, assets: [{ ...asset, name: 'GPTNiang-v0.8.26-electron-win-x64.zip' }] });
  assert.equal(await checkInstalledOnce({ ...opts, show: () => assert.fail('wrong pet') }), false);
  const next = options(t);
  let shown = 0;
  assert.equal(await checkInstalledOnce({ ...next, show: () => { shown++; return true; } }), true);
  assert.equal(await checkInstalledOnce({ ...next, show: () => { shown++; return true; } }), false);
  assert.equal(shown, 1);
});
