'use strict';
(async()=>{
 if(!window.desktop||typeof window.desktop.config!=='function'){
  console.error('[gpt-niang] desktop preload bridge missing');
  window.desktop?.status?.({ok:false,error:'RENDERER_BRIDGE_MISSING'});
  document.title='桌宠初始化失败';
  return;
 }
 const config=await window.desktop.config();if(!config.safeMode){try{LabPerformanceCatalog.configure(config.animation);}catch{window.desktop.status({ok:false,error:'RENDERER_MANIFEST_FAILED'});}}
 const stage=document.querySelector('main'),figure=document.querySelector('.figure'),staticImage=document.getElementById('static');
 const guard=new LabFrameGuard.FrameGuard(document.getElementById('guard')),player=new LabVideoPlayer.Player([...document.querySelectorAll('video')],name=>config.clips[name].url,{guard,idleClip:'frontidle'});
 let product=null,shown=null,current=null,pressAnimation=null,geometryFrame=null,imageReady=Promise.resolve(),stateEpoch=0,clickPoint=null;
 const nameBox=document.getElementById('pet-name'),nameStyle=document.createElement('style');
 nameStyle.textContent=PetShared.TOOLTIP_CSS+'#pet-name{z-index:4;--pet-size:580px}html[lang="ja"] #pet-name{font-family:'+(window.GptNiangI18n?GptNiangI18n.fontStack('ja','bubble'):"'ShangshouSoftCandy','Yu Gothic UI','Meiryo','BIZ UDPGothic','Hiragino Kaku Gothic ProN','Segoe UI',sans-serif")+'}';
 document.head.append(nameStyle);
 let hover=null;
 function drawName(){
  if(!hover){nameBox.classList.remove('is-on');return;}
  nameBox.textContent=product.characterName;
  const point=PetShared.tooltipPlacement(hover,{w:nameBox.offsetWidth,h:nameBox.offsetHeight},{x:4,y:4,w:innerWidth-8,h:innerHeight-8},480*PetShared.TOOLTIP_GAP_RATIO);
  nameBox.style.left=point.x+'px';nameBox.style.top=point.y+'px';nameBox.classList.add('is-on');
 }
 window.desktop.onHover(point=>{hover=point;drawName();});
 let pressSound=null,releaseSound=null,pendingRelease=false;
 function stopSound(){for(const sound of [pressSound,releaseSound])if(sound){sound.pause();sound.currentTime=0;}pendingRelease=false;}
 function sound(slot){if(product.prefs.form!=='bust'&&product.prefs.characterId==='gpt-dragon'||!product.audio.enabled||product.audio.volume<=0)return;if(slot==='press'){stopSound();if(pressSound)pressSound.play().catch(()=>{});}else if(pressSound&&!pressSound.paused&&!pressSound.ended){pendingRelease=true;}else releaseSound?.play().catch(()=>{});}
 function updateAudio(){stopSound();pressSound=product.audio.press?new Audio(product.audio.press):null;releaseSound=product.audio.release?new Audio(product.audio.release):null;for(const a of [pressSound,releaseSound])if(a){a.volume=product.audio.volume;a.preload='auto';}if(pressSound)pressSound.onended=()=>{if(pendingRelease){pendingRelease=false;releaseSound?.play().catch(()=>{});}};}
 function applyState(next){const old=product,changed=old?.display?.url!==next.display.url||old?.display?.mode!==next.display.mode;product=next;const lang=next.resolvedLanguage==='ja'?'ja':'zh-CN';LabPerformanceCatalog.setLanguage?.(lang);if(document.documentElement)document.documentElement.lang=lang;document.title=window.GptNiangI18n?GptNiangI18n.t(lang,'desktop.title'):(lang==='ja'?'デスクトップペット':'桌宠');if(hover&&(old?.characterName!==next.characterName||old?.resolvedLanguage!==next.resolvedLanguage))drawName();if(!old||old.audio.enabled!==next.audio.enabled||old.audio.volume!==next.audio.volume||old.audio.press!==next.audio.press||old.audio.release!==next.audio.release)updateAudio();if(changed){const epoch=++stateEpoch;stopSound();if(next.display.mode==='static'){const l=next.display.layout;Object.assign(staticImage.style,l?{inset:'auto',left:((1-l.width)*50)+'%',width:(l.width*100)+'%',height:'auto',bottom:((1-l.feet)*100)+'%'}:{inset:'0',left:'0',width:'100%',height:'100%',bottom:'0'});staticImage.src=next.display.url;imageReady=staticImage.decode().then(async()=>{if(epoch!==stateEpoch)return false;player.interrupt();document.body.classList.add('static');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return epoch===stateEpoch;}).catch(()=>false);}else document.body.classList.remove('static');}
  figure.classList.toggle('colored',next.appearance.scope==='full');figure.style.animationPlayState=next.prefs.colorPaused?'paused':'running';
 }
 applyState(config.product);if(product.fontUrl)new FontFace('ShangshouSoftCandy','url("'+product.fontUrl+'")').load().then(font=>{document.fonts.add(font);drawName();}).catch(()=>{});updateAudio();stage.style.cursor='url("'+product.cursors.grab+'") 16 16,grab';
 player.onFrame=data=>{if(product.display.mode==='static')return;shown=data;window.desktop.frame(data);};player.onEnd=data=>window.desktop.media({type:'ended',...data});player.onError=data=>window.desktop.media({type:'error',...data});
 let dragPrev=null,dragResetTimer=null;
 function clearDragTilt(){clearTimeout(dragResetTimer);dragResetTimer=null;dragPrev=null;figure.style.transform='';}
 function updateDragTilt(e){if(!pointer.held||e.pointerId!==pointer.pointerId)return;const now=performance.now(),x=Number.isFinite(e.screenX)?e.screenX:e.clientX,y=Number.isFinite(e.screenY)?e.screenY:e.clientY;if(dragPrev){const dt=Math.max(8,now-dragPrev.at),vx=(x-dragPrev.x)/dt,vy=(y-dragPrev.y)/dt,speed=Math.hypot(vx,vy);if(speed>.08){const deg=Math.max(-6,Math.min(6,vx*2.8)),stretch=Math.min(.024,speed*.007);figure.style.transform=`rotate(${deg.toFixed(2)}deg) scale(${(1-stretch*.35).toFixed(3)},${(1+stretch).toFixed(3)})`;clearTimeout(dragResetTimer);dragResetTimer=setTimeout(()=>{figure.style.transform='';},110);}}dragPrev={x,y,at:now};}
 const pointer=new LabPointerSession.PointerSession({stage,send:data=>window.desktop.input(data),presentation:()=>shown,press:()=>{clearDragTilt();player.retain();stage.classList.add('held');stage.style.cursor='url("'+product.cursors.grabbing+'") 16 16,grabbing';sound('press');},release:(cancel,e)=>{clearDragTilt();clickPoint=!cancel&&e?{x:e.clientX/stage.clientWidth,y:e.clientY/stage.clientHeight}:null;player.freeze();if(cancel)stopSound();else sound('release');window.desktop.status({input:pointer.status()});},reset:reason=>{clearDragTilt();if(reason==='main')stopSound();stage.style.cursor='url("'+product.cursors.grab+'") 16 16,grab';stage.classList.remove('held');}});
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
    const trackGeometry=()=>{if(current!==command||!pressAnimation)return;window.desktop.hitGeometry({owner,scaleY:stage.getBoundingClientRect().height/stage.clientHeight});if(pressAnimation.playState==='running')geometryFrame=requestAnimationFrame(trackGeometry);else geometryFrame=null;};trackGeometry();await pressAnimation.finished.catch(()=>{});if(current===command)window.desktop.hitGeometry({owner,scaleY:1});if(current===command){const point=player.clip==='frontidle'?clickPoint:null;clickPoint=null;window.desktop.product({kind:'click-finished',owner,point});}
   }
   if(current!==command)return;window.desktop.status({ok:true,action:command.name,requestId:command.requestId,clip:player.clip,mediaStats:{trace:player.trace.length,frameSamples:player.frames.length,videoElements:player.videos.length},ui:{width:stage.clientWidth,height:stage.clientHeight}});
  }catch{window.desktop.media({type:'error',...owner,code:'PLAYBACK_FAILED'});}
 }
 let flightFrame=null;
 function stopFlightFrames(){if(flightFrame!==null){cancelAnimationFrame(flightFrame);flightFrame=null;}}
 window.desktop.onInputAck(data=>pointer.ack(data));window.desktop.onAction(action);window.desktop.onState(applyState);
 window.desktop.onTransport(data=>{
  if(!Number.isSafeInteger(data.serial)||data.serial<pointer.serial)return;
  pointer.transport(data);
  stopFlightFrames();
  if(data.phase!=='flight')return;
  function pulse(){window.desktop.flightFrame(data.serial);flightFrame=requestAnimationFrame(pulse);}
  flightFrame=requestAnimationFrame(pulse);
 });
 stage.addEventListener('pointerdown',e=>pointer.begin(e));
 window.addEventListener('mousemove',()=>{if(!pointer.held)window.desktop.input({kind:'hover'});});
 window.addEventListener('pointermove',e=>{pointer.move(e);updateDragTilt(e);});window.addEventListener('pointerup',e=>{if(e.button===0)pointer.end(false,e);});window.addEventListener('pointercancel',e=>pointer.end(true,e));stage.addEventListener('lostpointercapture',e=>pointer.lost(e));
 stage.addEventListener('contextmenu',e=>{e.preventDefault();pointer.end(true);player.freeze();window.desktop.input({kind:'menu'});});window.addEventListener('blur',()=>pointer.end(true));
 const inputHealth=setInterval(()=>window.desktop.status({input:pointer.status()}),1000);
 window.addEventListener('beforeunload',()=>{clearInterval(inputHealth);clearDragTilt();stopFlightFrames();pointer.dispose();if(geometryFrame!==null)cancelAnimationFrame(geometryFrame);stopSound();player.dispose();});window.desktop.ready();
})().catch(()=>window.desktop?.status?.({ok:false,error:'RENDERER_INIT_FAILED'}));
