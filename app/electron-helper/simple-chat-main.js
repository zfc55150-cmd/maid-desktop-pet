const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {ChatService} = require('./simple-chat-service');
const {PetSpeech} = require('./pet-speech');
const {SpeechPhraser} = require('./speech-phrasing');
module.exports = function installSimpleChat(electron, petWindows, options={}) {
 const {app,ipcMain,safeStorage,BrowserWindow,clipboard} = electron;
 let settingsWindow=null, service=null, activeReply=null;
 const settingsURL=pathToFileURL(path.join(__dirname,'pet-settings.html')).href;
 const indexURL=pathToFileURL(path.join(__dirname,'index.html')).href;
 const speech=options.speech||new PetSpeech();
 const getService=()=>service ||= options.service||new ChatService({dir:path.join(process.env.DSH_HOME || path.join(app.getPath('appData'),'DeepSeekActionPet'),'simple-chat'),secrets:safeStorage,requireExisting:true});
 const sameFrame=e=>e.senderFrame && e.senderFrame.routingId===e.sender.mainFrame.routingId && e.senderFrame.processId===e.sender.mainFrame.processId;
 const trusted=e=>sameFrame(e)&&e.senderFrame.url.split('?')[0]===indexURL&&[...petWindows.values()].some(w=>!w.isDestroyed()&&w.webContents.id===e.sender.id);
 const trustedSettings=e=>sameFrame(e)&&settingsWindow&&!settingsWindow.isDestroyed()&&e.sender.id===settingsWindow.webContents.id&&e.senderFrame.url===settingsURL;
 const bind=(name,fn)=>ipcMain.handle('simple-chat:'+name,async(e,arg)=>{
  if(!trusted(e)&&!(['state','save','clear','copyHistory','voiceSettings','previewVoice'].includes(name)&&trustedSettings(e)))return {ok:false,error:'无效的窗口请求。'};
  try{return {ok:true,data:await fn(name==='openSettings'?null:getService(),arg,e)};}
  catch(error){return {ok:false,error:error instanceof SyntaxError?'聊天记录无法读取，请保留文件并联系修复。':error.code?'本地设置未能保存，请检查磁盘空间。':error.message};}
 });
 const invalidate=()=>{if(activeReply)activeReply.cancelled=true;activeReply=null;speech.stop();};
 const resetPets=()=>{for(const w of petWindows.values())if(!w.isDestroyed())w.webContents.send('simple-chat:event',{type:'reset'});};
 bind('state',s=>({...s.state(),voiceStatus:speech.status(),...speech.voiceSettings?.()}));
 bind('voiceSettings',(s,v)=>{if(s.state().busy||activeReply)throw new Error('请先等待回复结束，或点击停止。');const settings=speech.setVoiceSettings(v);if(s.snapshot().voiceEnabled)speech.warmup().catch(()=>{});return settings;});
 bind('input',(s,value)=>{speech.setInputOpen(value);return true;});
 bind('warmup',s=>s.state().voiceEnabled?speech.warmup():({ready:false,muted:true}));
 bind('openSettings',()=>{
  if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.show();settingsWindow.focus();return true;}
  settingsWindow=new BrowserWindow({title:'蓝鲸女仆 · 设置与记录',width:600,height:780,minWidth:480,minHeight:500,resizable:true,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'pet-settings-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  settingsWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  settingsWindow.webContents.on('will-navigate',e=>e.preventDefault());
  settingsWindow.on('closed',()=>settingsWindow=null);settingsWindow.loadURL(settingsURL);return true;
 });
 bind('save',(s,v)=>s.save(v));
 bind('send',async(s,v,e)=>{
  const start=s.state();
  if(start.busy||activeReply)throw new Error('正在回复或朗读，请先等待或点击停止。');
  const text=typeof v==='string'?v:v?.text;
  const requestId=Number.isSafeInteger(v?.requestId)?v.requestId:0;
  const reply={job:null,error:null,sync:false,cancelled:false,voiceEnabled:start.voiceEnabled};
  const notify=payload=>{if(!reply.cancelled&&activeReply===reply&&!e.sender.isDestroyed())e.sender.send('simple-chat:event',{requestId,...payload});};
  reply.notify=notify;activeReply=reply;
  const phraser=new SpeechPhraser((part,caption)=>reply.job?.append(part,caption));
  let voiceDone=Promise.resolve({stopped:true});
  try{
   speech.stop();
   if(start.voiceEnabled){
    try {
     reply.sync=true;
     reply.job=speech.begin(m=>{if(m.event==='caption'){if(reply.sync&&!reply.error)notify({type:'caption',text:m.text});}else notify({type:'voice',status:m.event});});
     voiceDone=reply.job.done.catch(error=>{reply.error=error.message;notify({type:'voice',status:'error',message:error.message});});
    } catch(error) { reply.sync=false;reply.error='本地语音启动失败，文字回复正常。';notify({type:'voice',status:'error',message:reply.error}); }
   }
   const state=await s.send(text,(delta,content)=>{
    notify({type:'text',text:content,syncVoice:reply.sync&&!reply.error,voiceStatus:reply.voiceEnabled?speech.status():'muted'});
    phraser.push(delta);
   });
   phraser.end();reply.job?.end();notify({type:'text-done',voiceEnabled:reply.voiceEnabled});
   await voiceDone;
   if(reply.cancelled||activeReply!==reply)return {cancelled:true};
   return {...state,voiceEnabled:reply.voiceEnabled,voiceError:reply.error};
  }catch(error){if(activeReply===reply)speech.stop();if(reply.cancelled)return {cancelled:true};throw error;}
  finally{phraser.close();if(activeReply===reply)activeReply=null;}
 });
 bind('clear',(s,v)=>{
  const state=s.clear(v); // A failed clear must not stop an unrelated active reply.
  invalidate();resetPets();return state;
 });
 bind('copyHistory',s=>{const state=s.state();clipboard.writeText(state.messages.map(m=>(m.role==='user'?'我':'蓝鲸女仆')+'：\n'+m.content+(m.incomplete?'\n（回复未完整结束）':'')).join('\n\n'));return true;});
 bind('cancel',s=>{invalidate();s.cancel();return true;});
 bind('voice',(s,v)=>{const state=s.setVoice(v);if(activeReply)activeReply.voiceEnabled=v;if(v===false){if(activeReply)activeReply.sync=false;speech.dispose();activeReply?.notify({type:'voice',status:'muted'});}else speech.warmup().catch(()=>{});return state;});
 bind('speak',s=>{if(activeReply||s.state().busy)throw new Error('请先停止当前回复。');if(!s.snapshot().voiceEnabled)return {stopped:true};const last=s.snapshot().messages.at(-1);return last?.role==='assistant'?speech.speak(last.content):{stopped:true};});
 bind('previewVoice',(s,v,e)=>{if(s.state().busy||activeReply)throw new Error('请先等待回复结束，或点击停止。');return s.snapshot().voiceEnabled?speech.speak('你好，我在这里陪你。',m=>{if(!e.sender.isDestroyed())e.sender.send('simple-chat:event',{requestId:v?.requestId,type:'voice',status:m.event});}):({stopped:true});});
 app.on('before-quit',()=>{invalidate();service?.cancel();speech.dispose();});
 return {isBusy:()=>!!service?.pending||!!activeReply||!!speech.current};
};
