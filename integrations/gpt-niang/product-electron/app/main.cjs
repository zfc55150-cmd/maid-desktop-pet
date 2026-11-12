'use strict';
const {app,BrowserWindow,ipcMain,session,screen,Tray,nativeImage,dialog,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {ClickSequence}=require('./click-sequence.cjs'),clickSequence=new ClickSequence();
const {visibleFootprint}=require('./collision-body.cjs');
const {speechPlacement,hoverAllowed}=require('./bubble-geometry.cjs'),sharedUi=require('./vendor/shared-core.js');
const {PointerGate}=require('./pointer-gate.cjs'),pointerGate=new PointerGate();
const {DragHit}=require('./drag-hit.cjs'),{characterPixels,placeAtFeet,panelLayout,bubbleLayout,sizeLayout,uiZoom}=require('./presentation-layout.cjs');
const {TouchResponses}=require('./touch.cjs'),appearanceRules=require('./appearance.cjs');
const {ProductHost,readJson}=require('./product-host.cjs'),{sha}=require('./file-integrity.cjs'),{PerformanceDirector}=require('./performance-director.cjs'),{ProductScheduler}=require('./schedulers.cjs'),{HitCache,FrameAdmission}=require('./hit-cache.cjs'),{Motion,hit}=require('./desktop-motion.cjs'),{InputDriver}=require('./desktop-input.cjs'),{sourcePoint,PresentationHit,canvasPixels,moveOnly,sizeMatches,motionBounds}=require('./desktop-geometry.cjs'),catalog=require('./performance-catalog.js'),{snapshotWriter}=require('./snapshot-writer.cjs');
const runtimeHelpers=require('./runtime-helpers.cjs'),{root,cfg}=runtimeHelpers.loadProductConfig(process.argv,__dirname,readJson),testOnly=process.argv.includes('--test-only'),smoke=process.argv.includes('--smoke');
const {FlightPacing}=require('./flight-pacing.cjs');
const {windowCoordinate}=require('./desktop-geometry.cjs');
if(!cfg)throw Error('PRODUCT_PACKAGE_REQUIRED');
if(cfg.stage&&!testOnly&&!process.argv.includes('--live-validation'))throw Error('STAGE_REQUIRES_TEST_MODE');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-device-scale-factor','1');app.commandLine.appendSwitch('disable-background-networking');app.setPath('userData',testOnly?path.join(root,'test-profile'):path.join(cfg.dataDir,'electron/profile'));
let lastIgnoreApply=0,speechCssHeight=null,speechLayout=null,lastUiDpi=96,panelReady=false,hitScale=1,previousHitScale=1,hitScaleAt=0;
function desktopDpi(){const value=native?.hostFrame?.().dpi;if(value)lastUiDpi=value;return lastUiDpi;}
let tooltipWindow,tooltipReady=false,tooltipCssSize=null,tooltipPointer=null,tooltipText=null,tooltipCharacterId=null,speechCssWidth=null;
let win,panel,sizeWindow,menuPopup,speechWindow,tray,native,product,director,scheduler,motion,input,cache,frameAdmission,hitState,dragHit,scenes,animation,timer,speech=null,speechTimer=null,closing=false,quitReady=false,owned=false,ignore=null,expected=344,menuOpen=false,staticMask=null,standingBody=null,display=null,lastRequested=null,lastStateKey=null,rendererReady=false,frames=0,lastFollow=0,lastProduct=0,lastPresence=0,lastDisplayRequest=null,lastAutoQuote=0,presenceWriter=null,touch=null,appearance={scope:'none',palette:appearanceRules.palette('')},appearanceKey='';
let captureActive=false,resizeCheckPending=false;
const stats={version:catalog.revision,at:Date.now(),errors:[],input:{accepted:0,rejected:0,watchdogReleases:0,freshPressRecoveries:0,lastReject:null},moves:0,frameUpdates:0,source:'product-electron',screenPresentationVerified:false,events:[]};
const diagnosticWriter=snapshotWriter(path.join(root,testOnly?'test-diagnostics.json':'diagnostics.json'));
const error=code=>{if(stats.errors.at(-1)!==code){if(stats.errors.length===64)stats.errors.shift();stats.errors.push(code);}};
process.on('uncaughtException',failure=>{
 // Electron's default Windows error box blocks the main loop. Exit through
 // the normal failure path so the installed supervisor can start a new pet.
 error('MAIN_UNCAUGHT_EXCEPTION');
 const frames=typeof failure?.stack==='string'?failure.stack.split('\n'):[];
 stats.mainException={phase:motion?.phase||'startup',frames:frames.map(line=>
  line.match(/[\\/]app[\\/]([\w.-]+\.(?:cjs|js):\d+:\d+)\)?$/)?.[1]).filter(Boolean).slice(0,6)};
 try{
  fs.writeFileSync(path.join(root,testOnly?'test-main-exception.json':'diagnostics-main-exception.json'),
   JSON.stringify({at:new Date().toISOString(),version:catalog.revision,code:'MAIN_UNCAUGHT_EXCEPTION',...stats.mainException})+'\n');
 }catch{}
 if(closing){app.exit(1);return;}
 close('failure').catch(()=>app.exit(1));
});
const event=(type,detail={})=>{if(stats.events.length===512)stats.events.shift();stats.events.push({type,at:Date.now(),...detail});};
const fileUrl=file=>pathToFileURL(file).href;
function valid(e){return !closing&&[win,panel,sizeWindow,speechWindow,tooltipWindow].some(w=>w&&!w.isDestroyed()&&e.sender===w.webContents);}
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
function protectOverlay(w){if(process.platform==='win32')w.setContentProtection(true);}
function sendState(){if(!product||!display)return;if(speech?.mode==='quota')speech.quota=product.snapshot().quota;const state=snapshot();for(const w of [win,panel,sizeWindow,speechWindow,tooltipWindow])if(w&&!w.isDestroyed())w.webContents.send('product-state',state);}
function snapshot(){const data=product.snapshot();const colorKey=JSON.stringify([data.prefs.colorMode,data.prefs.colorChance,data.prefs.colorTextChance,speech?.text]);if(colorKey!==appearanceKey){appearanceKey=colorKey;appearance={scope:appearanceRules.scope(data.prefs,speech?.mode==='quote'?speech.text:null,readJson(path.join(product.dataDir,'color-triggers.json'))?.quotes||['Token来，Token来']),palette:appearanceRules.palette(speech?.text||'')};}if(testOnly)data.audio.enabled=false;return {...data,display,appearance,version:catalog.revision,fontUrl:fileUrl(path.join(root,'assets/identity-hover/hover-font.ttf')),cursors:{grab:fileUrl(path.join(root,'assets/identity-hover/cursor-grab.cur')),grabbing:fileUrl(path.join(root,'assets/identity-hover/cursor-grabbing.cur'))},actions:catalog.selectable,characterName:characters().find(c=>c.id===product.prefs().characterId)?.name||'ChatGPT 傲娇龙娘',speech};}
function characters(){const rows=[{id:'gpt-dragon',name:'ChatGPT 傲娇龙娘',url:fileUrl(path.join(root,'assets/gpt-dragon-niang-bust.png'))}],personal=readJson(path.join(product.dataDir,'characters.json'));for(const c of personal?.characters||[]){if(!/^custom-[a-f0-9]{32}$/.test(c.id)||c.file!==c.id+'.png'||typeof c.name!=='string')continue;const file=path.join(product.dataDir,'characters',c.file);if(fs.existsSync(file))rows.push({id:c.id,name:c.name.slice(0,80),url:fileUrl(file)});}return rows;}
function imageMask(file,layout=null){const image=nativeImage.createFromPath(file);if(image.isEmpty())throw Error('CHARACTER_DECODE_FAILED');const size=image.getSize(),scale=layout?384*layout.width/size.width:Math.min(384/size.width,384/size.height),width=Math.max(1,Math.round(size.width*scale)),height=Math.max(1,Math.round(size.height*scale)),resized=image.resize({width,height,quality:'best'}),pixels=resized.toBitmap(),mask=Buffer.alloc(384*384/8),ox=Math.floor((384-width)/2),oy=Math.round(384*(layout?.feet||1))-height;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>10){const n=(oy+y)*384+ox+x;mask[n>>>3]|=1<<(n&7);}return mask;}
function desiredDisplay(){const p=product.prefs();if(p.characterId==='gpt-dragon'&&p.form==='full'&&p.dragonAnimationEnabled)return {mode:'full',url:null,key:'full'};let file=path.join(root,p.form==='bust'?'assets/pet-forms/frost-glass-cheek.png':'assets/frontidle.png');if(p.characterId!=='gpt-dragon'){const row=characters().find(c=>c.id===p.characterId);if(row)file=require('node:url').fileURLToPath(row.url);else error('CHARACTER_MISSING');}return {mode:'static',url:fileUrl(file),key:file,layout:p.characterId==='gpt-dragon'&&p.form==='bust'?{width:.62,feet:359/384}:null};}
function placementBody(){return display.mode==='static'?visibleFootprint(staticMask,0,1,null):standingBody;}
async function applyPreferences(previous=null){
 const p=product.prefs(),next=desiredDisplay(),changed=next.key!==display?.key;
 if(changed&&next.mode==='static')staticMask=imageMask(require('node:url').fileURLToPath(next.url),next.layout);display=next;
 const size=characterPixels(p.scale);if((changed||size!==expected)&&motion.phase!=='idle')input.cancel();
 if(size!==expected){const b=win.getBounds();expected=size;lockCharacterSize();moveOnly(win,placeAtFeet(b,size,screen.getDisplayMatching(b).workArea,placementBody()));lastRequested=null;if(!testOnly){const position=win.getBounds();product.settings.update({desktopCanvasPixels:size,...(!p.followHost?{desktopLeft:position.x,desktopTop:position.y}:{})});}}
 if(previous?.followHost&&!p.followHost){native.detach();const position=win.getBounds();product.settings.update({desktopLeft:position.x,desktopTop:position.y,desktopCanvasPixels:expected});}if(speech&&speechWindow&&!speechWindow.isDestroyed()&&previous&&(previous.bubbleScale!==p.bubbleScale||previous.desktopTopmost!==p.desktopTopmost)){showSpeech(speech.mode,speech.text);}
 if(win.isAlwaysOnTop()!==p.desktopTopmost)win.setAlwaysOnTop(p.desktopTopmost,'screen-saver');scheduler.reset();sendState();if(rendererReady&&changed){input.cancel();}
}
function configure(w){if(smoke)w.webContents.on('console-message',(_e,level,message,line)=>{if(level>=2){stats.smokeConsole??=[];if(stats.smokeConsole.length<12)stats.smokeConsole.push({message:String(message).slice(0,500),line});}});w.on('show',()=>event('window-show',{title:w.getTitle()}));w.on('page-title-updated',e=>e.preventDefault());w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('render-process-gone',()=>{if(w===win){error('RENDERER_GONE');close('failure');}});}
function loadWindow(w,file,options){
 w.loadFile(path.join(__dirname,file),options).catch(()=>{
  if(closing||w.isDestroyed())return;
  error('WINDOW_LOAD_FAILED:'+file);
  if(w===win)close('failure');
  else w.destroy();
 });
}
function openPanel(tab='settings'){if(panel&&!panel.isDestroyed()){if(!smoke&&panelReady){panel.show();panel.focus();}panel.webContents.send('product-notice',{tab});return;}const area=screen.getDisplayMatching(win.getBounds()).workArea,panelSize=panelLayout(area,desktopDpi());panelReady=false;panel=new BrowserWindow({title:'设置',width:panelSize.width,height:panelSize.height,x:area.x+Math.round((area.width-panelSize.width)/2),y:area.y+Math.round((area.height-panelSize.height)/2),minWidth:Math.min(740,panelSize.width),minHeight:Math.min(560,panelSize.height),show:false,backgroundColor:'#f7f4fb',autoHideMenuBar:true,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'product-preload.cjs')}});configure(panel);panel.webContents.once('dom-ready',()=>{panel.webContents.setZoomFactor(panelSize.zoom);stats.panelZoom=panelSize.zoom;});loadWindow(panel,'product-panel.html',{query:{tab}});panel.on('closed',()=>{panel=null;lastAutoQuote=Date.now();scheduler.reset();});}
function openSize(){if(sizeWindow&&!sizeWindow.isDestroyed()){if(!smoke){sizeWindow.show();sizeWindow.focus();}return;}const area=screen.getDisplayMatching(win.getBounds()).workArea,layout=sizeLayout(area,desktopDpi());sizeWindow=new BrowserWindow({title:'调整大小',width:layout.width,height:layout.height,x:area.x+Math.round((area.width-layout.width)/2),y:area.y+Math.round((area.height-layout.height)/2),useContentSize:true,resizable:false,maximizable:false,fullscreenable:false,show:false,backgroundColor:'#f8fbff',autoHideMenuBar:true,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'product-preload.cjs')}});configure(sizeWindow);sizeWindow.webContents.once('dom-ready',()=>{sizeWindow.webContents.setZoomFactor(layout.zoom);stats.sizeZoom=layout.zoom;});loadWindow(sizeWindow,'size-panel.html');sizeWindow.on('closed',()=>{sizeWindow=null;scheduler.reset();});}
function positionSpeech(){if(!speech||!speechWindow||speechWindow.isDestroyed()||!win||win.isDestroyed())return;const b=win.getBounds(),size=speechWindow.getSize(),area=screen.getDisplayMatching(b).workArea,point=speechPlacement(b,placementBody(),{width:size[0],height:size[1]},area,speechLayout.zoom);moveOnly(speechWindow,point);}
function resizeSpeech(){if(!speechWindow||speechWindow.isDestroyed()||!speechCssWidth||!speechCssHeight)return;speechWindow.setSize(Math.min(speechLayout.width,Math.ceil(speechCssWidth*speechLayout.zoom)),Math.min(speechLayout.maxHeight,Math.ceil(speechCssHeight*speechLayout.zoom)),false);positionSpeech();if(speech&&!smoke&&!captureActive)speechWindow.showInactive();}
function hideTooltip(){tooltipPointer=null;tooltipText=null;if(tooltipWindow&&!tooltipWindow.isDestroyed())tooltipWindow.hide();}
function positionTooltip(){if(!tooltipWindow||tooltipWindow.isDestroyed()||!tooltipPointer||!tooltipReady)return;const area=screen.getDisplayNearestPoint(tooltipPointer).workArea,size=tooltipWindow.getSize(),point=sharedUi.tooltipPlacement(tooltipPointer,{w:size[0],h:size[1]},{x:area.x,y:area.y,w:area.width,h:area.height},480*sharedUi.TOOLTIP_GAP_RATIO*uiZoom(desktopDpi())),b=tooltipWindow.getBounds();if(b.x!==windowCoordinate(point.x)||b.y!==windowCoordinate(point.y))moveOnly(tooltipWindow,point);if(!smoke&&!tooltipWindow.isVisible()){tooltipWindow.showInactive();tooltipWindow.moveTop();}}
function updateHover(pointer,inside){if(!hoverAllowed({inside,phase:motion.phase,menu:menuOpen,panel:panel?.isVisible(),sizePanel:sizeWindow?.isVisible(),visible:smoke||win.isVisible()})){hideTooltip();return false;}tooltipPointer=pointer;const id=product.prefs().characterId,name=tooltipText&&tooltipCharacterId===id?tooltipText:characters().find(c=>c.id===id)?.name||'ChatGPT 傲娇龙娘',zoom=uiZoom(desktopDpi());tooltipCharacterId=id;
 if(!tooltipWindow||tooltipWindow.isDestroyed()){tooltipReady=false;tooltipWindow=new BrowserWindow({parent:win,title:'人物名称',width:240,height:60,show:false,frame:false,transparent:true,hasShadow:false,focusable:false,skipTaskbar:true,alwaysOnTop:product.prefs().desktopTopmost,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'product-preload.cjs')}});configure(tooltipWindow);protectOverlay(tooltipWindow);tooltipWindow.setIgnoreMouseEvents(true);tooltipWindow.webContents.once('dom-ready',()=>tooltipWindow.webContents.setZoomFactor(zoom));loadWindow(tooltipWindow,'tooltip.html');}
 if(tooltipWindow.isAlwaysOnTop()!==product.prefs().desktopTopmost)tooltipWindow.setAlwaysOnTop(product.prefs().desktopTopmost,'floating');if(tooltipWindow.webContents.getZoomFactor()!==zoom){tooltipWindow.webContents.setZoomFactor(zoom);if(tooltipCssSize)tooltipWindow.setSize(Math.ceil(tooltipCssSize.width*zoom),Math.ceil(tooltipCssSize.height*zoom),false);}if(name!==tooltipText){tooltipText=name;tooltipWindow.webContents.send('product-state',snapshot());}positionTooltip();return true;}

function hideSpeech(){clearTimeout(speechTimer);speech=null;if(speechWindow&&!speechWindow.isDestroyed())speechWindow.hide();}
function showSpeech(mode,text=null){if(closing||captureActive||!win||win.isDestroyed())return;const p=product.prefs(),area=screen.getDisplayMatching(win.getBounds()).workArea;speechLayout=bubbleLayout(area,desktopDpi(),p.bubbleScale);if(mode==='completion'&&(p.quietUntil===-1||p.quietUntil>Date.now()))return;speech={mode,text:mode==='quote'?text||product.nextQuote():mode==='completion'?'Codex\n有回复已结束':text,quota:product.snapshot().quota};
 if(!speechWindow||speechWindow.isDestroyed()){speechCssHeight=null;speechCssWidth=null;speechWindow=new BrowserWindow({title:'文字卡片',width:speechLayout.width,height:Math.round(160*speechLayout.zoom),show:false,frame:false,transparent:true,hasShadow:false,focusable:true,skipTaskbar:true,alwaysOnTop:p.desktopTopmost,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'product-preload.cjs')}});configure(speechWindow);protectOverlay(speechWindow);speechWindow.webContents.once('dom-ready',()=>{speechWindow.webContents.setZoomFactor(speechLayout.zoom);stats.speechZoom=speechLayout.zoom;});loadWindow(speechWindow,'speech.html');speechWindow.once('ready-to-show',()=>{if(closing||!speechWindow||speechWindow.isDestroyed())return;speechWindow.setAlwaysOnTop(product.prefs().desktopTopmost,'floating');resizeSpeech();});}else{speechWindow.webContents.setZoomFactor(speechLayout.zoom);stats.speechZoom=speechLayout.zoom;speechWindow.webContents.send('product-notice',speech);resizeSpeech();}speechWindow.setAlwaysOnTop(p.desktopTopmost,'floating');speechWindow.setIgnoreMouseEvents(mode==='identity');clearTimeout(speechTimer);if(mode!=='identity')speechTimer=setTimeout(hideSpeech,mode==='quota'?18000:6500);lastAutoQuote=Date.now();sendState();}
function menuTemplate(){
 const p=product.prefs(),groups=new Map(),run=(kind,values={})=>()=>command({sender:win.webContents},{kind,...values});
 for(const row of catalog.selectable){if(!groups.has(row.group))groups.set(row.group,[]);groups.get(row.group).push({label:row.label,click:()=>director.manual(row.name)});}
 return [
  {label:'切换形态',click:run('preferences',{prefs:{},form:p.form==='full'?'bust':'full'})},
  {label:'调整大小',click:openSize},{type:'separator'},
  {label:'动作点播',enabled:display.mode==='full',submenu:[{label:'回到待机',click:()=>director.manual('idle')},...Array.from(groups,([label,submenu])=>({label,submenu}))]},
  {label:'陪伴模式',submenu:[['active','活泼'],['natural','自然'],['quiet','安静']].map(([idleRhythm,label])=>({label,type:'radio',checked:p.idleRhythm===idleRhythm,click:run('preferences',{prefs:{},idleRhythm})}))},
  {type:'separator'},{label:'更多设置',click:()=>openPanel('settings')},{label:'重载配置',click:()=>reloadConfiguration()},{label:'退出',click:()=>close('user')}
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
 menuPopup.open(menuTemplate(),point,monitor.workArea,uiZoom(monitor.scaleFactor*96),win.isVisible()?win:null);
}
function notice(message){for(const w of [panel,win])if(w&&!w.isDestroyed())w.webContents.send('product-notice',{message});}
function setIgnore(value,force=false){if(ignore===value&&!force||!win||win.isDestroyed())return;win.setIgnoreMouseEvents(value,{forward:true});ignore=value;lastIgnoreApply=Date.now();}
function overBody(pointer){if(!hitState.current)return false;const scales=Date.now()-hitScaleAt<120?[hitScale,previousHitScale]:[1];return scales.some(scale=>{const point=sourcePoint(pointer,win.getBounds(),scale);return dragHit.test(hitState.current,hitState.retained,point.x,point.y,expected);});}
function refreshPointerGate(pointer=screen.getCursorScreenPoint()){if(captureActive){setIgnore(true);return false;}const now=Date.now(),bounds=win.getBounds(),inside=overBody(pointer),within=pointer.x>=bounds.x&&pointer.y>=bounds.y&&pointer.x<bounds.x+bounds.width&&pointer.y<bounds.y+bounds.height,value=pointerGate.decide({inside,within,leftDown:!smoke&&native.leftDown(),dragging:motion?.phase==='drag',menu:menuOpen,now});setIgnore(value,!value&&now-lastIgnoreApply>1000);return inside;}
function pressHit(pointer,data){return overBody(pointer)||dragHit.presented(data?.presentation,data?.point,expected);}
function writePosition(p){const rounded={x:windowCoordinate(p.x),y:windowCoordinate(p.y)},key=rounded.x+','+rounded.y;if(key===lastRequested){const actual=win.getBounds();if(actual.x===rounded.x&&actual.y===rounded.y)return;}win.setPosition(rounded.x,rounded.y,false);lastRequested=key;stats.moves++;positionSpeech();}
function persistPosition(){let h=null,hostFailed=false;try{h=native?.hostFrame?.()??null;}catch{hostFailed=true;}try{const b=win.getBounds(),p=product.prefs();if(p.followHost&&(hostFailed||!h))error('POSITION_HOSTFRAME_UNAVAILABLE');if(p.followHost&&h?.found){const dpi=(h.dpi||96)/96;product.update({anchor:'free',left:(b.x-h.x)/dpi,right:(h.x+h.width-b.x-b.width)/dpi,bottom:(h.y+h.height-b.y-b.height)/dpi});}else product.settings.update({desktopLeft:b.x,desktopTop:b.y,desktopCanvasPixels:expected});}catch(failure){const message=String(failure?.message||failure).slice(0,120);error((['SETTINGS_CHANGED','PREFERENCES_CHANGED'].includes(message)?'POSITION_SAVE_CONFLICT':'POSITION_SAVE_FAILED')+':'+message);}}
async function command(e,data){if(!valid(e)||!data||typeof data.kind!=='string')throw Error('CALLER');try{switch(data.kind){
 case 'preferences':{const previous=product.prefs();product.savePreferences(data);await applyPreferences(previous);return snapshot();}
 case 'reload-preferences':product.reloadPreferences();sendState();return snapshot();
 case 'update-check':await product.checkUpdate('manual');sendState();return snapshot();
 case 'update-automatic':product.setUpdateAutomatic(data.enabled===true);sendState();return {ok:true};case 'open-external':if(!product.isAllowedReleaseUrl(data.url))throw Error('INVALID_RELEASE_URL');stats.openedExternalUrl=data.url;if(!testOnly)await shell.openExternal(data.url);return {ok:true,url:data.url};
 case 'refresh':await product.refresh();sendState();return snapshot();
 case 'observation':product.setObservationPaused(data.paused===true);sendState();return snapshot();
 case 'quiet':product.setExperience({quietUntil:data.until});hideSpeech();sendState();return snapshot();
 case 'action':return {ok:display.mode==='full'&&director.manual(data.name)};
 case 'quote':showSpeech('quote');return {ok:true};
 case 'triggers-read':return readJson(path.join(product.dataDir,'color-triggers.json'))?.quotes||['Token来，Token来'];
 case 'triggers-save':{if(!Array.isArray(data.rows)||data.rows.length>5000||data.rows.some(t=>typeof t!=='string'||t.length>200))throw Error('INVALID_TRIGGERS');const {SettingsStore}=require('./settings-store.cjs');new SettingsStore(path.join(product.dataDir,'color-triggers.json')).update({version:1,quotes:[...new Set(data.rows)]});appearanceKey='';sendState();return {ok:true};}
 case 'quotes-read':return product.quoteRows();
 case 'quotes-save':return product.saveQuotes(data.rows);
 case 'characters':return characters();
 case 'character-select':if(!characters().some(c=>c.id===data.id))throw Error('INVALID_CHARACTER');product.settings.update({characterId:data.id});await applyPreferences();return snapshot();
 case 'character-import':{const selected=await dialog.showOpenDialog(panel||win,{title:'导入本地形象',properties:['openFile'],filters:[{name:'PNG图片',extensions:['png']}]});if(selected.canceled)return {ok:false};const source=selected.filePaths[0];if(fs.statSync(source).size>20*1024*1024||nativeImage.createFromPath(source).isEmpty())throw Error('INVALID_CHARACTER');const id='custom-'+crypto.randomUUID().replaceAll('-',''),folder=path.join(product.dataDir,'characters'),file=id+'.png';fs.mkdirSync(folder,{recursive:true});fs.copyFileSync(source,path.join(folder,file));const {SettingsStore}=require('./settings-store.cjs'),store=new SettingsStore(path.join(product.dataDir,'characters.json'));store.update({version:1,characters:[...(store.value.characters||[]),{id,name:path.basename(source,'.png').slice(0,80),file}],removed:store.value.removed||[]});return {ok:true};}
 case 'audio-import':{if(!['press','release'].includes(data.slot))throw Error('INVALID_SLOT');const selected=await dialog.showOpenDialog(panel||win,{title:'导入5秒以内WAV短音效',properties:['openFile'],filters:[{name:'WAV音效',extensions:['wav']}]});if(selected.canceled)return {ok:false};const {normalizeWave}=await import(pathToFileURL(path.join(root,cfg.serviceRoot,'audio-import.mjs')).href),bytes=normalizeWave(fs.readFileSync(selected.filePaths[0])),file=crypto.randomUUID().replaceAll('-','')+'.wav',folder=path.join(product.dataDir,'sounds');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,file),bytes);product.audio.update({version:1,mode:'custom',[data.slot]:{file,name:path.basename(selected.filePaths[0]).slice(0,255)}});sendState();return {ok:true};}
 case 'audio-builtin':product.audio.update({version:1,mode:'builtin',press:null,release:null});sendState();return {ok:true};
 case 'panel-ready':if(e.sender!==panel?.webContents)throw Error('CALLER');panelReady=true;if(!smoke)panel.show();return {ok:true};
 case 'close-panel':panel?.close();return {ok:true};
 case 'settings':openPanel('settings');return {ok:true};
 case 'size':openSize();return {ok:true};
 case 'size-ready':if(e.sender!==sizeWindow?.webContents)throw Error('CALLER');if(!smoke){sizeWindow.show();sizeWindow.focus();}return {ok:true};
 case 'speech-size':if(e.sender!==speechWindow?.webContents)throw Error('CALLER');if(![data.width,data.height].every(n=>Number.isFinite(n)&&n>=1&&n<=10000))throw Error('INVALID_SIZE');speechCssWidth=data.width;speechCssHeight=data.height;resizeSpeech();return {ok:true};
 case 'tooltip-size':if(e.sender!==tooltipWindow?.webContents)throw Error('CALLER');if(![data.width,data.height].every(n=>Number.isFinite(n)&&n>=1&&n<=10000))throw Error('INVALID_SIZE');tooltipCssSize={width:data.width,height:data.height};{const zoom=uiZoom(desktopDpi());tooltipWindow.setSize(Math.ceil(data.width*zoom),Math.ceil(data.height*zoom),false);}tooltipReady=true;positionTooltip();return {ok:true};
 case 'speech-close':hideSpeech();return {ok:true};
 case 'speech-click':clickSequence.quote();showSpeech('quote');return {ok:true};
 case 'click-finished':if(!fromCharacter(e)||!director.matches(data.owner))return {ok:false};if(display.mode!=='static'&&product.prefs().dragonTouchEnabled){const response=touch.choose(data.point);if(response){director.manual('clip:'+response.clip);event('touch',response);}}return {ok:true};
 default:throw Error('UNKNOWN_COMMAND');
 }}catch(failure){const conflict=failure.message==='PREFERENCES_CHANGED'||failure.message==='SETTINGS_CHANGED';notice(conflict?'设置已在别处修改，输入已保留。请先重新读取再保存。':'操作未能完成，请重新读取并核对设置。');return {error:conflict?'PREFERENCES_CHANGED':'ACTION_FAILED'};}}
async function close(reason='normal'){if(closing)return;closing=true;const exitCode=reason==='failure'?1:0,closeStarted=Date.now(),mark=step=>{(stats.closeTimings??=[]).push({step,ms:Date.now()-closeStarted});};
 // Last-resort exit: a stalled close step must not leave a smoke or user process running.
 setTimeout(()=>{stats.closeTimedOut=true;mark('fallback-exit');try{fs.writeFileSync(path.join(root,testOnly?'product-test-status.json':'last-exit.json'),JSON.stringify({...stats,reason,at:Date.now()},null,2));}catch{}process.exit(exitCode);},10000);
 await new Promise(setImmediate);clearInterval(timer);clearTimeout(speechTimer);native?.detach?.();menuPopup?.close();for(const w of [panel,sizeWindow,speechWindow,tooltipWindow,win])if(w&&!w.isDestroyed())w.destroy();tray?.destroy();mark('windows');await product?.close();mark('product');await Promise.allSettled([presenceWriter?.flush(),diagnosticWriter.flush()]);mark('flush');if(!testOnly&&product){for(const name of ['presence.json','runtime.json']){const file=path.join(product.dataDir,name);if(readJson(file)?.pid===process.pid){try{fs.unlinkSync(file);}catch{}}}}if(owned)native.release();try{fs.writeFileSync(path.join(root,testOnly?'product-test-status.json':'last-exit.json'),JSON.stringify({...stats,reason,at:Date.now()},null,2));if(!testOnly){if(reason==='user')fs.writeFileSync(path.join(product.dataDir,'supervisor-pause.json'),JSON.stringify({desktop:true,at:new Date().toISOString()}));}}catch{}quitReady=true;process.exit(exitCode);}
app.on('before-quit',e=>{if(!quitReady){e.preventDefault();close('normal');}});
app.whenReady().then(async()=>{
 const build=readJson(path.join(root,cfg.nativeRoot,'build.json')),binary=path.join(root,cfg.nativeRoot,'native-lease.node');if(sha(binary)!==build.binarySha256)throw Error('NATIVE_HASH');native=require(binary);
 const canonical=path.win32.normalize(cfg.compatRoot),key=testOnly?'Local\\GPTNiangProductTest_'+crypto.randomUUID():'Local\\GPTNiangUsage_'+Buffer.from(canonical).toString('base64').replaceAll('/','_').replaceAll('+','-');owned=native.tryAcquire(key);if(!owned){quitReady=true;app.quit();return;}
 const dataDir=testOnly?path.join(root,'test-state'):cfg.dataDir;fs.mkdirSync(dataDir,{recursive:true});if(testOnly)runtimeHelpers.ensureTestStateSeed(dataDir);product=new ProductHost({root,dataDir,serviceRoot:path.join(root,cfg.serviceRoot),configPath:path.join(root,'installation.json'),compatRoot:cfg.compatRoot,testOnly,onCompletion:()=>{showSpeech('completion');},onReleaseNotice:info=>{showSpeech('release',info.text);}});presenceWriter=snapshotWriter(path.join(dataDir,'presence.json'));
 animation=readJson(path.join(root,'animation.json'));catalog.configure(animation);touch=new TouchResponses(animation);scenes=readJson(path.join(root,'scenes.json'));for(const c of Object.values(scenes.clips))c.url=fileUrl(path.join(root,c.file));cache=new HitCache(root,readJson(path.join(root,'hit-masks.json')).entries);hitState=new PresentationHit();dragHit=new DragHit({mask:name=>name==='static'?staticMask:cache.get(name)});display=desiredDisplay();if(display.mode==='static')staticMask=imageMask(require('node:url').fileURLToPath(display.url),display.layout);standingBody=visibleFootprint(await cache.load('frontidle'),0);
 const prefs=product.prefs(),d=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());expected=characterPixels(prefs.scale);
 const saved=product.settings.value.desktopCanvasPixels,oldSize=Number.isFinite(saved)&&saved>=100&&saved<=1500?saved:canvasPixels(300*prefs.scale/1.4),prior={x:prefs.desktopLeft??d.workArea.x+d.workArea.width-oldSize-60,y:prefs.desktopTop??d.workArea.y+d.workArea.height-oldSize-30,width:oldSize,height:oldSize},placement=placeAtFeet(prior,expected,screen.getDisplayMatching(prior).workArea,placementBody());
 win=new BrowserWindow({title:'桌宠',width:expected,height:expected,x:placement.x,y:placement.y,useContentSize:true,frame:false,transparent:true,backgroundColor:'#00000000',show:false,hasShadow:false,resizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,focusable:true,webPreferences:{offscreen:smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'desktop-preload.cjs')}});lockCharacterSize();win.setAlwaysOnTop(prefs.desktopTopmost,'screen-saver');configure(win);protectOverlay(win);
 for(const name of ['resize','maximize','enter-full-screen'])win.on(name,queueSizeRepair);
 win.on('hide',()=>{menuPopup?.close();hideSpeech();hideTooltip();});win.on('closed',()=>close('user'));if(!testOnly&&saved!==expected)product.settings.update({desktopCanvasPixels:expected,...(!prefs.followHost?{desktopLeft:placement.x,desktopTop:placement.y}:{})});
 session.defaultSession.webRequest.onBeforeRequest((details,reply)=>reply({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('data:')}));session.defaultSession.setPermissionRequestHandler((_w,_p,reply)=>reply(false));
 const send=async action=>{try{const plan=display.mode==='static'?[]:catalog.plan(action.name,scenes.clips,{fromPose:action.fromPose});for(const step of plan)await cache.load(step.clip);if(closing||director.current!==action)return;win.webContents.send('desktop-action',action);event('performance',{name:action.name,origin:action.origin,requestId:action.requestId});}catch{error('MEDIA_PLAN_FAILED');director.mediaError(action);}};
 director=new PerformanceDirector(send);scheduler=new ProductScheduler({director});frameAdmission=new FrameAdmission({cache,owns:d=>!closing&&director.matches(d),retained:()=>[hitState.current?.clip,hitState.retained?.clip,...dragHit.clips()].filter(Boolean),onError:()=>error('HIT_MASK_LOAD_FAILED'),accept:data=>{hitState.update(data);dragHit.record(data);cache.pin([hitState.current?.clip,hitState.retained?.clip,...dragHit.clips()]);if(!smoke&&motion.phase!=='drag')refreshPointerGate();director.present(data);scheduler.present(data);frames++;stats.frameUpdates++;if(testOnly&&process.argv.includes('--test-crash')&&frames===5)setTimeout(()=>win.webContents.forcefullyCrashRenderer(),20);stats.currentFrame={clip:data.clip,frame:data.frame,visible:data.visible,requestId:data.requestId};showWhenReady();}});
 motion=new Motion(e=>{if(e.type==='rested')writePosition(e.position);if(display.mode!=='static'||e.type!=='qualified')director.motion(e);if(e.type==='grab'){native.detach();scheduler.reset();hideSpeech();}if(e.type==='release'&&!e.moved&&!e.thrown)showClickCard();if(e.type==='release'&&e.thrown)flightPacing.start(performance.now());if(['grab','cancel','release','rested'].includes(e.type))win.webContents.send('desktop-transport',{phase:e.type==='grab'?'drag':e.type==='release'&&e.thrown?'flight':'idle',serial:motion.serial,gesture:e.gesture??motion.gesture});if(e.type==='rested'||e.type==='release'&&!e.thrown||e.type==='cancel'&&e.previousPhase!=='idle')persistPosition();});
 input=new InputDriver({motion,bounds:()=>win.getBounds(),hit:pressHit,write:writePosition,raise:()=>{if(!smoke)win.moveTop();setIgnore(false);},observe:data=>{if(data.kind==='begin')stats.input.accepted++;if(data.kind==='rejected-begin'){stats.input.rejected++;stats.input.lastReject=data.reason;}if(data.kind==='watchdog-release')stats.input.watchdogReleases++;if(data.kind==='fresh-press-recovery')stats.input.freshPressRecoveries++;}});
 menuPopup=new (require('./menu-popup.cjs').MenuPopup)({BrowserWindow,ipcMain,root:__dirname,smoke,protect:protectOverlay,onClose:()=>{menuOpen=false;scheduler.reset();}});
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
 win.once('ready-to-show',()=>{win.setAlwaysOnTop(product.prefs().desktopTopmost,'screen-saver');stats.windowReady=true;showWhenReady();});function showWhenReady(){if(smoke||closing||captureActive||!stats.windowReady||!stats.staticReady&&frames<3||win.isVisible())return;if(product.prefs().followHost&&!native.hostFrame().visible)return;win.showInactive();event('shown');}
 if(!smoke){tray=new Tray(nativeImage.createFromPath(path.join(root,'assets/gpt-dragon-niang-bust.png')).resize({width:24,height:24}));tray.setToolTip('桌宠');tray.on('click',popup);tray.on('right-click',popup);}
 product.start().catch(()=>{product.note('OBSERVERS_START_FAILED');notice('任务观察暂不可用，人物与设置仍可使用。');});loadWindow(win,'desktop.html');const started=Date.now();
 if(testOnly&&process.argv.includes('--test-main-error'))setImmediate(()=>{throw Error('TEST_MAIN_FAILURE');});
 let lastCaptureCheck=0;
 timer=setInterval(()=>{
  if(closing||win.isDestroyed())return;
  const now=Date.now();
  if(motion.phase==='flight'&&flightPacing.fallback(performance.now()))stats.flightPacing.fallbackSteps++;
  if(!smoke&&now-lastCaptureCheck>=80){
   lastCaptureCheck=now;
   const active=native.captureActive?.()===true;
   if(active!==captureActive){
    captureActive=active;
    if(active){
     if(motion.phase==='drag')input.cancel();
     menuPopup.close();hideSpeech();hideTooltip();setIgnore(true);win.hide();
    }else showWhenReady();
   }
  }
  if(motion.phase==='drag'&&!smoke)input.recover(screen.getCursorScreenPoint(),native.leftDown(),now);
  const pointer=screen.getCursorScreenPoint(),inside=refreshPointerGate(pointer);
  if(!smoke&&!captureActive)updateHover(pointer,inside);
  if(now-lastProduct>=500){lastProduct=now;const state=product.tick(),key=JSON.stringify(state);if(key!==lastStateKey){lastStateKey=key;sendState();}const selection=scheduler.tick(state,{blocked:menuOpen||motion.phase!=='idle'||panel?.isVisible()||sizeWindow?.isVisible()||!rendererReady,clips:scenes.clips});if(selection){stats.companion={...selection,at:now};event('companion-selection',selection);}if(state.prefs.autoQuoteEnabled&&(state.prefs.form!=='bust'||state.prefs.autoBubble)&&!speech&&!menuOpen&&!panel?.isVisible()&&!sizeWindow?.isVisible()&&motion.phase==='idle'&&now-lastAutoQuote>state.prefs.autoQuoteIntervalSeconds*1000&&now-started>30000&&state.prefs.quietUntil!==-1&&state.prefs.quietUntil<=now){showSpeech('quote');}}
  if(now-lastFollow>=100){lastFollow=now;const p=product.prefs();if(p.followHost&&motion.phase==='idle'&&!smoke&&!captureActive){const h=native.hostFrame();if(h.found){if(h.visible){if(!win.isVisible()&&(frames>=3||stats.staticReady))win.showInactive();const dpi=(h.dpi||96)/96,handle=Number(win.getNativeWindowHandle().readBigUInt64LE());native.follow(handle,h.handle,expected,expected,p.left*dpi,p.right*dpi,p.bottom*dpi,p.anchor==='right'?0:p.anchor==='left'?1:2,0);}else{win.hide();hideSpeech();}}else{native.detach();win.hide();hideSpeech();}}else native.detach();positionSpeech();}
  if(now-lastPresence>=1000){lastPresence=now;diagnosticWriter.write({version:catalog.revision,pid:process.pid,at:now,errors:stats.errors,input:{...stats.input,activeGesture:input.active},rendererInput:stats.rendererInput,clickThrough:ignore,menuOpen,hitReady:!!hitState.current&&!!(hitState.current.clip==='static'?staticMask:cache.get(hitState.current.clip)),moves:stats.moves,frameUpdates:stats.frameUpdates,frame:stats.currentFrame,motion:motion.phase,visible:win.isVisible(),focusable:win.isFocusable(),focused:win.isFocused(),companion:stats.companion,collision:stats.collision,automaticPool:catalog.automatic.length,size:win.getSize(),processes:app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,cpu:p.cpu,memory:p.memory})),screenPresentationVerified:false}).catch(()=>{});repairCharacterSize();if(!testOnly){const handle=Number(win.getNativeWindowHandle().readBigUInt64LE()),presence={pid:process.pid,widget:handle,at:now,visible:win.isVisible(),character:{id:product.prefs().characterId,galleryOpen:!!panel?.isVisible()},dragonMotion:{form:product.prefs().form,phase:product.task.phase,clip:hitState.current?.clip,presentedFrames:stats.frameUpdates,manifestVersion:catalog.revision},motion:{active:motion.phase!=='idle',dragging:motion.phase==='drag',flying:motion.phase==='flight'},scene:{open:!!speech},music:{enabled:false},sound:{press:{configured:false,active:false},release:{configured:false,active:false}},renderer:'electron'};presenceWriter.write(presence).catch(()=>error('PRESENCE_WRITE_FAILED'));if(!stats.runtimeWritten){fs.writeFileSync(path.join(dataDir,'runtime.json.tmp'),JSON.stringify({pid:process.pid,widget:handle,startedAt:new Date(started).toISOString(),renderer:'electron',version:catalog.revision,appDir:root}));fs.renameSync(path.join(dataDir,'runtime.json.tmp'),path.join(dataDir,'runtime.json'));stats.runtimeWritten=true;}const stop=path.join(dataDir,'stop.flag');if(fs.existsSync(stop)&&fs.statSync(stop).mtimeMs>=started-1000)close('stop');const request=readJson(path.join(dataDir,'display-request.json'));if(request?.nonce&&request.nonce!==lastDisplayRequest){lastDisplayRequest=request.nonce;if(now-request.at<30000){if(request.mode==='quota')showSpeech('quota');else if(request.mode==='quote')showSpeech('quote');else if(request.mode==='menu')openPanel('settings');else if(request.mode==='size')openSize();else if(request.mode==='characters')openPanel('characters');else if(request.mode==='close-menu')panel?.hide();}}}}
 },16);
 if(smoke)require(process.argv.includes('--bubble-smoke')?'./bubble-smoke.cjs':'./product-smoke.cjs').run({win,product,director,scheduler,motion,stats,root,openPanel,applyPreferences,snapshot,command,close,cache,hitTest:overBody,menuTemplate,openSize,popup,menuPopup,input,showSpeech,collisionBody,flightBounds,stepFlight,flightPacing,writePosition,getDisplays:()=>displays,updateHover,hideTooltip,positionSpeech,hoverState:()=>({active:!!tooltipPointer,ready:tooltipReady})}).catch(()=>{error('SMOKE_FAILED');close('failure');});
}).catch(()=>{error('PRODUCT_INIT_FAILED');close('failure');});
