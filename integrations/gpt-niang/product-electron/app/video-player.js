/* Independent candidate. No production code, windows, settings or networking. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabVideoPlayer=api;})(globalThis,()=>{
 'use strict';
 class Player {
  constructor(videos,resolve,env={}){
   this.videos=videos;this.resolve=resolve;this.env={now:()=>performance.now(),raf:fn=>requestAnimationFrame(fn),cancelRaf:id=>cancelAnimationFrame(id),opacity:v=>Number(typeof getComputedStyle==='function'?getComputedStyle(v).opacity:v.style.opacity),...env};
   this.generation=0;this.activeGeneration=0;this.presentation=0;this.front=-1;this.pendingCancel=null;this.disposed=false;this.trace=[];this.frames=[];this.pulseId=null;this.monitorCancel=null;this.retiring=null;this.frozen=false;
   videos.forEach(v=>{v.muted=true;v.style.opacity='0';});
  }
  playSequence(steps,owner={}){
   if(this.disposed)throw new Error('DISPOSED');
   if(!Array.isArray(steps)||!steps.length||steps.some((s,i)=>!s.clip||!Number.isFinite(s.fps)||!(s.fps>0)||!Number.isInteger(s.frames)||!(s.frames>0)||!Number.isFinite(s.speed??1)||!((s.speed??1)>0)||!Number.isFinite(s.fadeMs??0)||(s.fadeMs??0)<0||(s.fadeMs??0)>1000||(s.rateTransition&&(!Number.isInteger(s.rateTransition.frame)||s.rateTransition.frame<=0||s.rateTransition.frame>=s.frames||!Number.isFinite(s.rateTransition.afterMs)||s.rateTransition.afterMs<=0||!Number.isFinite(s.rateTransition.speed)||s.rateTransition.speed<=0))||(s.holdLast&&(s.loop||i<steps.length-1))||(s.loop&&i<steps.length-1)))throw new Error('INVALID_SEQUENCE');
   const copy=steps.map(s=>({...s,owner:{...owner},rateTransition:s.rateTransition?{...s.rateTransition}:undefined}));const token=++this.generation;
   this.pendingCancel?.();return this.switch(copy,0,token);
  }
  record(event){if(this.trace.length===512)this.trace.shift();this.trace.push(event);}
  returnToIdle(step,owner){
   if(this.clip===step.clip&&this.front>=0&&this.sequence&&this.retain(owner))return Promise.resolve(true);
   return this.playSequence([{...step,reuse:true}],owner);
  }
  prewarmIdle(){
   if(!this.env.idleClip||this.clip===this.env.idleClip||this.front<0||this.pendingCancel||this.disposed)return;
   const standby=this.videos[this.front===0?1:0],url=this.resolve(this.env.idleClip);
   if(standby.src===url)return;
   standby.pause();standby.onended=null;standby.style.transition='none';standby.style.opacity='0';standby.loop=true;standby.src=url;standby.load();
  }
  async switch(steps,index,token){
   if(this.disposed||this.generation!==token)return false;
   const step=steps[index],target=this.videos[this.front===0?1:0],url=this.resolve(step.clip),initialRate=step.rateTransition?step.rateTransition.frame/step.fps/(step.rateTransition.afterMs/1000):(step.speed||1);
   this.record({event:'request',clip:step.clip,token,at:this.env.now()});
   return new Promise(resolve=>{
    let settled=false,frameId=null,timer;
    const cleanup=()=>{clearTimeout(timer);target.removeEventListener('loadeddata',ready);target.removeEventListener('error',error);if(frameId!==null)target.cancelVideoFrameCallback(frameId);if(this.pendingCancel===cancel)this.pendingCancel=null;};
    const complete=value=>{if(settled)return;settled=true;cleanup();resolve(value);};
    const current=()=>!this.disposed&&this.generation===token&&target.src===url;
    const cancel=()=>complete(false);
    const error=()=>{if(settled)return;this.record({event:'error',clip:step.clip,token,at:this.env.now()});complete(false);this.onError?.({...step.owner,clip:step.clip,code:'MEDIA_LOAD_FAILED'});};
    const commit=(now,metadata)=>{
      frameId=null;if(settled||!current()){complete(false);return;}
      // A callback can precede a usable alpha surface. Keep the single old
      // presentation until the hidden decoder actually contains character pixels.
      if(this.env.guard?.canRelease&&!this.env.guard.canRelease(target)){
       target.play().catch(error);frameId=target.requestVideoFrameCallback(commit);return;
      }
      if(this.env.guard?.present&&!this.env.guard.present(target)){target.play().catch(error);frameId=target.requestVideoFrameCallback(commit);return;}
      // A decoded-frame callback can precede the queued loadeddata event.
      // Commit must establish this step's rate before publishing or playing it.
      try{target.playbackRate=initialRate;}catch{error();return;}
      const old=this.front<0?null:this.videos[this.front];
      this.monitorCancel?.();
      if(old)old.onended=null;
      // Transparent silhouettes must never overlap: release the snapshot and
      // exchange the two layers in one task, after validating the decoded frame.
      target.style.transition='none';target.style.zIndex='3';target.style.opacity=this.env.guard?.persistent?'0':'1';
      if(old){old.style.transition='none';old.style.zIndex='1';old.style.opacity='0';old.pause();}
      this.env.guard?.release();
      this.front=this.videos.indexOf(target);this.clip=step.clip;this.activeGeneration=token;const presentation=++this.presentation;
      this.retiring=null;this.sequence={steps,index};
      this.lastMetadata={...metadata};
      this.record({event:'commit',clip:step.clip,token,at:this.env.now(),firstMediaTime:metadata.mediaTime});
      this.bindEnd(target,steps,index,token,presentation);
      if(this.frames.length<16384)this.frames.push({clip:step.clip,token,mediaTime:metadata.mediaTime,presentedFrames:metadata.presentedFrames,at:now});
      this.publish(target,step,token,metadata);
      this.monitor(target,step,token,presentation);target.play().catch(()=>{if(current())this.onError?.({...step.owner,clip:step.clip,code:'MEDIA_PLAY_FAILED'});});complete(true);this.prewarmIdle();
    };
    const ready=()=>{
     if(settled||!current()){complete(false);return;}
     // load() already resets the new stream to zero. Seeking to zero again
     // can clear its decoded surface after the first-frame callback.
     try{target.playbackRate=initialRate;}catch{error();}
    };
    // A standby may still be fading out from a rapid previous switch. Make
    // the current front solid before clearing/reloading that standby surface.
    const visible=this.front<0?null:this.videos[this.front];
    const guarded=this.frozen&&this.env.guard?.active?true:this.env.guard?.capture(visible);this.frozen=false;
    if(visible){visible.style.transition='none';visible.style.opacity=guarded||this.env.guard?.persistent?'0':'1';visible.style.zIndex='1';}
    this.retiring=null;
    target.style.transition='none';target.style.opacity='0';target.style.zIndex='0';
    this.pendingCancel=cancel;target.pause();target.onended=null;target.loop=!!step.loop;
    target.addEventListener('loadeddata',ready,{once:true});target.addEventListener('error',error,{once:true});
    timer=setTimeout(error,10000);
    // Reuse a decoded standby loop without clearing its valid first frame.
    if(step.reuse&&target.src===url&&target.readyState>=2&&!target.seeking&&!target.error){commit(this.env.now(),{mediaTime:target.currentTime||0,presentedFrames:0});}
    else{target.src=url;frameId=target.requestVideoFrameCallback(commit);target.load();}
   });
  }
  bindEnd(video,steps,index,token,presentation){
   const step=steps[index];video.onended=()=>{
    if(this.disposed||this.generation!==token||this.videos[this.front]!==video||this.activeGeneration!==token||this.presentation!==presentation)return;
    this.record({event:'end',clip:step.clip,token,at:this.env.now()});this.onEnd?.({...step.owner,clip:step.clip,generation:token});
    if(step.holdLast)video.pause();else if(index+1<steps.length)this.switch(steps,index+1,token);
   };
  }
  publish(video,step,token,metadata){
   this.onFrame?.({...step.owner,clip:step.clip,frame:Math.min(step.frames-1,Math.floor(metadata.mediaTime*step.fps+1e-6)),mediaTime:metadata.mediaTime,fadeMs:step.fadeMs||0,generation:token,visible:(this.env.guard?.persistent||this.env.opacity(video)>=.999)&&!video.seeking&&!this.env.guard?.active});
  }
  monitor(video,step,token,presentation){
   let frameId=null;
   const current=()=>!this.disposed&&this.generation===token&&this.activeGeneration===token&&this.presentation===presentation&&this.videos[this.front]===video;
   const failed=()=>{if(current())this.onError?.({...step.owner,clip:step.clip,code:'MEDIA_RUNTIME_FAILED'});};video.addEventListener('error',failed);
   this.monitorCancel=()=>{if(this.pulseId!==null)this.env.cancelRaf(this.pulseId);if(frameId!==null)video.cancelVideoFrameCallback(frameId);video.removeEventListener('error',failed);this.pulseId=null;frameId=null;};
   const frame=(now,m)=>{if(!current())return;
    if(step.rateTransition&&m.mediaTime*step.fps+1e-6>=step.rateTransition.frame)video.playbackRate=step.rateTransition.speed;
    if(this.env.guard?.present&&!this.env.guard.present(video)){frameId=video.requestVideoFrameCallback(frame);return;}
    this.lastMetadata={...m};
    const retiring=this.retiring;
    if(retiring&&retiring.target===video&&retiring.presentation===presentation&&!video.seeking&&(!this.env.guard?.active||!this.env.guard.canRelease||this.env.guard.canRelease(video))){retiring.old.style.opacity='0';retiring.old.pause();video.style.transition='none';video.style.opacity=this.env.guard?.persistent?'0':'1';this.env.guard?.release();this.retiring=null;}
    if(this.frames.length<16384)this.frames.push({clip:step.clip,token,mediaTime:m.mediaTime,presentedFrames:m.presentedFrames,at:now});
    this.publish(video,step,token,m);
    frameId=video.requestVideoFrameCallback(frame);
   };frameId=video.requestVideoFrameCallback(frame);
  }
  retain(owner){
   const token=++this.generation;this.pendingCancel?.();this.monitorCancel?.();this.monitorCancel=null;
   // The synchronous press invalidates old callbacks without changing a pixel.
   // Its acknowledged hold/click transfers ownership of the same media timeline.
   if(!owner||!this.sequence||this.front<0)return this.front>=0;
   const {steps:previous,index}=this.sequence,steps=previous.map(s=>({...s,owner:{...owner}})),step=steps[index],video=this.videos[this.front],presentation=++this.presentation;
   this.sequence={steps,index};this.activeGeneration=token;this.retiring=null;
   const metadata=this.env.guard?.persistent&&this.lastMetadata?this.lastMetadata:{mediaTime:video.currentTime||0,presentedFrames:0};
   // A frozen guard is removed only after the resumed decoder is known usable.
   if(!this.env.guard?.active||!this.env.guard.canRelease||this.env.guard.canRelease(video)){
    this.videos.forEach((v,i)=>{v.style.transition='none';v.style.opacity=i===this.front&&!this.env.guard?.persistent?'1':'0';if(i!==this.front)v.pause();});this.env.guard?.release();
   }else this.retiring={old:this.videos[this.front===0?1:0],target:video,presentation};
   this.frozen=false;this.bindEnd(video,steps,index,token,presentation);this.monitor(video,step,token,presentation);this.publish(video,step,token,metadata);
   if(video.ended)video.onended();else video.play().catch(()=>{if(this.generation===token)this.onError?.({...owner,clip:step.clip,code:'MEDIA_PLAY_FAILED'});});
   return true;
  }
  freeze(){const opacity=this.videos.map(v=>this.env.opacity(v)),guarded=this.env.guard?.capturePresentation(this.videos,this.env.opacity);this.interrupt();this.frozen=true;this.videos.forEach((v,i)=>{v.style.transition='none';v.style.opacity=guarded?'0':String(opacity[i]);});this.record({event:'released-pose-locked',clip:this.clip,at:this.env.now()});}
  interrupt(){++this.generation;++this.presentation;this.activeGeneration=0;this.pendingCancel?.();this.monitorCancel?.();this.monitorCancel=null;this.retiring=null;this.videos.forEach(v=>{v.pause();v.onended=null;});}
  dispose(){this.interrupt();this.disposed=true;if(this.env.guard?.clear)this.env.guard.clear();else this.env.guard?.release();this.videos.forEach(v=>{v.style.opacity='0';v.removeAttribute('src');v.load();});}
 }
 return {Player};
});
