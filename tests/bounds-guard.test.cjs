'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MIN_SIZE, MAX_SIZE, sanitizeBounds, createLogLimiter } = require('../app/electron-helper/bounds-guard.js');

const displays = [
  { x: 0, y: 0, width: 1920, height: 1040 },
  { x: -1280, y: 0, width: 1280, height: 720 }
];

test('sanitizeBounds rejects non-finite coordinates and clamps dimensions to [64, 4096]', () => {
  assert.equal(sanitizeBounds({ x: NaN, y: 0, width: 200, height: 200 }, displays).ok, false);
  const small = sanitizeBounds({ x: 100, y: 100, width: 10, height: 30 }, displays);
  assert.equal(small.ok, true);
  assert.equal(small.clampedSize, true);
  assert.deepEqual(small.rect, { x: 100, y: 100, width: MIN_SIZE, height: MIN_SIZE });

  const huge = sanitizeBounds({ x: 100, y: 100, width: 9999, height: 5000 }, displays);
  assert.equal(huge.clampedSize, true);
  assert.deepEqual(huge.rect, { x: 100, y: 100, width: MAX_SIZE, height: MAX_SIZE });
});

test('sanitizeBounds keeps near-edge flight windows intact and clamps fully off-screen windows', () => {
  const nearEdge = sanitizeBounds({ x: -100, y: 900, width: 320, height: 320 }, [{ x: 0, y: 0, width: 1920, height: 1040 }]);
  assert.equal(nearEdge.clampedPos, false);

  const farAway = sanitizeBounds({ x: 5000, y: 4000, width: 320, height: 320 }, displays);
  assert.equal(farAway.clampedPos, true);
  assert.equal(farAway.rect.x, 1920 - 64);
  assert.equal(farAway.rect.y, 1040 - 64);

  const onSecondary = sanitizeBounds({ x: -900, y: 200, width: 320, height: 320 }, displays);
  assert.equal(onSecondary.clampedPos, false);
  assert.equal(onSecondary.rect.x, -900);
});

test('createLogLimiter throttles repeated logs per reason within interval', () => {
  const allow = createLogLimiter(10_000);
  assert.equal(allow('size-clamped', 1000), true);
  assert.equal(allow('size-clamped', 5000), false);
  assert.equal(allow('position-clamped', 5000), true);
  assert.equal(allow('size-clamped', 11000), true);
});
