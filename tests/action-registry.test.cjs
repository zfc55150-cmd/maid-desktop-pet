'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../integrations/gpt-niang/electron/action-registry.cjs');
const data = { clips: [
  { clipId: 'a', aliases: ['wave', 'alias'], entryPose: 'front', requiredProps: [], allowedTriggers: ['daily', 'manual'], autoEligible: true },
  { clipId: 'b', aliases: ['cupreturn'], entryPose: 'tea', requiredProps: ['cup'], allowedTriggers: ['transition'], autoEligible: false },
  { clipId: 'c', aliases: ['unknown'], entryPose: 'unknown', allowedTriggers: ['daily'], autoEligible: true },
  { clipId: 'd', aliases: ['event'], entryPose: 'front', allowedTriggers: ['event'], autoEligible: false },
] };
test('aliases have one identity and cannot increase selection weight', () => {
  const r = create(data);
  assert.deepEqual(r.unique(['wave', 'alias', 'event']), ['wave', 'event']);
  r.record('wave');
  assert.equal(r.choose(['alias'], { pose: 'front', trigger: 'daily' }), null);
});
test('return edges require explicit pose, props and transition trigger', () => {
  const r = create(data);
  assert.equal(r.canEnter('cupreturn', { pose: 'front', trigger: 'daily' }), false);
  assert.equal(r.canEnter('cupreturn', { pose: 'tea', trigger: 'transition' }), false);
  assert.equal(r.canEnter('cupreturn', { pose: 'tea', props: ['cup'], trigger: 'transition' }), true);
  assert.equal(r.canEnter('cupreturn', { pose: 'tea', props: ['cup'], trigger: 'manual' }), false);
});
test('unknown semantics and event clips stay outside automatic daily choice', () => {
  const r = create(data);
  assert.equal(r.choose(['unknown', 'event'], { pose: 'front', trigger: 'daily' }), null);
  assert.equal(r.canEnter('event', { pose: 'front', trigger: 'event' }), true);
});
