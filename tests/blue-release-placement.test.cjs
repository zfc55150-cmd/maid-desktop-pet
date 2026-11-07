'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const shared=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/electron-helper/shared-core.js'),'utf8')+';PetShared;');
const source=fs.readFileSync(process.env.BLUE_RELEASE_TEST_SOURCE||path.join(__dirname,'../app/electron-helper/sprite.js'),'utf8');
function fixture({x=350,y=200,scale=1,mode='full',root='main',fast=false}={}){
 const c={S:shared,VIEW:{w:1600,h:1000},window:{__dshPetDebug:{}},toLocal:n=>n/scale,performance:{now:()=>1000},setTimeout(){},console:{log(){}}};vm.createContext(c);vm.runInContext(source+';globalThis.Sprite=PetSprite;',c);
 const moves=[],throws=[],clips=[];let spaceReads=0;
 const area={x:0,y:0,width:1600,height:1000};const space=shared.throwSpace({areas:[area],panels:[area],size:480,sideAllow:150});
 const s=Object.assign(Object.create(c.Sprite.prototype),{assetRoot:root,pet:{id:root},forms:{mode,press(){}},dragState:{active:true,dragging:true,sx:100,sy:100,petX:x-20,petY:y-10},pos:{x,y},physics:shared.DEFAULT_PHYSICS,
  dragTrail:fast?[{t:960,x:100,y:100},{t:980,x:200,y:100}]:[{t:700,x:80,y:90},{t:800,x:100,y:100}],
  halfW:240,halfH:135,bottomPad:22.5,animations:{idle:['idle'],landing:['landing']},anim:'grab',pendingSquash:true,hit:{classList:{remove(){}}},stage:{style:{}},syncInputBusy(){},stopDragFollow(){},
  resumeWorkStatusAnim:()=>false,playOnce(n){clips.push(n)},switchTo(n){clips.push(n)},sendBounds(px,py){this.pos={x:Math.round(px),y:Math.round(py)};moves.push({...this.pos})},startThrow(...args){throws.push(args)},throwSpaceOf(){spaceReads++;return space;}});
 const release=()=>s.onPointerUp({type:'pointerup',screenX:120*scale,screenY:110*scale});
 return {s,release,moves,throws,clips,space,get spaceReads(){return spaceReads}};
}
test('slow BlueWhale placement remains where released, including edges, with real stale-trail velocity detection',()=>{
 for(const scale of [1,1.25,1.5])for(const mode of ['full','bust'])for(const [x,y] of [[350,200],[-160,30],[1400,50],[350,-20],[350,725],[350,760]]){
  const f=fixture({x,y,scale,mode});f.release();assert.equal(f.throws.length,0,`unexpected gravity at ${x},${y}, scale=${scale}, ${mode}`);assert.equal(f.s.pos.x,x);assert.equal(f.s.pos.y,y);assert.equal(f.spaceReads,0,'manual placement must not consult throw boundaries');assert.equal(f.s.customPos.rx,(x+240)/1600);assert.equal(f.s.customPos.ry,(y+135)/1000);
  assert.equal(f.s.dragState.active,false);assert.equal(f.s.dragState.dragging,false);if(mode==='full')assert.deepEqual(f.clips,['idle']);
 }
});
test('real fast release still enters unchanged throw physics',()=>{const f=fixture({fast:true});f.release();assert.equal(f.throws.length,1);assert.equal(f.throws[0][0],350);assert.equal(f.throws[0][1],200);assert.ok(f.throws[0][2]>500);assert.equal(f.throws[0][3],0);});
test('other file pets retain current slow-release gravity and near-floor landing',()=>{
 const air=fixture({root:'other'});air.release();assert.deepEqual(air.throws,[[350,200,0,0]]);
 const ground=fixture({root:'other',y:725});ground.release();assert.equal(ground.throws.length,0);assert.equal(ground.s.pos.y,730);assert.deepEqual(ground.clips,['landing']);
});
