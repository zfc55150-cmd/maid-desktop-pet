'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseByteRange, corsHeaders, isAllowedOrigin, readOrigin } = require('../app/electron-helper/bridge-media.js');

test('parseByteRange handles full, partial, suffix, and unsatisfiable ranges', () => {
  assert.deepEqual(parseByteRange(null, 100), { kind: 'full', start: 0, end: 99, size: 100 });
  assert.deepEqual(parseByteRange('bytes=0-9', 100), {
    kind: 'partial',
    start: 0,
    end: 9,
    length: 10,
    size: 100,
    contentRange: 'bytes 0-9/100',
  });
  assert.deepEqual(parseByteRange('bytes=90-999', 100), {
    kind: 'partial',
    start: 90,
    end: 99,
    length: 10,
    size: 100,
    contentRange: 'bytes 90-99/100',
  });
  assert.deepEqual(parseByteRange('bytes=-15', 100), {
    kind: 'partial',
    start: 85,
    end: 99,
    length: 15,
    size: 100,
    contentRange: 'bytes 85-99/100',
  });
  assert.deepEqual(parseByteRange('bytes=100-120', 100), { kind: 'unsatisfiable', size: 100 });
  assert.deepEqual(parseByteRange('bytes=20-10', 100), { kind: 'unsatisfiable', size: 100 });
  assert.deepEqual(parseByteRange('bytes=0-1,2-3', 100), { kind: 'unsatisfiable', size: 100 });
  assert.deepEqual(parseByteRange('bytes=0-0', 0), { kind: 'unsatisfiable', size: 0 });
});

test('corsHeaders restricts Access-Control-Allow-Origin to local/null origins', () => {
  const fileHeaders = corsHeaders({ headers: { get: (k) => (k === 'origin' ? 'file://' : '') } }, 'video/mp4');
  assert.equal(fileHeaders['access-control-allow-origin'], 'file://');
  assert.equal(fileHeaders['content-type'], 'video/mp4');

  const nullHeaders = corsHeaders({ headers: { origin: 'null' } });
  assert.equal(nullHeaders['access-control-allow-origin'], 'null');

  const evilHeaders = corsHeaders({ headers: { origin: 'https://evil.example' } }, 'application/json');
  assert.equal(evilHeaders['access-control-allow-origin'], undefined);
  assert.equal(evilHeaders['content-type'], 'application/json');
  assert.equal(readOrigin({ headers: { Origin: ' https://evil.example ' } }), 'https://evil.example');
  assert.equal(isAllowedOrigin('https://evil.example'), false);
  assert.equal(isAllowedOrigin('file://'), true);
});

test('electron-helper main.js enforces bridge origin 403, async DPI probe, cached workAreas, and safe windows init', () => {
  const mainSrc = fs.readFileSync(path.join(__dirname, '../app/electron-helper/main.js'), 'utf8');
  assert.equal(mainSrc.includes('execFileSync'), false, 'startup must not synchronously spawn DPI probe');
  assert.equal(mainSrc.includes("typeof windows === 'undefined'"), false, 'avoid TDZ dead guard on const windows');
  const winDecl = mainSrc.indexOf('const windows = new Map()');
  const secondInst = mainSrc.indexOf("app.on('second-instance'");
  assert.ok(winDecl > 0 && secondInst > winDecl, 'windows Map must be declared before second-instance handler');
  assert.match(mainSrc, /status:\s*403/);
  assert.match(mainSrc, /sanitizeBounds\(bounds,\s*cachedWorkAreas/);
  assert.match(mainSrc, /release reminder disabled: unable to resolve local release tag/);
});
