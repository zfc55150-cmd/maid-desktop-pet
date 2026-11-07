(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabPerformanceCatalog=api;})(globalThis,()=>{
 'use strict';
 // Material-specific semantics live here, never in window physics or Player.
 const takeoff=Object.freeze({clip:'flutter',airborneFrame:66,preparationMs:1200,airSpeed:1.25});
 const geometry=Object.freeze({sourceSize:384,idleBodyHeight:335,feetY:360,targetBodyHeight:300});
 const automatic=Object.freeze([{name:'proud',clips:['proudarms','proudarmsreturn','frontidle'],cooldownMs:45000},{name:'walking',clips:['walking','frontidle'],cooldownMs:90000}]);
 const selectable=Object.freeze([{name:'proud',label:'抱臂与收势'},{name:'walking',label:'轻快小得意（原地）'},{name:'fan',label:'展扇小场景'},{name:'lantern',label:'提灯（含灯体与流苏）'}]);
 function plan(name,clips){
  const step=(clip,extra={})=>{if(!clips[clip])throw new Error('MISSING_CLIP:'+clip);return {...clips[clip],clip,...extra};};
  const idle=()=>step('frontidle',{loop:true,fadeMs:80});
  switch(name){
   case 'idle':case 'hold':case 'recover':case 'click':return [idle()];
   case 'takeoff':return [step(takeoff.clip,{loop:false,fadeMs:80,rateTransition:{frame:takeoff.airborneFrame,afterMs:takeoff.preparationMs,speed:takeoff.airSpeed}}),idle()];
   case 'landing':return [step('draglanding',{loop:false,speed:1.2,fadeMs:80}),idle()];
   case 'proud':return [step('proudarms'),step('proudarmsreturn'),idle()];
   case 'walking':return [step('walking'),idle()]; // In-place performance only.
   case 'fan':return [step('fanmishap'),idle()];
   case 'lantern':return [step('lanterninvite'),idle()];
   default:throw new Error('UNKNOWN_PERFORMANCE');
  }
 }
 function airborne(frame){return frame?.clip===takeoff.clip&&Number.isInteger(frame.frame)&&frame.frame>=takeoff.airborneFrame&&frame.visible===true;}
 return {plan,airborne,takeoff,geometry,automatic,selectable,revision:'electron-materials.1'};
});
