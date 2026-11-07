'use strict';
// Offscreen media smoke only. No desktop pet window or production integration.
const {app,BrowserWindow,ipcMain,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(process.argv[2]||'');
const sequenceMode=process.argv.includes('--sequence');
if(!fs.existsSync(path.join(root,'encoding-control.json')))throw new Error('Frozen encoding control required');
const profile=path.join(root,'electron-probe-profile');
app.setPath('userData',profile);app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
let win,paints=0,finished=false;
async function finish(data){if(finished)return;finished=true;
 const report={...data,mode:'offscreen-smoke',paintEvents:paints,electron:process.versions.electron,chrome:process.versions.chrome,gpuFeatures:app.getGPUFeatureStatus(),processes:app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu,memory:p.memory})),screenPresentationVerified:false,inputLatencyVerified:false,artworkAccepted:false};
 fs.writeFileSync(path.join(root,sequenceMode?'electron-sequence-verification.json':'electron-verification.json'),JSON.stringify(report,null,2));
 if(win&&!win.isDestroyed())win.destroy();app.quit();
}
app.whenReady().then(()=>{
 session.defaultSession.webRequest.onBeforeRequest((details,reply)=>reply({cancel:!details.url.startsWith('file:')}));
 session.defaultSession.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
 win=new BrowserWindow({show:false,width:384,height:384,transparent:true,frame:false,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'electron-preload.cjs')}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('paint',()=>paints++);
 ipcMain.on('probe-result',(event,data)=>{if(event.sender===win.webContents)finish(data);});
 ipcMain.handle('probe-config',event=>{
  if(event.sender!==win.webContents)throw new Error('CALLER');
  const scenes=JSON.parse(fs.readFileSync(path.join(root,'scenes.json'),'utf8'));
  for(const [name,clip]of Object.entries(scenes.clips))clip.url=pathToFileURL(path.join(root,clip.file)).href;
  return scenes;
 });
 win.loadFile(path.join(__dirname,sequenceMode?'electron-sequence.html':'electron-probe.html'),{query:{video:path.join(root,'frontidle-control.webm')}});
 setTimeout(()=>finish({ok:false,error:'PROBE_TIMEOUT'}),sequenceMode?45000:15000).unref();
}).catch(error=>finish({ok:false,error:error.code||error.name}));
