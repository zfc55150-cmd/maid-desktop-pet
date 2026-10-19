const path=require('node:path');
const fs=require('node:fs');
const DEFAULT_INSTRUCT='中文普通话，年轻女性，温柔甜糯的二次元陪伴角色声线。嗓音柔软、甜润、圆润，轻声亲近地聊天，带自然微笑和一点害羞，轻柔撒娇但不夸张。音高适中，咬字清楚柔和，停顿自然，句尾轻轻放柔。不要尖细刺耳、用力夹嗓、元气喊叫、播音腔或气声耳语。';
const {spawn}=require('node:child_process');
const readline=require('node:readline');
class PetSpeech {
 constructor(spawnImpl=spawn,options={}){
  this.spawn=spawnImpl;this.root=options.root||path.resolve(__dirname,'../../../../voice-runtime');
  this.workerPath=options.workerPath||path.join(this.root,'voice_worker.py');
  this.settingsPath=options.settingsPath||path.join(this.root,'voice-settings.json');
  let saved={};try{saved=JSON.parse(fs.readFileSync(this.settingsPath,'utf8'));}catch{}
  this.voiceModel=saved.voiceModel==='design'?'design':'base';
  this.voiceInstruct=typeof saved.voiceInstruct==='string'&&saved.voiceInstruct.trim()?saved.voiceInstruct:DEFAULT_INSTRUCT;
  this.idleMs=options.idleMs??600000;this.timeoutMs=options.timeoutMs??300000;
  this.log=options.log||require('./voice-log').createVoiceLogger(process.env.DSH_HOME);
   this.worker=null;this.ready=false;this.serial=0;this.current=null;this.warm=null;this.pin=false;
 }
 voiceSettings(){return {voiceModel:this.voiceModel,voiceInstruct:this.voiceInstruct};}
 setVoiceSettings(value){
  if(this.current)throw new Error('请先等待语音结束，或点击停止，再切换音色。');
  if(!value||!['base','design'].includes(value.voiceModel)||typeof value.voiceInstruct!=='string'||!value.voiceInstruct.trim()||value.voiceInstruct.length>2000)throw new Error('请选择音色，声音描述请填写 1–2000 字。');
  const modelDir=value.voiceModel==='design'?'model-design':'model';
  if(!fs.existsSync(path.join(this.root,modelDir,'config.json')))throw new Error('这个语音模型尚未安装完整。');
  const next={voiceModel:value.voiceModel,voiceInstruct:value.voiceInstruct.trim()};
  fs.writeFileSync(this.settingsPath+'.tmp',JSON.stringify(next,null,2));fs.renameSync(this.settingsPath+'.tmp',this.settingsPath);
  this.dispose();this.voiceModel=next.voiceModel;this.voiceInstruct=next.voiceInstruct;return this.voiceSettings();
 }
 status(){return this.ready?'ready':this.worker?'loading':'off';}
 schedule(){clearTimeout(this.idleTimer);if(!this.pin&&!this.current&&this.worker){this.idleTimer=setTimeout(()=>this.dispose(),this.idleMs);this.idleTimer.unref?.();}}
 setInputOpen(value){this.pin=value===true;if(this.pin)clearTimeout(this.idleTimer);else this.schedule();}
 write(value){this.worker.stdin.write(JSON.stringify(value)+'\n');}
 ensureWorker(){
  clearTimeout(this.idleTimer);if(this.worker)return;
  const child=this.spawn(path.join(this.root,'venv','Scripts','python.exe'),['-u',this.workerPath],{
   windowsHide:true,shell:false,env:{...process.env,PET_SPEECH_PARENT:String(process.pid),PET_VOICE_ROOT:this.root,PET_VOICE_MODEL:this.voiceModel,PET_VOICE_INSTRUCT:this.voiceInstruct,PYTHONUTF8:'1'},stdio:['pipe','pipe','ignore']});
  this.worker=child;this.ready=false;
  const lines=readline.createInterface({input:child.stdout});
  const fail=message=>{if(this.worker!==child)return;this.dispose(new Error(message));};
  lines.on('line',line=>{
   if(this.worker!==child)return;let m;try{m=JSON.parse(line);}catch{return;}
   this.log(m.event,m.code);
   if(m.event==='ready'){this.ready=true;this.warm?.resolve({ready:true});this.warm=null;this.current?.notify({event:'ready'});this.schedule();}
   if(m.event==='error'){
    const message=m.code==='GPU_BUSY'?'显存暂时不足，语音暂停，文字回复正常。':m.code==='NO_GPU'?'暂时无法使用显卡语音，文字回复正常。':'本地语音暂时不可用，文字回复正常。';
    if(m.id==null){fail(message);return;}
    if(this.current?.id===m.id)this.finish(null,new Error(message));
   }
   if(this.current?.id!==m.id)return;
   if(m.event==='playing')this.current.notify({event:'playing'});
   if(m.event==='caption'&&typeof m.text==='string')this.current.notify({event:'caption',text:m.text});
   if(m.event==='done')this.finish({stopped:false});
  });
  child.once('error',()=>{this.log('spawn-error');fail('本地语音启动失败，文字回复正常。');});
  child.once('exit',()=>{this.log('exit');lines.close();fail('本地语音进程已退出，文字回复正常。');});
  child.stdin.on('error',()=>{this.log('pipe-error');fail('本地语音连接中断，文字回复正常。');});
 }
 warmup(){
  this.ensureWorker();if(this.ready){this.schedule();return Promise.resolve({ready:true});}
  if(this.warm)return this.warm.promise;
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  const timer=setTimeout(()=>{this.log('timeout');this.dispose(new Error('语音准备超时，文字聊天仍可使用。'));},this.timeoutMs);
  this.warm={promise,resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};
  this.write({type:'warmup'});return promise;
 }
 begin(notify=()=>{}){
  this.stop();this.ensureWorker();const id=++this.serial;
  let resolve,reject;const done=new Promise((a,b)=>{resolve=a;reject=b;});
  const timer=setTimeout(()=>{this.log('timeout');try{this.write({type:'cancel',id});}catch{}this.finish(null,new Error('语音等待超时。'));},this.timeoutMs);
  this.current={id,notify,resolve,reject,timer};
  this.write({type:'begin',id});
  return {id,done,append:(text,caption)=>{if(this.current?.id===id&&text.trim())this.write({type:'append',id,text:text.slice(0,12000),caption});},
   end:()=>{if(this.current?.id===id)this.write({type:'end',id});}};
 }
 finish(value,error){const item=this.current;if(!item)return;this.current=null;clearTimeout(item.timer);error?item.reject(error):item.resolve(value);this.schedule();}
 stop(){const item=this.current;if(!item)return;try{this.write({type:'cancel',id:item.id});}catch{}this.finish({stopped:true});}
 dispose(error){clearTimeout(this.idleTimer);const child=this.worker;this.worker=null;this.ready=false;
  if(error){this.finish(null,error);this.warm?.reject(error);}else{this.finish({stopped:true});this.warm?.resolve({ready:false,stopped:true});}
  this.warm=null;if(child)child.kill();}
 speak(text,notify){const job=this.begin(notify);job.append(text);job.end();return job.done;}
}
module.exports={PetSpeech};
