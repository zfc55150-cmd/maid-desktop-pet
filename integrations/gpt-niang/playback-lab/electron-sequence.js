'use strict';
(async()=>{
 const config=await window.probe.config(),videos=[...document.querySelectorAll('video')],checks=[];
 const player=new LabVideoPlayer.Player(videos,name=>config.clips[name].url);
 const step=(clip,other={})=>({...config.clips[clip],clip,...other});
 const check=(ok,name)=>{if(!ok)throw new Error(name);checks.push(name);};
 const until=async condition=>{const start=performance.now();while(!condition()){if(performance.now()-start>16000)throw new Error('SCENARIO_TIMEOUT');await new Promise(r=>setTimeout(r,10));}};
 try{
  check(await player.playSequence([step('proudarms'),step('proudarmsreturn'),step('frontidle')]),'native-chain-start');
  await until(()=>player.clip==='frontidle');
  check(player.trace.filter(x=>x.event==='commit').map(x=>x.clip).join('|')==='proudarms|proudarmsreturn|frontidle','native-return-order');
  for(const name of ['proudarms','proudarmsreturn']){
   const begin=player.trace.find(x=>x.clip===name&&x.event==='commit'),end=player.trace.find(x=>x.clip===name&&x.event==='end');
   check(end.at-begin.at>=5900,'native-duration-'+name);
  }
  const old=player.playSequence([step('proudarms'),step('proudarmsreturn')]);
  const current=player.playSequence([step('walking',{fadeMs:180})]);
  check(await old===false,'old-load-cancelled');check(await current,'new-walking-accepted');
  const boundary=performance.now();
  await new Promise(r=>setTimeout(r,220));
  check(!player.trace.some(x=>x.at>boundary&&x.event==='commit'&&x.clip==='proudarmsreturn'),'no-late-return');
  check(await player.playSequence([step('flutter',{rateTransition:{frame:66,afterMs:1200,speed:1.25},fadeMs:80,loop:false})]),'takeoff-start');
  await until(()=>player.frames.some(x=>x.clip==='flutter'&&x.mediaTime>=85/30));
  const flutter=player.frames.filter(x=>x.clip==='flutter');
  check(videos[player.front].playbackRate===1.25,'takeoff-rate-boundary');
  check(await player.playSequence([step('draglanding',{speed:1.2,fadeMs:80}),step('frontidle',{fadeMs:80})]),'landing-start');
  await until(()=>player.clip==='frontidle');
  const landingStart=player.trace.find(x=>x.event==='commit'&&x.clip==='draglanding'),landingEnd=player.trace.find(x=>x.event==='end'&&x.clip==='draglanding');
  check(landingEnd.at-landingStart.at>=4900&&landingEnd.at-landingStart.at<6000,'landing-rate');
  check(player.trace.filter(x=>x.event==='commit').every(x=>Math.abs(x.firstMediaTime)<0.005),'every-action-commits-source-frame-zero');
  const pending=player.playSequence([step('fanmishap')]);player.dispose();check(await pending===false,'dispose-cancels-pending');
  window.probe.finish({ok:true,checks,trace:player.trace,frames:player.frames,releasedFlutterMediaTime:flutter.at(-1).mediaTime,transitionPixelEquivalenceVerified:false,scenarioUsesSyntheticCommands:true});
 }catch(error){player.dispose();window.probe.finish({ok:false,error:error.message,checks,trace:player.trace,frames:player.frames});}
})().catch(error=>window.probe.finish({ok:false,error:error.message}));
