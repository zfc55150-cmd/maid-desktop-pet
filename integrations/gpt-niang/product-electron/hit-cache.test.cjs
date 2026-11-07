'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{FrameAdmission}=require('./app/hit-cache.cjs');
test('evicted route masks retain previous hit and reject late frames from a replaced request',async()=>{
 const waits=new Map(),resident=new Map([['old',Buffer.alloc(1)]]),pins=[],accepted=[],errors=[];let request=1;
 const cache={pin:n=>pins.push(n),get:n=>resident.get(n),load:n=>new Promise(resolve=>waits.set(n,()=>{resident.set(n,Buffer.alloc(1));resolve();}))};
 const gate=new FrameAdmission({cache,owns:d=>d.requestId===request,retained:()=>['old'],accept:d=>accepted.push(d),onError:()=>errors.push('MASK')});
 gate.push({clip:'route',frame:0,requestId:1});gate.push({clip:'route',frame:1,requestId:1});assert.equal(accepted.length,0);assert(pins.every(p=>p.includes('old')));
 request=2;gate.push({clip:'next',frame:0,requestId:2});waits.get('route')();await new Promise(setImmediate);assert.equal(accepted.length,0);waits.get('next')();await new Promise(setImmediate);assert.deepEqual(accepted,[{clip:'next',frame:0,requestId:2}]);assert.equal(errors.length,0);
 gate.push({clip:'next',frame:1,requestId:2});assert.equal(accepted.at(-1).frame,1);
});
