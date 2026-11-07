'use strict';
const catalog=require('./performance-catalog.js');
class PerformanceDirector{
 constructor(send){this.send=send;this.requestId=0;this.serial=0;this.gesture=null;this.phase='idle';this.current=null;this.evidence=null;this.airborneAtRelease=false;this.events=[];this.pose='C';}
 record(type,detail={}){if(this.events.length===512)this.events.shift();this.events.push({type,phase:this.phase,serial:this.serial,requestId:this.requestId,...detail});}
 request(name,extra={}){this.evidence=null;this.current={name,requestId:++this.requestId,serial:this.serial,gesture:this.gesture,fromPose:this.pose,...extra};this.record('request',{name,origin:this.current.origin});this.send(this.current);return this.current;}
 start(){this.request('idle',{origin:'idle'});}
 matches(data){return !!data&&data.requestId===this.current?.requestId&&data.serial===this.serial&&data.gesture===this.gesture;}
 present(data){if(!this.matches(data)||data.visible!==true||!Number.isInteger(data.frame))return false;
  if(['held','preparing','airborne'].includes(this.phase)){this.evidence=this.current.name==='takeoff'&&catalog.airborne(data)?{...data}:null;if(this.evidence)this.phase='airborne';else if(data.clip==='frontidle')this.phase='held';}
  else if(data.clip==='frontidle'&&this.phase!=='coasting'){this.phase='idle';this.pose='C';}
  return true;
 }
 motion(e){const {type,serial}=e;if(type==='grab'){this.serial=serial;this.gesture=e.gesture;this.phase='held';this.airborneAtRelease=false;this.pose='C';this.request('hold',{origin:'interaction'});return;}
  if(type==='cancel'){const resetThroughGesture=e.gesture??this.gesture;this.serial=serial;this.gesture=null;this.phase='idle';this.airborneAtRelease=false;this.pose='C';this.request('recover',{origin:'interaction',resetPointer:true,resetThroughGesture});return;}
  if(serial!==this.serial)return;
  if(type==='qualified'&&this.phase==='held'){this.phase='preparing';this.request('takeoff',{origin:'interaction'});}
  if(type==='release'&&['held','preparing','airborne'].includes(this.phase)){this.airborneAtRelease=!!this.evidence;this.record('release',{airborneAtRelease:this.airborneAtRelease,thrown:e.thrown});this.phase=e.thrown?'coasting':this.airborneAtRelease?'landing':!e.moved?'performing':'idle';this.request(e.thrown?(this.airborneAtRelease?'coast':'recover'):this.airborneAtRelease?'landing':e.moved?'recover':'click',{origin:'interaction',resetPointer:true});if(!e.thrown)this.airborneAtRelease=false;}
  if(type==='rested'&&this.phase==='coasting'){const landing=this.airborneAtRelease;this.airborneAtRelease=false;this.phase=landing?'landing':'idle';this.record('rested',{landing});if(landing)this.request('landing',{origin:'interaction'});}
 }
 manual(name,{origin='manual'}={}){if(name!=='idle'&&!catalog.isSelectable(name)||['held','preparing','airborne','coasting'].includes(this.phase))return false;if(origin==='task'&&this.phase==='performing'&&(!['task','automatic'].includes(this.current?.origin)||catalog.needsLanding(this.current?.name)))return false;this.phase=name==='idle'?'idle':'performing';this.airborneAtRelease=false;this.request(name,{origin});return true;}
 mediaError(data){if(!this.matches(data))return false;this.record('media-error',{code:data.code||'MEDIA_ERROR'});this.evidence=null;this.airborneAtRelease=false;if(['idle','recover','hold'].includes(this.current.name)){this.phase='fault';return false;}this.request('recover',{origin:'recovery'});return true;}
}
module.exports={PerformanceDirector};
