const {test}=require('node:test'),assert=require('node:assert/strict');
const {Player}=require('./video-player.js');
class Video extends EventTarget {
 constructor(){super();this.style={};this.callbacks=new Map();this.serial=0;this.paused=true;this.src='';}
 pause(){this.paused=true;}async play(){this.paused=false;}
 load(){}removeAttribute(){this.src='';}
 requestVideoFrameCallback(fn){const id=++this.serial;this.callbacks.set(id,fn);return id;}
 cancelVideoFrameCallback(id){this.callbacks.delete(id);}
 ready(){this.dispatchEvent(new Event('loadeddata'));}
 frame(mediaTime=0){const pending=[...this.callbacks];this.callbacks.clear();for(const [,fn]of pending)fn(0,{mediaTime,presentedFrames:1});}
}
const flush=()=>new Promise(setImmediate),step=(clip,other={})=>({clip,frames:180,fps:30,...other});
function fixture(extra={}){const videos=[new Video(),new Video()];let now=0,serial=0;const rafs=new Map();const p=new Player(videos,x=>'file:///'+x+'.webm',{now:()=>now,raf:fn=>{rafs.set(++serial,fn);return serial;},cancelRaf:id=>rafs.delete(id),...extra});return {p,videos,rafs,advance:ms=>{now=ms;const f=[...rafs.values()];rafs.clear();f.forEach(fn=>fn());}};}
async function commit(v){v.ready();await flush();v.frame();await flush();}
test('older decoded callback cannot overwrite a newer action',async()=>{
 const {p,videos}=fixture();const old=p.playSequence([step('old')]);videos[0].ready();await flush();const late=[...videos[0].callbacks.values()][0];
 const newer=p.playSequence([step('new')]);await commit(videos[0]);assert.equal(await old,false);assert.equal(await newer,true);late(0,{mediaTime:0});assert.equal(p.clip,'new');p.dispose();
});
test('natural return preserves sequence; old presentation callbacks cannot revive on slot reuse',async()=>{
 const {p,videos}=fixture();const started=p.playSequence([step('a'),step('return'),step('idle',{loop:true})]);await commit(videos[0]);await started;
 const oldEnd=videos[0].onended,oldMonitor=[...videos[0].callbacks.values()][0];oldEnd();await commit(videos[1]);videos[1].onended();await commit(videos[0]);
 assert.equal(p.clip,'idle');const n=p.frames.length;oldMonitor(0,{mediaTime:4});oldEnd();assert.equal(p.frames.length,n);assert.equal(p.clip,'idle');p.dispose();
});
test('new pending request suppresses an old natural return',async()=>{
 const {p,videos}=fixture();const a=p.playSequence([step('a'),step('return')]);await commit(videos[0]);await a;const oldEnd=videos[0].onended;
 const b=p.playSequence([step('new')]);oldEnd();await commit(videos[1]);assert.equal(await b,true);assert.equal(p.clip,'new');assert.equal(p.trace.some(x=>x.event==='request'&&x.clip==='return'),false);p.dispose();
});
test('decode failure retains visible slot and clears pending request',async()=>{
 const {p,videos}=fixture();const a=p.playSequence([step('idle')]);await commit(videos[0]);await a;
 const b=p.playSequence([step('broken')]);videos[1].dispatchEvent(new Event('error'));assert.equal(await b,false);assert.equal(p.front,0);assert.equal(p.clip,'idle');assert.equal(p.pendingCancel,null);p.dispose();
});
test('takeoff rate boundary and disposal clean callbacks',async()=>{
 const {p,videos,rafs,advance}=fixture();const a=p.playSequence([step('flutter',{rateTransition:{frame:66,afterMs:1200,speed:1.25}})]);await commit(videos[0]);await a;
 assert.equal(videos[0].playbackRate,66/30/1.2);advance(1500);videos[0].frame(65.5/30);assert.equal(videos[0].playbackRate,66/30/1.2);videos[0].frame(66/30);assert.equal(videos[0].playbackRate,1.25);
 const pending=p.playSequence([step('landing')]);p.dispose();assert.equal(await pending,false);assert.equal(rafs.size,0);assert.equal(videos[0].callbacks.size,0);assert.equal(videos[1].callbacks.size,0);assert.equal(videos[0].style.opacity,'0');
});
test('failed request cannot later commit even without a newer request',async()=>{
 const {p,videos}=fixture();const a=p.playSequence([step('broken')]);const late=[...videos[0].callbacks.values()][0];
 videos[0].dispatchEvent(new Event('error'));assert.equal(await a,false);late(0,{mediaTime:0});assert.equal(p.front,-1);assert.equal(p.trace.some(x=>x.event==='commit'),false);p.dispose();
});
test('invalid timeline is rejected before disturbing current ownership',()=>{
 const {p}=fixture();for(const options of [{speed:Infinity},{speed:NaN},{fadeMs:-1},{frames:0},{rateTransition:{frame:66,afterMs:1200,speed:1.25},frames:60}])assert.throws(()=>p.playSequence([step('bad',options)]),/INVALID_SEQUENCE/);assert.equal(p.generation,0);p.dispose();
});

test('a grab cancels an upcoming return but keeps the visible video and frame callbacks playing',async()=>{
 const {p,videos}=fixture();const a=p.playSequence([step('idle',{loop:true})]);await commit(videos[0]);await a;
 const pending=p.playSequence([step('other')]);assert.equal(p.retain(),true);assert.equal(await pending,false);assert.equal(videos[0].paused,false);assert.equal(videos[0].loop,true);const n=p.frames.length;videos[0].frame(.1);assert(p.frames.length>n);assert.equal(p.clip,'idle');p.dispose();
});

test('old layer keeps playing until the incoming opacity and a subsequent decoded frame are ready',async()=>{
 let opacity=.4;const {p,videos}=fixture({opacity:()=>opacity});const a=p.playSequence([step('idle')]);await commit(videos[0]);await a;
 Object.defineProperty(videos[1],'currentTime',{get:()=>0,set:()=>{throw new Error('REDUNDANT_SEEK');}});
 const b=p.playSequence([step('flutter',{fadeMs:80})]);await commit(videos[1]);await b;
 assert.equal(videos[0].style.opacity,'1');assert.equal(videos[0].paused,false);
 videos[1].frame(.03);assert.equal(videos[0].style.opacity,'1');
 opacity=1;videos[1].seeking=true;videos[1].frame(.06);assert.equal(videos[0].style.opacity,'1');
 videos[1].seeking=false;videos[1].frame(.09);assert.equal(videos[0].style.opacity,'0');assert.equal(videos[0].paused,true);p.dispose();
});

test('rapid reuse makes the current front solid before clearing the outgoing standby',async()=>{
 const {p,videos}=fixture({opacity:()=>.2});const a=p.playSequence([step('idle')]);await commit(videos[0]);await a;
 const b=p.playSequence([step('flutter',{fadeMs:80})]);await commit(videos[1]);await b;
 const c=p.playSequence([step('idle',{fadeMs:80})]);assert.equal(videos[1].style.opacity,'1');assert.equal(videos[1].style.transition,'none');assert.equal(videos[0].style.opacity,'0');videos[0].dispatchEvent(new Event('error'));assert.equal(await c,false);assert.equal(videos[1].style.opacity,'1');p.dispose();
});

test('grabbing during a guarded handoff retains the guard until another current frame',async()=>{
 const guard={active:false,capture(v){this.active=!!v;return this.active;},release(){this.active=false;}},f=fixture({guard});const a=f.p.playSequence([step('idle')]);await commit(f.videos[0]);await a;
 const b=f.p.playSequence([step('flutter',{fadeMs:80})]);await commit(f.videos[1]);await b;assert.equal(guard.active,true);f.p.retain();assert.equal(guard.active,true);assert.equal(f.videos[1].paused,false);f.videos[1].frame(.03);assert.equal(guard.active,false);f.p.dispose();
});

test('locking a released pose cancels preparation callbacks and pending loads until an explicit new action',async()=>{
 const guard={active:false,capture(v){return this.active=!!v;},capturePresentation(){return this.active=true;},release(){this.active=false;}},f=fixture({guard});const a=f.p.playSequence([step('flutter',{rateTransition:{frame:66,afterMs:1200,speed:1.25}})]);await commit(f.videos[0]);await a;
 const late=[...f.videos[0].callbacks.values()][0],n=f.p.frames.length,pending=f.p.playSequence([step('other')]);f.p.freeze();assert.equal(await pending,false);assert.equal(f.videos[0].paused,true);assert.equal(guard.active,true);assert.equal(f.videos[0].style.opacity,'0');f.advance(1500);late(1500,{mediaTime:3,presentedFrames:90});assert.equal(f.p.frames.length,n);assert.equal(f.rafs.size,0);f.p.retain();assert.equal(guard.active,true);assert.equal(f.videos[0].paused,true);
 const next=f.p.playSequence([step('landing')]);await commit(f.videos[1]);await next;assert.equal(f.p.clip,'landing');assert.equal(f.p.frozen,false);f.p.dispose();
});
