'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moveOnly, windowCoordinate } = require('./app/desktop-geometry.cjs');
const { placeAtFeet } = require('./app/presentation-layout.cjs');

test('window placement normalizes signed zero on either axis and keeps negative monitor coordinates', () => {
  const moves = [];
  const window = { setPosition: (...args) => moves.push(args) };
  moveOnly(window, { x: -0.49, y: -0 });
  moveOnly(window, { x: -1920.4, y: -0.51 });
  assert.deepEqual(moves, [[0, 0, false], [-1920, -1, false]]);
  const area = { x: -100, y: -100, width: 800, height: 800 };
  assert.deepEqual(placeAtFeet({ x: -0.4, y: -0.4, width: 384, height: 384 }, 384, area),
    { x: 0, y: 0, width: 384, height: 384 });
});

test('window coordinate conversion rejects values outside the native signed range', () => {
  for (const invalid of [NaN, Infinity, '10', -2147483649, 2147483648]) {
    assert.throws(() => windowCoordinate(invalid), { message: 'POSITION_RANGE' });
  }
});
