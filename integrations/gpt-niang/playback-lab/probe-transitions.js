(async()=>{
 const config=await window.probe.config(),guard=new LabFrameGuard.FrameGuard(document.querySelector('canvas')),player=new LabVideoPlayer.Player([...document.querySelectorAll('video')],name=>config.clips[name].url,{guard}),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const step=(name,extra={})=>({clip:name,...config.clips[name],...extra}),events=[];
 const note=kind=>events.push({kind,at:Date.now(),guard:guard.active,front:player.front,videos:player.videos.map(v=>({opacity:getComputedStyle(v).opacity,ready:v.readyState,seeking:v.seeking,paused:v.paused,time:v.currentTime}))});
 await player.playSequence([step('frontidle')]);await pause(200);
 for(let n=0;n<12;n++){
  note('before-hold');player.retain();await pause(30);
  note('before-takeoff');await player.playSequence([step('flutter',{takeoff:true,fadeMs:80})]);note('takeoff-commit');await pause(n%2?30:160);
  note('before-idle');await player.playSequence([step('frontidle',{fadeMs:80})]);note('idle-commit');await pause(n%3?30:150);
 }
 await pause(250);window.probe.finish({completed:true,timeOrigin:performance.timeOrigin,events,trace:player.trace,frames:player.frames.length});
})().catch(e=>window.probe.finish({error:e.message}));
