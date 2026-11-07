'use strict';
const {app,BrowserWindow,ipcMain,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {acquire,read}=require('./video-visibility.cjs');
const {spawn}=require('node:child_process');
const {launch:restoreOfficial}=require('./restore-widget.cjs');
const root=path.resolve(process.argv[2]||''),probe=process.argv.includes('--probe'),smoke=process.argv.includes('--smoke');
const managedArg=process.argv.find(x=>x.startsWith('--managed='));const managed=managedArg?path.resolve(managedArg.slice(10)):null;
if(managed&&!managed.startsWith(root+path.sep))throw new Error('MANAGED_SESSION_SCOPE');
app.setPath('userData',path.join(root,'video-review-profile'));app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-background-networking');
let lease,win,last={},restored=false;
function restore(){if(!managed||restored)return;const state=read(path.join(managed,'controller.json'));if(!state.needsRestore)return;restored=true;
 try{if(state.controllerPid){process.kill(state.controllerPid,0);return;}}catch{}
 restoreOfficial(lease.baseline);
}
app.whenReady().then(async()=>{
 lease=acquire(root,{synthetic:smoke});
 if(managed){fs.writeFileSync(path.join(managed,'candidate-ready.json'),JSON.stringify({pid:process.pid,at:Date.now()}));const deadline=Date.now()+15000;while(!lease.owned&&Date.now()<deadline){await new Promise(r=>setTimeout(r,20));lease.tryAgain();}}
 if(probe||!lease.owned){fs.writeFileSync(path.join(root,'video-visibility-probe.json'),JSON.stringify({ok:true,productionMutexBusy:!lease.owned,candidateWindowOpened:false,nativeLeaseInElectron:true,keySha256:lease.keySha256},null,2));lease.release();app.quit();return;}
 session.defaultSession.webRequest.onBeforeRequest((d,reply)=>reply({cancel:!d.url.startsWith('file:')}));session.defaultSession.setPermissionRequestHandler((_w,_p,reply)=>reply(false));
 win=new BrowserWindow({width:560,height:640,show:false,backgroundColor:'#292633',webPreferences:{offscreen:smoke,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,preload:path.join(__dirname,'electron-preload.cjs')}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 ipcMain.handle('probe-config',event=>{if(event.sender!==win.webContents)throw new Error('CALLER');const scenes=read(path.join(root,'scenes.json'));for(const c of Object.values(scenes.clips))c.url=pathToFileURL(path.join(root,c.file)).href;return {...scenes,smoke,targetHeight:300};});
 const save=()=>fs.writeFileSync(path.join(root,'video-review-session.json'),JSON.stringify({at:new Date().toISOString(),...last,mode:smoke?'offscreen-review-smoke':'ordinary-review-window',screenPresentationVerified:false,artworkAccepted:false},null,2));
 ipcMain.on('probe-result',(event,data)=>{if(event.sender!==win.webContents)return;last=data;save();if(smoke)win.close();});
 win.on('closed',()=>{save();lease.release();restore();app.quit();});
 win.loadFile(path.join(__dirname,'review-video.html'));
 if(!smoke)win.once('ready-to-show',()=>{win.showInactive();if(managed)fs.writeFileSync(path.join(managed,'candidate-visible.json'),JSON.stringify({pid:process.pid,visible:win.isVisible(),at:Date.now(),leaseOwned:lease.owned,keySha256:lease.keySha256}));});
 if(smoke)setTimeout(()=>{last={ok:false,error:'SMOKE_TIMEOUT'};win.close();},12000).unref();
 if(managed)setTimeout(()=>{if(win&&!win.isDestroyed())win.close();},300000).unref();
}).catch(error=>{fs.writeFileSync(path.join(root,'video-review-error.json'),JSON.stringify({ok:false,error:error.message}));if(win&&!win.isDestroyed())win.destroy();lease?.release();app.quit();});
app.on('before-quit',()=>{if(win&&!win.isDestroyed())win.destroy();lease?.release();if(lease)restore();});
