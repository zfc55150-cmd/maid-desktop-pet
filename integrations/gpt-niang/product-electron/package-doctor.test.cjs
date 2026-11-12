'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sha } = require('./app/file-integrity.cjs');
const { verify } = require('./app/package-doctor.cjs');

test('package doctor reports both versions and detects metadata and file drift', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpt-package-doctor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data));
  const version = '0.8.32-electron', releaseTag = 'v1.0.2';
  write('product.json', { version, releaseTag, compatRoot: root });
  write('package.json', { version, releaseTag });
  fs.writeFileSync(path.join(root, 'idle.webm'), 'synthetic video bytes');
  const maskBytes = 2 * 384 * 384 / 8;
  fs.writeFileSync(path.join(root, 'idle.bin'), Buffer.alloc(maskBytes));
  const metadata = file => ({ path: file, sha256: sha(path.join(root, file)), bytes: fs.statSync(path.join(root, file)).size });
  write('scenes.json', { clips: { idle: { file: 'idle.webm', frames: 2, fps: 30 } } });
  write('animation.json', { fps: 30, states: { idle: { frames: 2 } } });
  write('hit-masks.json', { size: 384, threshold: 10, entries: { idle: { file: 'idle.bin', frames: 2,
    sha256: metadata('idle.bin').sha256, videoSha256: metadata('idle.webm').sha256, bytes: maskBytes } } });
  write('package-manifest.json', { renderer: 'electron', version, releaseTag, clips: 1, frames: 2,
    files: ['product.json', 'package.json', 'idle.webm', 'idle.bin', 'scenes.json',
      'animation.json', 'hit-masks.json'].map(metadata) });
  assert.equal(verify(root).version, version);
  assert.equal(verify(root).releaseTag, releaseTag);
  write('package.json', { version, releaseTag: 'v1.0.3' });
  assert.throws(() => verify(root), /RELEASE_METADATA/);
  write('package.json', { version, releaseTag });
  fs.appendFileSync(path.join(root, 'idle.webm'), 'modified');
  assert.throws(() => verify(root), /FILE_HASH:idle\.webm/);
});
