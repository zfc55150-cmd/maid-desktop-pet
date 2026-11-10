'use strict';
const {canvasPixels,motionBounds,windowCoordinate}=require('./desktop-geometry.cjs');
const characterPixels=scale=>canvasPixels(360*scale/1.4);
function placeAtFeet(bounds,size,area,body){const feet=360/384,limits=motionBounds(bounds,[{bounds:area,workArea:area}],size,body);return {x:windowCoordinate(Math.max(limits.minX,Math.min(limits.maxX,bounds.x+(bounds.width-size)/2))),y:windowCoordinate(Math.max(limits.minY,Math.min(limits.maxY,bounds.y+(bounds.height-size)*feet))),width:size,height:size};}
function uiZoom(dpi=144){const d=Number(dpi)>96?Number(dpi):144;return Math.max(1.5,Math.min(1.85,d/96));}
function panelLayout(area,dpi){const zoom=Math.max(1,Math.min(uiZoom(dpi),(area.width-48)/860,(area.height-48)/680));return {zoom,width:Math.min(area.width-32,Math.round(900*zoom)),height:Math.min(area.height-32,Math.round(730*zoom))};}
function bubbleLayout(area,dpi,scale){const zoom=Math.min(uiZoom(dpi)*scale/1.4,(area.width-32)/320);return {zoom,width:Math.round(320*zoom),maxHeight:area.height-24};}
function sizeLayout(area,dpi){const zoom=Math.min(uiZoom(dpi),(area.width-32)/400,(area.height-32)/420);return {zoom,width:Math.round(400*zoom),height:Math.round(420*zoom)};}
module.exports={characterPixels,placeAtFeet,uiZoom,panelLayout,bubbleLayout,sizeLayout};
