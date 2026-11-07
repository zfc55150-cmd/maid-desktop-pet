import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeEvent,reduceEvent,validSnapshot} from './activity-state.mjs';

const sleep=ms => new Promise(resolve => setTimeout(resolve,ms));
export function ensureDirectory(directory) {
  const absolute=path.resolve(directory);
  const chain=[];
  for (let p=absolute;;p=path.dirname(p)) {chain.push(p);if(path.dirname(p)===p)break;}
  for (const p of chain.reverse()) {
    try {const stat=fs.lstatSync(p);if(stat.isSymbolicLink() || !stat.isDirectory())throw new Error('Unsafe directory');}
    catch(error) {
      if(error.code!=='ENOENT')throw error;
      try{fs.mkdirSync(p);}catch(created){if(created.code!=='EEXIST')throw created;}
      const stat=fs.lstatSync(p);if(stat.isSymbolicLink() || !stat.isDirectory())throw new Error('Unsafe directory');
    }
  }
  return absolute;
}
export async function recordEvent(input,directory,{now=Date.now(),skipOlder=false,reconcile=null}={}) {
  const event=normalizeEvent(input,now);
  if (!event) return false;
  const root=ensureDirectory(directory);
  const destination=path.join(root,event.session+'.json');
  const lock=path.join(root,event.session+'.lock');
  let owned=false,temp;
  try {
    for (let attempt=0;attempt<50;attempt++) {
      try {fs.mkdirSync(lock);owned=true;break;}
      catch(error) {
        if (error.code!=='EEXIST')throw error;
        let stat;
        try{stat=fs.lstatSync(lock);}catch(missing){if(missing.code==='ENOENT')continue;throw missing;}
        if(stat.isSymbolicLink() || !stat.isDirectory())throw new Error('Unsafe lock');
        if(Date.now()-stat.mtimeMs>10000){try{fs.rmdirSync(lock);}catch{}}
        await sleep(10);
      }
    }
    if(!owned)return false;
    let previous=null;
    try {
      const stat=fs.lstatSync(destination);
      if(stat.isSymbolicLink() || stat.size>16384)throw new Error('Unsafe snapshot');
      previous=JSON.parse(fs.readFileSync(destination,'utf8'));
    }catch(error){if(error.message==='Unsafe snapshot')throw error;}
    if(skipOlder&&validSnapshot(previous)&&previous.at>event.at)return false;
    // A restarted bounded tail reconstructs known open tools. Do not keep
    // orphaned tool identifiers from the previous observer process forever.
    // Preserve a newer/in-progress explicit waiting state until its own result.
    if(validSnapshot(reconcile)&&reconcile.session===event.session&&reconcile.turn===event.turn&&(!validSnapshot(previous)||previous.phase!=='waiting'||previous.turn!==reconcile.turn))previous=reconcile;
    const next=reduceEvent(previous,{...event,at:Math.max(event.at,validSnapshot(previous)?previous.at:0)});
    if(!validSnapshot(next))return false;
    temp=destination+'.'+process.pid+'.tmp';
    fs.writeFileSync(temp,JSON.stringify(next),{flag:'wx',mode:0o600});
    for(let attempt=0;;attempt++){
      try{fs.renameSync(temp,destination);temp=null;break;}
      catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=5)throw error;await sleep(10*(attempt+1));}
    }
    // Bound persistent metadata. Never traverse outside this fixed directory.
    const files=fs.readdirSync(root).filter(name=>/^[a-f0-9]{32}\.json$/.test(name)).map(name=>({name,stat:fs.lstatSync(path.join(root,name))})).filter(x=>x.stat.isFile()&&!x.stat.isSymbolicLink()).sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs);
    for(const item of files.slice(64)) {try{fs.unlinkSync(path.join(root,item.name));}catch{}}
    return true;
  } finally {
    if(temp){try{fs.unlinkSync(temp);}catch{}}
    if(owned){try{fs.rmdirSync(lock);}catch{}}
  }
}

async function main() {
  const flag=process.argv.indexOf('--state-dir');
  if(flag<0 || !process.argv[flag+1])return;
  let bytes=0,chunks=[];
  for await(const chunk of process.stdin) {
    bytes+=chunk.length;
    if(bytes>16*1024*1024)return;
    chunks.push(chunk);
  }
  try{await recordEvent(JSON.parse(Buffer.concat(chunks).toString('utf8')),process.argv[flag+1]);}catch{}
  // Always quiet and successful: this observer never approves, blocks, edits,
  // or continues a Codex task, even if its own storage is unavailable.
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{}).finally(()=>{process.exitCode=0;});
}
