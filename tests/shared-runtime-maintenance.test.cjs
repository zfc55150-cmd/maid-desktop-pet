'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {assertIndependentStopped}=require('../scripts/assert-shared-runtime-idle.cjs');
function connect(event,code){return()=>{const socket=new EventEmitter();socket.destroy=()=>{};socket.setTimeout=()=>{};queueMicrotask(()=>socket.emit(event,code?{code}:undefined));return socket;};}
test('shared runtime guard allows only a positively closed independent port',async()=>{assert.equal((await assertIndependentStopped({connect:connect('error','ECONNREFUSED')})).listening,false);await assert.rejects(assertIndependentStopped({connect:connect('connect')}),/3089 is running/);await assert.rejects(assertIndependentStopped({connect:connect('error','EACCES')}),/could not be confirmed/);});
