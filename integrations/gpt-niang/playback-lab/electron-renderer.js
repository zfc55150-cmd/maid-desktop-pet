'use strict';
const video=document.querySelector('video'),start=performance.now(),frames=[];
video.src=new URL('file:///'+new URLSearchParams(location.search).get('video').replaceAll('\\','/')).href;
video.addEventListener('error',()=>window.probe.finish({ok:false,error:'MEDIA_'+video.error?.code}),{once:true});
video.addEventListener('loadeddata',async()=>{
 const loadedMs=performance.now()-start;
 try{await video.play();}catch{window.probe.finish({ok:false,error:'PLAY_REJECTED'});return;}
 function frame(now,m){frames.push({nowMs:now-start,mediaTime:m.mediaTime,presentationTime:m.presentationTime,expectedDisplayTime:m.expectedDisplayTime,presentedFrames:m.presentedFrames,processingDuration:m.processingDuration});if(m.mediaTime>=5.8)done();else video.requestVideoFrameCallback(frame);}
 function done(){video.pause();window.probe.finish({ok:true,loadedMs,width:video.videoWidth,height:video.videoHeight,duration:video.duration,frames,quality:video.getVideoPlaybackQuality().toJSON?.()||{total:video.getVideoPlaybackQuality().totalVideoFrames,dropped:video.getVideoPlaybackQuality().droppedVideoFrames}});}
 video.requestVideoFrameCallback(frame);
},{once:true});
