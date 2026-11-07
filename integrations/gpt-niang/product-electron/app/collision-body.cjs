'use strict';
const {geometry}=require('./performance-catalog.js'),frames=new WeakMap(),size=geometry.sourceSize,frameBytes=size*size/8;
// Masks are immutable verified buffers. Cache by buffer, so eviction also frees
// its bounds; the physics clock never rescans a frame that has already appeared.
function maskBounds(mask,frame){
 if(!mask||!Number.isInteger(frame)||frame<0||mask.length%frameBytes||frame>=mask.length/frameBytes)return null;
 let cache=frames.get(mask);if(!cache){cache=new Map();frames.set(mask,cache);}if(cache.has(frame))return cache.get(frame);
 let left=size,top=size,right=0,bottom=0;const offset=frame*frameBytes;
 for(let i=0;i<frameBytes;i++){const byte=mask[offset+i];if(!byte)continue;const y=Math.floor(i*8/size);top=Math.min(top,y);bottom=Math.max(bottom,y+1);for(let bit=0;bit<8;bit++)if(byte&(1<<bit)){const x=(i*8+bit)%size;left=Math.min(left,x);right=Math.max(right,x+1);}}
 const result=right>left?Object.freeze({left,top,right,bottom}):null;cache.set(frame,result);return result;
}
function visibleFootprint(mask,frame,scaleY=1,feetY=geometry.feetY){
 const box=maskBounds(mask,frame)||{left:0,top:0,right:size,bottom:geometry.feetY},anchor=geometry.feetY;
 return {...box,top:anchor+(box.top-anchor)*scaleY,bottom:feetY??anchor+(box.bottom-anchor)*scaleY};
}
module.exports={maskBounds,visibleFootprint};
