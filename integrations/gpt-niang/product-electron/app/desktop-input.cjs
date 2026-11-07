'use strict';
// Follow actual screen-coordinate pointer samples immediately. The watchdog
// recovers a missed capture/release; it is not the normal movement clock.
class InputDriver {
 constructor({motion,bounds,hit,write,raise=()=>{},observe=()=>{}}){Object.assign(this,{motion,bounds,hit,write,raise,observe});this.active=null;this.lastGesture=0;this.lastEvent=0;this.lastSample=0;}
 handle(data,received=Date.now()){
  if(!data||!['begin','move','end','cancel'].includes(data.kind)||!Number.isSafeInteger(data.gesture)||data.gesture<1||![data.x,data.y,data.at].every(Number.isFinite)||Math.abs(data.x)>1e6||Math.abs(data.y)>1e6)return false;
  const p={x:data.x,y:data.y},sample=Math.min(received,Math.max(received-2000,data.at));
  if(data.kind==='begin'){
   if(this.active!==null&&this.motion.phase!=='drag')this.active=null;
   if(data.gesture>this.lastGesture&&this.active!==null){this.observe({kind:'fresh-press-recovery'});this.cancel();}
   const rejected=data.gesture<=this.lastGesture?'STALE_GESTURE':!this.hit(p,data)?'OUTSIDE_BODY':null;
   if(rejected){this.observe({kind:'rejected-begin',gesture:data.gesture,reason:rejected});return false;}
   this.active=this.lastGesture=data.gesture;this.lastSample=sample;this.lastEvent=received;this.motion.begin(p,this.bounds(),sample,data.gesture);this.raise();this.observe({kind:data.kind,gesture:data.gesture,eventAgeMs:Math.max(0,received-data.at),sampleAt:data.at,receivedAt:received});return true;
  }
  if(this.active!==data.gesture||this.motion.phase!=='drag')return false;
  this.lastEvent=received;this.lastSample=Math.max(this.lastSample,sample);
  if(data.kind==='move'){
   const next=this.motion.move(p,this.lastSample);if(next)this.write(next);
  }else{
   if(data.kind==='end'){const next=this.motion.move(p,this.lastSample,false);if(next)this.write(next);}
   this.motion.end(p,this.lastSample,data.kind==='cancel');this.active=null;
  }
  this.observe({kind:data.kind,gesture:data.gesture,eventAgeMs:Math.max(0,received-data.at),sampleAt:data.at,receivedAt:received});return true;
 }
 recover(pointer,leftDown,now){
  if(this.active===null||this.motion.phase!=='drag')return;
  if(now-this.lastEvent<80)return;
  if(!leftDown){this.motion.cancel();this.active=null;}
  else {const next=this.motion.move(pointer,now);if(next)this.write(next);}
  this.lastSample=now;this.observe({kind:leftDown?'watchdog-move':'watchdog-release',receivedAt:now});
 }
 cancel(gesture=this.active??this.lastGesture){this.active=null;this.motion.cancel(gesture);}
 recoverTimeout(gesture){if(gesture!==this.active||this.motion.phase!=='drag')return false;this.cancel(gesture);return true;}
}
module.exports={InputDriver};
