'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {merge}=require('../integrations/gpt-niang/electron/prepare-profile-sync.cjs');
test('shared animation profile updates both entry routes without changing preference or event switches',()=>{
 const a={pets:[{size:640,position:{marginX:9},balanceEnabled:false,workStatusEnabled:false}],whisperPrompt:'SYNTHETIC',voiceEnabled:false,animations:{idle:['old']}};
 const bytes=Buffer.from(JSON.stringify(a)),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const b=merge({characterId:'gptniang',animations:{idle:['new'],actionRegistry:{clips:[]}},geometry:{feetY:359}},bytes,sha);
 assert.deepEqual(b.pets,a.pets);assert.equal(b.whisperPrompt,a.whisperPrompt);assert.equal(b.voiceEnabled,false);assert.deepEqual(b.animations.idle,['new']);
 assert.throws(()=>merge({characterId:'gptniang'},bytes,'0'.repeat(64)),/changed since review/);
});
