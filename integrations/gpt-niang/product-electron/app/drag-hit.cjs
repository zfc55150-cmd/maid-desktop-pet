'use strict';
const {hit}=require('./desktop-motion.cjs');
// A hand moving between presentation and pointer delivery must remain grabbable.
// Grace is bounded in time and pixels; empty canvas remains click-through.
class DragHit {
 constructor({mask,now=Date.now,graceMs=120,radiusPixels=7}={}){Object.assign(this,{mask,now,graceMs,radiusPixels});this.recent=[];}
 record(frame){if(frame.visible!==true)return;this.recent.push({clip:frame.clip,index:frame.frame,requestId:frame.requestId,serial:frame.serial,gesture:frame.gesture,at:this.now()});this.prune();}
 prune(){const t=this.now();this.recent=this.recent.filter(f=>t-f.at<=this.graceMs).slice(-4);}
 clips(){this.prune();return this.recent.map(f=>f.clip);}
 presented(data,point,canvasPixels){if(!data||!point||!Number.isInteger(data.frame)||![point.x,point.y].every(n=>Number.isFinite(n)&&n>=0&&n<1))return false;this.prune();const frame=this.recent.find(f=>f.clip===data.clip&&f.index===data.frame&&f.requestId===data.requestId&&f.serial===data.serial&&f.gesture===data.gesture);return !!frame&&this.test(frame,null,point.x*384,point.y*384,canvasPixels);}
 test(current,retained,x,y,canvasPixels){
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=384||y>=384)return false;this.prune();
  const r=Math.min(12,this.radiusPixels*384/canvasPixels),edge=Math.ceil(r);
  for(const f of [current,retained,...this.recent].filter(Boolean)){const mask=this.mask(f.clip);if(!mask)continue;if(hit(mask,f.index,x,y))return true;for(let dy=-edge;dy<=edge;dy++)for(let dx=-edge;dx<=edge;dx++)if(dx*dx+dy*dy<=r*r&&hit(mask,f.index,x+dx,y+dy))return true;}return false;
 }
}
module.exports={DragHit};
