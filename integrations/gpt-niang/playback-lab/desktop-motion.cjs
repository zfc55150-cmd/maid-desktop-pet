'use strict';
const S=require('./vendor/shared-core.js');
// Physical state only. No clips, media frames, or landing decisions.
class Motion {
 constructor(emit){this.emit=emit;this.phase='idle';this.serial=0;this.events=[];}
 event(type,detail={}){const event={type,serial:this.serial,...detail};if(this.events.length===512)this.events.shift();this.events.push(event);this.emit(event);}
 begin(pointer,bounds,now,gesture=null){
  ++this.serial;this.gesture=gesture;this.phase='drag';this.flight=null;this.start={...pointer};this.origin={x:bounds.x,y:bounds.y};this.position={...this.origin};this.trail=[{...pointer,t:now}];this.moved=false;this.qualified=false;this.event('grab',{gesture});
 }
 move(pointer,now,startFeedback=true){
  if(this.phase!=='drag')return null;
  const dx=pointer.x-this.start.x,dy=pointer.y-this.start.y;
  if(Math.hypot(dx,dy)>5)this.moved=true;
  const last=this.trail.at(-1);if(!last||last.x!==pointer.x||last.y!==pointer.y)this.trail.push({...pointer,t:now});this.trail=S.trimTrail(this.trail,now);
  if(startFeedback&&this.moved&&!this.qualified&&S.estimateReleaseVelocity(this.trail,now)){this.qualified=true;this.event('qualified');}
  if(!this.moved)return null;this.position={x:this.origin.x+dx,y:this.origin.y+dy};return this.position;
 }
 end(pointer,now,cancelled=false){
  if(this.phase!=='drag')return;this.move(pointer,now,false);
  if(cancelled){this.cancel();return;}
  const velocity=this.moved?S.estimateReleaseVelocity(this.trail,now):null;
  this.phase=velocity?'flight':'idle';this.flight=velocity?{...this.position,...velocity}:null;
  this.event('release',{moved:this.moved,thrown:!!velocity});
 }
 tick(dt,bounds){
  if(this.phase!=='flight')return null;
  const next=S.throwStep(this.flight,dt,bounds);this.flight={x:next.x,y:next.y,vx:next.vx,vy:next.vy};this.position={x:next.x,y:next.y};
  if(next.atRest){this.phase='idle';this.flight=null;this.event('rested');}
  return this.position;
 }
 reanchor(pointer,bounds,now){if(this.phase!=='drag')return;this.start={...pointer};this.origin={x:bounds.x,y:bounds.y};this.trail=[{...pointer,t:now}];}
 cancel(gesture=this.gesture){++this.serial;this.phase='idle';this.flight=null;this.event('cancel',{gesture});}
}
function hit(mask,frame,x,y,size=384){if(!mask||!Number.isInteger(frame)||frame<0||x<0||y<0||x>=size||y>=size)return false;const n=frame*size*size+Math.floor(y)*size+Math.floor(x);return n>>>3<mask.length&&!!(mask[n>>>3]&(1<<(n&7)));}
module.exports={Motion,hit};
