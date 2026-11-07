'use strict';
const catalog=require('./performance-catalog.js');
// Sole owner of performance intentions. No window, DOM, clock, or video objects.
class PerformanceDirector {
 constructor(send){this.send=send;this.requestId=0;this.serial=0;this.gesture=null;this.phase='idle';this.airborneAtRelease=false;this.evidence=null;this.events=[];this.current=null;}
 record(type,detail={}){if(this.events.length===512)this.events.shift();this.events.push({type,phase:this.phase,serial:this.serial,requestId:this.requestId,...detail});}
 request(name,extra={}){this.evidence=null;const command={name,requestId:++this.requestId,serial:this.serial,gesture:this.gesture,...extra};this.current=command;this.record('request',{name});this.send(command);return command;}
 start(){this.request('idle');}
 matches(data){return !!data&&data.requestId===this.current?.requestId&&data.serial===this.serial&&data.gesture===this.gesture;}
 present(data){
  if(!this.matches(data)||data.visible!==true||!Number.isInteger(data.frame))return false;
  if(this.phase==='held'||this.phase==='preparing'||this.phase==='airborne'){
   this.evidence=this.current.name==='takeoff'&&catalog.airborne(data)?{...data}:null;
   if(this.evidence)this.phase='airborne';else if(data.clip==='frontidle')this.phase='held';
  }else if(data.clip==='frontidle'&&this.phase!=='coasting')this.phase='idle';
  return true;
 }
 motion(event){
  const {type,serial}=event;
  if(type==='grab'){
   this.serial=serial;this.gesture=event.gesture;this.phase='held';this.airborneAtRelease=false;this.request('hold');return;
  }
  if(type==='cancel'){
   const resetThroughGesture=event.gesture??this.gesture;
   this.serial=serial;this.gesture=null;this.phase='idle';this.airborneAtRelease=false;this.request('recover',{resetPointer:true,resetThroughGesture});return;
  }
  if(serial!==this.serial)return;
  if(type==='qualified'&&this.phase==='held'){this.phase='preparing';this.request('takeoff');}
  if(type==='release'&&['held','preparing','airborne'].includes(this.phase)){
   this.airborneAtRelease=!!this.evidence;
   this.record('release',{airborneAtRelease:this.airborneAtRelease,thrown:event.thrown});
   this.phase=event.thrown?'coasting':this.airborneAtRelease?'landing':'idle';
   // Neutral animated recovery during inertia. Landing is consumed at rest.
   this.request(event.thrown?'recover':this.airborneAtRelease?'landing':event.moved?'recover':'click',{resetPointer:true});
   if(!event.thrown)this.airborneAtRelease=false;
  }
  if(type==='rested'&&this.phase==='coasting'){
   const landing=this.airborneAtRelease;this.airborneAtRelease=false;this.phase=landing?'landing':'idle';
   this.record('rested',{landing});if(landing)this.request('landing');
  }
 }
 manual(name){if(!['idle','proud','fan','lantern','walking'].includes(name)||!['idle','performing','landing','fault'].includes(this.phase))return false;this.phase=name==='idle'?'idle':'performing';this.airborneAtRelease=false;this.request(name);return true;}
 mediaError(data){if(!this.matches(data))return false;this.record('media-error',{code:data.code||'MEDIA_ERROR'});this.evidence=null;this.airborneAtRelease=false;if(['idle','recover','hold'].includes(this.current.name)){this.phase='fault';return false;}this.request('recover');return true;}
}
module.exports={PerformanceDirector};
