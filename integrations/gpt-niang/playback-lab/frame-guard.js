(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabFrameGuard=api;})(globalThis,()=>{
 'use strict';
 class FrameGuard {
  constructor(canvas,makeCanvas=()=>document.createElement('canvas')){this.canvas=canvas;this.scratch=makeCanvas();this.active=false;canvas.width=canvas.height=this.scratch.width=this.scratch.height=384;canvas.style.opacity='0';}
  capture(video){
   if(!video||video.readyState<2||video.seeking)return this.active;
   try{
    const source=this.scratch.getContext('2d');source.clearRect(0,0,384,384);source.drawImage(video,0,0,384,384);
    const target=this.canvas.getContext('2d');target.globalCompositeOperation='copy';target.drawImage(this.scratch,0,0);
    this.canvas.style.opacity='1';this.active=true;
   }catch{/* A failed capture must leave the previous valid guard intact. */}
   return this.active;
  }
  release(){this.canvas.style.opacity='0';this.active=false;}
  capturePresentation(videos,opacity){
   const layers=videos.filter(v=>v.readyState>=2&&!v.seeking).map(v=>({image:v,opacity:opacity(v),z:Number(v.style.zIndex||0)})).filter(l=>l.opacity>0);
   if(this.active)layers.push({image:this.canvas,opacity:1,z:2});
   if(!layers.length)return false;
   try{
    const source=this.scratch.getContext('2d');source.globalCompositeOperation='source-over';source.clearRect(0,0,384,384);
    for(const layer of layers.sort((a,b)=>a.z-b.z)){source.globalAlpha=layer.opacity;source.drawImage(layer.image,0,0,384,384);}source.globalAlpha=1;
    const target=this.canvas.getContext('2d');target.globalCompositeOperation='copy';target.drawImage(this.scratch,0,0);this.canvas.style.opacity='1';this.active=true;
   }catch{/* Retain an existing valid snapshot if a decoder surface disappears. */}
   return this.active;
  }
 }
 return {FrameGuard};
});
