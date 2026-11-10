(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabPerformanceCatalog=api;})(globalThis,()=>{
 'use strict';
 let manifest=null;
 const takeoff=Object.freeze({clip:'flutter',airborneFrame:66,preparationMs:1200,airSpeed:1.25});
 const geometry=Object.freeze({sourceSize:384,idleBodyHeight:335,feetY:360,targetBodyHeight:300});
 const aliases={proud:'proudarms',walking:'walking',fan:'fanmishap',lantern:'lanterninvite'};
 const idleClips={A:'idle',B:'brelaxed',C:'frontidle'};
 const idlePose=clip=>clip==='idlesway'?'A':Object.keys(idleClips).find(pose=>idleClips[pose]===clip);
 // These clips finish above the standing baseline. Their complete performance
 // includes a pose-matched landing, for both menu selection and automatic play.
 const landingReturns=Object.freeze({frontpose:'frontlanding',flutter:'draglanding'});
 const returnClip=clip=>manifest?.transitionClips?.[clip]||landingReturns[clip];
 const selectableClip=clip=>!!manifest?.states[clip]&&!manifest.states[clip].followUpOnly;
 const needsLanding=name=>Object.hasOwn(landingReturns,aliases[name]||String(name).replace(/^clip:/,''));
 function configure(value){if(!value?.states?.frontidle||!value.transitionClips)throw Error('INVALID_CHARACTER_MANIFEST');manifest=value;}
 function route(from,to,clips=manifest?.states){if(from===to)return [];const edges=[['A','B','poserelax'],['B','C','turnfront'],['C','B','turnside'],['B','A','btoabridge'],['A','C','atocbridge']],queue=[[from,[]]],seen=new Set([from]);while(queue.length){const [pose,list]=queue.shift();for(const [a,b,clip]of edges)if(a===pose&&!seen.has(b)&&clips?.[clip]){if(b===to)return [...list,clip];seen.add(b);queue.push([b,[...list,clip]]);}}return null;}
 function plan(name,clips,{fromPose='C'}={}){
  const step=(clip,extra={})=>{if(!clips[clip])throw Error('MISSING_CLIP:'+clip);return {...clips[clip],clip,loop:false,...extra};};
  const idle=(clip='frontidle',fadeMs=80)=>step(clip,{loop:true,fadeMs});
  if(['idle','hold','recover','click'].includes(name))return [idle()];
  if(name==='coast')return [];
  if(name==='takeoff')return [step(takeoff.clip,{holdLast:true,fadeMs:80,rateTransition:{frame:takeoff.airborneFrame,afterMs:takeoff.preparationMs,speed:takeoff.airSpeed}})];
  if(name==='landing')return [step('draglanding',{speed:1.2,fadeMs:80}),idle()];
  const clip=aliases[name]||name.replace(/^clip:/,'');if(!selectableClip(clip)||!clips[clip])throw Error('UNKNOWN_PERFORMANCE');
  const entry=manifest.clipEntryPoses?.[clip]||'C',head=route(fromPose,entry,clips),steps=(head||[]).filter(n=>n!==clip).map(n=>step(n));
  if(idlePose(clip))return [...steps,idle(clip,head===null?180:80)];
  steps.push(step(clip,{fadeMs:head===null?180:80}));
  const bridge=returnClip(clip);if(bridge)steps.push(step(bridge,clip==='frontpose'&&bridge==='frontlanding'?{speed:1,fadeMs:0}:landingReturns[clip]===bridge?{speed:1.2,fadeMs:120}:{}));
  let pose=manifest.clipExitPoses?.[bridge||clip]||'C';const heldProp=manifest.propPolicies?.[clip]==='held-prop-fade';
  if(heldProp&&!bridge)return [...steps,idle('frontidle',180)];
  const back=manifest.returnPoses?.[clip];
  if(!bridge&&back&&back!==clip&&!idlePose(back)){steps.push(step(back));pose=manifest.clipExitPoses?.[back]||pose;}
  const rest=idleClips[pose];
  if(rest&&clips[rest])return [...steps,idle(rest)];
  return [...steps,...(route(pose,'C',clips)||[]).map(n=>step(n)),idle()];
 }
 const extraAutomatic={frontidle:1,brelaxed:1,idle:1,idlesway:1,weightshift:1,footrelax:90000,response:60000,thinking:60000,sleeping:180000,confused:150000};
 const automatic=()=>[...new Set([...(manifest?.idleInteractionPool||[]),...Object.keys(extraAutomatic)])].filter(selectableClip).map(clip=>{
  const name='clip:'+clip,entryPose=manifest.clipEntryPoses?.[clip]||'C',steps=plan(name,manifest.states,{fromPose:entryPose});
  return {name,clip,entryPose,clips:[...new Set(steps.map(s=>s.clip))],idlePose:idlePose(steps.at(-1).clip),cooldownMs:manifest.states[clip].idleCooldownMs||extraAutomatic[clip]||manifest.idleInteractionCooldownMs||22000};
 });
 const airborne=f=>f?.clip===takeoff.clip&&Number.isInteger(f.frame)&&f.frame>=takeoff.airborneFrame&&f.visible===true;
 return {configure,plan,route,idlePose,needsLanding,airborne,takeoff,geometry,revision:'0.8.26-electron',isSelectable:name=>selectableClip(aliases[name]||name.replace(/^clip:/,'')),get selectable(){return Object.keys(manifest?.states||{}).filter(selectableClip).map(clip=>({name:'clip:'+clip,clip,label:manifest.states[clip].label,group:manifest.menuGroups?.[clip]||'其他动作'}));},get automatic(){return automatic();}};
});
