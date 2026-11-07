'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Player}=require('./app/video-player.js');
class Video extends EventTarget{
 constructor(){super();this.style={opacity:'0'};this.callbacks=new Map();this.next=0;this.seeking=false;this.playbackRate=1;}
 pause(){}play(){return Promise.resolve();}removeAttribute(){}load(){this.playbackRate=1;}
 requestVideoFrameCallback(fn){this.callbacks.set(++this.next,fn);return this.next;}cancelVideoFrameCallback(id){this.callbacks.delete(id);}
 frame(mediaTime=.1){const pending=[...this.callbacks.values()];this.callbacks.clear();for(const fn of pending)fn(0,{mediaTime,presentedFrames:1});}
}
test('decoded frame arriving before loadeddata still starts a landing at its requested speed',async()=>{
 const videos=[new Video(),new Video()],player=new Player(videos,x=>x,{opacity:()=>1}),published=[];player.onFrame=()=>published.push(videos[player.front].playbackRate);
 try{const ready=player.playSequence([{clip:'draglanding',frames:180,fps:30,speed:1.2}]);videos[0].frame();assert(await ready);assert.equal(videos[0].playbackRate,1.2);assert.equal(published[0],1.2);videos[0].dispatchEvent(new Event('loadeddata'));assert.equal(videos[0].playbackRate,1.2);}finally{player.dispose();}
});
test('late loadeddata does not skip the takeoff preparation rate or undo its airborne ramp',async()=>{
 const videos=[new Video(),new Video()],player=new Player(videos,x=>x,{opacity:()=>1});
 try{const ready=player.playSequence([{clip:'flutter',frames:180,fps:30,holdLast:true,rateTransition:{frame:66,afterMs:1200,speed:1.25}}]);videos[0].frame();assert(await ready);assert(Math.abs(videos[0].playbackRate-1.8333333333333333)<1e-9);videos[0].frame(2.3);assert.equal(videos[0].playbackRate,1.25);videos[0].dispatchEvent(new Event('loadeddata'));assert.equal(videos[0].playbackRate,1.25);}finally{player.dispose();}
});
