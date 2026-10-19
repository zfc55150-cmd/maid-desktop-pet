const electron=require('electron');
const {app,BrowserWindow}=electron;
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),helper=path.join(root,'app/electron-helper');
const out=path.join(root,'work/electron-smoke');fs.mkdirSync(out,{recursive:true});
app.setPath('userData',path.join(out,'profile'));
process.env.DSH_HOME=path.join(out,'data');
const {ChatService}=require(helper+'/simple-chat-service');
const dir=path.join(process.env.DSH_HOME,'simple-chat');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'chat.json'),JSON.stringify({prompt:'用于检查排版的测试人设。',memory:'测试偏好：喜欢简洁的中文回复。',voiceEnabled:false,messages:[{role:'user',content:'这是一条测试消息。'},{role:'assistant',content:'你好，我在这里陪你。'}]}));
const service=new ChatService({dir,secrets:{},requireExisting:true,fetchImpl:()=>{throw new Error('Network must not be used in this test');}});
const settings=[];let clipboardText='';const checks=[];
class HiddenWindow extends BrowserWindow{constructor(options){super({...options,show:false});settings.push(this);}}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitJS(win,code){for(let i=0;i<80;i++){if(!win.isDestroyed()){try{if(await win.webContents.executeJavaScript(code))return;}catch{}}await pause(50);}throw new Error('Renderer timeout: '+code);}
const watchdog=setTimeout(()=>{console.error('Smoke timeout');app.exit(2);},25000);
app.whenReady().then(async()=>{
 const pet=new BrowserWindow({show:false,width:800,height:600,webPreferences:{preload:path.join(helper,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const speech={current:null,status:()=> 'off',voiceSettings:()=>({voiceModel:'base'}),stop(){},dispose(){}};
 require(helper+'/simple-chat-main')({...electron,BrowserWindow:HiddenWindow,clipboard:{writeText:text=>clipboardText=text}},new Map([['main',pet]]),{service,speech});
 await pet.loadFile(path.join(helper,'index.html'));
 const state=await pet.webContents.executeJavaScript('window.petBridge.chatState()');assert.equal(state.ok,true);assert.equal(state.data.messages.length,2);checks.push('sandboxed pet preload and IPC');
 assert.equal(await pet.webContents.executeJavaScript('typeof require'),'undefined');checks.push('renderer has no Node require');
 assert.equal((await pet.webContents.executeJavaScript('window.petBridge.chatOpenSettings()')).ok,true);
 const win=settings[0];await waitJS(win,"document.getElementById('save') && !document.getElementById('save').disabled");
 assert.equal(win.webContents.getLastWebPreferences().sandbox,true);
 const page=await win.webContents.executeJavaScript("({memory:document.getElementById('memory').value,history:document.getElementById('history').value,overflow:document.documentElement.scrollWidth>innerWidth})");
 assert.match(page.memory,/测试偏好/);assert.match(page.history,/测试消息/);assert.equal(page.overflow,false);checks.push('settings, memory and history render without horizontal overflow');
 await win.webContents.executeJavaScript("document.getElementById('memory').value='新的测试记忆';document.getElementById('save').click()");
 await waitJS(win,"document.getElementById('status').textContent==='设置与长期记忆已保存。'");assert.equal(service.state().memory,'新的测试记忆');checks.push('real settings IPC saves synthetic memory');
 await win.webContents.executeJavaScript("document.getElementById('copyHistory').click()");await waitJS(win,"document.getElementById('status').textContent.includes('已复制')");assert.match(clipboardText,/测试消息/);checks.push('history copy strips configuration fields');
 await win.webContents.executeJavaScript("document.querySelectorAll('details')[0].open=true");
 await pause(150);fs.writeFileSync(path.join(out,'settings.png'),(await win.webContents.capturePage()).toPNG());
 const invalid=await win.webContents.executeJavaScript("window.petSettings.clear({revision:'stale',includeBackup:true,clearMemory:true})");assert.equal(invalid.ok,false);assert.equal(service.state().messages.length,2);checks.push('stale clear is rejected through actual IPC');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,checks},null,2));
 console.log(JSON.stringify({ok:true,checks}));clearTimeout(watchdog);app.exit(0);
}).catch(error=>{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:false,error:String(error)}));console.error(error);clearTimeout(watchdog);app.exit(1);});
