'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {verifyManifest, PORTABLE_DSH_HOME_SNIPPET} = require('../scripts/verify.cjs');

test('generated product copies match their canonical sources', () => {
  assert.equal(require('../scripts/sync-shared.cjs').syncShared(), 5);
});
const root = path.resolve(__dirname, '..');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(root, '.test-data-maintenance-'));
  t.after(() => {
    assert.ok(path.resolve(dir).startsWith(root + path.sep + '.test-data-maintenance-'));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  fs.mkdirSync(path.join(dir, 'app'));
  fs.writeFileSync(path.join(dir, 'app/code.js'), 'synthetic source');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({version: '1.0.0'}));
  const manifest = {version: '1.0.0', files: [{source: 'app/code.js', target: 'code.js', sha256: crypto.createHash('sha256').update('synthetic source').digest('hex'), previousSha256: null}]};
  const save = () => fs.writeFileSync(path.join(dir, 'deployment.json'), JSON.stringify(manifest));
  save();
  return {dir, manifest, save};
}

test('maintenance verification distinguishes source checks from installed checks', t => {
  const {dir} = fixture(t);
  assert.equal(verifyManifest({root: dir}).installedFiles, null);
  const installed = path.join(dir, 'installed'); fs.mkdirSync(installed);
  fs.copyFileSync(path.join(dir, 'app/code.js'), path.join(installed, 'code.js'));
  assert.equal(verifyManifest({root: dir, installedRoot: installed}).installedFiles, 1);
  fs.writeFileSync(path.join(installed, 'code.js'), 'different installed version');
  assert.throws(() => verifyManifest({root: dir, installedRoot: installed}), /Installed hash mismatch/);
});

test('source drift cannot pass the preflight', t => {
  const {dir} = fixture(t); fs.writeFileSync(path.join(dir, 'app/code.js'), 'unreviewed source');
  assert.throws(() => verifyManifest({root: dir}), /Source hash mismatch/);
});

test('deployment entries cannot escape source or target boundaries', t => {
  const {dir, manifest, save} = fixture(t);
  manifest.files[0].source = '../outside'; save();
  assert.throws(() => verifyManifest({root: dir}), /escapes/);
  manifest.files[0].source = 'app/code.js'; manifest.files[0].target = '../outside'; save();
  assert.throws(() => verifyManifest({root: dir}), /escapes/);
});

test('duplicate destination files cannot silently overwrite each other', t => {
  const {dir, manifest, save} = fixture(t);
  fs.writeFileSync(path.join(dir, 'app/other.js'), 'synthetic source');
  manifest.files.push({...manifest.files[0], source: 'app/other.js', target: 'CODE.JS'}); save();
  assert.throws(() => verifyManifest({root: dir}), /Duplicate deployment target/);
});

test('a manifest for a different release cannot pass the preflight', t => {
  const {dir, manifest, save} = fixture(t); manifest.version = '2.0.0'; save();
  assert.throws(() => verifyManifest({root: dir}), /version/);
});

test('missing previousSha256 and strictMetadata releaseTag mismatches are rejected', t => {
  const {dir, manifest, save} = fixture(t);
  delete manifest.files[0].previousSha256; save();
  assert.throws(() => verifyManifest({root: dir}), /previousSha256/);
  manifest.files[0].previousSha256 = null; save();
  assert.throws(() => verifyManifest({root: dir, strictMetadata: true}), /releaseTag/);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({version: '1.0.0', releaseTag: 'v1.0.7'}));
  fs.mkdirSync(path.join(dir, 'app/electron-helper'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'app/electron-helper/package.json'), JSON.stringify({version: '1.0.0', releaseTag: 'v1.0.4'}));
  assert.throws(() => verifyManifest({root: dir, strictMetadata: true}), /mismatch/);
  fs.writeFileSync(path.join(dir, 'app/electron-helper/package.json'), JSON.stringify({version: '1.0.0', releaseTag: 'v1.0.7'}));
  assert.equal(verifyManifest({root: dir, strictMetadata: true}).version, '1.0.0');
  assert.throws(() => verifyManifest({root: dir, strictMetadata: true, checkAppCompleteness: true}), /Unregistered app file/);
});

test('repository deployment.json satisfies app completeness and immediate predecessor previousRef hash chain', () => {
  const result = verifyManifest({root, strictMetadata: true, checkAppCompleteness: true});
  assert.ok(result.sourceFiles >= 56);
  assert.ok(result.previousRef, 'deployment.json must declare previousRef for value verification');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const tagsOut = spawnSync('git', ['tag', '--sort=-v:refname'], {cwd: root, encoding: 'utf8', windowsHide: true});
  if (tagsOut.status === 0) {
    const ver = t => t.slice(1).split('.').map(Number);
    const cmp = (a, b) => ver(a)[0] - ver(b)[0] || ver(a)[1] - ver(b)[1] || ver(a)[2] - ver(b)[2];
    const formalTags = tagsOut.stdout.split(/\r?\n/).map(s => s.trim()).filter(t => /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(t));
    const predecessors = formalTags.filter(t => cmp(t, pkg.releaseTag) < 0).sort((a, b) => cmp(b, a));
    if (predecessors.length > 0) {
      assert.equal(result.previousRef, predecessors[0], `previousRef (${result.previousRef}) must equal immediate predecessor tag (${predecessors[0]}) of ${pkg.releaseTag}`);
    }
  }
});

test('verifyManifest validates previousRef format, supports skipPreviousRefCheck, and accepts portable DSH_HOME main.js', t => {
  const {dir, manifest, save} = fixture(t);
  manifest.previousRef = '--invalid-flag';
  save();
  assert.throws(() => verifyManifest({root: dir, strictMetadata: false, previousRef: '--invalid-flag'}), /Invalid previousRef format/);
  manifest.previousRef = 'v99.99.99';
  save();
  assert.equal(verifyManifest({root: dir, skipPreviousRefCheck: true}).previousRef, null);

  const portable = path.join(dir, 'portable');
  fs.mkdirSync(path.join(portable, 'node_modules/dsh-pet/runtime/electron-helper'), {recursive: true});
  fs.writeFileSync(path.join(portable, 'Start-DeepSeek-Niang.cmd'), '@echo off\r\n');
  const mainSrc = "app.setName('dsh-pet-electron-helper');\n";
  const mainTarget = 'node_modules/dsh-pet/runtime/electron-helper/main.js';
  fs.writeFileSync(path.join(dir, 'app/code.js'), mainSrc);
  manifest.files[0].target = mainTarget;
  manifest.files[0].sha256 = crypto.createHash('sha256').update(mainSrc).digest('hex');
  manifest.files.push({
    source: 'app/restricted.png',
    target: 'node_modules/dsh-pet/runtime/electron-helper/deepseek-bust.png',
    sha256: crypto.createHash('sha256').update('png').digest('hex'),
    previousSha256: null,
    restricted: true
  });
  fs.writeFileSync(path.join(dir, 'app/restricted.png'), 'png');
  save();
  fs.writeFileSync(path.join(portable, mainTarget), mainSrc + PORTABLE_DSH_HOME_SNIPPET);
  fs.writeFileSync(path.join(portable, 'node_modules/dsh-pet/runtime/electron-helper/release-tag.json'), JSON.stringify({tag: 'v1.0.8', maintenanceVersion: '1.0.0'}));
  assert.equal(verifyManifest({root: dir, installedRoot: portable, skipPreviousRefCheck: true}).installedFiles, 2);
});
