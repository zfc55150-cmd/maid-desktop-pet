'use strict';
const policy=Object.freeze({idle:[120,200],rest:[2600,4200],busy:[2300,4200],showcaseGapMs:43000,thinkingEvery:6});
const contextOnly=new Set(['thinking','confused']);
function performances(rows,pose){
 return rows.filter(action=>{
  if(contextOnly.has(action.clip)||['frontidle','brelaxed','idle','idlesway'].includes(action.clip))return false;
  return !pose||(action.entryPose===pose&&action.idlePose===pose);
 });
}
module.exports={policy,performances};
