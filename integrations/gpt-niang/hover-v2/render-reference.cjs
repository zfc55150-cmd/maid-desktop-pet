const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
const ctx={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../../app/electron-helper/shared-core.js'),'utf8'),ctx);
app.commandLine.appendSwitch('force-device-scale-factor','2');
app.setPath('userData',path.resolve(__dirname,'../../../work/gpt-hover-reference-profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:260,height:95,show:false,useContentSize:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
 const font=pathToFileURL(path.join(__dirname,'assets/hover-font.ttf')).href;
 const html=`<!doctype html><meta charset="utf-8"><style>@font-face{font-family:ShangshouSoftCandy;src:url('${font}')}html,body{margin:0;background:#eceff3;--dsh-pet-size:462px}${ctx.PetShared.TOOLTIP_CSS}.pet-tooltip{left:65px!important;top:30px!important;transition:none!important}</style><div class="pet-tooltip is-on">GPT娘</div>`;
 const input=path.join(__dirname,'reference.html');fs.writeFileSync(input,html);
 await win.loadFile(input);await win.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
 const shot=await win.webContents.capturePage();fs.writeFileSync(path.join(__dirname,'deepseek-css-reference.png'),shot.toPNG());
 console.log(JSON.stringify({ok:true,reference:'Original TOOLTIP_CSS and font',size:shot.getSize()}));win.destroy();app.quit();
}).catch(e=>{console.error(e.message);app.exit(1)});
