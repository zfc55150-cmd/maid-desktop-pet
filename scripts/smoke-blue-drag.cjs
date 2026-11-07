'use strict';
// Hidden, isolated Electron window. No native mouse injection or production IPC.
const {app,BrowserWindow,ipcMain,screen}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),helper=path.join(root,'app/electron-helper'),out=process.env.DSH_PET_DRAG_SMOKE_OUTPUT?path.resolve(process.env.DSH_PET_DRAG_SMOKE_OUTPUT):path.join(root,'work/deepseek-drag-20261101-01/electron');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));app.commandLine.appendSwitch('force-device-scale-factor','1');
const url=p=>pathToFileURL(p).href,pause=ms=>new Promise(r=>setTimeout(r,ms));
fs.writeFileSync(path.join(out,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('petBridge',{setBounds(...a){ipcRenderer.send('test:bounds',a)},setInputRegions(){},setInteractive(){},setInputBusy(){},chatState:async()=>({ok:true,data:{messages:[],voiceEnabled:false}}),onChatEvent:()=>()=>{}});`);
const css=fs.readFileSync(path.join(helper,'index.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const video=path.join(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'),'Programs/DeepSeekActionPet/node_modules/dsh-pet/assets/webm');
let win;const spriteSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(helper,'sprite.js'))).digest('hex');const result={ok:false,spriteSha256,productionModified:false,apiCalls:0,nativeMouseInjected:false,method:'real Chromium sprite, real local videos, zoom1.5, real main-process setContentBounds; controlled pointer samples',checks:[],errors:[]};
app.whenReady().then(async()=>{
 const area=screen.getPrimaryDisplay().workArea;
 const fixture=`localStorage.clear();window.__dshPetDebug={};const S=window.PetShared,CONFIG={scale:1.5,topInsetRatio:0},BASE='',VIEW={x:0,y:0,w:${area.width/1.5},h:${area.height/1.5}},PRIMARY_AREA={x:0,y:0,width:VIEW.w,height:VIEW.h},WORK_AREAS=[PRIMARY_AREA],AREAS=[PRIMARY_AREA],PANELS=[PRIMARY_AREA],WINDOW_MARGIN_RATIO=.5,BUBBLE_DURATION_MS=10000,rootEl=document.getElementById('root'),cfg={},config={};const toScreen=v=>v*1.5,toLocal=v=>v/1.5;
window.sprite=new PetSprite({id:'main',assetRoot:'main',name:'隔离拖动验证',size:480,position:{corner:'bottom-right',marginX:100,marginY:100},fixedEnabled:true,animationWeights:{idle:100,turn:0,move:0},animations:{idle:['待机呼吸休闲'],drag:['被鼠标拖拽悬空反馈'],clicks:[],turn:[],moves:{actions:[]},categories:[]}});sprite.assetBase=${JSON.stringify(url(video)+'/')};sprite._scheduleIdleRoll=()=>{};window.videoLoads=0;for(const v of [sprite.videoA,sprite.videoB]){const load=v.load.bind(v);v.load=()=>{videoLoads++;load();};}sprite.switchTo('待机呼吸休闲',false);window.squashes=0;const originalSquash=sprite.startSquash.bind(sprite);sprite.startSquash=(...args)=>{squashes++;return originalSquash(...args)};`;
 fs.writeFileSync(path.join(out,'fixture.js'),fixture);
 fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div>${['shared-core.js','pet-form.js','pet-inline-chat.js','sprite.js','events.js'].map(n=>`<script src="${url(path.join(helper,n))}"></script>`).join('')}<script src="fixture.js"></script>`);
 win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.join(out,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.webContents.setAudioMuted(true);
 ipcMain.on('test:bounds',(event,a)=>{if(event.sender.id!==win.webContents.id)return;win.setContentBounds({x:Math.round(a[0]),y:Math.round(a[1]),width:Math.round(a[2]),height:Math.round(a[3])},false)});
 win.webContents.on('console-message',(_e,l,m)=>{if(l>=3&&!m.includes('Content-Security-Policy'))result.errors.push(m)});
 await win.loadFile(path.join(out,'index.html'));win.webContents.setZoomFactor(1.5);
 const js=s=>win.webContents.executeJavaScript(s);
 async function until(expr,max=12000){const start=Date.now();while(Date.now()-start<max){await win.webContents.capturePage({x:0,y:0,width:1,height:1});if(await js(expr))return;await pause(16);}throw Error('Timeout: '+expr);}
 async function form(mode){await js(`window.formDone=false;void sprite.forms.set('${mode}').then(()=>window.formDone=true)`);await until(`formDone && sprite.forms.mode==='${mode}'`);}
 await until('!sprite.pending && Math.max(sprite.videoA.readyState,sprite.videoB.readyState)>=2');await js('sprite.forms.ready');
 await form('bust');await pause(50);
 const before=await js('({pos:{...sprite.pos},loads:videoLoads})'),bounds=win.getContentBounds();
 await js("sprite.onPointerDown({button:0,pointerId:1,screenX:600,screenY:600});sprite.onPointerMove({screenX:690,screenY:645})");await pause(60);
 const after=await js('({pos:{...sprite.pos},loads:videoLoads,dragging:sprite.dragState.dragging})'),moved=win.getContentBounds();
 assert.equal(after.pos.x-before.pos.x,60);assert.equal(after.pos.y-before.pos.y,30);assert.equal(moved.x-bounds.x,90);assert.equal(moved.y-bounds.y,45);assert.equal(after.loads,before.loads);assert.equal(after.dragging,true);result.checks.push('half-body follows90x45 physical input with90x45 native-window displacement; no video reload');
 await js("sprite.onPointerUp({type:'pointerup',screenX:690,screenY:645});sprite.stopThrow()");await form('full');
 await js("sprite.onPointerDown({button:0,pointerId:1,screenX:600,screenY:600});sprite.onPointerMove({screenX:690,screenY:645});sprite.onPointerUp({type:'pointerup',screenX:705,screenY:660});sprite.stopThrow()");
 await until("!sprite.pending && sprite.anim==='待机呼吸休闲'");await pause(300);assert.equal(await js("sprite.anim==='待机呼吸休闲' && !sprite.dragState.active && !sprite.dragState.dragging"),true);result.checks.push('release returns to idle despite queued real drag-video load');
 for(const mode of ['bust','full']){
  await form(mode);
  await js('sprite.stopThrow();sprite.sendBounds(200,150);sprite.onPointerDown({button:0,pointerId:1,screenX:600,screenY:600});sprite.onPointerMove({screenX:645,screenY:630})');
  await pause(220);await js('sprite.onPointerUp({type:"pointerup",screenX:645,screenY:630})');
  const placed=await js('({x:sprite.pos.x,y:sprite.pos.y,throwing:sprite.throwRef!==null})'),native=win.getContentBounds();
  assert.deepEqual(placed,{x:230,y:170,throwing:false});await pause(220);
  assert.deepEqual(await js('({x:sprite.pos.x,y:sprite.pos.y,throwing:sprite.throwRef!==null})'),placed);
  assert.deepEqual(win.getContentBounds(),native);result.checks.push(`${mode}: slow release preserves renderer and real window position without gravity`);
 }
 // Hold a genuine decoded video-frame callback, then release it after a grab.
 await form('full');
 await js("window.heldFrames=[];window.heldVideo=sprite.front===0?sprite.videoB:sprite.videoA;window.originalRVFC=heldVideo.requestVideoFrameCallback;heldVideo.requestVideoFrameCallback=function(fn){return originalRVFC.call(this,(t,m)=>heldFrames.push(()=>fn(t,m)))};sprite.switchTo('被吓一跳',true)");
 await until('heldFrames.length>0');await js('heldVideo.requestVideoFrameCallback=originalRVFC;sprite.onPointerDown({button:0,pointerId:1,screenX:600,screenY:600});heldFrames.splice(0).forEach(fn=>fn())');
 assert.notEqual(await js('sprite.anim'),'被吓一跳');assert.equal(await js('sprite.pending'),null);await js('sprite.onPointerUp({type:"pointercancel",pointerId:1})');result.checks.push('a real decoded but delayed old frame cannot commit after a new grab');
 await js('window.cachedVideo=sprite.front===0?sprite.videoB:sprite.videoA;cachedVideo.pause();cachedVideo.currentTime=2');await until('!cachedVideo.seeking && cachedVideo.readyState>=2 && cachedVideo.currentTime>1.9');
 await js("sprite.switchTo('被吓一跳',true)");await until("!sprite.pending && sprite.anim==='被吓一跳'");assert.ok(await js('(sprite.front===0?sprite.videoA:sprite.videoB).currentTime<0.75'));result.checks.push('a genuinely cached interrupted video restarts near frame zero');
 await js("sprite.pet.workStatusEnabled=true;sprite.animations.events={workStatus:Array(6).fill('待机呼吸休闲'),whisper:['待机呼吸休闲']}");
 for(const mode of ['full','bust']){
  await form(mode);
  await js('sprite.workState=null;sprite.sendBounds(200,150)');
  for(let n=0;n<10;n++){
   await js(`sprite.onPointerDown({button:0,pointerId:1,screenX:600,screenY:600});sprite.onPointerMove({pointerId:1,screenX:645,screenY:630});sprite.onWorkTick({state:'working',task:'synthetic task'},${n+1+(mode==='full'?0:10)});sprite.showWhisper('synthetic notice')`);
   await pause(30);
   assert.equal(await js("!sprite.pending || sprite.pending.anim==='被鼠标拖拽悬空反馈'"),true);
   if(mode==='full')await until("sprite.anim==='被鼠标拖拽悬空反馈'");
   await js('sprite.onPointerUp({type:"pointerup",pointerId:2,screenX:0,screenY:0})');assert.equal(await js('sprite.dragState.active'),true);
   await js('sprite.onPointerUp({type:"pointercancel",pointerId:1,screenX:0,screenY:0})');
   assert.deepEqual(await js('({x:sprite.pos.x,y:sprite.pos.y,flight:sprite.throwRef!==null})'),{x:230,y:170,flight:false});
   await js('sprite.workState=null;sprite.whisperOn=false;sprite.sendBounds(200,150)');
  }
  result.checks.push(`${mode}: 10 held drags resist work/whisper and foreign-pointer release; cancel never throws`);
 }
 await form('full');await js('sprite.workState=null;sprite.playIdle()');await until('!sprite.pending');
 await js('squashes=0;{const b=sprite.throwSpaceOf().bounds[0];sprite.startThrow(200,b.maxY,200,0)}');await until('sprite.throwRef===null');assert.equal(await js('squashes'),0);result.checks.push('real animation-frame ground coasting settles without repeated squash');
 await js('squashes=0;{const b=sprite.throwSpaceOf().bounds[0];sprite.startThrow(200,b.maxY-120,80,100)}');await until('sprite.throwRef===null',15000);const landing=await js('({squashes,pos:sprite.pos,floor:sprite.throwSpaceOf().bounds[0].maxY,dragging:sprite.dragState.active})');assert.equal(landing.pos.y,Math.round(landing.floor));assert.ok(landing.squashes>0&&landing.squashes<20);assert.equal(landing.dragging,false);result.landing=landing;result.checks.push('airborne flight bounces and settles with grab state released');
 const formsPosition=await js('JSON.stringify(sprite.pos)'),formsBounds=win.getContentBounds();
 for(let n=0;n<20;n++){const mode=n%2?'full':'bust';await form(mode);assert.equal(await js('JSON.stringify(sprite.pos)'),formsPosition);assert.deepEqual(win.getContentBounds(),formsBounds);assert.equal(await js('[sprite.videoA,sprite.videoB].every(v=>!v.style.transform.includes("scaleY"))'),true);}
 result.checks.push('20 awaited form switches preserve identity and native window position');
 await js("sprite.animations.events={};sprite.pet.fixedEnabled=false;sprite.weights={idle:0,turn:0,move:100};sprite.animations.moves={actions:[{name:'待机呼吸休闲'}],default:{minDist:20,maxDist:60,margin:0,leadSec:0,tailSec:0}};sprite.switchTo('被吓一跳',true)");await until('!sprite.pending');
 await js('sprite.justDragged=true;sprite.onContextMenu({clientX:400,clientY:400,preventDefault(){}})');assert.equal(await js('sprite.menuOpen'),true);
 const menuPosition=await js('JSON.stringify(sprite.pos)'),menuBounds=win.getContentBounds();
 const menuStart=Date.now();let menuSamples=0;
 while(Date.now()-menuStart<30000){await pause(1000);await win.webContents.capturePage({x:0,y:0,width:1,height:1});assert.equal(await js('sprite.menuOpen && sprite.moveRef===null'),true);assert.equal(await js('JSON.stringify(sprite.pos)'),menuPosition);assert.deepEqual(win.getContentBounds(),menuBounds);menuSamples++;}
 result.menu={durationMs:Date.now()-menuStart,samples:menuSamples};await js('sprite.closeMenu()');result.checks.push('fresh right-click after a drag opens; menu remains stationary 30s even when a real one-shot ends with 100% roaming weight');
 await js('sprite.dispose()');assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(helper,'sprite.js'))).digest('hex'),spriteSha256,'Source changed during verification');result.ok=result.errors.length===0;result.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));win.destroy();app.quit();
}).catch(e=>{result.errors.push(e.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(result,null,2));console.error(e.stack);app.exit(1)});
setInterval(()=>fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(result,null,2)),5000).unref();
setTimeout(()=>{result.errors.push('Smoke timed out');fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(result,null,2));app.exit(2);},90000).unref();
