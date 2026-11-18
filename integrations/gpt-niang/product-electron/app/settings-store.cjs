'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const RETRY_CODES=new Set(['EPERM','EACCES','EBUSY']),RETRY_WAIT=new Int32Array(new SharedArrayBuffer(4));
function pauseSync(ms){Atomics.wait(RETRY_WAIT,0,0,ms);}
function renameWithRetry(from,to){
 const delays=[10,20,40,80];
 for(let attempt=0;;attempt++){
  try{fs.renameSync(from,to);return;}
  catch(e){if(!RETRY_CODES.has(e?.code)||attempt>=delays.length)throw e;pauseSync(delays[attempt]);}
 }
}
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
class SettingsStore {
 constructor(file,{maxBytes=1024*1024}={}){this.file=path.resolve(file);this.maxBytes=maxBytes;this.canSave=true;this.revision=null;this.value={};this.error=null;this.load();}
 read(file){if(!fs.existsSync(file))return {exists:false,value:{},revision:null};const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||stat.size>this.maxBytes)throw Error('SETTINGS_INVALID');const bytes=fs.readFileSync(file),value=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));if(!object(value))throw Error('SETTINGS_INVALID');return {exists:true,value,revision:digest(bytes)};}
 load(){try{const read=this.read(this.file);this.value=read.value;this.revision=read.revision;this.canSave=true;this.error=null;this.loadFailure=null;}catch(err){this.canSave=false;this.error='SETTINGS_UNREADABLE';this.loadFailure=String(err?.message||err).slice(0,120);try{this.value=this.read(this.file+'.bak').value;}catch{this.value={};}}return this;}
 update(patch){
  if(!this.canSave||!object(patch))throw Error('SETTINGS_SAVE_BLOCKED');const current=this.read(this.file);if(current.revision!==this.revision){const conflict=Object.keys(patch).some(key=>JSON.stringify(current.value[key])!==JSON.stringify(this.value[key])&&JSON.stringify(current.value[key])!==JSON.stringify(patch[key]));this.value=current.value;this.revision=current.revision;if(conflict){this.error='SETTINGS_CHANGED';throw Error('SETTINGS_CHANGED');}}
  const next={...current.value,...patch},text=JSON.stringify(next,null,2)+'\n';if(Buffer.byteLength(text)>this.maxBytes)throw Error('SETTINGS_TOO_LARGE');
  fs.mkdirSync(path.dirname(this.file),{recursive:true});const temporary=this.file+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(temporary,text,{flag:'wx'});if(this.read(this.file).revision!==this.revision)throw Error('SETTINGS_CHANGED');if(current.exists)fs.copyFileSync(this.file,this.file+'.bak');renameWithRetry(temporary,this.file);this.value=next;this.revision=digest(Buffer.from(text));this.error=null;return this.value;}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 }
}
function updateBatch(plans){const committed=[];try{for(const {store,patch}of plans){const before=fs.existsSync(store.file)?fs.readFileSync(store.file):null;store.update(patch);committed.push({store,before,revision:store.revision});}}catch(error){let rollbackFailed=false;for(const {store,before,revision}of committed.reverse()){try{if(store.read(store.file).revision!==revision)throw Error('CONCURRENT_ROLLBACK');if(before===null)fs.unlinkSync(store.file);else{const temporary=store.file+'.'+crypto.randomUUID()+'.rollback';try{fs.writeFileSync(temporary,before,{flag:'wx'});if(store.read(store.file).revision!==revision)throw Error('CONCURRENT_ROLLBACK');renameWithRetry(temporary,store.file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}}store.load();}catch{rollbackFailed=true;}}if(rollbackFailed){const err=new Error('PREFERENCES_RELOAD_REQUIRED');err.cause=error;throw err;}throw error;}}
module.exports={SettingsStore,updateBatch};
