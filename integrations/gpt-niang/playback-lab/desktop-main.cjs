'use strict';
const {app,BrowserWindow,ipcMain,session,screen,Menu,Tray,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{spawn}=require('node:child_process');
const {acquire,read}=require('./video-visibility.cjs'),{Motion,hit}=require('./desktop-motion.cjs');
const {launch:restoreOfficial}=require('./restore-widget.cjs');
const {canvasPixels,moveOnly,sizeMatches,motionBounds}=require('./desktop-geometry.cjs');
const {InputDriver}=require('./desktop-input.cjs');
const {PerformanceDirector}=require('./performance-director.cjs');
const {IdleScheduler}=require('./idle-scheduler.cjs');
const catalog=require('./performance-catalog.js');
const {sourcePoint,PresentationHit}=require('./desktop-geometry.cjs');
const {snapshotWriter}=require('./snapshot-writer.cjs');
const materialsSmoke=process.argv.includes('--materials-smoke');
const architectureSmoke=process.argv.includes('--architecture-smoke')||materialsSmoke;
const soakSmoke=process.argv.includes('--soak-smoke');
const crashSmoke=process.argv.includes('--crash-smoke');
const root=path.resolve(process.argv[2]||''),arg=process.argv.find(x=>x.startsWith('--managed=')),managed=arg?path.resolve(arg.slice(10)):null,smoke=process.argv.includes('--smoke')||process.argv.includes('--physics-smoke')||architectureSmoke||soakSmoke||crashSmoke;
const physicsSmoke=process.argv.includes('--physics-smoke');
const manualExit=process.argv.includes('--manual-exit');
const previewTimeoutMs=managed&&!manualExit?300000:null;
if(managed&&!managed.startsWith(root+path.sep))throw new Error('MANAGED_SCOPE');
if(fs.existsSync(path.join(root,'candidate-manifest.json')))require('./candidate-package.cjs').verify(root);
app.setPath('userData',path.join(root,'desktop-profile'));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-background-networking');
// Candidate-process-only coordinates. Same Windows geometry principle as the
// installed DeepSeek: prevent per-monitor DIP conversion from feeding back.
if(process.platform==='win32')app.commandLine.appendSwitch('force-device-scale-factor','1');
let lease,win,tray,timer,motion,input,director,frame=null,restored=false,ignoreState=null,closing=false,quitReady=false,lastRequested=null,windowReady=false,lastFlightStamp=null,lastFlightArrival=0,flightStarted=0;
function setIgnore(ignore){if(ignoreState===ignore)return;win.setIgnoreMouseEvents(ignore,{forward:true});ignoreState=ignore;}
const metrics={at:new Date().toISOString(),mode:'transparent-desktop-candidate',moves:0,hitPolls:0,frameUpdates:0,actions:[],errors:[],resource:[],screenPresentationVerified:false,artworkAccepted:false};
metrics.trial={revision:catalog.revision,root:path.basename(root),manualExit,previewTimeoutMs,releaseRule:'cancel immediately, animated neutral recovery; same-gesture airborne evidence gates landing',sources:Object.fromEntries(['desktop-main.cjs','desktop-renderer.js','performance-catalog.js','performance-director.cjs','video-player.js','desktop-motion.cjs','desktop-input.cjs','frame-guard.js','flight-clock.js','desktop-geometry.cjs','desktop-preload.cjs','desktop.html'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex')]))};
const writer=snapshotWriter(path.join(root,'desktop-session.json'));
const save=()=>{if(motion){metrics.motionEvents=motion.events;metrics.motion={phase:motion.phase,serial:motion.serial};metrics.performance={phase:director.phase,requestId:director.requestId,airborneAtRelease:director.airborneAtRelease,events:director.events};}return writer.write(metrics).catch(()=>{if(!metrics.errors.includes('METRICS_WRITE'))metrics.errors.push('METRICS_WRITE');});};
function destroyTray(){if(tray&&!tray.isDestroyed())tray.destroy();tray=null;}
function restore(){if(!managed||restored||!lease)return;restored=true;const state=read(path.join(managed,'controller.json'));if(!state.needsRestore)return;try{if(state.controllerPid){process.kill(state.controllerPid,0);return;}}catch{}restoreOfficial(lease.baseline);}
function close(){if(closing)return;closing=true;clearInterval(timer);destroyTray();if(win&&!win.isDestroyed())win.destroy();lease?.release();save().finally(()=>{restore();quitReady=true;app.quit();});}
app.whenReady().then(async()=>{
 lease=acquire(root,{synthetic:smoke});
 if(managed){fs.writeFileSync(path.join(managed,'candidate-ready.json'),JSON.stringify({pid:process.pid,at:Date.now()}));const deadline=Date.now()+15000;while(!lease.owned&&Date.now()<deadline){await new Promise(r=>setTimeout(r,20));lease.tryAgain();}}
 if(!lease.owned){app.quit();return;}
 metrics.gpuFeatures=app.getGPUFeatureStatus();metrics.gpuUsageMeasured=false;
 const scenes=read(path.join(root,'scenes.json')),spec=read(path.join(root,'hit-masks.json')),masks={};
 const presentationHit=new PresentationHit();
 for(const [name,c]of Object.entries(scenes.clips)){c.url=pathToFileURL(path.join(root,c.file)).href;const s=spec.entries[name],buffer=fs.readFileSync(path.join(root,s.file));if(crypto.createHash('sha256').update(buffer).digest('hex')!==s.sha256||buffer.length!==c.frames*384*384/8)throw new Error('HIT_MASK_HASH');masks[name]=buffer;}
 session.defaultSession.webRequest.onBeforeRequest((d,reply)=>reply({cancel:!d.url.startsWith('file:')}));session.defaultSession.setPermissionRequestHandler((_w,_p,reply)=>reply(false));
 const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),width=canvasPixels(300);
 let displayCache=screen.getAllDisplays();const refreshDisplays=()=>{displayCache=screen.getAllDisplays();};for(const name of ['display-added','display-removed','display-metrics-changed'])screen.on(name,refreshDisplays);
 metrics.geometry={coordinateMode:'candidate physical pixels / forced DSF 1',expectedCanvas:width,observations:[]};
 win=new BrowserWindow({title:'GPT娘 '+catalog.revision+' 独立试用',x:display.workArea.x+display.workArea.width-width-100,y:display.workArea.y+display.workArea.height-width-50,width,height:width,useContentSize:true,show:false,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,skipTaskbar:true,focusable:true,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'desktop-preload.cjs')}});
 win.setMinimumSize(width,width);win.setMaximumSize(width,width);
 if(smoke)win.webContents.setFrameRate(60);
 const recordSize=()=>{const size=win.getSize();if(metrics.geometry.observations.length<512)metrics.geometry.observations.push({at:Date.now(),size,contentSize:win.getContentSize(),zoom:win.webContents.getZoomFactor()});return sizeMatches(size,width);};
 win.on('resize',()=>{if(!recordSize()){metrics.errors.push('SIZE_GUARD_TRIGGERED');close();}});
 setIgnore(true);if(!smoke)win.setAlwaysOnTop(true,'screen-saver');win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 const send=command=>{if(metrics.actions.length<2048)metrics.actions.push({...command,action:command.name,at:Date.now()});win.webContents.send('desktop-action',command);};
 director=new PerformanceDirector(send);
 const idleScheduler=new IdleScheduler({director,clips:scenes.clips,enabled:!smoke});
 metrics.automatic={scope:'candidate local idle, no product task observer',enabled:idleScheduler.enabled,events:[]};
 motion=new Motion(event=>{
  director.motion(event);
  const flying=event.type==='release'&&event.thrown;
  if(flying){lastFlightStamp=null;flightStarted=lastFlightArrival=Date.now();}
  if(flying||['grab','release','cancel','rested'].includes(event.type))win.webContents.send('desktop-transport',{phase:flying?'flight':'stopped',serial:motion.serial});
 });let menuOpen=false,lastResource=0,lastWatch=0;
 const popup=()=>{input.cancel();menuOpen=true;setIgnore(false);Menu.buildFromTemplate([{label:catalog.revision+(manualExit?' · 手动退出':''),enabled:false},{label:'独立试用：任务、额度与半身尚未接回',enabled:false},{label:'待机',click:()=>director.manual('idle')},...catalog.selectable.map(item=>({label:item.label,click:()=>director.manual(item.name)})),{label:'随机表演（试用）',type:'checkbox',checked:idleScheduler.enabled,click:item=>{idleScheduler.setEnabled(item.checked);metrics.automatic.enabled=item.checked;}},{type:'separator'},{label:'退出预览并恢复正式GPT娘',click:close}]).popup({window:win,callback:()=>{menuOpen=false;idleScheduler.reset();}});};
 if(!smoke){tray=new Tray(nativeImage.createFromPath(path.join(lease.baseline.gptRoot,'assets/gpt-dragon-niang-bust.png')).resize({width:24,height:24}));tray.setToolTip('GPT娘透明预览：退出后恢复正式挂件');tray.on('right-click',popup);tray.on('click',popup);}
 const valid=event=>event.sender===win.webContents;
 ipcMain.handle('desktop-config',event=>{if(!valid(event))throw new Error('CALLER');return scenes;});
 ipcMain.on('desktop-ready',event=>{if(valid(event)&&!director.current)director.start();});
 ipcMain.on('desktop-media',(event,data)=>{if(!valid(event)||!director.matches(data))return;if(data.type==='error'){metrics.errors.push(data.code||'MEDIA_ERROR');director.mediaError(data);}else if(data.type==='ended'){if(!metrics.mediaEnds)metrics.mediaEnds=[];if(metrics.mediaEnds.length<512)metrics.mediaEnds.push(data);}save();});
 ipcMain.on('desktop-frame',(event,data)=>{if(!valid(event)||!masks[data.clip]||!Number.isInteger(data.frame)||data.frame<0||data.frame>=scenes.clips[data.clip].frames)return;
  if(!director.matches(data))return;
  const requested=metrics.actions.findLast(a=>a.requestId===data.requestId);
  if(requested){if(requested.firstDecodedAt===undefined)requested.firstDecodedAt=Date.now();if(data.visible&&requested.firstOpaqueAt===undefined)requested.firstOpaqueAt=Date.now();}
  presentationHit.update(data);frame={clip:data.clip,index:data.frame};metrics.frameUpdates++;director.present(data);
  showWhenReady();
  if(architectureSmoke&&metrics.frameUpdates>=3&&!metrics.architectureProbeStarted){metrics.architectureProbeStarted=true;require('./architecture-smoke.cjs').run({win,motion,input,director,metrics,frame:()=>frame,masks,close,root,idleScheduler:materialsSmoke?idleScheduler:null}).catch(()=>{metrics.errors.push('ARCHITECTURE_HARNESS_FAILED');close();});}
  if(soakSmoke&&metrics.frameUpdates>=3&&!metrics.soakStarted){metrics.soakStarted=true;require('./soak-smoke.cjs').run({win,director,metrics,close,root}).catch(()=>{metrics.errors.push('SOAK_HARNESS_FAILED');close();});}
  if(crashSmoke&&metrics.frameUpdates>=3&&!metrics.crashStarted){metrics.crashStarted=true;setTimeout(()=>win.webContents.forcefullyCrashRenderer(),0);}
  if(physicsSmoke&&metrics.frameUpdates>=3&&!metrics.physicsProbeStarted){metrics.physicsProbeStarted=true;setTimeout(()=>{const now=Date.now(),a=display.workArea;motion.begin({x:100,y:100},{x:a.x+100,y:a.y+100},now-70);motion.move({x:200,y:80},now-30);motion.end({x:250,y:80},now);},0);}
 });
 ipcMain.on('desktop-status',(event,data)=>{if(!valid(event))return;if(!data.ok)metrics.errors.push(data.error);if(data.ui)metrics.ui=data.ui;if(data.mediaStats)metrics.mediaStats=data.mediaStats;if(data.releaseMode){if(!metrics.releases)metrics.releases=[];if(metrics.releases.length<512)metrics.releases.push({at:Date.now(),mode:data.releaseMode,frame:data.releaseFrame,clip:data.clip});}if(data.ignoredAction){if(!metrics.ignoredActions)metrics.ignoredActions=[];if(metrics.ignoredActions.length<512)metrics.ignoredActions.push({at:Date.now(),action:data.ignoredAction,reason:data.reason});}save();if(smoke&&!physicsSmoke&&!architectureSmoke&&!soakSmoke&&!crashSmoke&&data.ok){metrics.smokeOk=true;setTimeout(close,500);}});
 function overBody(pointer){if(!frame)return false;const {x,y}=sourcePoint(pointer,win.getBounds());return presentationHit.test(f=>hit(masks[f.clip],f.index,x,y));}
 const writePosition=p=>{const rounded={x:Math.round(p.x),y:Math.round(p.y)},key=rounded.x+','+rounded.y;if(key===lastRequested)return;moveOnly(win,rounded);lastRequested=key;metrics.moves++;};
 metrics.input={mode:'pointer event -> position; watchdog only for missing capture',samples:[],watchdogMoves:0,watchdogReleases:0};
 input=new InputDriver({motion,bounds:()=>win.getBounds(),hit:overBody,write:writePosition,raise:()=>{win.moveTop();setIgnore(false);},observe:sample=>{
  if(sample.kind==='watchdog-move')metrics.input.watchdogMoves++;else if(sample.kind==='watchdog-release')metrics.input.watchdogReleases++;
  else if(metrics.input.samples.length<2048)metrics.input.samples.push({...sample,positionCallCompletedAt:Date.now()});
 }});
 ipcMain.on('desktop-input',(event,data)=>{if(!valid(event)||closing)return;if(data?.kind==='menu')popup();else if(data?.kind==='recovery-timeout'){input.recoverTimeout(data.gesture);}else {if(data?.kind==='end'&&data.gesture===input.active)director.present(data.presentation);const accepted=input.handle(data);if(data?.kind==='begin'&&!accepted)input.cancel(data.gesture);}});
 metrics.physics={clock:'renderer requestAnimationFrame, one step in flight',frames:[]};
 ipcMain.handle('desktop-physics-step',(event,data)=>{
  if(!valid(event)||closing||motion.phase!=='flight'||data?.serial!==motion.serial||!Number.isFinite(data.at))return {active:false};
  if(lastFlightStamp!==null&&data.at<=lastFlightStamp)return {active:true};
  const now=Date.now(),dt=lastFlightStamp===null?(now-flightStarted)/1000:(data.at-lastFlightStamp)/1000,gap=now-lastFlightArrival;lastFlightStamp=data.at;lastFlightArrival=now;
  const bounds=motionBounds(motion.flight,displayCache,width),started=performance.now(),next=motion.tick(dt,bounds);if(next)writePosition(next);
  if(metrics.physics.frames.length<4096)metrics.physics.frames.push({serial:data.serial,at:now,rendererIntervalMs:dt*1000,arrivalGapMs:gap,positionCallMs:performance.now()-started});
  if(physicsSmoke&&motion.phase==='idle'&&!metrics.physicsProbeFinished){metrics.physicsProbeFinished=true;metrics.smokeOk=!metrics.actions.some(x=>x.action==='landing')&&metrics.physics.frames.length>10;setTimeout(close,300);}
  return {active:motion.phase==='flight'&&motion.serial===data.serial};
 });
 timer=setInterval(()=>{
  if(!win||win.isDestroyed())return;const now=Date.now();
  if(!smoke||materialsSmoke&&metrics.autoProbeReady){const automatic=idleScheduler.tick({blocked:menuOpen||motion.phase!=='idle'||metrics.frameUpdates<3});if(automatic&&metrics.automatic.events.length<512)metrics.automatic.events.push({name:automatic,at:now});}
  if(motion.phase==='flight'&&now-lastFlightArrival>1200){metrics.errors.push('FLIGHT_CLOCK_STALLED');input.cancel();}
  if(now-lastWatch>=50){lastWatch=now;const p=screen.getCursorScreenPoint();if(motion.phase==='drag'&&!architectureSmoke)input.recover(p,lease.leftDown(),now);metrics.hitPolls++;setIgnore(!(motion.phase==='drag'||menuOpen||overBody(p)));}
  if(now-lastResource>2000){lastResource=now;if(!recordSize()){metrics.errors.push('SIZE_GUARD_TRIGGERED');close();return;}if(metrics.resource.length===512)metrics.resource.shift();metrics.resource.push({at:now,memory:process.memoryUsage(),processes:app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,cpu:p.cpu,memory:p.memory})),screenPresentationVerified:false});save();}
 },50);
 function showWhenReady(){if(smoke||closing||!windowReady||metrics.frameUpdates<3||win.isVisible())return;win.showInactive();win.setAlwaysOnTop(true,'screen-saver');win.moveTop();if(managed)fs.writeFileSync(path.join(managed,'candidate-visible.json'),JSON.stringify({pid:process.pid,visible:win.isVisible(),at:Date.now(),leaseOwned:lease.owned,keySha256:lease.keySha256}));}
 win.once('ready-to-show',()=>{windowReady=true;showWhenReady();});
 win.webContents.on('render-process-gone',()=>{if(closing)return;metrics.errors.push('RENDER_PROCESS_GONE');if(crashSmoke){metrics.crashHandled=true;metrics.smokeOk=true;}close();});
 win.on('closed',close);
 win.loadFile(path.join(__dirname,'desktop.html'));if(previewTimeoutMs!==null)setTimeout(close,previewTimeoutMs).unref();if(smoke)setTimeout(()=>{metrics.errors.push('SMOKE_TIMEOUT');close();},soakSmoke?330000:materialsSmoke?120000:architectureSmoke?80000:15000).unref();
}).catch(error=>{metrics.errors.push(error.message);close();});
app.on('before-quit',event=>{if(!quitReady){event.preventDefault();close();}});
