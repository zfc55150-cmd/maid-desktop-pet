'use strict';
(async()=>{
 const config=await window.desktop.config(),stage=document.querySelector('main');
 const guard=new LabFrameGuard.FrameGuard(document.querySelector('canvas'));
 const player=new LabVideoPlayer.Player([...document.querySelectorAll('video')],name=>config.clips[name].url,{guard});
 let held=false,gesture=0,pointerId=null,lastPointer=null,shown=null,current=null,pressAnimation=null,releaseGuard=null;
 const flightClock=new LabFlightClock.Driver(data=>window.desktop.step(data),()=>window.desktop.status({ok:false,error:'FLIGHT_STEP_FAILED'}));
 player.onFrame=data=>{shown=data;window.desktop.frame(data);};
 player.onEnd=data=>window.desktop.media({type:'ended',...data});
 player.onError=data=>window.desktop.media({type:'error',...data});
 function clearPointer(){held=false;pointerId=null;stage.classList.remove('held');}
 async function action(command){
  if(!command||!Number.isSafeInteger(command.requestId)||command.requestId<=(current?.requestId??0))return;
  // All commands owned by an older local gesture are stale, not just takeoff.
  if(command.gesture!==null&&command.gesture<gesture)return;
  if(command.resetThroughGesture!==undefined&&command.resetThroughGesture<gesture)return;
  if(command.name==='takeoff'&&(!held||command.gesture!==gesture)){
   window.desktop.status({ok:true,ignoredAction:'takeoff',reason:'pointer-not-held-or-old-gesture'});return;
  }
  current=command;clearTimeout(releaseGuard);releaseGuard=null;
  if(command.resetPointer&&(!held||command.gesture===gesture||command.resetThroughGesture>=gesture))clearPointer();
  pressAnimation?.cancel();pressAnimation=null;
  try{
   const owner={requestId:command.requestId,serial:command.serial,gesture:command.gesture};
   if(!await player.playSequence(LabPerformanceCatalog.plan(command.name,config.clips),owner)||current!==command)return;
   if(command.name==='click')pressAnimation=stage.animate([{transform:'scaleY(1)',offset:0},{transform:'scaleY(.55)',offset:.45},{transform:'scaleY(1.06)',offset:.82},{transform:'scaleY(1)',offset:1}],{duration:220});
   window.desktop.status({ok:true,action:command.name,requestId:command.requestId,clip:player.clip,mediaStats:{trace:player.trace.length,frameSamples:player.frames.length,videoElements:player.videos.length},ui:{width:stage.getBoundingClientRect().width,height:stage.getBoundingClientRect().height}});
  }catch{window.desktop.media({type:'error',requestId:command.requestId,serial:command.serial,gesture:command.gesture,code:'PLAN_FAILED'});}
 }
 window.desktop.onAction(action);
 window.desktop.onTransport(data=>{if(data.phase==='flight')flightClock.start(data.serial);else flightClock.stop();});
 const sample=(kind,e)=>{if(e)lastPointer={x:e.screenX,y:e.screenY,at:performance.timeOrigin+e.timeStamp};return {kind,gesture,...lastPointer};};
 stage.addEventListener('pointerdown',e=>{
  if(e.button!==0||held||e.isPrimary===false)return;
  flightClock.stop();clearTimeout(releaseGuard);held=true;++gesture;pointerId=e.pointerId;
  // Cancel pending returns immediately; don't wait for the main-process reply.
  player.retain();stage.classList.add('held');window.desktop.input(sample('begin',e));
  try{stage.setPointerCapture(e.pointerId);}catch{release(true,e);}
 });
 stage.addEventListener('pointermove',e=>{if(held&&e.pointerId===pointerId)window.desktop.input(sample('move',e));});
 const release=(cancel,e)=>{
  if(!held||e&&e.pointerId!==pointerId)return;
  const data=sample(cancel?'cancel':'end',e);data.presentation=shown;
  clearPointer();player.freeze();window.desktop.input(data);
  // A transport failure must not leave an indefinitely locked pose. Recovery
  // stays owned by the director; report and let main cancel the gesture.
  const releasedGesture=gesture;releaseGuard=setTimeout(()=>window.desktop.input({kind:'recovery-timeout',gesture:releasedGesture}),1000);
 };
 stage.addEventListener('pointerup',e=>{if(e.button===0)release(false,e);});
 stage.addEventListener('pointercancel',e=>release(true,e));stage.addEventListener('lostpointercapture',()=>release(true));
 stage.addEventListener('contextmenu',e=>{e.preventDefault();clearPointer();player.freeze();window.desktop.input({kind:'menu'});});
 window.addEventListener('blur',()=>release(true));
 window.addEventListener('beforeunload',()=>{clearTimeout(releaseGuard);flightClock.stop();player.dispose();});
 window.desktop.ready();
})().catch(()=>window.desktop.status({ok:false,error:'RENDERER_INIT_FAILED'}));
