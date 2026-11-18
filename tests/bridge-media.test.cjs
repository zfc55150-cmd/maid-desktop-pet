'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseByteRange, corsHeaders } = require('../app/electron-helper/bridge-media.js');

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
});
