'use strict';
// Hidden software-composited media test, no desktop input or visible pet.
const {app,BrowserWindow,ipcMain,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {read,acquire}=require('./video-visibility.cjs');
const root=path.resolve(process.argv[2]),label=process.argv[3]||'transition';
if(!/^[a-z-]+$/.test(label))throw new Error('LABEL');
app.disableHardwareAcceleration();app.setPath('userData',path.join(root,'probe-profile'));app.commandLine.appendSwitch('disable-background-networking');
let win,lease,established=false,finished=false;
const report={label,visibleWindow:false,paints:[],blankPaints:0};
function finish(data){if(finished)return;finished=true;Object.assign(report,data);const start=data.events?.[0]?.at;report.transitionBlankPaints=Number.isFinite(start)?report.paints.filter(p=>p.at>=start&&p.visible===0).length:null;report.startupBlankPaints=report.transitionBlankPaints===null?null:report.blankPaints-report.transitionBlankPaints;fs.writeFileSync(path.join(root,label+'.json'),JSON.stringify(report,null,2));lease?.release();app.exit(data.error?1:0);}
app.whenReady().then(()=>{
 lease=acquire(root,{synthetic:true});
 const scenes=read(path.join(root,'scenes.json'));for(const c of Object.values(scenes.clips))c.url=pathToFileURL(path.join(root,c.file)).href;
 session.defaultSession.webRequest.onBeforeRequest((d,reply)=>reply({cancel:!d.url.startsWith('file:')}));
 win=new BrowserWindow({width:344,height:344,show:false,frame:false,transparent:true,backgroundColor:'#00000000',webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'electron-preload.cjs')}});
 win.webContents.on('paint',(_e,_dirty,image)=>{const pixels=image.toBitmap();let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>10)visible++;if(visible>100)established=true;if(established&&visible===0)report.blankPaints++;if(report.paints.length<4096)report.paints.push({at:Date.now(),visible});});
 ipcMain.handle('probe-config',()=>scenes);
 ipcMain.on('probe-result',(_e,data)=>finish(data));
 win.webContents.setFrameRate(60);win.loadFile(label.startsWith('baseline')?path.join(root,'probe-before.html'):path.join(__dirname,label.startsWith('release')?'probe-release.html':'probe-transitions.html'));setTimeout(()=>finish({error:'TIMEOUT'}),20000).unref();
}).catch(e=>finish({error:e.message}));
