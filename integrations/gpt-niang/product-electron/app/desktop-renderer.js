'use strict';
(async()=>{
 const config=await window.desktop.config();LabPerformanceCatalog.configure(config.animation);
 const stage=document.querySelector('main'),figure=document.querySelector('.figure'),staticImage=document.getElementById('static');
 const guard=new LabFrameGuard.FrameGuard(document.getElementById('guard')),player=new LabVideoPlayer.Player([...document.querySelectorAll('video')],name=>config.clips[name].url,{guard,idleClip:'frontidle'});
 let product=null,shown=null,current=null,pressAnimation=null,geometryFrame=null,imageReady=Promise.resolve(),stateEpoch=0,clickPoint=null;
 let pressSound=null,releaseSound=null,pendingRelease=false;
 function stopSound(){for(const sound of [pressSound,releaseSound])if(sound){sound.pause();sound.currentTime=0;}pendingRelease=false;}
 function sound(slot){if(product.prefs.form!=='bust'&&product.prefs.characterId==='gpt-dragon'||!product.audio.enabled||product.audio.volume<=0)return;if(slot==='press'){stopSound();if(pressSound)pressSound.play().catch(()=>{});}else if(pressSound&&!pressSound.paused&&!pressSound.ended){pendingRelease=true;}else releaseSound?.play().catch(()=>{});}
 function updateAudio(){stopSound();pressSound=product.audio.press?new Audio(product.audio.press):null;releaseSound=product.audio.release?new Audio(product.audio.release):null;for(const a of [pressSound,releaseSound])if(a){a.volume=product.audio.volume;a.preload='auto';}if(pressSound)pressSound.onended=()=>{if(pendingRelease){pendingRelease=false;releaseSound?.play().catch(()=>{});}};}
 function applyState(next){const old=product,changed=old?.display?.url!==next.display.url||old?.display?.mode!==next.display.mode;product=next;if(!old||old.audio.enabled!==next.audio.enabled||old.audio.volume!==next.audio.volume||old.audio.press!==next.audio.press||old.audio.release!==next.audio.release)updateAudio();if(changed){const epoch=++stateEpoch;stopSound();if(next.display.mode==='static'){const l=next.display.layout;Object.assign(staticImage.style,l?{inset:'auto',left:((1-l.width)*50)+'%',width:(l.width*100)+'%',height:'auto',bottom:((1-l.feet)*100)+'%'}:{inset:'0',left:'0',width:'100%',height:'100%',bottom:'0'});staticImage.src=next.display.url;imageReady=staticImage.decode().then(async()=>{if(epoch!==stateEpoch)return false;player.interrupt();document.body.classList.add('static');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return epoch===stateEpoch;});}else document.body.classList.remove('static');}
  figure.classList.toggle('colored',next.appearance.scope==='full');figure.style.animationPlayState=next.prefs.colorPaused?'paused':'running';
 }
 applyState(config.product);updateAudio();stage.style.cursor='url("'+product.cursors.grab+'") 16 16,grab';
 player.onFrame=data=>{if(product.display.mode==='static')return;shown=data;window.desktop.frame(data);};player.onEnd=data=>window.desktop.media({type:'ended',...data});player.onError=data=>window.desktop.media({type:'error',...data});
 const flightClock=new LabFlightClock.Driver(data=>window.desktop.step(data),()=>window.desktop.status({ok:false,error:'FLIGHT_STEP_FAILED'}));
 const pointer=new LabPointerSession.PointerSession({stage,send:data=>window.desktop.input(data),presentation:()=>shown,press:()=>{flightClock.stop();player.retain();stage.classList.add('held');stage.style.cursor='url("'+product.cursors.grabbing+'") 16 16,grabbing';sound('press');},release:(cancel,e)=>{if(e)clickPoint={x:e.clientX/stage.clientWidth,y:e.clientY/stage.clientHeight};player.freeze();if(cancel)stopSound();else sound('release');},reset:reason=>{if(reason==='main')stopSound();stage.style.cursor='url("'+product.cursors.grab+'") 16 16,grab';stage.classList.remove('held');}});
 async function action(command){
  if(!command||!Number.isSafeInteger(command.requestId)||command.requestId<=(current?.requestId??0)||command.gesture!==null&&command.gesture<pointer.gesture||command.resetThroughGesture!==undefined&&command.resetThroughGesture<pointer.gesture)return;
  if(command.name==='takeoff'&&(!pointer.held||command.gesture!==pointer.gesture||product.display.mode==='static'))return;
  current=command;pointer.reconcile(command);if(geometryFrame!==null){cancelAnimationFrame(geometryFrame);geometryFrame=null;}pressAnimation?.cancel();pressAnimation=null;window.desktop.hitGeometry({owner:{requestId:command.requestId,serial:command.serial,gesture:command.gesture},scaleY:1});
  const owner={requestId:command.requestId,serial:command.serial,gesture:command.gesture};
  try{
   if(product.display.mode==='static'){await imageReady;if(current!==command)return;shown={...owner,clip:'static',frame:0,visible:true};window.desktop.frame(shown);window.desktop.status({ok:true,readyForDisplay:true});}
   else if(['hold','click'].includes(command.name)){if(!await player.returnToIdle(LabPerformanceCatalog.plan(command.name,config.clips)[0],owner)||current!==command)return;}
   else if(command.name==='coast'&&LabPerformanceCatalog.airborne(shown)){player.freeze();shown={...shown,...owner,visible:true};window.desktop.frame(shown);}
   else if(!await player.playSequence(LabPerformanceCatalog.plan(command.name==='coast'?'recover':command.name,config.clips,{fromPose:command.fromPose}),owner)||current!==command)return;
   if(command.name==='click'){
    const started=performance.now();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(performance.now()-started<40)await new Promise(r=>setTimeout(r,40-(performance.now()-started)));if(current!==command)return;
    pressAnimation=stage.animate([{transform:'scaleY(1)',offset:0},{transform:'scaleY(.55)',offset:.45},{transform:'scaleY(1.06)',offset:.82},{transform:'scaleY(1)',offset:1}],{duration:220});
    const trackGeometry=()=>{if(current!==command||!pressAnimation)return;window.desktop.hitGeometry({owner,scaleY:stage.getBoundingClientRect().height/stage.clientHeight});if(pressAnimation.playState==='running')geometryFrame=requestAnimationFrame(trackGeometry);else geometryFrame=null;};trackGeometry();await pressAnimation.finished.catch(()=>{});if(current===command)window.desktop.hitGeometry({owner,scaleY:1});if(current===command)window.desktop.product({kind:'click-finished',owner,point:player.clip==='frontidle'?clickPoint:null});
   }
   if(current!==command)return;window.desktop.status({ok:true,action:command.name,requestId:command.requestId,clip:player.clip,mediaStats:{trace:player.trace.length,frameSamples:player.frames.length,videoElements:player.videos.length},ui:{width:stage.clientWidth,height:stage.clientHeight}});
  }catch{window.desktop.media({type:'error',...owner,code:'PLAYBACK_FAILED'});}
 }
 window.desktop.onInputAck(data=>pointer.ack(data));window.desktop.onAction(action);window.desktop.onState(applyState);window.desktop.onTransport(data=>{pointer.transport(data);if(data.phase==='flight')flightClock.start(data.serial);else flightClock.stop();});
 stage.addEventListener('pointerdown',e=>pointer.begin(e));
 window.addEventListener('mousemove',()=>{if(!pointer.held)window.desktop.input({kind:'hover'});});
 window.addEventListener('pointermove',e=>pointer.move(e));window.addEventListener('pointerup',e=>{if(e.button===0)pointer.end(false,e);});window.addEventListener('pointercancel',e=>pointer.end(true,e));stage.addEventListener('lostpointercapture',e=>pointer.lost(e));
 stage.addEventListener('contextmenu',e=>{e.preventDefault();pointer.end(true);player.freeze();window.desktop.input({kind:'menu'});});window.addEventListener('blur',()=>pointer.end(true));
 const inputHealth=setInterval(()=>window.desktop.status({input:pointer.status()}),1000);
 window.addEventListener('beforeunload',()=>{clearInterval(inputHealth);pointer.dispose();if(geometryFrame!==null)cancelAnimationFrame(geometryFrame);flightClock.stop();stopSound();player.dispose();});window.desktop.ready();
})().catch(()=>window.desktop.status({ok:false,error:'RENDERER_INIT_FAILED'}));
