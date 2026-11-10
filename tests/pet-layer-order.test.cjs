'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {shouldReassertTopmost,raiseOnInteraction}=require('../app/electron-helper/topmost-watchdog');
test('idle watchdog preserves peer order beyond multiple former reassert intervals',()=>{
  const state={lastAssertMs:0,destroyed:false,visible:true,paused:false,alwaysOnTop:true};
  for(const nowMs of [1000,5000,10000,60000,3600000])assert.equal(shouldReassertTopmost({...state,nowMs}),false);
  assert.equal(shouldReassertTopmost({...state,alwaysOnTop:false,nowMs:6000}),true);
  for(const change of [{visible:false},{destroyed:true},{paused:true}])assert.equal(shouldReassertTopmost({...state,alwaysOnTop:false,nowMs:6000,...change}),false);
  assert.equal(shouldReassertTopmost({...state,alwaysOnTop:false,nowMs:1000}),false);
});
test('a new interaction raises its own pet once and a later interaction can reverse order',()=>{
  let order=['deepseek','gpt'];
  const win=name=>({isDestroyed:()=>false,isVisible:()=>true,isAlwaysOnTop:()=>true,setAlwaysOnTop:()=>assert.fail('an already topmost pet need not change bands'),moveTop:()=>{order=[name,...order.filter(x=>x!==name)];}});
  const ds=win('deepseek'),gpt=win('gpt');
  assert.equal(raiseOnInteraction(gpt,false,true),true);assert.equal(order[0],'gpt');
  assert.equal(raiseOnInteraction(ds,false,true),true);assert.equal(order[0],'deepseek');
  assert.equal(raiseOnInteraction(gpt,false,true),true);assert.equal(order[0],'gpt');
  assert.equal(raiseOnInteraction(ds,true,true),false);assert.equal(order[0],'gpt');
  assert.equal(raiseOnInteraction(ds,true,false),false);assert.equal(order[0],'gpt');
  assert.equal(raiseOnInteraction({...ds,isDestroyed:()=>true},false,true),false);
  assert.equal(raiseOnInteraction({...ds,isVisible:()=>false},false,true),false);
});
