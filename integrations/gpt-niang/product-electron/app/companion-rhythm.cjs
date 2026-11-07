'use strict';
const rhythms=Object.freeze({active:{idle:[4000,8000],busy:[4000,8000],thinkingEvery:4},natural:{idle:[6000,12000],busy:[6000,10000],thinkingEvery:3},quiet:{idle:[24000,40000],busy:[20000,30000],thinkingEvery:2}});
const workNatural=new Set(['lookaround','sleeveside','proudarms','frontpose','stretching','tea']),workActive=new Set([...workNatural,'response','footrelax']),workQuiet=new Set(['lookaround','sleeveside']),quietExcluded=new Set(['wave','walking','flutterplay','skirtbeat','challengeaccept']);
const profile=id=>rhythms[id]||rhythms.natural;
const idlePool=(rows,id)=>id==='quiet'?rows.filter(a=>!quietExcluded.has(a.clip)):rows;
const workPool=(rows,id)=>rows.filter(a=>(id==='active'?workActive:id==='quiet'?workQuiet:workNatural).has(a.clip));
module.exports={profile,idlePool,workPool};
