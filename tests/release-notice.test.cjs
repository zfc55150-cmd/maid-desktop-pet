'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  RELEASE_NOTICE_API,
  parseReleaseVersion,
  compareReleaseVersions,
  isNewerRelease,
  isAllowedReleaseUrl,
  sanitizeReleaseUrl,
  checkReleaseNotice,
  formatReleaseStatusText
} = require('../integrations/gpt-niang/product-electron/services/release-notice.cjs');
const { ProductHost } = require('../integrations/gpt-niang/product-electron/app/product-host.cjs');

test('semver comparison handles v-prefix, prerelease suffix, equality, and invalid tags', () => {
  assert.deepEqual(parseReleaseVersion('v1.0.0'), [1, 0, 0]);
  assert.deepEqual(parseReleaseVersion('1.0.1-beta.2'), [1, 0, 1]);
  assert.equal(compareReleaseVersions('v1.0.0', 'v1.0.1'), -1);
  assert.equal(isNewerRelease('v1.0.0', 'v1.0.1'), true);
  assert.equal(compareReleaseVersions('1.0.0', 'v1.0.0'), 0);
  assert.equal(isNewerRelease('1.0.0', 'v1.0.0'), false);
  assert.equal(compareReleaseVersions('v1.0.2', 'v1.0.1-rc.1'), 1);
  for (const invalid of ['', 'invalid', 'v1.0', 'v01.0.0', '1.2.3.4', null, undefined]) {
    assert.equal(parseReleaseVersion(invalid), null);
    assert.equal(compareReleaseVersions('v1.0.0', invalid), null);
    assert.equal(isNewerRelease('v1.0.0', invalid), false);
  }
});

test('url whitelist permits only zfc55150-cmd/maid-desktop-pet https urls', () => {
  assert.equal(RELEASE_NOTICE_API, 'https://api.github.com/repos/zfc55150-cmd/maid-desktop-pet/releases?per_page=10');
  assert.equal(isAllowedReleaseUrl('https://github.com/zfc55150-cmd/maid-desktop-pet/releases/tag/v1.0.1'), true);
  assert.equal(isAllowedReleaseUrl('https://github.com/zfc55150-cmd/maid-desktop-pet/releases'), true);
  assert.equal(isAllowedReleaseUrl('http://github.com/zfc55150-cmd/maid-desktop-pet/releases/tag/v1.0.1'), false);
  assert.equal(isAllowedReleaseUrl('https://github.com/T7moris/GPT-Niang/releases/tag/v1.3.6'), false);
  assert.equal(isAllowedReleaseUrl('https://evil.example.com/https://github.com/zfc55150-cmd/maid-desktop-pet/'), false);
  assert.equal(sanitizeReleaseUrl('https://github.com/other/repo/releases'), 'https://github.com/zfc55150-cmd/maid-desktop-pet/releases');
});

test('new version notifies once, persists lastNotifiedTag, and throttles daily automatic checks', async () => {
  const store = {};
  const notices = [];
  let fetchCount = 0;
  const nowBase = 1794110000000;
  const fakeFetch = async (url, init) => {
    fetchCount++;
    assert.equal(url, RELEASE_NOTICE_API);
    assert.ok(init.headers['User-Agent']);
    return {
      status: 200,
      ok: true,
      headers: {},
      json: async () => ([{
        tag_name: 'v1.0.1',
        draft: false, prerelease: false,
        html_url: 'https://github.com/zfc55150-cmd/maid-desktop-pet/releases/tag/v1.0.1'
      }])
    };
  };

  const first = await checkReleaseNotice({
    store,
    localTag: 'v1.0.0',
    mode: 'automatic',
    fetchImpl: fakeFetch,
    now: () => nowBase,
    onNotify: info => notices.push(info)
  });
  assert.equal(first.ok, true);
  assert.equal(first.notified, true);
  assert.equal(notices.length, 1);
  assert.match(notices[0].text, /v1\.0\.1/);
  assert.equal(store.latestTag, 'v1.0.1');
  assert.equal(store.lastNotifiedTag, 'v1.0.1');
  assert.equal(store.phase, 'available');
  assert.equal(store.checkedAt, nowBase);

  // Within 24h automatic check is throttled without hitting fetch
  const secondAuto = await checkReleaseNotice({
    store,
    localTag: 'v1.0.0',
    mode: 'automatic',
    fetchImpl: fakeFetch,
    now: () => nowBase + 3600000,
    onNotify: info => notices.push(info)
  });
  assert.equal(secondAuto.skipped, 'throttled');
  assert.equal(fetchCount, 1);
  assert.equal(notices.length, 1);

  // Even when forced / manual or after 24h, the same version never notifies a second time
  const thirdManual = await checkReleaseNotice({
    store,
    localTag: 'v1.0.0',
    mode: 'manual',
    force: true,
    fetchImpl: fakeFetch,
    now: () => nowBase + 90000000,
    onNotify: info => notices.push(info)
  });
  assert.equal(thirdManual.ok, true);
  assert.equal(thirdManual.notified, false);
  assert.equal(fetchCount, 2);
  assert.equal(notices.length, 1);
});

test('rate-limit responses (403/429 and X-RateLimit-Remaining:0) back off until reset time and offline errors report readable reason', async () => {
  const store = {};
  const nowBase = 1794110000000;
  const resetEpochSeconds = Math.floor((nowBase + 1800000) / 1000);
  let calls = 0;

  const rateLimited = await checkReleaseNotice({
    store,
    localTag: 'v1.0.0',
    mode: 'manual',
    force: true,
    now: () => nowBase,
    fetchImpl: async () => {
      calls++;
      return {
        status: 403,
        ok: false,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(resetEpochSeconds)
        },
        json: async () => ({ message: 'API rate limit exceeded' })
      };
    }
  });
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.state.phase, 'rate-limited');
  assert.equal(rateLimited.state.retryAfterAt, resetEpochSeconds * 1000);
  assert.match(formatReleaseStatusText(rateLimited.state), /限流|访问受限/);

  // Retry before reset time backs off without calling fetch
  const duringBackoff = await checkReleaseNotice({
    store,
    localTag: 'v1.0.0',
    mode: 'manual',
    force: true,
    now: () => nowBase + 60000,
    fetchImpl: async () => {
      calls++;
      throw new Error('Should not be called during backoff');
    }
  });
  assert.equal(duringBackoff.skipped, 'rate-limited');
  assert.equal(calls, 1);

  // After reset time, offline failure does not throw and sets a readable reason
  const offline = await checkReleaseNotice({
    store,
    localTag: 'v1.0.0',
    mode: 'manual',
    force: true,
    now: () => resetEpochSeconds * 1000 + 1000,
    fetchImpl: async () => {
      const err = new Error('connect ECONNREFUSED');
      err.code = 'ECONNREFUSED';
      throw err;
    }
  });
  assert.equal(offline.ok, false);
  assert.equal(offline.state.phase, 'failed');
  assert.match(formatReleaseStatusText(offline.state), /网络不可用.*ECONNREFUSED/);
});

test('ProductHost defaults portable release notice to enabled while keeping upstream installer disabled', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maid-release-notice-host-'));
  try {
    fs.mkdirSync(path.join(temp, 'portable'), { recursive: true });
    fs.mkdirSync(path.join(temp, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(temp, 'assets/quotes.json'), JSON.stringify({ quotes: ['测试语录'] }));
    fs.writeFileSync(path.join(temp, 'product.json'), JSON.stringify({
      version: '0.8.17-electron',
      releaseTag: 'v1.0.0',
      portable: true
    }));
    const stateDir = path.join(temp, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    // Simulate bootstrap-written automatic:false without userSetAutomatic
    fs.writeFileSync(path.join(stateDir, 'update-preferences.json'), JSON.stringify({ automatic: false }));

    const bubbles = [];
    let spawnedUpstream = 0;
    const host = new ProductHost({
      root: temp,
      dataDir: stateDir,
      serviceRoot: path.resolve(__dirname, '../integrations/gpt-niang/product-electron/services'),
      configPath: path.join(temp, 'installation.json'),
      testOnly: false,
      onReleaseNotice: info => bubbles.push(info),
      spawnNode: () => { spawnedUpstream++; return { once() {}, kill() {} }; },
      fetchImpl: async () => ({
        status: 200,
        ok: true,
        headers: {},
        json: async () => ([{
          tag_name: 'v1.1.0',
          draft: false, prerelease: false,
          assets: [{ name: 'GPTNiang-v0.8.26-electron-win-x64.zip', state: 'uploaded', size: 100 }],
          html_url: 'https://github.com/zfc55150-cmd/maid-desktop-pet/releases/tag/v1.1.0'
        }])
      })
    });

    assert.equal(host.snapshot().update.automatic, true);
    assert.equal(host.snapshot().update.upstreamPhase, 'disabled-portable');
    await host.checkUpdate('manual');
    assert.equal(spawnedUpstream, 0);
    assert.equal(bubbles.length, 1);
    assert.equal(host.snapshot().update.latestTag, 'v1.1.0');
    assert.equal(host.snapshot().update.lastNotifiedTag, 'v1.1.0');
    await host.close();
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('GPT ignores releases without an uploaded nonempty GPT package and clears stale notices', async () => {
  const gpt = { name: 'GPTNiang-v0.8.26-electron-win-x64.zip', state: 'uploaded', size: 100 };
  for (const payload of [
    { assets: [{ name: 'DeepSeekActionPet-v1.0.2-win-x64.zip', state: 'uploaded', size: 100 }] },
    { assets: [{ ...gpt, state: 'new' }] }, { assets: [{ ...gpt, size: 0 }] },
    { assets: [] }, { assets: [gpt], draft: true }, { assets: [gpt], prerelease: true }
  ]) {
    const store = { latestTag: 'v1.0.9', phase: 'available' };
    const result = await checkReleaseNotice({ store, localTag: 'v1.0.1', assetKind: 'gpt', force: true,
      fetchImpl: async () => ({ status: 200, json: async () => [{ tag_name: 'v1.0.2', draft: false, prerelease: false, ...payload }] }),
      onNotify: () => assert.fail('must not notify') });
    assert.equal(result.skipped, 'no-matching-release');
    assert.equal(result.state.hasUpdate, false);
  }
  let notified = 0;
  const result = await checkReleaseNotice({ store: {}, localTag: 'v1.0.1', assetKind: 'gpt', force: true,
    fetchImpl: async () => ({ status: 200, json: async () => [{ tag_name: 'v1.0.2', draft: false, prerelease: false, assets: [gpt] }] }),
    onNotify: () => notified++ });
  assert.equal(result.state.hasUpdate, true); assert.equal(notified, 1);
});

test('both pets select the highest compatible formal tag and retry early after no match', async () => {
  const gpt = 'GPTNiang-v0.8.32-electron-win-x64.zip';
  const release = (tag_name, ...names) => ({ tag_name, draft: false, prerelease: false,
    assets: names.map(name => ({ name, state: 'uploaded', size: 100 })) });
  const ds = tag => `DeepSeekActionPet-${tag}-win-x64.zip`;
  for (const [assetKind, other, own, expected] of [
    ['gpt', release('v1.0.6', ds('v1.0.6')), release('v1.0.4', gpt), 'v1.0.4'],
    ['deepseek', release('v1.0.6', gpt), release('v1.0.4', ds('v1.0.4')), 'v1.0.4']
  ]) {
    const store = { phase: 'current', checkedAt: 1794109999000, latestTag: 'v1.0.1' }, notified = [];
    let releases = [other];
    let at = 1794110000000, calls = 0;
    const check = () => checkReleaseNotice({ store, localTag: 'v1.0.1', assetKind, now: () => at,
      onNotify: notice => notified.push(notice.latestTag),
      fetchImpl: async () => { calls++; return { status: 200, json: async () => releases }; } });
    assert.equal((await check()).skipped, 'no-matching-release');
    releases = [other, release('v1.0.2', gpt, ds('v1.0.2')), own,
      { ...release('v1.0.9', gpt, ds('v1.0.9')), prerelease: true }];
    at += 1000;
    assert.equal((await check()).skipped, 'throttled');
    at += 3600000;
    assert.equal((await check()).state.latestTag, expected);
    assert.deepEqual(notified, [expected]);
    assert.equal(calls, 2);
    at += 3600000;
    assert.equal((await check()).skipped, 'throttled');
    at += 86400000;
    assert.equal((await check()).notified, false);
    assert.deepEqual(notified, [expected]);
  }
});
