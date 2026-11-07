'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {verifyManifest} = require('../scripts/verify.cjs');
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
  const manifest = {version: '1.0.0', files: [{source: 'app/code.js', target: 'code.js', sha256: crypto.createHash('sha256').update('synthetic source').digest('hex')}]};
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
