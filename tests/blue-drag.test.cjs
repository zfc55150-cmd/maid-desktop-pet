'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const shared=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/electron-helper/shared-core.js'),'utf8')+';PetShared;');
const source=fs.readFileSync(process.env.BLUE_DRAG_TEST_SOURCE||path.join(__dirname,'../app/electron-helper/sprite.js'),'utf8');
function fixture(scale=1,mode='bust',assetRoot='main'){
 let time=100;const context={window:{__dshPetDebug:{}},VIEW:{w:1600,h:1000},S:{...shared,estimateReleaseVelocity:()=>({vx:20,vy:0})},toLocal:x=>x/scale,performance:{now:()=>time+=16},console:{log(){}},setTimeout(){},requestAnimationFrame(){throw Error('Unexpected spring RAF for BlueWhale');}};
 vm.createContext(context);vm.runInContext(source+';globalThis.Sprite=PetSprite;',context);
 const moves=[],switches=[];let springs=0,thrown;
 const s=Object.assign(Object.create(context.Sprite.prototype),{assetRoot,pet:{id:'main'},forms:{mode,press(){}},dragState:{active:true,dragging:false,sx:600/scale,sy:300/scale,petX:200,petY:150},pos:{x:200,y:150},halfW:240,halfH:135,dragTrail:[],stage:{style:{}},bottomPad:22.5,animations:{drag:['drag'],idle:['idle']},physics:shared.DEFAULT_PHYSICS,hit:{classList:{remove(){}}},syncInputBusy(){},switchTo(n){switches.push(n)},sendBounds(x,y){this.pos={x:Math.round(x),y:Math.round(y)};moves.push({...this.pos})},startDragFollow(){springs++},stopDragFollow(){this.dragTarget=null},startThrow(...args){thrown=args},setTip(){}});
 return {s,moves,switches,get springs(){return springs},get thrown(){return thrown}};
}
test('BlueWhale follows screen displacement immediately at 100/125/150% without moving-window feedback',()=>{
 for(const scale of [1,1.25,1.5]){
  const f=fixture(scale);for(const delta of [30,60,90,60,-30]){f.s.onPointerMove({screenX:600+delta,screenY:300+delta/2,clientX:999-delta});assert.deepEqual(f.s.pos,{x:Math.round(200+delta/scale),y:Math.round(150+delta/2/scale)});}
  const n=f.moves.length;f.s.onPointerMove({screenX:570,screenY:285,clientX:-999});assert.deepEqual(f.moves.at(-1),f.moves[n-1]);assert.equal(f.springs,0);
 }
});
test('half-body dragging never loads a hidden full-body drag video; full-body loads once',()=>{
 const bust=fixture();bust.s.onPointerMove({screenX:630,screenY:330});assert.equal(bust.switches.length,0);
 const full=fixture(1,'full');full.s.onPointerMove({screenX:630,screenY:330});full.s.onPointerMove({screenX:640,screenY:340});assert.deepEqual(full.switches,['drag']);
});
test('other file pets retain their existing spring path',()=>{const f=fixture(1,'full','other');f.s.onPointerMove({screenX:630,screenY:330});assert.equal(f.springs,1);assert.equal(f.moves.length,0);});
test('click below threshold and inactive input cannot move the window',()=>{const f=fixture();f.s.onPointerMove({screenX:601,screenY:301});assert.equal(f.moves.length,0);f.s.dragState.active=false;f.s.onPointerMove({screenX:700,screenY:400});assert.equal(f.moves.length,0);});
test('pointerup uses the newest final screen sample before handing off throw physics',()=>{const f=fixture(1.5);f.s.onPointerMove({screenX:630,screenY:330});f.s.onPointerUp({type:'pointerup',screenX:660,screenY:345});assert.deepEqual(f.thrown,[240,180,20,0]);assert.equal(f.s.dragState.active,false);});
test('cancel cannot jump to bogus release coordinates or invent a throw',()=>{const f=fixture();f.s.onPointerMove({screenX:630,screenY:330});f.s.onPointerUp({type:'pointercancel',screenX:0,screenY:0});assert.equal(f.thrown,undefined);assert.deepEqual(f.s.pos,{x:230,y:180});});
test('full-body release leaves the grab animation before starting physical flight',()=>{const f=fixture(1,'full');f.s.onPointerMove({screenX:630,screenY:330});f.s.onPointerUp({type:'pointerup',screenX:660,screenY:345});assert.deepEqual(f.switches,['drag','idle']);assert.equal(f.s.dragState.active,false);assert.equal(f.s.dragState.dragging,false);assert.ok(f.thrown);});

function flightFixture(mode='full'){
 let clock=0,id=0,squashes=0;const raf=new Map();
 const c={window:{__dshPetDebug:{}},S:shared,VIEW:{w:1600,h:1000},toScreen:x=>x,performance:{now:()=>clock},requestAnimationFrame:fn=>{raf.set(++id,fn);return id},cancelAnimationFrame:n=>raf.delete(n),console:{log(){}}};vm.createContext(c);vm.runInContext(source+';globalThis.Sprite=PetSprite;',c);
 const area={x:0,y:0,width:1600,height:1000},space=shared.throwSpace({areas:[area],panels:[area],size:480,sideAllow:150});const floor=space.bounds[0].maxY;
 const s=Object.assign(Object.create(c.Sprite.prototype),{assetRoot:'main',forms:{mode},pet:{id:'main'},physics:shared.DEFAULT_PHYSICS,throwToken:0,throwRef:null,dragState:{active:false,dragging:false},size:480,halfW:240,halfH:135,bottomPad:22.5,front:0,videoA:{},pos:{x:200,y:floor},animations:{idle:['idle'],landing:[]},stopDragFollow(){},stopMove(){},throwSpaceOf:()=>space,sendBounds(x,y){this.pos={x,y}},startSquash(){squashes++},resumeWorkStatusAnim:()=>false,switchTo(){},lastFlightReport:0});
 function run(){for(let n=0;n<1000&&raf.size;n++){const [key,fn]=raf.entries().next().value;raf.delete(key);clock+=1000/60;fn();}assert.equal(raf.size,0,'throw did not settle');}
 return {s,floor,run,get squashes(){return squashes}};
}
test('horizontal ground coasting settles without restarting landing squash every frame',()=>{const f=flightFixture();f.s.startThrow(200,f.floor,200,0);f.run();assert.equal(f.squashes,0);assert.equal(f.s.throwRef,null);assert.equal(f.s.pos.y,f.floor);});
test('an airborne throw can bounce and then settle; half-body never squashes hidden video',()=>{for(const mode of ['full','bust']){const f=flightFixture(mode);f.s.startThrow(200,f.floor-300,150,300);f.run();assert.equal(f.s.throwRef,null);assert.equal(f.s.pos.y,f.floor);if(mode==='full')assert.ok(f.squashes>0&&f.squashes<20);else assert.equal(f.squashes,0);}});

test('an old grab-video frame cannot overwrite an idle frame already committed after release',async()=>{
 let id=0;const timers=new Map(),timer=fn=>{timers.set(++id,fn);return id},clear=n=>timers.delete(n);const c={S:shared,window:{setTimeout:timer,clearTimeout:clear},setTimeout:timer,clearTimeout:clear,console};vm.createContext(c);vm.runInContext(source+';globalThis.Sprite=PetSprite;',c);
 const video=()=>{const listeners=new Set();return{src:'',readyState:0,style:{},classList:{add(){},remove(){}},callbacks:[],load(){},pause(){},play(){return Promise.resolve()},addEventListener(_,f){listeners.add(f)},removeEventListener(_,f){listeners.delete(f)},requestVideoFrameCallback(f){this.callbacks.push(f)},loaded(){for(const f of [...listeners])f()}}};
 const s=Object.assign(Object.create(c.Sprite.prototype),{pet:{id:'main'},front:0,gen:0,pending:null,_idleRollTimer:null,anim:'idle',videoA:video(),videoB:video(),assetBase:'https://synthetic.invalid/',facing:'left',_scheduleIdleRoll(){}});
 s.switchTo('grab',true);s.videoB.readyState=2;s.videoB.loaded();await Promise.resolve();const late=s.videoB.callbacks.shift();assert.ok(late);s.switchTo('idle-after-release',true);s.videoB.readyState=3;s.videoB.loaded();await Promise.resolve();const latest=s.videoB.callbacks.shift();assert.ok(latest);latest();const front=s.front;late();assert.equal(s.anim,'idle-after-release');assert.equal(s.front,front);
});
