const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ChatConfigStore}=require('./chat-config-store');
const BASE_SIZE=640,MIN_PERCENT=50,MAX_PERCENT=150;
function parseJsonc(text){
 let clean='',quoted=false,escape=false;
 for(let i=0;i<text.length;i++){
  const c=text[i],next=text[i+1];
  if(quoted){clean+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;clean+=c;continue;}
  if(c==='/'&&next==='/'){while(i<text.length&&text[i]!=='\n')i++;clean+='\n';continue;}
  if(c==='/'&&next==='*'){const end=text.indexOf('*/',i+2);if(end<0)throw new Error('Unclosed comment');i=end+1;clean+=' ';continue;}
  clean+=c;
 }
 let result='';quoted=false;escape=false;
 for(let i=0;i<clean.length;i++){
  const c=clean[i];
  if(quoted){result+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
  if(c==='"')quoted=true;
  if(c===','&&/^\s*[}\]]/.test(clean.slice(i+1)))continue;
  result+=c;
 }
 return JSON.parse(result);
}
function validateAppearance(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.pets)||!data.pets.length)throw new Error('Invalid appearance');
 const ids=new Set();
 for(const p of data.pets){if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||!Number.isFinite(p.size)||p.size<=0||p.size>4096)throw new Error('Invalid size');ids.add(p.id);}
 if(!ids.has('main'))throw new Error('Missing main pet');return data;
}
class AppearanceFile extends ChatConfigStore{
 constructor({file,fsImpl=fs}){super({dir:path.dirname(file),fsImpl,requireExisting:true});this.file=file;this.backup=file+'.bak';}
 validate(data){return validateAppearance(data);}
 read(){
  let raw;try{raw=this.fs.readFileSync(this.file,'utf8');}catch{throw new Error('暂时无法读取外观配置，已停止写入。请稍后点“重新读取”。');}
  let data;try{data=this.validate(parseJsonc(raw));}catch{throw new Error('外观配置内容异常，已停止写入以保护原文件和备份。');}
  return {data,raw,revision:crypto.createHash('sha256').update(raw).digest('hex')};
 }
}
class AppearanceStore{
 constructor({file,fsImpl=fs,notify=()=>{}}){this.file=file;this.fs=fsImpl;this.disk=new AppearanceFile({file,fsImpl});this.lastGoodFile=file+'.last-good.json';this.lastGood=null;this.notify=notify;this.lastWarning='';}
 warn(message){if(this.lastWarning!==message){this.lastWarning=message;this.notify(message);}}
 remember(data){
  this.lastGood=JSON.parse(JSON.stringify(data));const raw=JSON.stringify(data,null,2);
  try{
   try{if(this.fs.readFileSync(this.lastGoodFile,'utf8')===raw){this.lastWarning='';return '';}}catch{}
   this.disk.writeAtomic(this.lastGoodFile,raw);this.lastWarning='';return '';
  }catch{const message='大小配置可读取，但恢复副本暂未更新。请检查目录权限或磁盘空间。';this.warn(message);return message;}
 }
 protectedRead(){
  try{const snapshot=this.disk.read();return {...snapshot,warning:this.remember(snapshot.data),recovered:false};}
  catch{
   let data=this.lastGood;
   if(!data){for(const file of [this.lastGoodFile,this.disk.backup]){try{data=validateAppearance(parseJsonc(this.fs.readFileSync(file,'utf8')));break;}catch{}}}
   if(!data)throw new Error('外观配置和恢复副本暂时都无法读取，已停止使用默认小尺寸。请恢复配置后重试。');
   const warning='当前外观配置暂不可读，已沿用上次保存的大小；请点“重新读取”，恢复前不会覆盖原文件。';this.warn(warning);
   return {data:JSON.parse(JSON.stringify(data)),revision:null,recovered:true,warning};
  }
 }
 view(snapshot){const size=snapshot.data.pets.find(p=>p.id==='main').size;return {size,percent:Math.round(size/BASE_SIZE*100),baseSize:BASE_SIZE,minPercent:MIN_PERCENT,maxPercent:MAX_PERCENT,revision:snapshot.revision,canSave:!snapshot.recovered,warning:snapshot.warning||''};}
 state(){return this.view(this.protectedRead());}
 save(input){
  if(!input||!Number.isInteger(input.percent)||input.percent<MIN_PERCENT||input.percent>MAX_PERCENT)throw new Error('大小请选择 50% 到 150% 之间的整数。');
  if(typeof input.revision!=='string')throw new Error('请先重新读取外观配置，再保存大小。');
  let snapshot;
  try{snapshot=this.disk.update((data,revision)=>{
   if(input.revision!==revision)throw new Error('外观配置已更新，请点“重新读取”后再调整。');
   return {...data,pets:data.pets.map(p=>p.id==='main'?{...p,size:Math.round(BASE_SIZE*input.percent/100)}:p)};
  });}catch(error){throw new Error(error.message.replaceAll('聊天配置','外观配置'));}
  return this.view({...snapshot,recovered:false,warning:this.remember(snapshot.data)});
 }
}
const guards=new Map();
function readProtectedAppearance(file){
 const key=path.resolve(file);let store=guards.get(key);
 if(!store){store=new AppearanceStore({file:key,notify:m=>console.warn('[dsh-pet appearance] '+m)});guards.set(key,store);}
 return store.protectedRead().data;
}
module.exports={AppearanceStore,readProtectedAppearance,parseJsonc,validateAppearance,BASE_SIZE};
