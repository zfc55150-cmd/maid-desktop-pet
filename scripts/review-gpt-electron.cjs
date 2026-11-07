'use strict';
// Isolated renderer using installed media read-only. No host/API or personal data.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
const mode=args.includes('--baseline')?'baseline':'candidate';
const idle=args.includes('--idle');
const interaction=args.includes('--interaction');
const base=path.join(root,'work/optimization-20261101/baseline');
const tag=args.find(a=>a.startsWith('--tag='))?.slice(6)||'';
const out=path.join(root,'work/optimization-20261101/visual',mode+(idle?'-idle':'')+tag);
if(fs.existsSync(path.join(out,'result.json')))throw Error('Completed evidence exists; use a fresh output');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));
const helper=mode==='baseline'?path.join(base,'installed/node_modules/dsh-pet/runtime/electron-helper'):path.join(root,'app/electron-helper');
const media=path.join(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'),'DeepSeekActionPet/dsh-pet/pet/gptniang-animation');
const configFile=args.find(a=>a.startsWith('--config='))?.slice(9)||path.join(base,'config/DeepSeekActionPet/dsh-pet/pet/gptniang-config.json');
const original=JSON.parse(fs.readFileSync(configFile,'utf8'));
const pet={id:'gptniang',assetRoot:'gptniang',characterId:'gptniang',name:'隔离龙娘验证',size:480,position:{corner:'bottom-right',marginX:10,marginY:10},fixedEnabled:true,animations:original.animations,animationWeights:original.animationWeights,actionRegistry:original.actionRegistry,balanceEnabled:false,workStatusEnabled:false,whisperEnabled:false};
const url=p=>pathToFileURL(p).href;
const css=fs.readFileSync(path.join(helper,'index.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const scripts=['shared-core.js','action-registry.js','pet-form.js','pet-inline-chat.js','sprite.js','events.js'].filter(n=>fs.existsSync(path.join(helper,n)));
fs.writeFileSync(path.join(out,'fixture.js'),`window.__dshPetDebug={};window.bounds=[];
const S=window.PetShared,CONFIG={scale:1,topInsetRatio:0},BASE='',VIEW={x:0,y:0,w:1600,h:1000},PRIMARY_AREA={x:0,y:0,width:1600,height:1000};
const WINDOW_MARGIN_RATIO=0.5,rootEl=document.getElementById('root'),cfg={animations:null},config={},WORK_AREAS=[PRIMARY_AREA],AREAS=[PRIMARY_AREA],PANELS=[PRIMARY_AREA];
const toScreen=x=>x,toLocal=x=>x;const BUBBLE_DURATION_MS=5000;
window.petBridge={setBounds(...a){bounds.push(a)},setInputRegions(){},setInteractive(){},setInputBusy(){},chatState:async()=>({ok:true,data:{messages:[],voiceEnabled:false}}),onChatEvent:()=>()=>{}};
window.sprite=new PetSprite(${JSON.stringify(pet)});sprite.assetBase=${JSON.stringify(url(media)+'/')};
window.inputTrace=[];for(const type of ['pointerdown','pointermove','pointerup','lostpointercapture','mousemove'])document.addEventListener(type,e=>inputTrace.push({type,buttons:e.buttons,button:e.button,screenX:e.screenX,screenY:e.screenY,clientX:e.clientX,clientY:e.clientY,active:sprite.dragState.active,dragging:sprite.dragState.dragging}),true);
window.frames=[];window.commits=[];window.monitoring=true;
for(const v of [sprite.videoA,sprite.videoB]){const tick=(now,m)=>{if(!monitoring)return;frames.push({at:now,mediaTime:m.mediaTime,presentedFrames:m.presentedFrames,video:v===sprite.videoA?0:1,front:sprite.front,anim:sprite.anim});v.requestVideoFrameCallback(tick)};v.requestVideoFrameCallback(tick);}
sprite.switchTo('待机呼吸',false);
`);
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><style>${css}body{background:#e6e6e6}</style><div id="root"></div>${scripts.map(n=>`<script src="${url(path.join(helper,n))}"></script>`).join('')}<script src="fixture.js"></script>`);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const names=['待机呼吸','鼓腮抗议','怕痒躲避','热情挥手','害羞撇头','抱臂矜持','优雅奉茶','展扇巧笑','提灯引路','乖巧回应','轻盈落地','轻快踱步'];
const result={mode,idle,startedAt:new Date().toISOString(),method:'real Electron requestVideoFrameCallback and capturePage; video uses wallclock capture timestamps, may omit frames; not artistic approval',scenes:[],errors:[],userArtApproval:false,paidCalls:0,productionModified:false};
result.loadedCodeHashes=scripts.map(name=>({name,sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(helper,name))).digest('hex')}));
result.configSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(configFile)).digest('hex');
const ffdir=path.join(root,'work/gpt-niang-animation/video-tools/imageio_ffmpeg/binaries');
const ffmpeg=path.join(ffdir,fs.readdirSync(ffdir).find(n=>n.endsWith('.exe')));
let win;
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.setAudioMuted(true);
 win.webContents.on('console-message',(_e,l,m)=>{if(l>=3&&!m.includes('Content-Security-Policy'))result.errors.push(m)});
 win.webContents.on('render-process-gone',(_e,d)=>result.errors.push('renderer:'+d.reason));
 await win.loadFile(path.join(out,'index.html'));
 const js=s=>win.webContents.executeJavaScript(s);
 async function waitFor(s,max=15000){const start=Date.now();while(Date.now()-start<max){if(await js(s))return;await win.webContents.capturePage();await pause(40);}throw Error('Timeout: '+s);}
 await waitFor('!!window.sprite && sprite.pending===null && Math.max(sprite.videoA.readyState,sprite.videoB.readyState)>=2');
 result.environment={electron:process.versions.electron,chrome:process.versions.chrome,windows:require('node:os').release(),deviceScaleFactor:await js('devicePixelRatio'),viewport:{width:1000,height:800},petSizeCss:480,hiddenWindow:true};
 result.processSamples=[];
 const metricTimer=setInterval(()=>result.processSamples.push({at:new Date().toISOString(),processes:app.getAppMetrics().map(p=>({type:p.type,pid:p.pid,cpu:p.cpu,memory:p.memory}))}),5000);
 const crop={x:240,y:240,width:480,height:304};
 if(interaction){
  const check=async(label,code)=>{const value=await js(code);assert.ok(value,label);result.scenes.push({label,passed:true});};
  await check('dragon has no BlueWhale form or full-body squash',"sprite.characterCapabilities.characterId==='gptniang' && !sprite.characterCapabilities.fullBodySquash && sprite.forms.supported===false");
  await check('registered action identities active',"!!sprite.actionRegistry && sprite.actionRegistry.resolve('热情挥手').clipId===sprite.actionRegistry.resolve('挥手致意').clipId");
  await js("sprite.onMenuAction({action:'form-toggle'});sprite.onClick()");
  await waitFor("sprite.pending===null && !sprite.animations.idle.includes(sprite.anim)");
  const before=await js('({anim:sprite.anim,gen:sprite.gen,time:(sprite.front===0?sprite.videoA:sprite.videoB).currentTime})');
  for(let n=0;n<10;n++){await js('sprite.onClick()');await pause(200);}
  await check('5Hz clicking keeps current long clip and only one latest intent',`sprite.anim===${JSON.stringify(before.anim)} && sprite.gen===${before.gen} && typeof sprite._latestClickIntent==='string' && !sprite.pending`);
  await js("sprite.menuOpen=true;sprite._latestClickIntent=null");
  await pause(17000);
  await check('menu held through long-clip end prevents roaming',"sprite.menuOpen && sprite.moveRef===null && sprite.pendingMove===null && sprite.animations.idle.includes(sprite.anim)");
  await js("sprite.menuOpen=false;sprite._userActionUntil=0;sprite.actionPose='front';sprite.actionProps=[];sprite.onMenuAction({anim:'抱臂回正'})");
  await check('return-only manual entry is refused from idle',"sprite.anim!=='抱臂回正' && !sprite.pending");
  // Exercise real missing-media error after a valid frame, not only fake callbacks.
  await js("sprite.switchTo('__missing_isolated_test__',true)");
  await waitFor("!sprite.pending && sprite.animations.idle.includes(sprite.anim)");
  result.errors=result.errors.filter(e=>e.includes('__missing_isolated_test__')?false:true);
  await check('missing clip returns to loaded idle',"(sprite.front===0?sprite.videoA:sprite.videoB).readyState>=2 && !(sprite.front===0?sprite.videoA:sprite.videoB).paused");
  const point=await js('(()=>{const r=sprite.hit.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
  win.webContents.sendInputEvent({type:'mouseMove',...point});
  win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});await pause(80);
  await check('Chromium mouse-down reaches real pointer capture path',"sprite.dragState.active===true");
  win.webContents.sendInputEvent({type:'mouseMove',x:point.x+30,y:point.y-30,button:'left',modifiers:['leftButtonDown']});await pause(100);
  result.nativeMoveState=await js('({trace:inputTrace,dragState:sprite.dragState,anim:sprite.anim,pending:sprite.pending?.anim})');
  await check('Chromium movement crosses threshold and preempts idle with airborne video',"sprite.dragState.dragging && (sprite.pending?.anim===sprite.animations.drag[0] || sprite.anim===sprite.animations.drag[0])");
  win.webContents.sendInputEvent({type:'mouseUp',x:point.x+30,y:point.y-30,button:'left',clickCount:1});await pause(120);
  await check('Chromium release clears pointer busy state',"sprite.dragState.active===false && sprite.dragState.dragging===false");
  await js('sprite.stopThrow();sprite.stopDragFollow()');
  fs.writeFileSync(path.join(out,'interaction.png'),(await win.webContents.capturePage(crop)).toPNG());
 } else if(idle){
  // Normal idle scheduler sampling; record actual clip slices rather than assume all frames are idle.
  await js("sprite.pet.fixedEnabled=true;sprite.switchTo('待机呼吸',false)");
  const start=Date.now();
  for(let i=0;i<600;i++){await win.webContents.capturePage(crop);if(i%60===0)result.scenes.push({seconds:(Date.now()-start)/1000,...await js('({anim:sprite.anim,pending:!!sprite.pending,mediaTime:(sprite.front===0?sprite.videoA:sprite.videoB).currentTime,frames:frames.length,memory:performance.memory?.usedJSHeapSize})')});await pause(Math.max(0,start+(i+1)*1000-Date.now()));}
  result.durationSec=(Date.now()-start)/1000;
 } else {
  for(const [idx,name] of names.entries()){
   const bg=idx%3===0?'#e6e6e6':idx%3===1?'#20232c':'repeating-linear-gradient(40deg,#7e8c96 0 25px,#c1ab8b 25px 50px)';
   await js(`document.body.style.background=${JSON.stringify(bg)};sprite.stopMove();sprite.switchTo(${JSON.stringify(name)},false)`);
   await waitFor(`sprite.anim===${JSON.stringify(name)} && !sprite.pending`);
   const meta=await js('({duration:(sprite.front===0?sprite.videoA:sprite.videoB).duration,bottomPad:sprite.bottomPad,rect:sprite.stage.getBoundingClientRect().toJSON()})');
   assert.ok(meta.duration>0);
   // Wallclock timestamps retain real playback speed if capture cannot reach 30fps.
   const proc=spawn(ffmpeg,['-v','error','-y','-use_wallclock_as_timestamps','1','-f','rawvideo','-pixel_format','bgra','-video_size','480x304','-framerate','30','-i','pipe:0','-an','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','6','-crf','32','-b:v','0','-fps_mode','vfr',path.join(out,`${idx}-${name}.webm`)],{windowsHide:true,stdio:['pipe','ignore','pipe']});
   let err='';proc.stderr.on('data',d=>err+=d);let capture=0;const start=Date.now();const times=[];
   while(Date.now()-start<meta.duration*1000){
    const im=(await win.webContents.capturePage(crop)).resize({width:480,height:304});
    if(capture===0)fs.writeFileSync(path.join(out,`${idx}-first.png`),im.toPNG());
    proc.stdin.write(im.toBitmap());times.push(Date.now()-start);capture++;
    await pause(Math.max(0,start+capture*1000/30-Date.now()));
   }
   proc.stdin.end();const exit=await new Promise(r=>proc.on('close',r));if(exit!==0)throw Error('ffmpeg:'+err);
   fs.writeFileSync(path.join(out,`${idx}-last.png`),(await win.webContents.capturePage(crop)).toPNG());
   result.scenes.push({name,...meta,background:bg,captures:capture,captureTimesMs:times,elapsedMs:Date.now()-start,video:`${idx}-${name}.webm`});
   fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(result,null,2));
  }
 }
 result.frameSamples=await js('frames');
 result.end=await js('({anim:sprite.anim,pending:!!sprite.pending,front:sprite.front,formsMode:sprite.forms?.mode,capabilities:sprite.characterCapabilities})');
 await js('monitoring=false;sprite.dispose()');
 result.finishedAt=new Date().toISOString();result.ok=result.errors.length===0;
 clearInterval(metricTimer);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({mode,idle,ok:result.ok,scenes:result.scenes.length,frames:result.frameSamples.length,out,errors:result.errors}));win.destroy();app.quit();
}).catch(e=>{result.errors.push(e.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(result,null,2));console.error(e.stack);app.exit(1)});
setTimeout(()=>app.exit(2),idle?650000:240000).unref();
