const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {shouldReassertTopmost,raiseOnInteraction}=require('../app/electron-helper/topmost-watchdog');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/pet-layer-order-20261020/native-test');
fs.mkdirSync(out,{recursive:true});app.disableHardwareAcceleration();
app.whenReady().then(()=>{
 const win=new BrowserWindow({title:'Isolated DeepSeek pet layer regression',width:100,height:100,show:false,opacity:0,frame:false,focusable:false,webPreferences:{sandbox:true}});
 win.showInactive();win.setAlwaysOnTop(true,'screen-saver');
 const handle=win.getNativeWindowHandle().readBigUInt64LE().toString();
 let last=Date.now(),requestId=null;
 const timer=setInterval(()=>{
  const now=Date.now();
  if(shouldReassertTopmost({nowMs:now,lastAssertMs:last,destroyed:win.isDestroyed(),visible:win.isVisible(),paused:false,alwaysOnTop:win.isAlwaysOnTop()})){last=now;win.setAlwaysOnTop(true,'screen-saver');}
  try{
   const request=JSON.parse(fs.readFileSync(path.join(out,'request.json'),'utf8').replace(/^\uFEFF/,''));
   if(request.id===requestId)return;requestId=request.id;
   const ok=request.command==='interact'&&raiseOnInteraction(win,false,true);
   fs.writeFileSync(path.join(out,'response.json'),JSON.stringify({id:request.id,ok}));
  }catch{}
 },100);
 const ps=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(root,'integrations/gpt-niang/test-layer-order.ps1'),'-WidgetPath',path.join(root,'work/pet-layer-order-20261020/widget.ps1'),'-HostLayerPath',path.join(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'),'Programs/GPTNiangUsage/gpt-niang-usage/runtime/host-layer.ps1'),'-WorkDir',out,'-ElectronHandle',handle],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';ps.stdout.on('data',b=>{output+=b});ps.stderr.on('data',b=>{output+=b});
 const timeout=setTimeout(()=>{ps.kill();app.exit(2)},25000);
 ps.on('error',error=>{console.error(error.message);app.exit(1)});
 ps.on('exit',code=>{clearTimeout(timeout);clearInterval(timer);fs.writeFileSync(path.join(out,'process-output.txt'),output);let result;try{result=JSON.parse(fs.readFileSync(path.join(out,'native-result.json'),'utf8').replace(/^\uFEFF/,''));}catch{result={ok:false,code}}console.log(JSON.stringify(result));app.exit(result.ok?0:1)});
}).catch(error=>{console.error(error);app.exit(1)});
