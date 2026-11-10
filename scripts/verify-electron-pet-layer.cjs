'use strict';
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {raiseOnInteraction,shouldReassertTopmost}=require('../app/electron-helper/topmost-watchdog');
const out=path.resolve(process.argv[2]);
if(!out.startsWith(path.resolve(__dirname,'../work')+path.sep))throw Error('Layer test must be in work/');
fs.mkdirSync(out,{recursive:true});
app.setPath('userData',path.join(out,'layer-profile'));
function inspect(a,b){
 const script=`
 Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PetZ {
 [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint cmd);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int idx);
}
'@
 $a=[IntPtr]${a};$b=[IntPtr]${b};$front=''
 for($h=[PetZ]::GetTopWindow([IntPtr]::Zero); $h -ne [IntPtr]::Zero; $h=[PetZ]::GetWindow($h,2)){
  if($h -eq $a){$front='deepseek';break};if($h -eq $b){$front='gpt';break}
 }
 @{front=$front;deepseekTopmost=([PetZ]::GetWindowLong($a,-20) -band 8)-ne 0;gptTopmost=([PetZ]::GetWindowLong($b,-20) -band 8)-ne 0}|ConvertTo-Json -Compress
 `;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:10000});
 if(result.status!==0)throw Error(result.stderr||'Native order probe failed');
 return JSON.parse(result.stdout);
}
app.whenReady().then(async()=>{
 const make=()=>new BrowserWindow({show:false,x:32,y:32,width:56,height:56,frame:false,transparent:true,opacity:0,skipTaskbar:true,focusable:false});
 const ds=make(),gpt=make(),id=w=>w.getNativeWindowHandle().readBigUInt64LE().toString(),a=id(ds),b=id(gpt),steps=[];
 const record=(step,expected)=>{const state=inspect(a,b);steps.push({step,...state});assert.equal(state.front,expected);assert(state.deepseekTopmost&&state.gptTopmost);};
 for(const w of [ds,gpt]){w.setAlwaysOnTop(true,'screen-saver');w.showInactive();}
 gpt.moveTop();record('GPT grab','gpt');
 assert(raiseOnInteraction(ds,false,true));record('DeepSeek grab','deepseek');
 await new Promise(r=>setTimeout(r,5100));
 assert(!shouldReassertTopmost({nowMs:6000,lastAssertMs:0,visible:true,alwaysOnTop:ds.isAlwaysOnTop()}));
 record('DeepSeek stays in front after idle watchdog interval','deepseek');
 gpt.moveTop();record('GPT can grab front again','gpt');
 fs.writeFileSync(path.join(out,'native-layer-proof.json'),JSON.stringify({ok:true,steps},null,2));
 console.log(JSON.stringify({ok:true,steps}));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
