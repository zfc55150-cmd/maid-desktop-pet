'use strict';
const referenceSize=480,edge=20;
function speechPlacement(box,body,size,area,zoom){
 const top=box.y+body.top*box.height/384,centre=box.x+(body.left+body.right)*box.width/768;
 const x=Math.max(area.x,Math.min(area.x+area.width-size.width,Math.round(centre-size.width/2)));
 const inset=(edge-referenceSize*.017)*zoom,gap=8*zoom;
 const y=Math.max(area.y,Math.min(area.y+area.height-size.height,Math.round(top-gap-size.height+inset)));
 return {x,y};
}
function hoverAllowed({inside,phase,menu,panel,sizePanel,visible}){return !!inside&&phase==='idle'&&!menu&&!panel&&!sizePanel&&!!visible;}
module.exports={speechPlacement,hoverAllowed,referenceSize,edge};
