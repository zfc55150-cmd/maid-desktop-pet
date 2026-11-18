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
const APPEARANCE_MESSAGES={
 'zh-CN':{
  readFail:'暂时无法读取外观配置，已停止写入。请稍后点“重新读取”。',
  corrupt:'外观配置内容异常，已停止写入以保护原文件和备份。',
  backupWarn:'大小配置可读取，但恢复副本暂未更新。请检查目录权限或磁盘空间。',
  bothFail:'外观配置和恢复副本暂时都无法读取，已停止使用默认小尺寸。请恢复配置后重试。',
  recoveredWarn:'当前外观配置暂不可读，已沿用上次保存的大小；请点“重新读取”，恢复前不会覆盖原文件。',
  invalidPercent:'大小请选择 50% 到 150% 之间的整数。',
  needReload:'请先重新读取外观配置，再保存大小。',
  conflict:'外观配置已更新，请点“重新读取”后再调整。'
 },
 ja:{
  readFail:'外観設定を読み込めないため書き込みを停止しました。後ほど「再読み込み」を押してください。',
  corrupt:'外観設定の内容が異常なため、元ファイルとバックアップを保護するため書き込みを停止しました。',
  backupWarn:'サイズ設定は読み込めましたが、復元用コピーを更新できませんでした。権限や空き容量を確認してください。',
  bothFail:'外観設定と復元用コピーの両方を読み込めませんでした。設定を復元してから再試行してください。',
  recoveredWarn:'外観設定を一時的に読み込めないため、前回保存したサイズを使用しています。「再読み込み」するまで元ファイルは上書きしません。',
  invalidPercent:'サイズは 50%〜150% の整数を指定してください。',
  needReload:'サイズを保存する前に、外観設定を再読み込みしてください。',
  conflict:'外観設定が更新されています。「再読み込み」してから調整してください。'
 }
};
class AppearanceFile extends ChatConfigStore{
 constructor({file,fsImpl=fs,getLang=null}){super({dir:path.dirname(file),fsImpl,requireExisting:true,getLang});this.file=file;this.backup=file+'.bak';}
 validate(data){return validateAppearance(data);}
 read(){
  let raw;try{raw=this.fs.readFileSync(this.file,'utf8');}catch{const lang=this.getLang()==='ja'?'ja':'zh-CN';throw new Error(APPEARANCE_MESSAGES[lang].readFail);}
  let data;try{data=this.validate(parseJsonc(raw));}catch{const lang=this.getLang()==='ja'?'ja':'zh-CN';throw new Error(APPEARANCE_MESSAGES[lang].corrupt);}
  return {data,raw,revision:crypto.createHash('sha256').update(raw).digest('hex')};
 }
}
class AppearanceStore{
 constructor({file,fsImpl=fs,notify=()=>{},getLang=null}){this.file=file;this.fs=fsImpl;this.getLang=typeof getLang==='function'?getLang:()=>'zh-CN';this.disk=new AppearanceFile({file,fsImpl,getLang:this.getLang});this.lastGoodFile=file+'.last-good.json';this.lastGood=null;this.notify=notify;this.lastWarning='';}
 msg(key){const lang=this.getLang()==='ja'?'ja':'zh-CN';return APPEARANCE_MESSAGES[lang][key];}
 warn(message){if(this.lastWarning!==message){this.lastWarning=message;this.notify(message);}}
 remember(data){
  this.lastGood=JSON.parse(JSON.stringify(data));const raw=JSON.stringify(data,null,2);
  try{
   try{if(this.fs.readFileSync(this.lastGoodFile,'utf8')===raw){this.lastWarning='';return '';}}catch{}
   this.disk.writeAtomic(this.lastGoodFile,raw);this.lastWarning='';return '';
  }catch{const message=this.msg('backupWarn');this.warn(message);return message;}
 }
 protectedRead(){
  try{const snapshot=this.disk.read();return {...snapshot,warning:this.remember(snapshot.data),recovered:false};}
  catch{
   let data=this.lastGood;
   if(!data){for(const file of [this.lastGoodFile,this.disk.backup]){try{data=validateAppearance(parseJsonc(this.fs.readFileSync(file,'utf8')));break;}catch{}}}
   if(!data)throw new Error(this.msg('bothFail'));
   const warning=this.msg('recoveredWarn');this.warn(warning);
   return {data:JSON.parse(JSON.stringify(data)),revision:null,recovered:true,warning};
  }
 }
 view(snapshot){const size=snapshot.data.pets.find(p=>p.id==='main').size;return {size,percent:Math.round(size/BASE_SIZE*100),baseSize:BASE_SIZE,minPercent:MIN_PERCENT,maxPercent:MAX_PERCENT,revision:snapshot.revision,canSave:!snapshot.recovered,warning:snapshot.warning||''};}
 state(){return this.view(this.protectedRead());}
 save(input){
  if(!input||!Number.isInteger(input.percent)||input.percent<MIN_PERCENT||input.percent>MAX_PERCENT)throw new Error(this.msg('invalidPercent'));
  if(typeof input.revision!=='string')throw new Error(this.msg('needReload'));
  let snapshot;
  try{snapshot=this.disk.update((data,revision)=>{
   if(input.revision!==revision)throw new Error(this.msg('conflict'));
   return {...data,pets:data.pets.map(p=>p.id==='main'?{...p,size:Math.round(BASE_SIZE*input.percent/100)}:p)};
  });}catch(error){
   const lang=this.getLang()==='ja'?'ja':'zh-CN';
   throw new Error(lang==='ja'?error.message.replaceAll('チャット設定','外観設定'):error.message.replaceAll('聊天配置','外观配置'));
  }
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
