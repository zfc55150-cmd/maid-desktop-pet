const path=require('node:path'),{pathToFileURL}=require('node:url');
const {AppearanceStore}=require('./pet-appearance-store');
const SIZE_MAIN_MESSAGES={
 'zh-CN':{
  invalidReload:'桌宠重载地址无效。',
  applyError:'大小已保存，但暂未应用。请点“重试应用”，无需重复保存。',
  invalidRequest:'无效的窗口请求。',
  saveError:'外观配置暂时无法保存，请稍后重试。',
  windowTitle:'蓝鲸女仆 · 调整大小',
  busyError:'请等当前回复或朗读结束，再应用大小。'
 },
 ja:{
  invalidReload:'再読み込み先のURLが無効です。',
  applyError:'サイズは保存されましたが、まだ反映されていません。再保存せずに「適用を再試行」を押してください。',
  invalidRequest:'無効なウィンドウリクエストです。',
  saveError:'外観設定を保存できませんでした。しばらくしてから再試行してください。',
  windowTitle:'ブルークジラメイド · サイズ調整',
  busyError:'現在の返信または読み上げが終わってからサイズを適用してください。'
 }
};
function reloadURL(value,lang='zh-CN'){const url=new URL(value);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.pathname.endsWith('/config'))throw new Error((SIZE_MAIN_MESSAGES[lang]||SIZE_MAIN_MESSAGES['zh-CN']).invalidReload);url.pathname=url.pathname.slice(0,-6)+'reload';url.search='';url.hash='';return url.href;}
module.exports=function installPetSize(electron,petWindows,options={}){
 const {app,BrowserWindow,ipcMain}=electron;let window=null;
 const indexURL=pathToFileURL(path.join(__dirname,'index.html')).href;
 const pageURL=pathToFileURL(path.join(__dirname,'pet-size.html')).href;
 const file=path.join(process.env.DSH_HOME||path.join(app.getPath('appData'),'DeepSeekActionPet'),'dsh-pet','main-config.jsonc');
 const getLang=typeof options.getLanguage==='function'?options.getLanguage:()=>'zh-CN';
 const lang=()=>getLang()==='ja'?'ja':'zh-CN';
 const msg=key=>(SIZE_MAIN_MESSAGES[lang()]||SIZE_MAIN_MESSAGES['zh-CN'])[key];
 const store=options.store||new AppearanceStore({file,getLang:lang});
 const pet=e=>e.senderFrame&&e.senderFrame.url.split('?')[0]===indexURL&&e.senderFrame.routingId===e.sender.mainFrame.routingId&&e.senderFrame.processId===e.sender.mainFrame.processId&&[...petWindows.values()].some(w=>!w.isDestroyed()&&w.webContents.id===e.sender.id);
 const settings=e=>window&&!window.isDestroyed()&&e.sender.id===window.webContents.id&&e.senderFrame&&e.senderFrame.url===pageURL&&e.senderFrame.routingId===e.sender.mainFrame.routingId&&e.senderFrame.processId===e.sender.mainFrame.processId;
 let scheduled=false;
 const apply=()=>{
  if(scheduled)return;const url=reloadURL(process.env.DSH_PET_CONFIG_URL,lang());scheduled=true;
  (options.setTimer||setTimeout)(async()=>{
   try{if(options.isBusy?.())throw new Error('busy');const response=await (options.fetchImpl||fetch)(url,{method:'POST',headers:require('./local-control').headers(),redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('reload');}
   catch{scheduled=false;if(window&&!window.isDestroyed())window.webContents.send('pet-size:apply-error',msg('applyError'));}
  },250);
 };
 const bind=(name,fn)=>ipcMain.handle('pet-size:'+name,async(e,value)=>{
  if(!(name==='open'?pet(e):settings(e)))return {ok:false,error:msg('invalidRequest')};
  try{return {ok:true,data:await fn(value)};}catch(error){return {ok:false,error:error.code?msg('saveError'):error.message};}
 });
 bind('open',()=>{
  if(window&&!window.isDestroyed()){window.setTitle(msg('windowTitle'));window.show();window.focus();return true;}
  window=new BrowserWindow({title:msg('windowTitle'),width:400,height:410,useContentSize:true,resizable:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'pet-size-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.on('closed',()=>window=null);window.loadURL(pageURL);return true;
 });
 bind('state',()=>({...store.state(),language:lang()}));
 bind('save',value=>{if(options.isBusy?.())throw new Error(msg('busyError'));reloadURL(process.env.DSH_PET_CONFIG_URL,lang());const state=store.save(value);apply();return {...state,language:lang()};});
 bind('retry',()=>{if(options.isBusy?.())throw new Error(msg('busyError'));store.state();apply();return true;});
};
module.exports.reloadURL=reloadURL;
