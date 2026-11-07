'use strict';
class TouchResponses {
 constructor(manifest,{now=Date.now,random=Math.random}={}){Object.assign(this,{manifest,now,random});this.nextAt=0;this.last=null;}
 choose(point){
  const x=point?.x,y=point?.y;if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||this.now()<this.nextAt)return null;
  const region=(x>.65&&y>.45)||(x<.32&&y>.58)?'tail':y>=.27&&y<.44&&x>=.28&&x<=.72?'cheek':y<.44?'head':y>=.44&&y<.72&&(x<.36||x>.64)?'tickle':y>.84?'feet':'body';
  const fallback={tail:'flutterplay',cheek:'cheekpuff',head:'happy',tickle:'tickledodge',feet:'bow',body:'response'};
  let choices=(this.manifest.touchResponses?.[region]||[fallback[region]]).filter(c=>this.manifest.states[c]);if(!choices.length)return null;
  const fresh=choices.filter(c=>c!==this.last);if(fresh.length)choices=fresh;const clip=choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))];this.last=clip;this.nextAt=this.now()+650;return {region,clip};
 }
}
module.exports={TouchResponses};
