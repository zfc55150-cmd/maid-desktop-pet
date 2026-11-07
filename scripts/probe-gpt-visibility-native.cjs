'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/optimization-20261101/visual/controlled-visibility-01');
fs.mkdirSync(out,{recursive:true});if(fs.existsSync(path.join(out,'result.json')))throw Error('Evidence exists');app.setPath('userData',path.join(out,'profile'));
let fixture=fs.readFileSync(path.join(root,'work/optimization-20261101/visual/candidate-full/fixture.js'),'utf8');fixture=fixture.slice(0,fixture.indexOf('window.frames=[]'))+`
window.frames=[];window.heartbeats=[];window.inputs=[];window.phase='preparing';window.monitoring=true;
sprite._scheduleIdleRoll=()=>{};
for(const v of [sprite.videoA,sprite.videoB]){const tick=(now,m)=>{if(!monitoring)return;const q=v.getVideoPlaybackQuality();frames.push({at:now,mediaTime:m.mediaTime,presentedFrames:m.presentedFrames,video:v===sprite.videoA?0:1,front:sprite.front,anim:sprite.anim,phase,visibility:document.visibilityState,expectedDisplayTime:m.expectedDisplayTime,processingDuration:m.processingDuration,dropped:q.droppedVideoFrames,total:q.totalVideoFrames});v.requestVideoFrameCallback(tick)};v.requestVideoFrameCallback(tick);}
window.heartbeatTimer=setInterval(()=>{heartbeats.push({at:performance.now(),phase,visibility:document.visibilityState,anim:sprite.anim,pending:!!sprite.pending,video:(sprite.front===0?sprite.videoA:sprite.videoB).currentTime})},100);
for(const type of ['pointerdown','pointermove','pointerup','lostpointercapture','pointercancel'])document.addEventListener(type,e=>{const row={at:performance.now(),type,trusted:e.isTrusted,screenX:e.screenX,screenY:e.screenY,clientX:e.clientX,clientY:e.clientY,buttons:e.buttons,before:{...sprite.dragState}};inputs.push(row);queueMicrotask(()=>row.after={active:sprite.dragState.active,dragging:sprite.dragState.dragging,anim:sprite.anim,pending:sprite.pending?.anim,throwing:sprite.throwRef!==null})},true);
sprite.switchTo('待机呼吸',false);
`;
fs.writeFileSync(path.join(out,'fixture.js'),fixture);
let html=fs.readFileSync(path.join(root,'work/optimization-20261101/visual/candidate-full/index.html'),'utf8');html=html.replace('<meta charset="utf-8">','<meta charset="utf-8"><title>GPT QA Controlled Visibility Native Input 01</title>');fs.writeFileSync(path.join(out,'index.html'),html);
const pause=ms=>new Promise(r=>setTimeout(r,ms));let win;
const result={startedAt:new Date().toISOString(),productionModified:false,apiCalls:0,encoding:false,phases:[],errors:[],method:'same sprite idle, scheduler disabled in isolated fixture; hidden-visible-hidden 25s each; no capture during phases; backgroundThrottling false; renderer 100ms heartbeat plus actual rVFC'};
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,title:'GPT QA Controlled Visibility Native Input 01',width:1000,height:800,x:80,y:80,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.webContents.setAudioMuted(true);
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=3&&!message.includes('Content-Security-Policy'))result.errors.push(message)});
 await win.loadFile(path.join(out,'index.html'));const js=s=>win.webContents.executeJavaScript(s);
 for(let i=0;i<150;i++){await win.webContents.capturePage();if(await js('sprite.pending===null && Math.max(sprite.videoA.readyState,sprite.videoB.readyState)>=2'))break;await pause(40)}
 result.environment={electron:process.versions.electron,chrome:process.versions.chrome,devicePixelRatio:await js('devicePixelRatio'),bounds:win.getBounds(),codeHashes:['sprite.js','preload.js','shared-core.js','events.js'].map(n=>({name:n,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app/electron-helper',n))).digest('hex')}))};
 for(const name of ['hidden-1','visible','hidden-2']){
  if(name==='visible')win.showInactive();else win.hide();await js(`phase=${JSON.stringify(name)}`);const start=Date.now();result.phases.push({name,start:new Date().toISOString(),rendererStart:await js('performance.now()'),visible:win.isVisible()});
  fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({phase:name,elapsedTotal:(Date.now()-new Date(result.startedAt).getTime())/1000}));
  for(let t=0;t<25;t++){await pause(1000);if(t%5===0)result.phases.at(-1).metrics=app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu,memory:p.memory}));}
  result.phases.at(-1).elapsedMs=Date.now()-start;result.phases.at(-1).rendererEnd=await js('performance.now()');
 }
 result.frames=await js('frames');result.heartbeats=await js('heartbeats');
 fs.writeFileSync(path.join(out,'timing-result.json'),JSON.stringify(result));
 // Timing experiment ends here. The visible fixture remains available for OS-native input.
 win.showInactive();await js("phase='native-input';sprite.stopThrow();sprite.stopDragFollow();sprite.switchTo('待机呼吸',false)");
 fs.writeFileSync(path.join(out,'native-ready.json'),JSON.stringify({ready:true,bounds:win.getBounds(),hit:await js('sprite.hit.getBoundingClientRect().toJSON()')}));
 for(let i=0;i<120;i++){if(fs.existsSync(path.join(out,'finish-native')))break;await pause(500);}
 result.inputTrace=await js('inputs');result.nativeEnd=await js('({dragState:sprite.dragState,anim:sprite.anim,pending:sprite.pending?.anim,pos:sprite.pos,throwing:sprite.throwRef!==null})');
 fs.writeFileSync(path.join(out,'native-final.png'),(await win.webContents.capturePage()).toPNG());await js('monitoring=false;clearInterval(heartbeatTimer);sprite.dispose()');result.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result));console.log(JSON.stringify({out,frames:result.frames.length,inputs:result.inputTrace.length,errors:result.errors}));win.destroy();app.quit();
}).catch(e=>{result.errors.push(e.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(result));console.error(e.stack);app.exit(1)});
setTimeout(()=>app.exit(2),180000).unref();
