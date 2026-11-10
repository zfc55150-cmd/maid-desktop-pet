'use strict';
const rhythms=Object.freeze({active:{idle:[8000,13000],accentGapMs:75000,busy:[4000,8000],thinkingEvery:4},natural:{idle:[12000,20000],accentGapMs:120000,busy:[6000,10000],thinkingEvery:3},quiet:{idle:[24000,40000],accentGapMs:240000,busy:[20000,30000],thinkingEvery:2}});
const workNatural=new Set(['lookaround','sleeveside','proudarms','frontpose','stretching','tea']),workActive=new Set([...workNatural,'response','footrelax']),workQuiet=new Set(['lookaround','sleeveside']),quietExcluded=new Set(['wave','walking','flutterplay','skirtbeat','challengeaccept']);
const gentleFront=new Set(['csoftbreathblink','ctailtipsettle','cbrushfringe','chandsrest','csmallweightsettle','cnoticeuser','csuppressedyawn','sleeveside']);
const sideGestures=new Set(['footrelax','response']);
const contextOnly=new Set(['thinking','confused']);
const profile=id=>rhythms[id]||rhythms.natural;
const idlePool=(rows,id)=>id==='quiet'?rows.filter(a=>!quietExcluded.has(a.clip)):rows;
const idleLane=(rows,pose,id)=>{
 const local=idlePool(rows,id).filter(a=>a.entryPose===pose&&a.idlePose===pose&&!catalogLoop(a.clip)&&!contextOnly.has(a.clip));
 const gentle=local.filter(a=>(pose==='C'?gentleFront:sideGestures).has(a.clip));
 return {gentle,accents:local.filter(a=>!gentle.includes(a))};
};
const catalogLoop=id=>['frontidle','brelaxed','idle','idlesway'].includes(id);
const workPool=(rows,id)=>rows.filter(a=>(id==='active'?workActive:id==='quiet'?workQuiet:workNatural).has(a.clip));
module.exports={profile,idleLane,workPool};
