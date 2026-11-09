'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FlightPacing}=require('./app/flight-pacing.cjs');

test('120 Hz paint pulses advance one flight clock without timer interference',()=>{
 const steps=[],clock=new FlightPacing(dt=>steps.push(dt));
 clock.start(0);
 for(let t=8;t<=64;t+=8){
  assert.equal(clock.pulse(t),true);
  assert.equal(clock.fallback(t+1),false);
 }
 assert.deepEqual(steps,Array(8).fill(.008));
});

test('the timer advances stalled flight and a resumed pulse cannot double-step',()=>{
 const steps=[],clock=new FlightPacing(dt=>steps.push(dt));
 clock.start(0);
 assert.equal(clock.pulse(8),true);
 assert.equal(clock.fallback(47),false);
 assert.equal(clock.fallback(48),true);
 assert.equal(clock.pulse(49),false);
 assert.equal(clock.pulse(57),true);
 assert.deepEqual(steps,[.008,.04,.009]);
});
