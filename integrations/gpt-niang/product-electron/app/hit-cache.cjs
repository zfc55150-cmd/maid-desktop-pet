'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
class HitCache {
 constructor(root,entries,{budget=24*1024*1024}={}){this.root=root;this.entries=entries;this.budget=budget;this.cache=new Map();this.pending=new Map();this.bytes=0;this.pinned=new Set();}
 async load(name){if(this.cache.has(name)){const data=this.cache.get(name);this.cache.delete(name);this.cache.set(name,data);return data;}if(this.pending.has(name))return this.pending.get(name);const e=this.entries[name];if(!e)throw Error('MISSING_HIT_MASK');const task=fs.readFile(path.join(this.root,e.file)).then(data=>{if(data.length!==e.frames*384*384/8||crypto.createHash('sha256').update(data).digest('hex')!==e.sha256)throw Error('HIT_MASK_HASH');this.cache.set(name,data);this.bytes+=data.length;this.trim();return data;}).finally(()=>this.pending.delete(name));this.pending.set(name,task);return task;}
 trim(){for(const [name,data]of this.cache){if(this.bytes<=this.budget)break;if(this.pinned.has(name))continue;this.cache.delete(name);this.bytes-=data.length;}}
 pin(names){this.pinned=new Set(names.filter(Boolean));this.trim();}
 get(name){return this.cache.get(name);}
}
// A long route can evict a future clip before it appears. Admit its frame only
// after the mask is resident; keep the previous silhouette during that load.
class FrameAdmission {
 constructor({cache,owns,retained,accept,onError}){Object.assign(this,{cache,owns,retained,accept,onError});this.latest=null;}
 push(data){
  this.latest=data;this.cache.pin([data.clip,...this.retained()]);
  const commit=()=>{if(this.latest!==data||!this.owns(data))return false;this.accept(data);return true;};
  if(data.clip==='static'||this.cache.get(data.clip)){commit();return;}
  this.cache.load(data.clip).then(commit).catch(()=>{if(this.latest===data&&this.owns(data))this.onError();});
 }
}
module.exports={HitCache,FrameAdmission};
