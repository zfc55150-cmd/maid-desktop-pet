'use strict';
const {geometry}=require('./performance-catalog.js');
function canvasPixels(visibleHeight=geometry.targetBodyHeight){if(!Number.isFinite(visibleHeight)||visibleHeight<100||visibleHeight>900)throw new Error('HEIGHT_RANGE');return Math.round(visibleHeight*geometry.sourceSize/geometry.idleBodyHeight);}
function sourcePoint(pointer,bounds){return {x:(pointer.x-bounds.x)*geometry.sourceSize/bounds.width,y:(pointer.y-bounds.y)*geometry.sourceSize/bounds.height};}
class PresentationHit {
 constructor(){this.current=null;this.retained=null;}
 update(data){if(this.current?.clip!==data.clip)this.retained=this.current;this.current={clip:data.clip,index:data.frame};if(data.visible===true)this.retained=null;}
 test(predicate){return !!(this.current&&predicate(this.current)||this.retained&&predicate(this.retained));}
}
function moveOnly(win,p){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new Error('POSITION_RANGE');win.setPosition(Math.round(p.x),Math.round(p.y),false);}
function sizeMatches(size,expected){return size.length===2&&Math.abs(size[0]-expected)<=1&&Math.abs(size[1]-expected)<=1;}
function motionBounds(position,displays,size){
 if(!displays.length)throw new Error('NO_DISPLAY');let chosen=displays[0],best=-1,distance=Infinity;
 for(const d of displays){const b=d.bounds,area=Math.max(0,Math.min(position.x+size,b.x+b.width)-Math.max(position.x,b.x))*Math.max(0,Math.min(position.y+size,b.y+b.height)-Math.max(position.y,b.y)),cx=position.x+size/2,cy=position.y+size/2,dist=Math.hypot(Math.max(b.x-cx,0,cx-b.x-b.width),Math.max(b.y-cy,0,cy-b.y-b.height));if(area>best||(area===best&&dist<distance)){chosen=d;best=area;distance=dist;}}
 const a=chosen.workArea;return {minX:a.x,minY:a.y,maxX:Math.max(a.x,a.x+a.width-size),maxY:Math.max(a.y,a.y+a.height-size*geometry.feetY/geometry.sourceSize)};
}
module.exports={canvasPixels,moveOnly,sizeMatches,motionBounds,sourcePoint,PresentationHit};
