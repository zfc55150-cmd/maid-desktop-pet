const path=require('node:path'),{pathToFileURL}=require('node:url');
const {AppearanceStore}=require('./pet-appearance-store');
function reloadURL(value){const url=new URL(value);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.pathname.endsWith('/config'))throw new Error('桌宠重载地址无效。');url.pathname=url.pathname.slice(0,-6)+'reload';url.search='';url.hash='';return url.href;}
module.exports=function installPetSize(electron,petWindows,options={}){
 const {app,BrowserWindow,ipcMain}=electron;let window=null;
 const indexURL=pathToFileURL(path.join(__dirname,'index.html')).href;
 const pageURL=pathToFileURL(path.join(__dirname,'pet-size.html')).href;
 const file=path.join(process.env.DSH_HOME||path.join(app.getPath('appData'),'DeepSeekActionPet'),'dsh-pet','main-config.jsonc');
 const store=options.store||new AppearanceStore({file});
 const pet=e=>e.senderFrame&&e.senderFrame.url.split('?')[0]===indexURL&&e.senderFrame.routingId===e.sender.mainFrame.routingId&&e.senderFrame.processId===e.sender.mainFrame.processId&&[...petWindows.values()].some(w=>!w.isDestroyed()&&w.webContents.id===e.sender.id);
 const settings=e=>window&&!window.isDestroyed()&&e.sender.id===window.webContents.id&&e.senderFrame&&e.senderFrame.url===pageURL&&e.senderFrame.routingId===e.sender.mainFrame.routingId&&e.senderFrame.processId===e.sender.mainFrame.processId;
 let scheduled=false;
 const apply=()=>{
  if(scheduled)return;const url=reloadURL(process.env.DSH_PET_CONFIG_URL);scheduled=true;
  (options.setTimer||setTimeout)(async()=>{
   try{if(options.isBusy?.())throw new Error('busy');const response=await (options.fetchImpl||fetch)(url,{method:'POST',headers:require('./local-control').headers(),redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('reload');}
   catch{scheduled=false;if(window&&!window.isDestroyed())window.webContents.send('pet-size:apply-error','大小已保存，但暂未应用。请点“重试应用”，无需重复保存。');}
  },250);
 };
 const bind=(name,fn)=>ipcMain.handle('pet-size:'+name,async(e,value)=>{
  if(!(name==='open'?pet(e):settings(e)))return {ok:false,error:'无效的窗口请求。'};
  try{return {ok:true,data:await fn(value)};}catch(error){return {ok:false,error:error.code?'外观配置暂时无法保存，请稍后重试。':error.message};}
 });
 bind('open',()=>{
  if(window&&!window.isDestroyed()){window.show();window.focus();return true;}
  window=new BrowserWindow({title:'蓝鲸女仆 · 调整大小',width:400,height:410,useContentSize:true,resizable:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'pet-size-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.on('closed',()=>window=null);window.loadURL(pageURL);return true;
 });
 bind('state',()=>store.state());
 bind('save',value=>{if(options.isBusy?.())throw new Error('请等当前回复或朗读结束，再应用大小。');reloadURL(process.env.DSH_PET_CONFIG_URL);const state=store.save(value);apply();return state;});
 bind('retry',()=>{if(options.isBusy?.())throw new Error('请等当前回复或朗读结束，再应用大小。');store.state();apply();return true;});
};
module.exports.reloadURL=reloadURL;
