'use strict';
const {geometry}=require('./performance-catalog.js');
function canvasPixels(visibleHeight=geometry.targetBodyHeight){if(!Number.isFinite(visibleHeight)||visibleHeight<100||visibleHeight>900)throw new Error('HEIGHT_RANGE');return Math.round(visibleHeight*geometry.sourceSize/geometry.idleBodyHeight);}
function sourcePoint(pointer,bounds,scaleY=1){const y=(pointer.y-bounds.y)*geometry.sourceSize/bounds.height;return {x:(pointer.x-bounds.x)*geometry.sourceSize/bounds.width,y:geometry.feetY+(y-geometry.feetY)/scaleY};}
class PresentationHit {
 constructor(){this.current=null;this.retained=null;}
 update(data){if(this.current?.clip!==data.clip)this.retained=this.current;this.current={clip:data.clip,index:data.frame};if(data.visible===true)this.retained=null;}
 test(predicate){return !!(this.current&&predicate(this.current)||this.retained&&predicate(this.retained));}
}
function windowCoordinate(value){
 const rounded=Math.round(value);
 if(!Number.isFinite(value)||rounded< -2147483648||rounded>2147483647)throw new Error('POSITION_RANGE');
 // Math.round(-0.4) is negative zero, which Electron's int32 converter rejects.
 return rounded===0?0:rounded;
}
function moveOnly(win,p){win.setPosition(windowCoordinate(p.x),windowCoordinate(p.y),false);}
function sizeMatches(size,expected){return size.length===2&&Math.abs(size[0]-expected)<=1&&Math.abs(size[1]-expected)<=1;}
function motionBounds(position,displays,size,body={left:0,top:0,right:geometry.sourceSize,bottom:geometry.feetY}){
 if(!displays.length)throw new Error('NO_DISPLAY');let chosen=displays[0],best=-1,distance=Infinity;
 const scale=size/geometry.sourceSize,l=body.left*scale,r=body.right*scale,t=body.top*scale,f=body.bottom*scale,cx=position.x+(l+r)/2,cy=position.y+(t+f)/2;
 for(const d of displays){const b=d.bounds,area=Math.max(0,Math.min(position.x+r,b.x+b.width)-Math.max(position.x+l,b.x))*Math.max(0,Math.min(position.y+f,b.y+b.height)-Math.max(position.y+t,b.y)),dist=Math.hypot(Math.max(b.x-cx,0,cx-b.x-b.width),Math.max(b.y-cy,0,cy-b.y-b.height));if(area>best||(area===best&&dist<distance)){chosen=d;best=area;distance=dist;}}
 const a=chosen.workArea,b=chosen.bounds;
 const result={minX:a.x-l,minY:a.y-t,maxX:Math.max(a.x-l,a.x+a.width-r),maxY:Math.max(a.y-t,a.y+a.height-f)};
 // Open only real panel seams. Gaps and exposed edges retain their collisions.
 for(const other of displays){if(other===chosen)continue;const n=other.bounds;
  if(cy>=Math.max(b.y,n.y)&&cy<Math.min(b.y+b.height,n.y+n.height)){
   if(Math.abs(n.x+n.width-b.x)<=1)result.minX=-Infinity;
   if(Math.abs(b.x+b.width-n.x)<=1)result.maxX=Infinity;
  }
  if(cx>=Math.max(b.x,n.x)&&cx<Math.min(b.x+b.width,n.x+n.width)){
   if(Math.abs(n.y+n.height-b.y)<=1)result.minY=-Infinity;
   if(Math.abs(b.y+b.height-n.y)<=1)result.maxY=Infinity;
  }
 }
 return result;
}
module.exports={canvasPixels,windowCoordinate,moveOnly,sizeMatches,motionBounds,sourcePoint,PresentationHit};
