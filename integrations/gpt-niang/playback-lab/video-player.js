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
   if(!Array.isArray(steps)||!steps.length||steps.some((s,i)=>!s.clip||!Number.isFinite(s.fps)||!(s.fps>0)||!Number.isInteger(s.frames)||!(s.frames>0)||!Number.isFinite(s.speed??1)||!((s.speed??1)>0)||!Number.isFinite(s.fadeMs??0)||(s.fadeMs??0)<0||(s.fadeMs??0)>1000||(s.rateTransition&&(!Number.isInteger(s.rateTransition.frame)||s.rateTransition.frame<=0||s.rateTransition.frame>=s.frames||!Number.isFinite(s.rateTransition.afterMs)||s.rateTransition.afterMs<=0||!Number.isFinite(s.rateTransition.speed)||s.rateTransition.speed<=0))||(s.loop&&i<steps.length-1)))throw new Error('INVALID_SEQUENCE');
   const copy=steps.map(s=>({...s,owner:{...owner},rateTransition:s.rateTransition?{...s.rateTransition}:undefined}));const token=++this.generation;
   this.pendingCancel?.();return this.switch(copy,0,token);
  }
  record(event){if(this.trace.length===512)this.trace.shift();this.trace.push(event);}
  async switch(steps,index,token){
   if(this.disposed||this.generation!==token)return false;
   const step=steps[index],target=this.videos[this.front===0?1:0],url=this.resolve(step.clip);
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
      const old=this.front<0?null:this.videos[this.front];
      this.monitorCancel?.();
      if(old)old.onended=null;
      // CSS transition is a candidate effect, not claimed pixel-equivalent to
      // WPF's premultiplied CPU blend. Fair timing controls use fadeMs=0.
      target.style.transition=`opacity ${step.fadeMs||0}ms linear`;target.style.zIndex='3';target.style.opacity='1';
      // Keep a fully visible, playing old layer underneath until the incoming
      // layer is opaque AND has produced another decoded frame. A symmetric
      // fade can expose an empty surface during decoder/layer invalidation.
      if(old){old.style.transition='none';old.style.zIndex='1';old.style.opacity=this.env.guard?.active?'0':'1';}
      this.front=this.videos.indexOf(target);this.clip=step.clip;this.activeGeneration=token;const presentation=++this.presentation;
      this.retiring=old?{old,target,token,presentation}:null;
      this.record({event:'commit',clip:step.clip,token,at:this.env.now(),firstMediaTime:metadata.mediaTime});
      target.onended=()=>{
       if(!current()||this.videos[this.front]!==target||this.activeGeneration!==token||this.presentation!==presentation)return;
       this.record({event:'end',clip:step.clip,token,at:this.env.now()});
       this.onEnd?.({...step.owner,clip:step.clip,generation:token});
       if(index+1<steps.length)this.switch(steps,index+1,token);
      };
      if(this.frames.length<16384)this.frames.push({clip:step.clip,token,mediaTime:metadata.mediaTime,presentedFrames:metadata.presentedFrames,at:now});
      this.publish(target,step,token,metadata);
      this.monitor(target,step,token,presentation);target.play().catch(()=>{if(current())this.onError?.({...step.owner,clip:step.clip,code:'MEDIA_PLAY_FAILED'});});complete(true);
    };
    const ready=()=>{
     if(settled||!current()){complete(false);return;}
     // load() already resets the new stream to zero. Seeking to zero again
     // can clear its decoded surface after the first-frame callback.
     try{target.playbackRate=step.rateTransition?step.rateTransition.frame/step.fps/(step.rateTransition.afterMs/1000):(step.speed||1);}catch{error();}
    };
    // A standby may still be fading out from a rapid previous switch. Make
    // the current front solid before clearing/reloading that standby surface.
    const visible=this.front<0?null:this.videos[this.front];
    const guarded=this.frozen&&this.env.guard?.active?true:this.env.guard?.capture(visible);this.frozen=false;
    if(visible){visible.style.transition='none';visible.style.opacity=guarded?'0':'1';visible.style.zIndex='1';}
    this.retiring=null;
    target.style.transition='none';target.style.opacity='0';target.style.zIndex='0';
    this.pendingCancel=cancel;target.pause();target.onended=null;target.loop=!!step.loop;
    target.addEventListener('loadeddata',ready,{once:true});target.addEventListener('error',error,{once:true});
    timer=setTimeout(error,10000);target.src=url;frameId=target.requestVideoFrameCallback(commit);target.load();
   });
  }
  publish(video,step,token,metadata){
   this.onFrame?.({...step.owner,clip:step.clip,frame:Math.min(step.frames-1,Math.floor(metadata.mediaTime*step.fps+1e-6)),mediaTime:metadata.mediaTime,fadeMs:step.fadeMs||0,generation:token,visible:this.env.opacity(video)>=.999&&!video.seeking});
  }
  monitor(video,step,token,presentation){
   let frameId=null;
   const current=()=>!this.disposed&&this.activeGeneration===token&&this.presentation===presentation&&this.videos[this.front]===video;
   const failed=()=>{if(current())this.onError?.({...step.owner,clip:step.clip,code:'MEDIA_RUNTIME_FAILED'});};video.addEventListener('error',failed);
   this.monitorCancel=()=>{if(this.pulseId!==null)this.env.cancelRaf(this.pulseId);if(frameId!==null)video.cancelVideoFrameCallback(frameId);video.removeEventListener('error',failed);this.pulseId=null;frameId=null;};
   const frame=(now,m)=>{if(!current())return;
    if(step.rateTransition&&m.mediaTime*step.fps+1e-6>=step.rateTransition.frame)video.playbackRate=step.rateTransition.speed;
    const retiring=this.retiring;
    if(retiring&&retiring.target===video&&retiring.presentation===presentation&&this.env.opacity(video)>=.999&&!video.seeking){retiring.old.style.opacity='0';retiring.old.pause();this.env.guard?.release();this.retiring=null;}
    if(this.frames.length<16384)this.frames.push({clip:step.clip,token,mediaTime:m.mediaTime,presentedFrames:m.presentedFrames,at:now});
    this.publish(video,step,token,m);
    frameId=video.requestVideoFrameCallback(frame);
   };frameId=video.requestVideoFrameCallback(frame);
  }
  retain(){++this.generation;this.pendingCancel?.();if(this.frozen)return this.front>=0;this.videos.forEach((v,i)=>{v.onended=null;if(i!==this.front){v.style.opacity='0';v.pause();}});if(this.front>=0){const v=this.videos[this.front];v.style.transition='none';v.style.opacity='1';v.style.zIndex='3';this.retiring=this.env.guard?.active?{old:this.videos[this.front===0?1:0],target:v,presentation:this.presentation}:null;}return this.front>=0;}
  freeze(){const opacity=this.videos.map(v=>this.env.opacity(v)),guarded=this.env.guard?.capturePresentation(this.videos,this.env.opacity);this.interrupt();this.frozen=true;this.videos.forEach((v,i)=>{v.style.transition='none';v.style.opacity=guarded?'0':String(opacity[i]);});this.record({event:'released-pose-locked',clip:this.clip,at:this.env.now()});}
  interrupt(){++this.generation;++this.presentation;this.activeGeneration=0;this.pendingCancel?.();this.monitorCancel?.();this.monitorCancel=null;this.retiring=null;this.videos.forEach(v=>{v.pause();v.onended=null;});}
  dispose(){this.interrupt();this.disposed=true;this.env.guard?.release();this.videos.forEach(v=>{v.style.opacity='0';v.removeAttribute('src');v.load();});}
 }
 return {Player};
});
