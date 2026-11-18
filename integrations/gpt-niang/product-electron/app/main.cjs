'use strict';
const {app,BrowserWindow,ipcMain,session,screen,Tray,nativeImage,dialog,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {ClickSequence}=require('./click-sequence.cjs'),clickSequence=new ClickSequence();
const {visibleFootprint}=require('./collision-body.cjs');
const {speechPlacement,hoverAllowed}=require('./bubble-geometry.cjs');
const {buildMenuTree}=require('./vendor/shared-core.js');
const {PointerGate}=require('./pointer-gate.cjs'),pointerGate=new PointerGate();
const {DragHit}=require('./drag-hit.cjs'),{characterPixels,placeAtFeet,panelLayout,bubbleLayout,sizeLayout,uiZoom}=require('./presentation-layout.cjs');
const {TouchResponses}=require('./touch.cjs'),appearanceRules=require('./appearance.cjs'),i18n=require('./i18n.js');
const {ProductHost,readJson}=require('./product-host.cjs'),{sha}=require('./file-integrity.cjs'),{PerformanceDirector}=require('./performance-director.cjs'),{ProductScheduler}=require('./schedulers.cjs'),{HitCache,FrameAdmission}=require('./hit-cache.cjs'),{Motion,hit}=require('./desktop-motion.cjs'),{InputDriver}=require('./desktop-input.cjs'),{sourcePoint,PresentationHit,canvasPixels,moveOnly,sizeMatches,motionBounds}=require('./desktop-geometry.cjs'),catalog=require('./performance-catalog.js'),{snapshotWriter}=require('./snapshot-writer.cjs');
const runtimeHelpers=require('./runtime-helpers.cjs'),{root,cfg}=runtimeHelpers.loadProductConfig(process.argv,__dirname,readJson),testOnly=process.argv.includes('--test-only'),smoke=process.argv.includes('--smoke');
const {FlightPacing}=require('./flight-pacing.cjs');
const {windowCoordinate}=require('./desktop-geometry.cjs');
if(!cfg)throw Error('PRODUCT_PACKAGE_REQUIRED');
if(cfg.stage&&!testOnly&&!process.argv.includes('--live-validation'))throw Error('STAGE_REQUIRES_TEST_MODE');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-device-scale-factor','1');app.commandLine.appendSwitch('disable-background-networking');app.setPath('userData',testOnly?path.join(root,'test-profile'):path.join(cfg.dataDir,'electron/profile'));
let lastIgnoreApply=0,speechCssHeight=null,speechLayout=null,lastUiDpi=96,panelReady=false,hitScale=1,previousHitScale=1,hitScaleAt=0;
function desktopDpi(){const value=native?.hostFrame?.().dpi||(win&&!win.isDestroyed()?Math.round(screen.getDisplayMatching(win.getBounds()).scaleFactor*96):0);if(value)lastUiDpi=value;return lastUiDpi;}
let hoverPoint=null,speechCssWidth=null;
let win,panel,sizeWindow,menuPopup,speechWindow,tray,native,product,director,scheduler,motion,input,cache,frameAdmission,hitState,dragHit,scenes,animation,timer,speech=null,speechTimer=null,closing=false,quitReady=false,owned=false,ignore=null,expected=344,menuOpen=false,staticMask=null,standingBody=null,display=null,lastRequested=null,lastStateKey=null,rendererReady=false,frames=0,lastFollow=0,lastProduct=0,lastPresence=0,lastDisplayRequest=null,lastAutoQuote=0,presenceWriter=null,touch=null,appearance={scope:'none',palette:appearanceRules.palette('')},appearanceKey='';
let captureActive=false,lastCaptureSeen=-Infinity,resizeCheckPending=false,cachedCharacters=null,cachedCharactersAt=0,consecutiveTickErrors=0;
const stats={version:catalog.revision,at:Date.now(),errors:[],input:{accepted:0,rejected:0,watchdogReleases:0,freshPressRecoveries:0,lastReject:null},moves:0,frameUpdates:0,source:'product-electron',screenPresentationVerified:false,events:[]};
const diagnosticWriter=snapshotWriter(path.join(root,testOnly?'test-diagnostics.json':'diagnostics.json'));
const rendererRecoveries=[];
function appendCrashLog(record){
 if(testOnly||smoke||!cfg?.dataDir)return;
 try{
  fs.mkdirSync(cfg.dataDir,{recursive:true});
  const file=path.join(cfg.dataDir,'crash-history.jsonl');
  try{if(fs.statSync(file).size>512*1024){const tail=fs.readFileSync(file,'utf8').split('\n').slice(-200).join('\n');fs.writeFileSync(file,tail.endsWith('\n')?tail:tail+'\n');}}catch{}
  fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),pid:process.pid,version:catalog.revision,...record})+'\n');
 }catch{}
}
const error=code=>{if(stats.errors.at(-1)!==code){if(stats.errors.length===64)stats.errors.shift();stats.errors.push(code);}};
process.on('uncaughtException',failure=>{
 // Electron's default Windows error box blocks the main loop. Exit through
 // the normal failure path so the installed supervisor can start a new pet.
 error('MAIN_UNCAUGHT_EXCEPTION');
 const frames=typeof failure?.stack==='string'?failure.stack.split('\n'):[];
 stats.mainException={phase:motion?.phase||'startup',frames:frames.map(line=>
  line.match(/[\\/]app[\\/]([\w.-]+\.(?:cjs|js):\d+:\d+)\)?$/)?.[1]).filter(Boolean).slice(0,6)};
 appendCrashLog({code:'MAIN_UNCAUGHT_EXCEPTION',message:String(failure?.message||failure).slice(0,240),...stats.mainException,frame:stats.currentFrame||null});
 try{
  fs.writeFileSync(path.join(root,testOnly?'test-main-exception.json':'diagnostics-main-exception.json'),
   JSON.stringify({at:new Date().toISOString(),version:catalog.revision,code:'MAIN_UNCAUGHT_EXCEPTION',...stats.mainException})+'\n');
 }catch{}
 if(closing){app.exit(1);return;}
 close('failure').catch(()=>app.exit(1));
});
process.on('unhandledRejection',reason=>{
 error('MAIN_UNHANDLED_REJECTION');
 appendCrashLog({code:'MAIN_UNHANDLED_REJECTION',message:String(reason?.message||reason).slice(0,240),phase:motion?.phase||'startup'});
});
const event=(type,detail={})=>{if(stats.events.length===512)stats.events.shift();stats.events.push({type,at:Date.now(),...detail});};
const fileUrl=file=>pathToFileURL(file).href.replace(/^file:\/\/\/([a-z]):/,(_,d)=>'file:///'+d.toUpperCase()+':');
function valid(e){return !closing&&[win,panel,sizeWindow,speechWindow].some(w=>w&&!w.isDestroyed()&&e.sender===w.webContents);}
function fromCharacter(e){return !closing&&win&&!win.isDestroyed()&&e.sender===win.webContents;}
function lockCharacterSize(){
 win.setMinimumSize(1,1);
 win.setMaximumSize(expected,expected);
 win.setSize(expected,expected,false);
 win.setMinimumSize(expected,expected);
}
function repairCharacterSize(){
 if(closing||win.isDestroyed()||(sizeMatches(win.getSize(),expected)&&!win.isMaximized()&&!win.isFullScreen()))return;
 const normal=win.getNormalBounds(),area=screen.getDisplayMatching(normal).workArea;
 error('SIZE_GUARD');
 if(win.isFullScreen())win.setFullScreen(false);
 if(win.isMaximized())win.unmaximize();
 lockCharacterSize();
 moveOnly(win,placeAtFeet(normal,expected,area,placementBody()));
 lastRequested=null;
}
function queueSizeRepair(){
 if(resizeCheckPending)return;
 resizeCheckPending=true;
 setImmediate(()=>{resizeCheckPending=false;repairCharacterSize();});
}
function lang(){return product?.prefs().resolvedLanguage||i18n.resolveLanguage('auto',{systemLocale:app.getPreferredSystemLanguages?.()?.[0]||app.getLocale?.()});}
function syncLocalizedWindows(){
 const l=lang();
 for(const [w,key]of [[win,'desktop.title'],[panel,'panel.title'],[sizeWindow,'sizePanel.title'],[speechWindow,'speech.title']]){
  if(w&&!w.isDestroyed()){const title=i18n.t(l,key);if(w.getTitle()!==title)w.setTitle(title);}
 }
 if(tray){try{tray.setToolTip(i18n.t(l,'desktop.trayTooltip'));}catch{}}
 if(speech?.mode==='completion')speech.text=i18n.t(l,'desktop.taskCompletionText');
}
function sendState(){if(!product||!display)return;if(speech?.mode==='quota')speech.quota=product.snapshot().quota;const state=snapshot();for(const w of [win,panel,sizeWindow,speechWindow])if(w&&!w.isDestroyed())w.webContents.send('product-state',state);}
function snapshot(){const data=product.snapshot();const colorKey=JSON.stringify([data.prefs.colorMode,data.prefs.colorChance,data.prefs.colorTextChance,speech?.text]);if(colorKey!==appearanceKey){appearanceKey=colorKey;appearance={scope:appearanceRules.scope(data.prefs,speech?.mode==='quote'?speech.text:null,readJson(path.join(product.dataDir,'color-triggers.json'))?.quotes||i18n.defaultColorTriggers(data.resolvedLanguage)),palette:appearanceRules.palette(speech?.text||'')};}if(testOnly)data.audio.enabled=false;return {...data,display,appearance,version:catalog.revision,fontUrl:fileUrl(path.join(root,'assets/identity-hover/hover-font.ttf')),cursors:{grab:fileUrl(path.join(root,'assets/identity-hover/cursor-grab.cur')),grabbing:fileUrl(path.join(root,'assets/identity-hover/cursor-grabbing.cur'))},characterName:characters().find(c=>c.id===product.prefs().characterId)?.name||i18n.defaultCharacterName(data.resolvedLanguage),speech};}
function characters(force=false){const now=Date.now(),l=lang();if(!force&&cachedCharacters&&cachedCharacters.lang===l&&now-cachedCharactersAt<2000)return cachedCharacters.rows;const rows=[{id:'gpt-dragon',name:i18n.defaultCharacterName(l),url:fileUrl(path.join(root,'assets/gpt-dragon-niang-bust.png'))}],personal=readJson(path.join(product.dataDir,'characters.json'));for(const c of personal?.characters||[]){if(!/^custom-[a-f0-9]{32}$/.test(c.id)||c.file!==c.id+'.png'||typeof c.name!=='string')continue;const file=path.join(product.dataDir,'characters',c.file);if(fs.existsSync(file))rows.push({id:c.id,name:c.name.slice(0,80),url:fileUrl(file)});}cachedCharacters={lang:l,rows};cachedCharactersAt=now;return rows;}
function imageMask(file,layout=null){const fallbacks=[path.join(root,'assets/gpt-dragon-niang-bust.png'),path.join(root,'assets/frontidle.png')].filter(p=>fs.existsSync(p));let actual=fs.existsSync(file)?file:fallbacks[0]||file;if(actual!==file)error('CHARACTER_IMAGE_MISSING');let image=nativeImage.createFromPath(actual);if(image.isEmpty()&&actual!==fallbacks[0]&&fallbacks[0]){error('CHARACTER_DECODE_FALLBACK');actual=fallbacks[0];image=nativeImage.createFromPath(actual);}if(image.isEmpty())throw Error('CHARACTER_DECODE_FAILED');const size=image.getSize();if(!(size.width>0&&size.height>0))throw Error('CHARACTER_DECODE_FAILED');const scale=layout?384*layout.width/size.width:Math.min(384/size.width,384/size.height),width=Math.max(1,Math.min(384,Math.round(size.width*scale))),height=Math.max(1,Math.min(384,Math.round(size.height*scale))),resized=image.resize({width,height,quality:'best'}),pixels=resized.toBitmap(),mask=Buffer.alloc(384*384/8),ox=Math.floor((384-width)/2),oy=Math.round(384*(layout?.feet||1))-height;for(let y=0;y<height;y++){const py=oy+y;if(py<0||py>=384)continue;for(let x=0;x<width;x++){const px=ox+x;if(px<0||px>=384)continue;if(pixels[(y*width+x)*4+3]>10){const n=py*384+px;mask[n>>>3]|=1<<(n&7);}}}return mask;}
function desiredDisplay(){const p=product.prefs();if(p.characterId==='gpt-dragon'&&p.form==='full'&&p.dragonAnimationEnabled)return {mode:'full',url:null,key:'full'};let file=path.join(root,p.form==='bust'?'assets/pet-forms/frost-glass-cheek.png':'assets/frontidle.png');if(p.characterId!=='gpt-dragon'){const row=characters().find(c=>c.id===p.characterId);if(row)file=require('node:url').fileURLToPath(row.url);else error('CHARACTER_MISSING');}return {mode:'static',url:fileUrl(file),key:file,layout:p.characterId==='gpt-dragon'&&p.form==='bust'?{width:.62,feet:359/384}:null};}
function placementBody(){return display.mode==='static'?visibleFootprint(staticMask,0,1,null):standingBody;}
async function applyPreferences(previous=null){
 const p=product.prefs(),next=desiredDisplay(),changed=next.key!==display?.key;
 if(changed&&next.mode==='static')staticMask=imageMask(require('node:url').fileURLToPath(next.url),next.layout);display=next;
 const size=characterPixels(p.scale);if((changed||size!==expected)&&motion.phase!=='idle')input.cancel();
 if(size!==expected){const b=win.getBounds();expected=size;lockCharacterSize();moveOnly(win,placeAtFeet(b,size,screen.getDisplayMatching(b).workArea,placementBody()));lastRequested=null;if(!testOnly){const position=win.getBounds();product.settings.update({desktopCanvasPixels:size,desktopLeft:position.x,desktopTop:position.y});}}
 if(speech&&speechWindow&&!speechWindow.isDestroyed()&&previous&&(previous.bubbleScale!==p.bubbleScale||previous.desktopTopmost!==p.desktopTopmost)){showSpeech(speech.mode,speech.text);}
 if(win.isAlwaysOnTop()!==p.desktopTopmost)win.setAlwaysOnTop(p.desktopTopmost,'screen-saver');scheduler.reset();syncLocalizedWindows();sendState();if(rendererReady&&changed){input.cancel();}
}
function configure(w){if(smoke)w.webContents.on('console-message',(_e,level,message,line)=>{if(level>=2){stats.smokeConsole??=[];if(stats.smokeConsole.length<12)stats.smokeConsole.push({message:String(message).slice(0,500),line});}});w.on('show',()=>event('window-show',{title:w.getTitle()}));w.on('page-title-updated',e=>e.preventDefault());w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('render-process-gone',(_e,details)=>{if(closing)return;if(w!==win){error('AUX_RENDERER_GONE');if(w===speechWindow)hideSpeech();if(!w.isDestroyed())w.destroy();return;}const now=Date.now();while(rendererRecoveries.length&&now-rendererRecoveries[0]>60000)rendererRecoveries.shift();const canRecover=!testOnly&&!smoke&&!win.isDestroyed()&&rendererRecoveries.length<2;appendCrashLog({code:canRecover?'RENDERER_GONE_RECOVERED':'RENDERER_GONE',reason:details?.reason||null,exitCode:details?.exitCode??null,recovered:canRecover,frame:stats.currentFrame||null,motion:motion?.phase||null,lastEvents:stats.events.slice(-6)});if(canRecover){rendererRecoveries.push(now);error('RENDERER_GONE_RECOVERED');event('renderer-recovered',{reason:details?.reason||null});input?.cancel?.();menuPopup?.close?.();menuOpen=false;hideSpeech();hideTooltip();rendererReady=false;frames=0;stats.staticReady=false;lastRequested=null;hitScale=1;previousHitScale=1;hitScaleAt=0;if(hitState){hitState.current=null;hitState.retained=null;}scheduler?.reset?.();loadWindow(win,'desktop.html');return;}error('RENDERER_GONE');close('failure');});}
function loadWindow(w,file,options){
 w.loadFile(path.join(__dirname,file),options).catch(()=>{
  if(closing||w.isDestroyed())return;
  error('WINDOW_LOAD_FAILED:'+file);
  if(w===win)close('failure');
  else w.destroy();
 });
}
function openPanel(tab='settings'){if(panel&&!panel.isDestroyed()){if(!smoke&&panelReady){panel.show();panel.focus();}panel.webContents.send('product-notice',{tab});return;}const area=screen.getDisplayMatching(win.getBounds()).workArea,panelSize=panelLayout(area,desktopDpi());panelReady=false;panel=new BrowserWindow({title:i18n.t(lang(),'panel.title'),width:panelSize.width,height:panelSize.height,x:area.x+Math.round((area.width-panelSize.width)/2),y:area.y+Math.round((area.height-panelSize.height)/2),minWidth:Math.min(740,panelSize.width),minHeight:Math.min(560,panelSize.height),show:false,backgroundColor:'#f7f4fb',autoHideMenuBar:true,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'product-preload.cjs')}});configure(panel);panel.webContents.once('dom-ready',()=>{panel.webContents.setZoomFactor(panelSize.zoom);stats.panelZoom=panelSize.zoom;});loadWindow(panel,'product-panel.html',{query:{tab}});panel.on('closed',()=>{panel=null;lastAutoQuote=Date.now();scheduler.reset();});}
function openSize(){if(sizeWindow&&!sizeWindow.isDestroyed()){if(!smoke){sizeWindow.show();sizeWindow.focus();}return;}const area=screen.getDisplayMatching(win.getBounds()).workArea,layout=sizeLayout(area,desktopDpi());sizeWindow=new BrowserWindow({title:i18n.t(lang(),'sizePanel.title'),width:layout.width,height:layout.height,x:area.x+Math.round((area.width-layout.width)/2),y:area.y+Math.round((area.height-layout.height)/2),useContentSize:true,resizable:false,maximizable:false,fullscreenable:false,show:false,backgroundColor:'#f8fbff',autoHideMenuBar:true,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'product-preload.cjs')}});configure(sizeWindow);sizeWindow.webContents.once('dom-ready',()=>{sizeWindow.webContents.setZoomFactor(layout.zoom);stats.sizeZoom=layout.zoom;});loadWindow(sizeWindow,'size-panel.html');sizeWindow.on('closed',()=>{sizeWindow=null;scheduler.reset();});}
function positionSpeech(){if(!speech||!speechWindow||speechWindow.isDestroyed()||!win||win.isDestroyed())return;const b=win.getBounds(),size=speechWindow.getSize(),area=screen.getDisplayMatching(b).workArea,point=speechPlacement(b,placementBody(),{width:size[0],height:size[1]},area,speechLayout.zoom);moveOnly(speechWindow,point);}
function resizeSpeech(){if(!speechWindow||speechWindow.isDestroyed()||!speechCssWidth||!speechCssHeight)return;speechWindow.setSize(Math.min(speechLayout.width,Math.ceil(speechCssWidth*speechLayout.zoom)),Math.min(speechLayout.maxHeight,Math.ceil(speechCssHeight*speechLayout.zoom)),false);positionSpeech();if(speech&&!smoke&&!captureActive)speechWindow.showInactive();}
function hideTooltip(){if(!hoverPoint)return;hoverPoint=null;if(win&&!win.isDestroyed())win.webContents.send('desktop-hover',null);}
function updateHover(pointer,inside){
 if(!hoverAllowed({inside,phase:motion.phase,menu:menuOpen,panel:panel?.isVisible(),sizePanel:sizeWindow?.isVisible(),visible:!captureActive&&(smoke||win.isVisible())})){hideTooltip();return false;}
 const bounds=win.getBounds(),point={x:pointer.x-bounds.x,y:pointer.y-bounds.y};
 if(!hoverPoint||point.x!==hoverPoint.x||point.y!==hoverPoint.y){hoverPoint=point;win.webContents.send('desktop-hover',point);}
 return true;
}
function hideSpeech(){clearTimeout(speechTimer);speech=null;if(speechWindow&&!speechWindow.isDestroyed())speechWindow.hide();}
function showSpeech(mode,text=null){if(closing||captureActive||!win||win.isDestroyed())return;const p=product.prefs(),l=p.resolvedLanguage||'zh-CN',area=screen.getDisplayMatching(win.getBounds()).workArea;speechLayout=bubbleLayout(area,desktopDpi(),p.bubbleScale);if(mode==='completion'&&(p.quietUntil===-1||p.quietUntil>Date.now()))return;speech={mode,text:mode==='quote'?text||product.nextQuote():mode==='completion'?i18n.t(l,'desktop.taskCompletionText'):text,quota:product.snapshot().quota};
 if(!speechWindow||speechWindow.isDestroyed()){speechCssHeight=null;speechCssWidth=null;speechWindow=new BrowserWindow({title:i18n.t(l,'speech.title'),width:speechLayout.width,height:Math.round(160*speechLayout.zoom),show:false,frame:false,transparent:true,hasShadow:false,focusable:true,skipTaskbar:true,alwaysOnTop:p.desktopTopmost,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'product-preload.cjs')}});configure(speechWindow);speechWindow.webContents.once('dom-ready',()=>{speechWindow.webContents.setZoomFactor(speechLayout.zoom);stats.speechZoom=speechLayout.zoom;});loadWindow(speechWindow,'speech.html');speechWindow.once('ready-to-show',()=>{if(closing||!speechWindow||speechWindow.isDestroyed())return;speechWindow.setAlwaysOnTop(product.prefs().desktopTopmost,'floating');resizeSpeech();});}else{speechWindow.webContents.setZoomFactor(speechLayout.zoom);stats.speechZoom=speechLayout.zoom;speechWindow.webContents.send('product-notice',speech);resizeSpeech();}speechWindow.setAlwaysOnTop(p.desktopTopmost,'floating');speechWindow.setIgnoreMouseEvents(mode==='identity');clearTimeout(speechTimer);if(mode!=='identity')speechTimer=setTimeout(hideSpeech,mode==='quota'?18000:6500);lastAutoQuote=Date.now();sendState();}
function menuTemplate(){
 const p=product.prefs(),l=p.resolvedLanguage||'zh-CN',actions=catalog.getActions(l);
 const names=groupKey=>actions.filter(a=>a.groupKey===groupKey).map(a=>a.label);
 const [actionTree]=buildMenuTree({
  idle:names('待机'),turn:names('转向'),drag:names('拖拽'),clicks:names('点击回应'),
  moves:{actions:names('移动').map(name=>({name}))},
  categories:['小动作','玩耍','吃什么'].map(id=>({id:i18n.translateActionGroup(id,l),actions:names(id)})),
  events:{workStatus:names('工作状态')}
 });
 if(actionTree){
  actionTree.label=i18n.t(l,'menu.actions');
  for(const g of actionTree.children)g.label=i18n.translateActionGroup(g.label,l);
 }
 const actionNames=new Map(actions.map(action=>[action.label,action.name]));
 const run=(kind,values={})=>()=>command({sender:win.webContents},{kind,...values});
 return [
  {label:i18n.t(l,'menu.toggleForm'),click:run('preferences',{prefs:{},form:p.form==='full'?'bust':'full'})},
  {label:i18n.t(l,'menu.resize'),click:openSize},{type:'separator'},
  {label:actionTree.label,enabled:display.mode==='full',submenu:actionTree.children.map(group=>({
   label:group.label,
   submenu:group.children.map(({label,anim})=>({label,click:()=>{if(captureActive)return;const name=actionNames.get(anim);if(director.manual(name)){const cur=product.prefs(),quote=catalog.actionQuote?.(name,cur.resolvedLanguage);if(quote&&cur.clickCardsEnabled&&cur.quietUntil!==-1&&cur.quietUntil<=Date.now())showSpeech('quote',quote);}}}))
  }))},
  {type:'separator'},{label:i18n.t(l,'menu.moreSettings'),click:()=>openPanel('settings')},{label:i18n.t(l,'menu.reloadConfig'),click:()=>reloadConfiguration()},{label:i18n.t(l,'menu.quit'),click:()=>close('user')}
 ];
}
function reloadConfiguration(){
 if(closing)return;
 // Installed copies are restarted by the supervisor after the old native lease is released.
 if(!testOnly&&product.isPortable)app.relaunch();
 void close('reload');
}
function showClickCard(){const p=product.prefs();if(!(p.form==='bust'?p.bustClickCardsEnabled:p.clickCardsEnabled))return;const mode=clickSequence.next();showSpeech(mode);if(mode==='quota')product.refresh().then(sendState).catch(sendState);}
function popup(){
 if(closing||captureActive||menuOpen||!win||win.isDestroyed())return;
 input.cancel();hideSpeech();hideTooltip();menuOpen=true;setIgnore(false);
 const point=screen.getCursorScreenPoint(),monitor=screen.getDisplayNearestPoint(point);
 menuPopup.open(menuTemplate(),point,monitor.workArea,uiZoom(monitor.scaleFactor*96),win.isVisible()?win:null,{lang:lang(),title:i18n.t(lang(),'menu.windowTitle')});
}
function notice(message){for(const w of [panel,win])if(w&&!w.isDestroyed())w.webContents.send('product-notice',{message});}
function setIgnore(value,force=false){if(ignore===value&&!force||!win||win.isDestroyed())return;win.setIgnoreMouseEvents(value,{forward:true});ignore=value;lastIgnoreApply=Date.now();}
function overBody(pointer){if(!hitState.current)return false;const scales=Date.now()-hitScaleAt<120?[hitScale,previousHitScale]:[1];return scales.some(scale=>{const point=sourcePoint(pointer,win.getBounds(),scale);return dragHit.test(hitState.current,hitState.retained,point.x,point.y,expected);});}
function refreshPointerGate(pointer=screen.getCursorScreenPoint()){if(captureActive){setIgnore(true);return false;}const now=Date.now(),bounds=win.getBounds(),inside=overBody(pointer),within=pointer.x>=bounds.x&&pointer.y>=bounds.y&&pointer.x<bounds.x+bounds.width&&pointer.y<bounds.y+bounds.height,rawLeft=smoke?false:native?.leftDown?.(),value=pointerGate.decide({inside,within,leftDown:typeof rawLeft==='boolean'?rawLeft:null,dragging:motion?.phase==='drag',menu:menuOpen,now});setIgnore(value,!value&&now-lastIgnoreApply>1000);return inside;}
function pressHit(pointer,data){return overBody(pointer)||dragHit.presented(data?.presentation,data?.point,expected);}
function writePosition(p){const rounded={x:windowCoordinate(p.x),y:windowCoordinate(p.y)},key=rounded.x+','+rounded.y;if(key===lastRequested){const actual=win.getBounds();if(actual.x===rounded.x&&actual.y===rounded.y)return;}win.setPosition(rounded.x,rounded.y,false);lastRequested=key;stats.moves++;positionSpeech();}
function persistPosition(){try{const b=win.getBounds();product.settings.update({desktopLeft:b.x,desktopTop:b.y,desktopCanvasPixels:expected});}catch(failure){const message=String(failure?.message||failure).slice(0,120);error((['SETTINGS_CHANGED','PREFERENCES_CHANGED'].includes(message)?'POSITION_SAVE_CONFLICT':'POSITION_SAVE_FAILED')+':'+message);}}
async function command(e,data){if(!valid(e)||!data||typeof data.kind!=='string')throw Error('CALLER');try{switch(data.kind){
 case 'preferences':{const previous=product.prefs();product.savePreferences(data);await applyPreferences(previous);return snapshot();}
 case 'language':{product.update({language:data.language});await applyPreferences();return snapshot();}
 case 'reload-preferences':product.reloadPreferences();syncLocalizedWindows();sendState();return snapshot();
 case 'update-check':await product.checkUpdate('manual');sendState();return snapshot();
 case 'update-automatic':product.setUpdateAutomatic(data.enabled===true);sendState();return {ok:true};case 'open-external':if(!product.isAllowedReleaseUrl(data.url))throw Error('INVALID_RELEASE_URL');stats.openedExternalUrl=data.url;if(!testOnly)await shell.openExternal(data.url);return {ok:true,url:data.url};
 case 'refresh':await product.refresh();sendState();return snapshot();
 case 'codex-login':return await product.loginCodex();
 case 'observation':product.setObservationPaused(data.paused===true);sendState();return snapshot();
 case 'quiet':product.setExperience({quietUntil:data.until});hideSpeech();sendState();return snapshot();
 case 'action':return {ok:display.mode==='full'&&director.manual(data.name)};
 case 'quote':showSpeech('quote');return {ok:true};
 case 'triggers-read':return readJson(path.join(product.dataDir,'color-triggers.json'))?.quotes||i18n.defaultColorTriggers(lang());
 case 'triggers-save':{if(!Array.isArray(data.rows)||data.rows.length>5000||data.rows.some(t=>typeof t!=='string'||t.length>200))throw Error('INVALID_TRIGGERS');const {SettingsStore}=require('./settings-store.cjs');new SettingsStore(path.join(product.dataDir,'color-triggers.json')).update({version:1,quotes:[...new Set(data.rows)]});appearanceKey='';sendState();return {ok:true};}
 case 'quotes-read':return product.quoteRows();
 case 'quotes-save':return product.saveQuotes(data.rows);
 case 'characters':return characters();
 case 'character-select':if(!characters().some(c=>c.id===data.id))throw Error('INVALID_CHARACTER');product.settings.update({characterId:data.id});await applyPreferences();return snapshot();
 case 'character-import':{const l=lang(),selected=await dialog.showOpenDialog(panel||win,{title:i18n.t(l,'dialog.importCharacterTitle'),properties:['openFile'],filters:[{name:i18n.t(l,'dialog.pngFilter'),extensions:['png']}]});if(selected.canceled)return {ok:false};const source=selected.filePaths[0];if(fs.statSync(source).size>20*1024*1024||nativeImage.createFromPath(source).isEmpty())throw Error('INVALID_CHARACTER');const id='custom-'+crypto.randomUUID().replaceAll('-',''),folder=path.join(product.dataDir,'characters'),file=id+'.png';fs.mkdirSync(folder,{recursive:true});fs.copyFileSync(source,path.join(folder,file));const {SettingsStore}=require('./settings-store.cjs'),store=new SettingsStore(path.join(product.dataDir,'characters.json'));store.update({version:1,characters:[...(store.value.characters||[]),{id,name:path.basename(source,'.png').slice(0,80),file}],removed:store.value.removed||[]});cachedCharacters=null;return {ok:true};}
 case 'audio-import':{if(!['press','release'].includes(data.slot))throw Error('INVALID_SLOT');const l=lang(),selected=await dialog.showOpenDialog(panel||win,{title:i18n.t(l,'dialog.importAudioTitle'),properties:['openFile'],filters:[{name:i18n.t(l,'dialog.wavFilter'),extensions:['wav']}]});if(selected.canceled)return {ok:false};const source=selected.filePaths[0],{importWave,MAX_WAVE_BYTES}=await import(pathToFileURL(path.join(root,cfg.serviceRoot,'audio-import.mjs')).href);if(fs.statSync(source).size>MAX_WAVE_BYTES)throw Error('AUDIO_TOO_LARGE');const file=crypto.randomUUID().replaceAll('-','')+'.wav',folder=path.join(product.dataDir,'sounds');fs.mkdirSync(folder,{recursive:true});importWave(source,path.join(folder,file));product.audio.update({version:1,mode:'custom',[data.slot]:{file,name:path.basename(source).slice(0,255)}});sendState();return {ok:true};}
 case 'audio-builtin':product.audio.update({version:1,mode:'builtin',press:null,release:null});sendState();return {ok:true};
 case 'panel-ready':if(e.sender!==panel?.webContents)throw Error('CALLER');panelReady=true;if(!smoke)panel.show();return {ok:true};
 case 'close-panel':panel?.close();return {ok:true};
 case 'settings':openPanel('settings');return {ok:true};
 case 'size':openSize();return {ok:true};
 case 'size-ready':if(e.sender!==sizeWindow?.webContents)throw Error('CALLER');if(!smoke){sizeWindow.show();sizeWindow.focus();}return {ok:true};
 case 'speech-size':if(e.sender!==speechWindow?.webContents)throw Error('CALLER');if(![data.width,data.height].every(n=>Number.isFinite(n)&&n>=1&&n<=10000))throw Error('INVALID_SIZE');speechCssWidth=data.width;speechCssHeight=data.height;resizeSpeech();return {ok:true};
 case 'speech-close':hideSpeech();return {ok:true};
 case 'speech-click':clickSequence.quote();showSpeech('quote');return {ok:true};
 case 'click-finished':if(!fromCharacter(e)||!director.matches(data.owner))return {ok:false};if(display.mode!=='static'&&product.prefs().dragonTouchEnabled){const response=touch.choose(data.point);if(response){director.manual('clip:'+response.clip);event('touch',response);}}return {ok:true};
 default:throw Error('UNKNOWN_COMMAND');
 }}catch(failure){const conflict=failure.message==='PREFERENCES_CHANGED'||failure.message==='SETTINGS_CHANGED',l=lang();notice(conflict?i18n.t(l,'notice.preferencesChanged'):i18n.t(l,'notice.actionFailed'));return {error:conflict?'PREFERENCES_CHANGED':'ACTION_FAILED'};}}
async function close(reason='normal'){if(closing)return;closing=true;const exitCode=reason==='failure'?1:0,closeStarted=Date.now(),mark=step=>{(stats.closeTimings??=[]).push({step,ms:Date.now()-closeStarted});};
 // Last-resort exit: a stalled close step must not leave a smoke or user process running.
 setTimeout(()=>{stats.closeTimedOut=true;mark('fallback-exit');appendCrashLog({code:'CLOSE_FALLBACK_EXIT',reason,errors:stats.errors.slice(-6)});try{fs.writeFileSync(path.join(root,testOnly?'product-test-status.json':'last-exit.json'),JSON.stringify({...stats,reason,at:Date.now()},null,2));}catch{}process.exit(exitCode);},10000);
 await new Promise(setImmediate);clearInterval(timer);clearTimeout(speechTimer);native?.detach?.();menuPopup?.close();for(const w of [panel,sizeWindow,speechWindow,win])if(w&&!w.isDestroyed())w.destroy();tray?.destroy();mark('windows');await product?.close();mark('product');await Promise.race([Promise.allSettled([presenceWriter?.flush(),diagnosticWriter.flush()]),new Promise(r=>setTimeout(r,1500))]);mark('flush');if(!testOnly&&product){for(const name of ['presence.json','runtime.json']){const file=path.join(product.dataDir,name);if(readJson(file)?.pid===process.pid){try{fs.unlinkSync(file);}catch{}}}}if(owned)native.release();try{fs.writeFileSync(path.join(root,testOnly?'product-test-status.json':'last-exit.json'),JSON.stringify({...stats,reason,at:Date.now()},null,2));if(!testOnly){if(reason==='user')fs.writeFileSync(path.join(product.dataDir,'supervisor-pause.json'),JSON.stringify({desktop:true,at:new Date().toISOString()}));}}catch{}quitReady=true;process.exit(exitCode);}
app.on('second-instance',()=>{if(!closing&&win&&!win.isDestroyed()){if(!smoke&&!win.isVisible())win.showInactive();showSpeech('quote');}});
app.on('before-quit',e=>{if(!quitReady){e.preventDefault();close('normal');}});
app.whenReady().then(async()=>{
 try{const build=readJson(path.join(root,cfg.nativeRoot||'native-product','build.json')),binary=path.join(root,cfg.nativeRoot||'native-product','native-lease.node');if(!build||sha(binary)!==build.binarySha256)throw Error('NATIVE_HASH');native=require(binary);}catch(e){stats.nativeFallback=String(e?.message||e).slice(0,160);native={tryAcquire:()=>testOnly||app.requestSingleInstanceLock(),release:()=>{if(!testOnly)try{app.releaseSingleInstanceLock();}catch{}},leftDown:()=>null,detach:()=>{},captureActive:()=>false,cursorOver:()=>true};}
 const rawCompat=path.resolve(cfg.compatRoot||root),canonical=(()=>{try{return fs.realpathSync.native(rawCompat);}catch{return path.win32.normalize(rawCompat);}})().toLowerCase(),key=testOnly?'Local\\GPTNiangProductTest_'+crypto.randomUUID():'Local\\GPTNiangUsage_'+Buffer.from(canonical).toString('base64').replaceAll('/','_').replaceAll('+','-');try{owned=native.tryAcquire(key);}catch{owned=testOnly||app.requestSingleInstanceLock({key});}if(!owned){quitReady=true;app.quit();return;}
 const dataDir=testOnly?path.join(root,'test-state'):cfg.dataDir;fs.mkdirSync(dataDir,{recursive:true});if(testOnly)runtimeHelpers.ensureTestStateSeed(dataDir);const systemLocale=app.getPreferredSystemLanguages?.()?.[0]||app.getLocale?.();product=new ProductHost({root,dataDir,serviceRoot:path.join(root,cfg.serviceRoot),configPath:path.join(root,'installation.json'),compatRoot:cfg.compatRoot,testOnly,systemLocale,onCompletion:()=>{showSpeech('completion');},onReleaseNotice:info=>{showSpeech('release',info.text);}});presenceWriter=snapshotWriter(path.join(dataDir,'presence.json'));
 animation=readJson(path.join(root,'animation.json'));catalog.configure(animation);touch=new TouchResponses(animation);scenes=readJson(path.join(root,'scenes.json'));for(const c of Object.values(scenes.clips))c.url=fileUrl(path.join(root,c.file));cache=new HitCache(root,readJson(path.join(root,'hit-masks.json')).entries);hitState=new PresentationHit();dragHit=new DragHit({mask:name=>name==='static'?staticMask:cache.get(name)});display=desiredDisplay();if(display.mode==='static')staticMask=imageMask(require('node:url').fileURLToPath(display.url),display.layout);standingBody=visibleFootprint(await cache.load('frontidle'),0);
 const prefs=product.prefs(),d=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());expected=characterPixels(prefs.scale);
 const saved=product.settings.value.desktopCanvasPixels,oldSize=Number.isFinite(saved)&&saved>=100&&saved<=1500?saved:canvasPixels(300*prefs.scale/1.4),prior={x:prefs.desktopLeft??d.workArea.x+d.workArea.width-oldSize-60,y:prefs.desktopTop??d.workArea.y+d.workArea.height-oldSize-30,width:oldSize,height:oldSize},placement=placeAtFeet(prior,expected,screen.getDisplayMatching(prior).workArea,placementBody());
 win=new BrowserWindow({title:i18n.t(lang(),'desktop.title'),width:expected,height:expected,x:placement.x,y:placement.y,useContentSize:true,frame:false,transparent:true,backgroundColor:'#00000000',show:false,hasShadow:false,resizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,focusable:true,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'desktop-preload.cjs')}});lockCharacterSize();win.setAlwaysOnTop(prefs.desktopTopmost,'screen-saver');configure(win);
 for(const name of ['resize','maximize','enter-full-screen'])win.on(name,queueSizeRepair);
 win.on('hide',()=>{menuPopup?.close();hideSpeech();hideTooltip();});win.on('closed',()=>close('user'));if(!testOnly&&saved!==expected){try{product.settings.update({desktopCanvasPixels:expected,desktopLeft:placement.x,desktopTop:placement.y});}catch{}}
 session.defaultSession.webRequest.onBeforeRequest((details,reply)=>reply({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('data:')}));session.defaultSession.setPermissionRequestHandler((_w,_p,reply)=>reply(false));
 const send=async action=>{try{const plan=display.mode==='static'?[]:catalog.plan(action.name,scenes.clips,{fromPose:action.fromPose});for(const step of plan)await cache.load(step.clip);if(closing||director.current!==action)return;win.webContents.send('desktop-action',action);event('performance',{name:action.name,origin:action.origin,requestId:action.requestId});}catch{error('MEDIA_PLAN_FAILED');director.mediaError(action);}};
 director=new PerformanceDirector(send);scheduler=new ProductScheduler({director});frameAdmission=new FrameAdmission({cache,owns:d=>!closing&&director.matches(d),retained:()=>[hitState.current?.clip,hitState.retained?.clip,...dragHit.clips()].filter(Boolean),onError:()=>error('HIT_MASK_LOAD_FAILED'),accept:data=>{hitState.update(data);dragHit.record(data);cache.pin([hitState.current?.clip,hitState.retained?.clip,...dragHit.clips()]);if(!smoke&&motion.phase!=='drag')refreshPointerGate();director.present(data);scheduler.present(data);frames++;stats.frameUpdates++;if(testOnly&&process.argv.includes('--test-crash')&&frames===5)setTimeout(()=>win.webContents.forcefullyCrashRenderer(),20);stats.currentFrame={clip:data.clip,frame:data.frame,visible:data.visible,requestId:data.requestId};showWhenReady();}});
 motion=new Motion(e=>{if(e.type==='rested')writePosition(e.position);if(display.mode!=='static'||e.type!=='qualified')director.motion(e);if(e.type==='grab'){native.detach();scheduler.reset();hideSpeech();}if(e.type==='release'&&!e.moved&&!e.thrown)showClickCard();if(e.type==='release'&&e.thrown)flightPacing.start(performance.now());if(['grab','cancel','release','rested'].includes(e.type))win.webContents.send('desktop-transport',{phase:e.type==='grab'?'drag':e.type==='release'&&e.thrown?'flight':'idle',serial:motion.serial,gesture:e.gesture??motion.gesture});if(e.type==='rested'||e.type==='release'&&!e.thrown||e.type==='cancel'&&e.previousPhase!=='idle')persistPosition();});
 input=new InputDriver({motion,bounds:()=>win.getBounds(),hit:pressHit,write:writePosition,raise:()=>{if(!smoke)win.moveTop();setIgnore(false);},observe:data=>{if(data.kind==='begin')stats.input.accepted++;if(data.kind==='rejected-begin'){stats.input.rejected++;stats.input.lastReject=data.reason;}if(data.kind==='watchdog-release')stats.input.watchdogReleases++;if(data.kind==='fresh-press-recovery')stats.input.freshPressRecoveries++;}});
 menuPopup=new (require('./menu-popup.cjs').MenuPopup)({BrowserWindow,ipcMain,root:__dirname,smoke,onClose:()=>{menuOpen=false;scheduler.reset();}});
 ipcMain.handle('desktop-config',e=>{if(!fromCharacter(e))throw Error('CALLER');return {...scenes,animation,product:snapshot()};});ipcMain.handle('product-snapshot',e=>{if(!valid(e))throw Error('CALLER');return snapshot();});ipcMain.handle('product-command',command);
 ipcMain.on('desktop-ready',e=>{if(fromCharacter(e)&&!rendererReady){rendererReady=true;director.start();}});
 ipcMain.on('desktop-frame',(e,data)=>{if(!fromCharacter(e)||!director.matches(data)||!Number.isInteger(data.frame)||data.frame<0||data.clip!=='static'&&(!scenes.clips[data.clip]||data.frame>=scenes.clips[data.clip].frames))return;frameAdmission.push(data);});
 ipcMain.on('desktop-media',(e,data)=>{if(!fromCharacter(e)||!director.matches(data))return;if(data.type==='error'){error(data.code||'MEDIA_ERROR');scheduler.mediaError(data);director.mediaError(data);}if(data.type==='ended')event('media-ended',{clip:data.clip,requestId:data.requestId});});
 ipcMain.on('desktop-status',(e,data)=>{if(!fromCharacter(e))return;if(data.input){const v=data.input,counts=['gesture','downs','rearms','captureFailures','lostCaptures','mainResets','rejections','visualFailures'];if(counts.every(k=>Number.isSafeInteger(v[k])&&v[k]>=0)&&typeof v.held==='boolean'&&typeof v.capture==='boolean')stats.rendererInput=Object.fromEntries(['held','capture',...counts].map(k=>[k,v[k]]));return;}if(!data.ok)error(data.error||'RENDERER_ERROR');if(data.readyForDisplay){stats.staticReady=true;showWhenReady();}});
 ipcMain.on('desktop-hit-geometry',(e,data)=>{if(!fromCharacter(e)||!director.matches(data?.owner)||!Number.isFinite(data.scaleY)||data.scaleY<.45||data.scaleY>1.2)return;previousHitScale=hitScale;hitScale=data.scaleY;stats.hitScale=hitScale;hitScaleAt=Date.now();if(motion.phase!=='drag'&&!menuOpen)refreshPointerGate();});
 ipcMain.on('desktop-input',(e,data)=>{if(!fromCharacter(e)||captureActive)return;if(data?.kind==='hover'){if(motion.phase!=='drag')refreshPointerGate();return;}if(data?.kind==='menu'){popup();return;}if(data?.kind==='recovery-timeout'){input.recoverTimeout(data.gesture);return;}if(data?.kind==='end'&&data.gesture===input.active)director.present(data.presentation);const accepted=input.handle(data);if(data?.kind==='begin'){win.webContents.send('desktop-input-ack',{gesture:data.gesture,accepted});if(!accepted&&motion.phase==='idle'&&input.active===null&&data.gesture>input.lastGesture)input.cancel(data.gesture);}});
 let displays=screen.getAllDisplays();for(const name of ['display-added','display-removed','display-metrics-changed'])screen.on(name,()=>{displays=screen.getAllDisplays();});
 const collisionBody=()=>{const f=hitState.current,mask=f?.clip==='static'?staticMask:cache.get(f?.clip);return visibleFootprint(mask,f?.index,hitScale,display.mode==='static'?null:catalog.geometry.feetY);};
 const flightBounds=(position=motion.flight)=>{const body=collisionBody(),bounds=motionBounds(position,displays,expected,body);stats.collision={body,bounds,clip:hitState.current?.clip,frame:hitState.current?.index,size:expected};return bounds;};
 function stepFlight(dt){
  if(motion.phase!=='flight')return;
  const next=motion.tick(dt,flightBounds());
  if(motion.phase==='flight')writePosition(next);
 }
 const flightPacing=new FlightPacing(stepFlight);
 stats.flightPacing={paintSteps:0,fallbackSteps:0};
 ipcMain.on('desktop-flight-frame',(e,serial)=>{
  if(!fromCharacter(e)||motion.phase!=='flight'||serial!==motion.serial)return;
  if(flightPacing.pulse(performance.now()))stats.flightPacing.paintSteps++;
 });
 win.once('ready-to-show',()=>{stats.windowReady=true;showWhenReady();});function showWhenReady(){if(smoke||closing||captureActive||!stats.windowReady||!stats.staticReady&&frames<3||win.isVisible())return;win.showInactive();event('shown');}
 if(!smoke){try{tray=new Tray(nativeImage.createFromPath(path.join(root,'assets/gpt-dragon-niang-bust.png')).resize({width:24,height:24}));tray.setToolTip(i18n.t(lang(),'desktop.trayTooltip'));tray.on('click',popup);tray.on('right-click',popup);}catch{error('TRAY_INIT_FAILED');}}
 product.start().catch(()=>{product.note('OBSERVERS_START_FAILED');notice(i18n.t(lang(),'notice.observersFailed'));});loadWindow(win,'desktop.html');const started=Date.now();
 if(testOnly&&process.argv.includes('--test-main-error'))setImmediate(()=>{throw Error('TEST_MAIN_FAILURE');});
 let lastCaptureCheck=0,lastSchedule=0,schedulerState=null;
 timer=setInterval(()=>{
  if(closing||win.isDestroyed())return;
  try{
  const now=Date.now();
  if(motion.phase==='flight'&&flightPacing.fallback(performance.now()))stats.flightPacing.fallbackSteps++;
  if(!smoke&&now-lastCaptureCheck>=80){
   lastCaptureCheck=now;
   if(native.captureActive?.()===true)lastCaptureSeen=now;
    const active=now-lastCaptureSeen<400;
   if(active!==captureActive){
    captureActive=active;
    if(active){
     if(motion.phase==='drag')input.cancel();
     // Leave the pet visible behind the selection surface, including in its captured image.
     menuPopup.close();hideSpeech();hideTooltip();setIgnore(true);native.detach();
    }else showWhenReady();
   }
  }
  const ld=!smoke&&native?.leftDown?.();if(motion.phase==='drag'&&typeof ld==='boolean')input.recover(screen.getCursorScreenPoint(),ld,now);
  const pointer=screen.getCursorScreenPoint(),inside=refreshPointerGate(pointer);
  if(!smoke&&!captureActive)updateHover(pointer,inside&&!ignore&&native.cursorOver?.(Number(win.getNativeWindowHandle().readBigUInt64LE()))!==false);
  if(now-lastSchedule>=100&&schedulerState){lastSchedule=now;const selection=scheduler.tick(schedulerState,{blocked:captureActive||menuOpen||motion.phase!=='idle'||panel?.isVisible()||sizeWindow?.isVisible()||!rendererReady,clips:scenes.clips});if(selection){stats.companion={...selection,at:now};event('companion-selection',selection);}}
   if(now-lastProduct>=500){lastProduct=now;const state=schedulerState=product.tick(),key=JSON.stringify(state);if(key!==lastStateKey){lastStateKey=key;sendState();}if(state.prefs.autoQuoteEnabled&&(state.prefs.form!=='bust'||state.prefs.autoBubble)&&!speech&&!menuOpen&&!panel?.isVisible()&&!sizeWindow?.isVisible()&&motion.phase==='idle'&&now-lastAutoQuote>state.prefs.autoQuoteIntervalSeconds*1000&&now-started>30000&&state.prefs.quietUntil!==-1&&state.prefs.quietUntil<=now){showSpeech('quote');}}
  if(now-lastFollow>=100){lastFollow=now;if(win&&!win.isVisible()&&stats.windowReady&&(frames>=3||stats.staticReady)&&!smoke&&!closing&&!captureActive)win.showInactive();positionSpeech();}
  if(now-lastPresence>=1000){lastPresence=now;let autoLen=0;try{autoLen=catalog.automatic.length;}catch{error('AUTOMATIC_POOL_FAILED');}diagnosticWriter.write({version:catalog.revision,pid:process.pid,at:now,errors:stats.errors,input:{...stats.input,activeGesture:input.active},rendererInput:stats.rendererInput,clickThrough:ignore,menuOpen,hitReady:!!hitState.current&&!!(hitState.current.clip==='static'?staticMask:cache.get(hitState.current.clip)),moves:stats.moves,frameUpdates:stats.frameUpdates,frame:stats.currentFrame,motion:motion.phase,visible:win.isVisible(),focusable:win.isFocusable(),focused:win.isFocused(),companion:stats.companion,captureActive,collision:stats.collision,automaticPool:autoLen,size:win.getSize(),processes:app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,cpu:p.cpu,memory:p.memory})),screenPresentationVerified:false}).catch(()=>{});repairCharacterSize();if(!testOnly){const handle=Number(win.getNativeWindowHandle().readBigUInt64LE()),presence={pid:process.pid,widget:handle,at:now,visible:win.isVisible(),character:{id:product.prefs().characterId,galleryOpen:!!panel?.isVisible()},dragonMotion:{form:product.prefs().form,phase:product.task.phase,clip:hitState.current?.clip,presentedFrames:stats.frameUpdates,manifestVersion:catalog.revision},motion:{active:motion.phase!=='idle',dragging:motion.phase==='drag',flying:motion.phase==='flight'},scene:{open:!!speech},music:{enabled:false},sound:{press:{configured:false,active:false},release:{configured:false,active:false}},renderer:'electron'};presenceWriter.write(presence).catch(()=>error('PRESENCE_WRITE_FAILED'));if(!stats.runtimeWritten){try{fs.writeFileSync(path.join(dataDir,'runtime.json.tmp'),JSON.stringify({pid:process.pid,widget:handle,startedAt:new Date(started).toISOString(),renderer:'electron',version:catalog.revision,appDir:root}));fs.renameSync(path.join(dataDir,'runtime.json.tmp'),path.join(dataDir,'runtime.json'));stats.runtimeWritten=true;}catch{}}const stop=path.join(dataDir,'stop.flag');let stopRequested=false;try{stopRequested=fs.statSync(stop).mtimeMs>=started-1000;}catch{}if(stopRequested){void close('stop');return;}const request=readJson(path.join(dataDir,'display-request.json'));if(request?.nonce&&request.nonce!==lastDisplayRequest){lastDisplayRequest=request.nonce;if(now-request.at<30000){if(request.mode==='quota')showSpeech('quota');else if(request.mode==='quote')showSpeech('quote');else if(request.mode==='menu')openPanel('settings');else if(request.mode==='size')openSize();else if(request.mode==='characters')openPanel('characters');else if(request.mode==='close-menu')panel?.hide();}}}}
  consecutiveTickErrors=0;
  }catch(tickErr){
   error('TICK_ERROR:'+String(tickErr?.message||tickErr).slice(0,80));
   if(++consecutiveTickErrors>=10){appendCrashLog({code:'TICK_FAILURE_LIMIT',message:String(tickErr?.message||tickErr).slice(0,240)});void close('failure');}
  }
 },16);
 if(smoke)require(process.argv.includes('--bubble-smoke')?'./bubble-smoke.cjs':'./product-smoke.cjs').run({win,product,director,scheduler,motion,stats,root,openPanel,applyPreferences,snapshot,command,close,cache,hitTest:overBody,menuTemplate,openSize,popup,menuPopup,input,showSpeech,collisionBody,flightBounds,stepFlight,flightPacing,writePosition,getDisplays:()=>displays,updateHover,hideTooltip,positionSpeech,hoverState:()=>({active:!!hoverPoint})}).catch(()=>{error('SMOKE_FAILED');close('failure');});
}).catch(err=>{error('PRODUCT_INIT_FAILED');stats.initFailure={message:String(err?.message||err).slice(0,300),stack:String(err?.stack||'').split('\n').slice(0,6).map(s=>s.trim())};appendCrashLog({code:'PRODUCT_INIT_FAILED',...stats.initFailure});close('failure');});
