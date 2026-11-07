(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabPointerSession=api;})(globalThis,()=>{
 'use strict';
 // The physical press owns the session; DOM capture and decoder readiness do not.
 class PointerSession {
  constructor({stage,send,press=()=>{},release=()=>{},reset=()=>{},presentation=()=>null,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){Object.assign(this,{stage,send,press,release,reset,presentation,now,setTimer:(fn,ms)=>setTimer(fn,ms),clearTimer:id=>clearTimer(id)});this.held=false;this.gesture=0;this.pointerId=null;this.lastPointer=null;this.guard=null;this.serial=-1;this.counts={downs:0,rearms:0,captureFailures:0,lostCaptures:0,mainResets:0,rejections:0,visualFailures:0};}
  sample(kind,e){if(e)this.lastPointer={x:e.screenX,y:e.screenY,at:Number.isFinite(e.timeStamp)?(typeof performance==='object'?performance.timeOrigin:0)+e.timeStamp:this.now()};return {kind,gesture:this.gesture,...this.lastPointer};}
  cancelGuard(){if(this.guard!==null)this.clearTimer(this.guard);this.guard=null;}
  clear(reason){this.held=false;this.pointerId=null;this.reset(reason);}
  begin(e){if(e.button!==0||e.isPrimary===false)return false;this.counts.downs++;if(this.held){this.counts.rearms++;this.end(true);}this.cancelGuard();this.held=true;this.pointerId=e.pointerId;++this.gesture;const data=this.sample('begin',e);data.presentation=this.presentation();const rect=this.stage.getBoundingClientRect();data.point={x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height};
   this.send(data);try{this.press();}catch{this.counts.visualFailures++;}
   // Transparent, non-activating Windows surfaces may deny capture. Continue:
   // window events and the main process's physical-button watchdog still own it.
   try{this.stage.setPointerCapture(e.pointerId);}catch{this.counts.captureFailures++;}return true;
  }
  move(e){if(this.held&&e.pointerId===this.pointerId)this.send(this.sample('move',e));}
  end(cancel,e){if(!this.held||e&&e.pointerId!==this.pointerId)return false;const data=this.sample(cancel?'cancel':'end',e);data.presentation=this.presentation();if(e)data.point={x:e.clientX/this.stage.clientWidth,y:e.clientY/this.stage.clientHeight};this.clear();this.send(data);try{this.release(cancel,e);}catch{this.counts.visualFailures++;}this.cancelGuard();const gesture=this.gesture;this.guard=this.setTimer(()=>{this.guard=null;this.send({kind:'recovery-timeout',gesture});},1000);return true;}
  lost(e){if(this.held&&e.pointerId===this.pointerId)this.counts.lostCaptures++;}
  ack(data){if(data.gesture!==this.gesture||data.accepted||!this.held)return;this.counts.rejections++;this.cancelGuard();this.clear();try{this.release(true);}catch{this.counts.visualFailures++;}}
  transport(data){if(!Number.isSafeInteger(data.serial)||data.serial<this.serial)return;this.serial=data.serial;if(data.phase==='drag')return;if(data.gesture===this.gesture){this.cancelGuard();if(this.held){this.counts.mainResets++;this.clear('main');}}}
  reconcile(command){this.cancelGuard();if(command.resetPointer&&(!this.held||command.gesture===this.gesture||command.resetThroughGesture>=this.gesture))this.clear();}
  status(){return {held:this.held,gesture:this.gesture,capture:!!(this.held&&this.stage.hasPointerCapture?.(this.pointerId)),...this.counts};}
  dispose(){this.cancelGuard();if(this.held)this.end(true);this.cancelGuard();}
 }
 return {PointerSession};
});
