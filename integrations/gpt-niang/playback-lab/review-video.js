'use strict';
(async()=>{
 if(!window.probe?.config){document.querySelector('#status').textContent='请使用“打开GPT娘预览.cmd”启动独立预览。浏览器直接打开此HTML不能连接播放器。';return;}
 const config=await window.probe.config(),videos=[...document.querySelectorAll('video')],stage=document.querySelector('section');
 function size(){const px=config.targetHeight*384/335/devicePixelRatio;stage.style.width=stage.style.height=px+'px';}size();window.addEventListener('resize',size);
 const player=new LabVideoPlayer.Player(videos,name=>config.clips[name].url),step=(clip,extra={})=>({...config.clips[clip],clip,...extra}),inputs=[];
 const plans={
  '待机':[step('frontidle')],
  '抱臂与收势':[step('proudarms'),step('proudarmsreturn'),step('frontidle')],
  '走路原片（原地）':[step('walking'),step('frontidle')],
  '起飞计时样本':[step('flutter',{takeoff:true,fadeMs:80,loop:false})],
  '落地与返回':[step('draglanding',{speed:1.2,fadeMs:80}),step('frontidle',{fadeMs:80})],
  '展扇原片':[step('fanmishap'),step('frontidle',{fadeMs:180})]
 };
 const report=()=>({ok:true,inputs,trace:player.trace,frames:player.frames,devicePixelRatio,characterHeightTarget:config.targetHeight,characterPhysicalHeightMeasured:false,transitionPixelEquivalenceVerified:false});
 for(const [name,steps]of Object.entries(plans)){
  const b=document.createElement('button');b.textContent=name;b.addEventListener('click',async()=>{try{inputs.push({action:name,at:performance.now()});if(!await player.playSequence(steps))throw new Error('ACTION_LOAD_FAILED');document.querySelector('#status').textContent='正在播放：'+name+'。关闭窗口会恢复正式挂件。';window.probe.finish(report());}catch(error){document.querySelector('#status').textContent='动作加载失败：'+error.message;window.probe.finish({ok:false,error:error.message});}});document.querySelector('nav').append(b);
 }
 if(!await player.playSequence(plans['待机']))throw new Error('IDLE_LOAD_FAILED');
 if(config.smoke){const start=performance.now();while(player.frames.length<3){if(performance.now()-start>8000)throw new Error('FRAME_TIMEOUT');await new Promise(r=>setTimeout(r,10));}player.dispose();window.probe.finish(report());}
 window.addEventListener('beforeunload',()=>{window.probe.finish(report());player.dispose();});
})().catch(error=>window.probe.finish({ok:false,error:error.message}));
