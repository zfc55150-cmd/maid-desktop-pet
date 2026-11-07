(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabPerformanceCatalog=api;})(globalThis,()=>{
 'use strict';
 let manifest=null;
 const takeoff=Object.freeze({clip:'flutter',airborneFrame:66,preparationMs:1200,airSpeed:1.25});
 const geometry=Object.freeze({sourceSize:384,idleBodyHeight:335,feetY:360,targetBodyHeight:300});
 const aliases={proud:'proudarms',walking:'walking',fan:'fanmishap',lantern:'lanterninvite'};
 // These clips finish above the standing baseline. Their complete performance
 // includes a pose-matched landing, for both menu selection and automatic play.
 const landingReturns=Object.freeze({frontpose:'frontlanding',flutter:'draglanding'});
 const returnClip=clip=>manifest?.transitionClips?.[clip]||landingReturns[clip];
 const needsLanding=name=>Object.hasOwn(landingReturns,aliases[name]||String(name).replace(/^clip:/,''));
 function configure(value){if(!value?.states?.frontidle||!value.transitionClips)throw Error('INVALID_CHARACTER_MANIFEST');manifest=value;}
 function route(from,to){if(from===to)return [];const edges=[['A','B','poserelax'],['B','C','turnfront'],['C','B','turnside']],queue=[[from,[]]],seen=new Set([from]);while(queue.length){const [pose,list]=queue.shift();for(const [a,b,clip]of edges)if(a===pose&&!seen.has(b)){if(b===to)return [...list,clip];seen.add(b);queue.push([b,[...list,clip]]);}}return null;}
 function plan(name,clips,{fromPose='C'}={}){
  const step=(clip,extra={})=>{if(!clips[clip])throw Error('MISSING_CLIP:'+clip);return {...clips[clip],clip,loop:false,...extra};};
  const idle=(fadeMs=80)=>step('frontidle',{loop:true,fadeMs});
  if(['idle','hold','recover','click'].includes(name))return [idle()];
  if(name==='coast')return [];
  if(name==='takeoff')return [step(takeoff.clip,{holdLast:true,fadeMs:80,rateTransition:{frame:takeoff.airborneFrame,afterMs:takeoff.preparationMs,speed:takeoff.airSpeed}})];
  if(name==='landing')return [step('draglanding',{speed:1.2,fadeMs:80}),idle()];
  const clip=aliases[name]||name.replace(/^clip:/,'');if(!manifest?.states[clip]||!clips[clip])throw Error('UNKNOWN_PERFORMANCE');if(clip==='frontidle')return [idle()];
  const entry=manifest.clipEntryPoses?.[clip]||'C',head=route(fromPose,entry),steps=(head||[]).filter(n=>n!==clip).map(n=>step(n));steps.push(step(clip,{fadeMs:head===null?180:80}));
  const bridge=returnClip(clip);if(bridge)steps.push(step(bridge,clip==='frontpose'&&bridge==='frontlanding'?{speed:1,fadeMs:0}:landingReturns[clip]===bridge?{speed:1.2,fadeMs:120}:{}));
  let pose=manifest.clipExitPoses?.[bridge||clip]||'C';const heldProp=manifest.propPolicies?.[clip]==='held-prop-fade';
  if(!heldProp){const back=manifest.returnPoses?.[clip];if(!bridge&&back&&back!=='frontidle'&&back!==clip){steps.push(step(back));pose=manifest.clipExitPoses?.[back]||pose;}for(const n of route(pose,'C')||[])steps.push(step(n));}
  steps.push(idle(heldProp?180:80));return steps;
 }
 const extraAutomatic={brelaxed:90000,footrelax:90000,response:60000,thinking:60000,sleeping:180000,confused:150000};
 const automatic=()=>[...new Set([...(manifest?.idleInteractionPool||[]),...Object.keys(extraAutomatic)])].filter(clip=>manifest?.states[clip]).map(clip=>{const bridge=returnClip(clip),entry=manifest.clipEntryPoses?.[clip]||'C',exit=manifest.clipExitPoses?.[bridge||clip]||'C';return {name:'clip:'+clip,clip,clips:[...new Set([...(route('C',entry)||[]),clip,...(bridge?[bridge]:[]),...(route(exit,'C')||[]),'frontidle'])],cooldownMs:manifest.states[clip].idleCooldownMs||extraAutomatic[clip]||manifest.idleInteractionCooldownMs||22000};});
 const airborne=f=>f?.clip===takeoff.clip&&Number.isInteger(f.frame)&&f.frame>=takeoff.airborneFrame&&f.visible===true;
 return {configure,plan,route,needsLanding,airborne,takeoff,geometry,revision:'0.8.17-electron',isSelectable:name=>!!manifest?.states[aliases[name]||name.replace(/^clip:/,'')],get selectable(){return Object.entries(manifest?.states||{}).map(([clip,s])=>({name:'clip:'+clip,clip,label:s.label,group:manifest.menuGroups?.[clip]||'其他动作'}));},get automatic(){return automatic();}};
});
