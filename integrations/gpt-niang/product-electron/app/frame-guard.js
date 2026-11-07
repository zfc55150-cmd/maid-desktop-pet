(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabFrameGuard=api;})(globalThis,()=>{
 'use strict';
 class FrameGuard {
  constructor(canvas,makeCanvas=()=>document.createElement('canvas')){this.canvas=canvas;this.scratch=makeCanvas();this.active=false;canvas.width=canvas.height=this.scratch.width=this.scratch.height=384;canvas.style.opacity='0';this.scratch.getContext('2d',{willReadFrequently:true});}
  hasPixels(context){const bytes=context.getImageData(0,0,384,384).data;for(let n=3;n<bytes.length;n+=4)if(bytes[n]>0)return true;return false;}
  canRelease(video){if(!video||video.readyState<2||video.seeking)return false;try{const source=this.scratch.getContext('2d');source.clearRect(0,0,384,384);source.drawImage(video,0,0,384,384);return this.hasPixels(source);}catch{return false;}}
  copyVideo(video){
   if(!video||video.readyState<2||video.seeking)return false;
   try{
    const source=this.scratch.getContext('2d');source.clearRect(0,0,384,384);source.drawImage(video,0,0,384,384);if(!this.hasPixels(source))return false;
    const target=this.canvas.getContext('2d');target.globalCompositeOperation='copy';target.drawImage(this.scratch,0,0);
    this.canvas.style.opacity='1';return true;
   }catch{return false;/* Leave the previous valid presentation intact. */}
  }
  present(video){if(!this.copyVideo(video))return false;this.persistent=true;this.active=false;return true;}
  capture(video){
   // Preserve the exact last displayed frame, rather than a decoder that may
   // already have advanced while a press/action acknowledgement was in flight.
   if(this.persistent||this.copyVideo(video))this.active=true;
   return this.active;
  }
  release(){if(!this.persistent)this.canvas.style.opacity='0';this.active=false;}
  clear(){this.persistent=false;this.canvas.style.opacity='0';this.active=false;}
  capturePresentation(videos,opacity){
   if(this.persistent){this.active=true;return true;}
   const layers=videos.filter(v=>v.readyState>=2&&!v.seeking).map(v=>({image:v,opacity:opacity(v),z:Number(v.style.zIndex||0)})).filter(l=>l.opacity>0);
   if(this.active)layers.push({image:this.canvas,opacity:1,z:2});
   if(!layers.length)return false;
   try{
    const source=this.scratch.getContext('2d');source.globalCompositeOperation='source-over';source.clearRect(0,0,384,384);
    for(const layer of layers.sort((a,b)=>a.z-b.z)){source.globalAlpha=layer.opacity;source.drawImage(layer.image,0,0,384,384);}source.globalAlpha=1;if(!this.hasPixels(source))return this.active;
    const target=this.canvas.getContext('2d');target.globalCompositeOperation='copy';target.drawImage(this.scratch,0,0);this.canvas.style.opacity='1';this.active=true;
   }catch{/* Retain an existing valid snapshot if a decoder surface disappears. */}
   return this.active;
  }
 }
 return {FrameGuard};
});
