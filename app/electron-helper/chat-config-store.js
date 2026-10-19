const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const unavailable = () => new Error('暂时无法读取已保存的聊天配置。请稍后重新打开“对话”或点“重新读取”，无需重新填写密钥。');
class ChatConfigStore {
 constructor({dir, fsImpl=fs, requireExisting=false}) {
  this.fs=fsImpl;this.dir=dir;this.file=path.join(dir,'chat.json');
  this.backup=this.file+'.bak';this.requireExisting=requireExisting;this.seenFile=false;
 }
 validate(data) {
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('invalid');
  if(this.requireExisting&&(typeof data.prompt!=='string'||!Array.isArray(data.messages)))throw new Error('invalid');
  if(data.key!==undefined&&(typeof data.key!=='string'||data.key.length>4096))throw new Error('invalid');
  if(data.prompt!==undefined&&(typeof data.prompt!=='string'||data.prompt.length>4000))throw new Error('invalid');
   if(data.memory!==undefined&&(typeof data.memory!=='string'||data.memory.length>6000))throw new Error('invalid');
  if(data.messages!==undefined&&(!Array.isArray(data.messages)||data.messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string')))throw new Error('invalid');
  return data;
 }
 read() {
  let raw;
  try{raw=this.fs.readFileSync(this.file,'utf8');}
  catch(error){
   if(error.code==='ENOENT'&&!this.requireExisting&&!this.seenFile)return {data:{},raw:null,revision:null};
   throw unavailable();
  }
  let data;
  try{data=this.validate(JSON.parse(raw));}
  catch{throw new Error('聊天配置内容损坏，已停止保存以保护原文件和备份。请联系修复，不要重新填写覆盖。');}
  this.seenFile=true;
  return {data,raw,revision:crypto.createHash('sha256').update(raw).digest('hex')};
 }
 update(change, {sanitizeBackup} = {}) {
  // A real read distinguishes a missing/unreadable existing file from first use.
  this.read();
  let lock;
  const lockPath=this.file+'.lock';
  try{
   this.fs.mkdirSync(this.dir,{recursive:true});
   try{lock=this.createLock(lockPath);}
   catch(error){
    if(!['EEXIST','ENOTEMPTY','EPERM','EACCES'].includes(error.code)||!this.fs.existsSync(lockPath))throw error;
    let owner,observed;
    try{observed=this.readLock(lockPath);owner=JSON.parse(observed.raw).pid;}catch{}
    if(Number.isInteger(owner)&&owner>0){
     try{process.kill(owner,0);}catch(probe){
      if(probe.code==='ESRCH'){
       if(this.readLock(lockPath).raw!==observed.raw)throw new Error('聊天配置正在保存，请稍后重试。');
       this.removeLock(lockPath,observed);lock=this.createLock(lockPath);
      }
     }
    }
    if(lock===undefined)throw new Error('聊天配置正在保存，请稍后重试；原配置未被覆盖。');
   }
   const before=this.read();
   const next=this.validate(change(before.data,before.revision));
   const raw=JSON.stringify(next,null,2);
   // Refuse to replace a file changed by another writer after we read it.
   const check=()=>{if(this.read().revision!==before.revision)throw new Error('聊天配置已更新，本次未覆盖。请点“重新读取”后再试。');};
   check();
   // Explicit privacy clearing also sanitizes the backup before the main file.
   if(before.raw!==null)this.writeAtomic(this.backup,sanitizeBackup ? JSON.stringify(this.validate(sanitizeBackup(before.data)),null,2) : before.raw);
   check();
   this.writeAtomic(this.file,raw,check);
   return this.read();
  } catch(error) {
   if(error.code)throw new Error('聊天配置未能保存，原文件和备份已保留。请检查磁盘空间及目录权限后重试。');
   throw error;
  } finally {
   if(lock!==undefined){try{const current=this.readLock(lockPath);if(JSON.parse(current.raw).token===lock.token)this.removeLock(lockPath,current);}catch{}}
  }
 }
 createLock(lockPath) {
  // Publish complete owner metadata atomically. An exit between creation and
  // writing must never leave an empty permanent lock at the shared lock path.
  const token=crypto.randomBytes(12).toString('hex');
  const temp=lockPath+'.owner-'+process.pid+'-'+token;
  try{
   this.fs.mkdirSync(temp);
   this.writeAtomic(path.join(temp,'owner.json'),JSON.stringify({pid:process.pid,token}));
   if(this.fs.existsSync(lockPath))throw Object.assign(new Error('locked'),{code:'EEXIST'});
   this.fs.renameSync(temp,lockPath);
   return {token};
  }finally{
   try{this.fs.unlinkSync(path.join(temp,'owner.json'));}catch{}
   try{this.fs.rmdirSync(temp);}catch{}
  }
 }
 readLock(lockPath) {
  const item=this.fs.lstatSync(lockPath);
  if(item.isSymbolicLink())throw new Error('聊天配置保存保护路径异常，已停止写入。');
  const directory=item.isDirectory();
  return {directory,raw:this.fs.readFileSync(directory?path.join(lockPath,'owner.json'):lockPath,'utf8')};
 }
 removeLock(lockPath,lock) {
  if(lock.directory){this.fs.unlinkSync(path.join(lockPath,'owner.json'));this.fs.rmdirSync(lockPath);}
  else this.fs.unlinkSync(lockPath);
 }
 writeAtomic(file,raw,beforeRename=()=>{}) {
  const temp=file+'.tmp-'+process.pid+'-'+crypto.randomBytes(6).toString('hex');let descriptor;
  try{
   descriptor=this.fs.openSync(temp,'wx',0o600);
   this.fs.writeFileSync(descriptor,raw,'utf8');this.fs.fsyncSync(descriptor);
   this.fs.closeSync(descriptor);descriptor=undefined;
   beforeRename();this.fs.renameSync(temp,file);
  }finally{
   if(descriptor!==undefined){try{this.fs.closeSync(descriptor);}catch{}}
   try{this.fs.unlinkSync(temp);}catch{}
  }
 }
}
module.exports={ChatConfigStore};
