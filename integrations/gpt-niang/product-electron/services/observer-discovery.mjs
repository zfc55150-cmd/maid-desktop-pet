import fs from 'node:fs';
import path from 'node:path';

const within=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
const signature=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;

// Metadata only. Watch notifications are hints, never the sole source of truth:
// a complete periodic walk also discovers old months, archives and replacements.
export class RolloutDiscovery {
  constructor({codexHome,now=()=>Date.now(),fullScanMs=30000,hotWindowMs=300000,maxFiles=16384,maxHot=256,watch=true,io=fs}={}){
    this.home=path.resolve(codexHome);this.now=now;this.fullScanMs=Math.max(0,fullScanMs);this.hotWindowMs=hotWindowMs;
    this.maxFiles=Math.max(256,Math.min(32768,maxFiles));this.maxHot=Math.max(1,Math.min(512,maxHot));this.io=io;this.watch=watch;
    this.files=new Map();this.hot=new Set();this.hints=new Set();this.watchers=new Map();this.lastFull=null;this.dirty=false;
    this.metrics={walks:0,directories:0,stats:0,changed:0};this.code='OBSERVER_POLLING';
  }
  roots(){
    const roots=[];
    for(const name of ['sessions','archived_sessions']){
      const file=path.join(this.home,name);
      try{const s=this.io.lstatSync(file);if(!s.isDirectory()||s.isSymbolicLink())continue;const real=this.io.realpathSync(file);if(!within(this.home,real))continue;roots.push(real);}catch{}
    }
    return roots;
  }
  watchRoots(roots){
    if(!this.watch)return;
    for(const root of roots){
      if(this.watchers.has(root))continue;
      try{
        const watcher=this.io.watch(root,{recursive:true,persistent:false},(_event,name)=>{
          if(!name){this.dirty=true;return;}
          const file=path.resolve(root,String(name));if(!within(root,file))return;
          if(file.endsWith('.jsonl')&&this.hints.size<1024)this.hints.add(file);else this.dirty=true;
        });
        watcher.unref?.();
        watcher.on('error',()=>{this.code='OBSERVER_POLLING';this.dirty=true;try{watcher.close();}catch{};this.watchers.delete(root);});
        this.watchers.set(root,watcher);
      }catch{this.code='OBSERVER_POLLING';}
    }
    this.code=this.watchers.size===roots.length&&roots.length?'OBSERVER_OK':'OBSERVER_POLLING';
  }
  inspect(file,roots,changed,seen=null){
    if(!roots.some(root=>within(root,file)))return;
    try{
      this.metrics.stats++;const s=this.io.lstatSync(file);if(!s.isFile()||s.isSymbolicLink())return;
      const parent=path.dirname(file);let realParent=this.parents.get(parent);
      if(!realParent){realParent=this.io.realpathSync(parent);if(!roots.some(root=>realParent===root||within(root,realParent)))return;this.parents.set(parent,realParent);}
      const real=path.join(realParent,path.basename(file));
      seen?.add(real);const previous=this.files.get(real),key=signature(s);
      const entry={file:real,identity:`${s.dev}:${s.ino}`,size:s.size,mtimeMs:s.mtimeMs,signature:key};
      if(!previous||previous.signature!==key){changed.set(real,entry);this.metrics.changed++;this.hot.delete(real);this.hot.add(real);}
      this.files.delete(real);this.files.set(real,entry);
    }catch(error){if(error.code!=='ENOENT')this.readFailed=true;if(this.files.has(file)){this.files.delete(file);this.hot.delete(file);}}
  }
  scan({force=false}={}){
    const now=this.now(),roots=this.roots(),changed=new Map();this.readFailed=false;this.parents=new Map();
    const rootKey=roots.join('\0');if(rootKey!==this.rootKey){this.rootKey=rootKey;this.dirty=true;}
    for(const [root,watcher] of this.watchers)if(!roots.includes(root)){try{watcher.close();}catch{};this.watchers.delete(root);}
    this.watchRoots(roots);
    const full=force||this.lastFull===null||now<this.lastFull||now-this.lastFull>=this.fullScanMs||this.dirty;
    let complete=true;
    if(full){
      this.metrics.walks++;const seen=new Set();
      for(const root of roots){
        const pending=[root];
        while(pending.length){
          const directory=pending.pop();let entries;
          try{const s=this.io.lstatSync(directory);if(!s.isDirectory()||s.isSymbolicLink())continue;const real=this.io.realpathSync(directory);if(real!==root&&!within(root,real))continue;this.parents.set(directory,real);this.metrics.directories++;entries=this.io.readdirSync(directory,{withFileTypes:true});}catch{complete=false;continue;}
          for(const entry of entries){
            const file=path.join(directory,entry.name);
            if(entry.isDirectory()&&!entry.isSymbolicLink())pending.push(file);
            else if(entry.isFile()&&entry.name.endsWith('.jsonl'))this.inspect(file,roots,changed,seen);
          }
        }
      }
      if(complete&&roots.length)for(const file of this.files.keys())if(!seen.has(file)){this.files.delete(file);this.hot.delete(file);}
      this.lastFull=now;this.dirty=false;
    }else{
      for(const file of new Set([...this.hot,...this.hints]))this.inspect(file,roots,changed);
    }
    this.hints.clear();
    while(this.files.size>this.maxFiles){const file=this.files.keys().next().value;this.files.delete(file);this.hot.delete(file);}
    while(this.hot.size>this.maxHot)this.hot.delete(this.hot.values().next().value);
    const code=!roots.length?'OBSERVER_SOURCE_UNAVAILABLE':!complete||this.readFailed?'OBSERVER_PARTIAL':this.code;
    return {changed:[...changed.values()],live:new Set(this.files.keys()),full,complete:complete&&roots.length>0,code};
  }
  reset(){this.files.clear();this.hot.clear();this.hints.clear();this.lastFull=null;}
  close(){for(const w of this.watchers.values())try{w.close();}catch{};this.watchers.clear();}
}

export function observationPaused(file){if(!file)return false;try{fs.lstatSync(file);return true;}catch(e){return e.code!=='ENOENT';}}
export function writeObserverHealth(file,value){
  if(!file)return;
  const codes=new Set(['OBSERVER_OK','OBSERVER_POLLING','OBSERVER_PARTIAL','OBSERVER_SOURCE_UNAVAILABLE','OBSERVER_PAUSED','OBSERVER_READ_FAILED','OBSERVER_STATE_FAILED']);
  const result={version:1,at:Number.isFinite(value.at)?value.at:Date.now(),status:value.status==='paused'?'paused':value.code==='OBSERVER_OK'?'ok':'degraded',code:codes.has(value.code)?value.code:'OBSERVER_READ_FAILED'};
  for(const key of ['lastScanAt','lastEventAt','active','waiting','working','thinking','completed','completedAt','discovered','hot'])if(Number.isFinite(value[key]))result[key]=Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,value[key]));
  try{
    const dir=path.dirname(file);if(fs.lstatSync(dir).isSymbolicLink())return;const tmp=file+'.tmp';
    try{const s=fs.lstatSync(tmp);if(!s.isFile()||s.isSymbolicLink())return;fs.unlinkSync(tmp);}catch(e){if(e.code!=='ENOENT')return;}
    fs.writeFileSync(tmp,JSON.stringify(result),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);
  }catch{}
}
export function clearOwnedFiles(directory,names){
  const root=path.resolve(directory);const chain=[];for(let p=root;;p=path.dirname(p)){chain.push(p);if(path.dirname(p)===p)break;}
  for(const p of chain){const s=fs.lstatSync(p);if(s.isSymbolicLink()||!s.isDirectory())throw new Error('UNSAFE_OBSERVER_STATE');}
  let removed=0;
  for(const name of names){if(path.basename(name)!==name)throw new Error('UNSAFE_OBSERVER_STATE');const file=path.join(root,name);try{const s=fs.lstatSync(file);if(s.isFile()&&!s.isSymbolicLink()){fs.unlinkSync(file);removed++;}}catch(e){if(e.code!=='ENOENT')throw e;}}
  return removed;
}
