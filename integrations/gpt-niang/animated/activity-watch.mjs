import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {StringDecoder} from 'node:string_decoder';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {recordEvent,ensureDirectory} from './codex-hook.mjs';
import {normalizeEvent,reduceEvent} from './activity-state.mjs';
import {RolloutDiscovery,observationPaused,writeObserverHealth,clearOwnedFiles} from './observer-discovery.mjs';

const MAX_BYTES=4*1024*1024, TTL=30*60*1000;
const require=createRequire(import.meta.url);
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(x);
const stamp=r=>typeof r.timestamp==='number'?r.timestamp:Date.parse(r.timestamp);
const within=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};

// Tool output may be an object or serialized JSON. Only explicit typed status
// fields cross the bridge; prose and nested content are never searched for errors.
export function toolResultMetadata(value){
  if(typeof value==='string'){
    if(value.length>65536||Buffer.byteLength(value,'utf8')>65536||value.trimStart()[0]!=='{')return null;
    try{value=JSON.parse(value);}catch{return null;}
  }
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const metadata={};
  if(Object.hasOwn(value,'isError')&&typeof value.isError==='boolean')metadata.isError=value.isError;
  if(Object.hasOwn(value,'exit_code')&&Number.isSafeInteger(value.exit_code)&&Math.abs(value.exit_code)<=2147483648)metadata.exit_code=value.exit_code;
  return Object.keys(metadata).length?metadata:null;
}

// Only event type, timestamp and identifiers leave this parser. Tool arguments,
// text, reasoning and output are never copied to a snapshot or stdout.
export class ActivityParser {
  constructor(session){this.session=session;this.turn=null;this.started=null;this.tools=new Set();}
  parse(record,now=Date.now()){
    if(!record||typeof record!=='object')return [];
    const p=record?.payload;const at=stamp(record);if(!p||!Number.isFinite(at)||at>now+5000)return [];
    const out=[];
    const add=(event,tool,result)=>out.push({hook_event_name:event,session_id:this.session,turn_id:this.turn,tool_use_id:tool,at,...(result?{tool_response:result}:{})});
    if(record.type==='turn_context'&&validId(p.turn_id)){if(this.turn!==p.turn_id)this.tools.clear();this.turn=p.turn_id;return out;}
    if(record.type==='event_msg'){
      if(p.type==='item_completed'&&!this.turn&&validId(p.turn_id)){
        // Desktop rollout tails may begin mid-turn after a large image/tool
        // output. A structured item carries the real turn identity as well.
        this.turn=p.turn_id;this.started=this.turn;add('UserPromptSubmit');
      }else if(p.type==='task_started'&&validId(p.turn_id)){
        if(this.turn!==p.turn_id)this.tools.clear();
        this.turn=p.turn_id;this.started=this.turn;add('UserPromptSubmit');
      }else if(['task_complete','turn_complete','turn_aborted','task_aborted'].includes(p.type)&&validId(p.turn_id)){
        // An old turn's late end must never end the current turn.
        const normal=['task_complete','turn_complete'].includes(p.type)&&!p.error&&!['failed','cancelled','canceled','aborted','interrupted'].includes(p.status);
        if(this.turn===p.turn_id)this.tools.clear();
        out.push({hook_event_name:normal?'Stop':'Interrupt',session_id:this.session,turn_id:p.turn_id,at});
      }
    }else if(record.type==='response_item'&&this.turn){
      if(['function_call','custom_tool_call'].includes(p.type)&&typeof p.call_id==='string'&&p.call_id.length<=512){
        if(this.started!==this.turn){add('UserPromptSubmit');this.started=this.turn;}
        add('PreToolUse',p.call_id);
        this.tools.add(p.call_id);if(this.tools.size>64)this.tools.delete(this.tools.values().next().value);
        if(['request_user_input','functions.request_user_input'].includes(p.name))add('PermissionRequest',p.call_id);
      }else if(['function_call_output','custom_tool_call_output'].includes(p.type)&&typeof p.call_id==='string'&&p.call_id.length<=512){
        const result=this.tools.has(p.call_id)?toolResultMetadata(p.output):null;
        this.tools.delete(p.call_id);add('PostToolUse',p.call_id,result);
      }
    }
    return out.filter(x=>at>=now-TTL);
  }
}

function header(file){
  let fd;try{
    fd=fs.openSync(file,'r');const b=Buffer.alloc(65536),n=fs.readSync(fd,b,0,b.length,0);const text=b.subarray(0,n).toString('utf8');const end=text.indexOf('\n');
    if(end<0)return null;const r=JSON.parse(text.slice(0,end).replace(/^\uFEFF/,''));
    if(r.type!=='session_meta'||!validId(r.payload?.id))return null;
    const source=r.payload.source;if(source==='subagent'||(source&&typeof source==='object'&&Object.hasOwn(source,'subagent')))return null;
    return r.payload.id;
  }catch{return null;}finally{if(fd!==undefined)fs.closeSync(fd);}
}

export class ActivityTail {
  constructor(file,{session=header(file),bootstrap=true}={}){
    if(!session)throw new Error('Unsupported session');
    this.file=file;this.parser=new ActivityParser(session);this.pending='';this.decoder=new StringDecoder('utf8');this.discard=false;
    const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink())throw new Error('Unsafe rollout');
    this.identity=`${s.dev}:${s.ino}`;this.offset=bootstrap?Math.max(0,s.size-MAX_BYTES):0;
    this.committedOffset=this.offset;
    this.discard=this.offset>0;this.bootstrap=bootstrap;
  }
  read(now=Date.now()){
    const s=fs.lstatSync(this.file);if(s.isSymbolicLink()||!s.isFile())return [];
    const identity=`${s.dev}:${s.ino}`;
    if(identity!==this.identity||s.size<this.offset){const session=header(this.file);if(!session)throw new Error('Unsupported session');this.identity=identity;this.offset=0;this.committedOffset=0;this.pending='';this.decoder=new StringDecoder('utf8');this.discard=false;this.parser=new ActivityParser(session);}
    const size=Math.min(MAX_BYTES,s.size-this.offset);if(size<=0)return [];
    const b=Buffer.alloc(size);let fd,n;try{fd=fs.openSync(this.file,'r');n=fs.readSync(fd,b,0,size,this.offset);}finally{if(fd!==undefined)fs.closeSync(fd);}
    this.offset+=n;const newline=b.subarray(0,n).lastIndexOf(10);if(newline>=0)this.committedOffset=this.offset-(n-newline-1);
    const lines=(this.pending+this.decoder.write(b.subarray(0,n))).split('\n');this.pending=lines.pop();const events=[];
    for(const line of lines){
      if(this.discard){this.discard=false;continue;}
      if(line.length>MAX_BYTES)continue;
      // Avoid parsing ordinary chat and reasoning records when possible.
      if(!line.includes('"event_msg"')&&!line.includes('"response_item"')&&!line.includes('"turn_context"'))continue;
      try{events.push(...this.parser.parse(JSON.parse(line),now));}catch{}
    }
    if(this.pending.length>MAX_BYTES){this.pending='';this.discard=true;}
    if(!this.bootstrap)return events;
    this.bootstrap=false;
    let state=null;for(const raw of events){state=reduceEvent(state,normalizeEvent(raw,raw.at));}
    // Startup recovers an actually active recent turn, never celebrates history.
    if(!state)return [];
    const turn=this.parser.turn||events.at(-1)?.turn_id;
    if(!turn)return [];
    // Clear a pre-crash active snapshot when its completion happened while the
    // watcher was stopped. Startup never celebrates historical completions.
    if(state.terminal)return [{hook_event_name:'Interrupt',session_id:this.parser.session,turn_id:turn,at:state.at}];
    if(state.expiresAt<=now)return [];
    this.recoveredSnapshot=state;
    const seed={hook_event_name:'UserPromptSubmit',session_id:this.parser.session,turn_id:turn,at:state.at};
    const open=new Map();for(const event of events){if(event.hook_event_name==='PreToolUse')open.set(event.tool_use_id,event);else if(event.hook_event_name==='PostToolUse')open.delete(event.tool_use_id);else if(['UserPromptSubmit','Stop','Interrupt'].includes(event.hook_event_name))open.clear();}
    const closed=events.filter(e=>e.hook_event_name==='PostToolUse'&&e.turn_id===turn);
    return [seed,...closed,...[...open.values()].map(e=>({...e,at:state.at}))];
  }
}

export function indexedRollouts(codexHome,root){
  let db;
  try{
    const name=fs.readdirSync(codexHome).filter(x=>/^state_\d+\.sqlite$/.test(x)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]))[0];
    if(!name)return [];const file=path.join(codexHome,name);if(fs.lstatSync(file).isSymbolicLink())return [];
    const {DatabaseSync}=require('node:sqlite');db=new DatabaseSync(file,{readOnly:true,timeout:100});
    // Read exactly these metadata fields; never SELECT titles/messages/preview.
    const rows=db.prepare('SELECT rollout_path FROM threads WHERE archived = 0 ORDER BY updated_at DESC LIMIT 96').all();
    return rows.map(x=>x.rollout_path).filter(x=>typeof x==='string'&&x.endsWith('.jsonl')).filter(x=>{
      try{return within(root,fs.realpathSync(x))&&!fs.lstatSync(x).isSymbolicLink();}catch{return false;}
    });
  }catch{return [];}finally{try{db?.close();}catch{}}
}

export function recentRollouts(codexHome,now=Date.now()){
  const files=[];const sessions=path.join(codexHome,'sessions');let root;try{root=fs.realpathSync(sessions);}catch{return files;}
  for(let d=0;d<7;d++){
    const date=new Date(now-d*86400000);const day=path.join(root,String(date.getFullYear()),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0'));
    try{
      if(fs.lstatSync(day).isSymbolicLink()||!within(root,fs.realpathSync(day)))continue;
      for(const entry of fs.readdirSync(day,{withFileTypes:true}).slice(0,512)){
        if(!entry.isFile()||!entry.name.endsWith('.jsonl'))continue;const file=path.join(day,entry.name),s=fs.lstatSync(file);
        if(s.isSymbolicLink()||!within(root,fs.realpathSync(file)))continue;
        files.push({file,at:s.mtimeMs});
      }
    }catch{}
  }
  // Indexed paths also find a months-old chat that the user resumed today.
  // A missing/changed/inaccessible index falls back to recent local folders.
  return [...new Set([...indexedRollouts(codexHome,root),...files.sort((a,b)=>b.at-a.at).map(x=>x.file)])].slice(0,96);
}

export class ActivityWatch {
  constructor({codexHome,stateDir,intervalMs=1000,now=()=>Date.now(),discoveryOptions={watch:false},pauseFile=null,healthFile=null}={}){
    this.codexHome=codexHome;this.stateDir=ensureDirectory(stateDir);this.intervalMs=intervalMs;this.now=now;this.tails=new Map();this.timer=null;this.busy=false;
    this.discovery=new RolloutDiscovery({codexHome,now,...discoveryOptions});this.pauseFile=pauseFile;this.healthFile=healthFile;this.paused=false;this.wasPaused=false;this.checkpoints=new Map();this.completedTurns=new Map();this.completed=0;this.completedAt=0;
  }
  checkpoint(file,t,now){
    this.checkpoints.delete(path.basename(file));this.checkpoints.set(path.basename(file),{identity:t.identity,offset:t.discard?t.offset:t.committedOffset,discard:t.discard,at:now,session:t.parser.session,turn:t.parser.turn,started:t.parser.started,tools:[...t.parser.tools]});
    for(const [key,value] of this.checkpoints)if(now-value.at>300000)this.checkpoints.delete(key);
    while(this.checkpoints.size>512)this.checkpoints.delete(this.checkpoints.keys().next().value);
  }
  retain(file,tail,now){
    this.tails.delete(file);this.tails.set(file,tail);
    while(this.tails.size>96){const old=this.tails.keys().next().value;this.checkpoint(old,this.tails.get(old),now);this.tails.delete(old);}
  }
  async scan(){
    if(this.busy)return;this.busy=true;
    try{
      const now=this.now();
      if(this.paused||observationPaused(this.pauseFile)){this.wasPaused=true;writeObserverHealth(this.healthFile,{at:now,status:'paused',code:'OBSERVER_PAUSED',completed:0});return;}
      if(this.wasPaused){this.wasPaused=false;this.tails.clear();this.checkpoints.clear();this.discovery.reset();}
      const initial=this.discovery.lastFull===null,found=this.discovery.scan(),pending=new Map(found.changed.map(entry=>[entry.file,entry]));let code=found.code;
      if(initial){
        // Bootstrap has always been bounded to 96 sessions. Discover all cold
        // metadata, but recover only the most relevant sessions at startup;
        // any older path is still read when its metadata changes or it resumes.
        let indexed=[];try{indexed=indexedRollouts(this.codexHome,fs.realpathSync(path.join(this.codexHome,'sessions'))).map(file=>fs.realpathSync(file));}catch{}
        const order=[...new Set([...indexed,...found.changed.sort((a,b)=>b.mtimeMs-a.mtimeMs).map(entry=>entry.file)])].slice(0,96);
        for(const file of pending.keys())if(!order.includes(file))pending.delete(file);
        for(const file of pending.keys()){this.discovery.hot.delete(file);this.discovery.hot.add(file);}
        while(this.discovery.hot.size>this.discovery.maxHot)this.discovery.hot.delete(this.discovery.hot.values().next().value);
      }
      if(found.full&&found.complete)for(const key of this.tails.keys())if(!found.live.has(key)){this.checkpoint(key,this.tails.get(key),now);this.tails.delete(key);}
      for(const tail of this.tails.values()){const entry=this.discovery.files.get(tail.file);if(entry&&tail.offset<entry.size)pending.set(entry.file,entry);}
      for(const entry of pending.values()){
        const file=entry.file;
        try{let tail=this.tails.get(file);
          if(!tail){for(const [old,t] of this.tails)if(path.basename(old)===path.basename(file)&&t.identity===entry.identity){this.tails.delete(old);t.file=file;tail=t;break;}}
          if(!tail){
          const checkpoint=this.checkpoints.get(path.basename(file));
          tail=new ActivityTail(file);
          if(checkpoint&&checkpoint.identity===entry.identity&&checkpoint.offset<=entry.size&&now-checkpoint.at<=300000){tail.bootstrap=false;tail.identity=checkpoint.identity;tail.offset=checkpoint.offset;tail.committedOffset=checkpoint.offset;tail.discard=checkpoint.discard;tail.parser=new ActivityParser(checkpoint.session);tail.parser.turn=checkpoint.turn;tail.parser.started=checkpoint.started;tail.parser.tools=new Set(checkpoint.tools);this.checkpoints.delete(path.basename(file));}
        }
          this.retain(file,tail,now);
          const events=tail.read(now);
          for(let i=0;i<events.length;i++){
            const accepted=await recordEvent(events[i],this.stateDir,{now:events[i].at,skipOlder:true,reconcile:i===0?tail.recoveredSnapshot:null});
            if(!accepted){code='OBSERVER_STATE_FAILED';continue;}
            if(events[i].hook_event_name==='Stop'){const key=events[i].session_id+'\0'+events[i].turn_id;if(!this.completedTurns.has(key)){this.completedTurns.set(key,now);this.completed++;this.completedAt=now;}}
          }
          tail.recoveredSnapshot=null;
        }catch(error){if(error.message!=='Unsupported session')code='OBSERVER_READ_FAILED';}
      }
      for(const [key,at] of this.completedTurns)if(now-at>300000)this.completedTurns.delete(key);
      while(this.completedTurns.size>512)this.completedTurns.delete(this.completedTurns.keys().next().value);
      writeObserverHealth(this.healthFile,{at:now,lastScanAt:now,code,completed:this.completed,completedAt:this.completedAt,discovered:this.discovery.files.size,hot:this.discovery.hot.size});
    }finally{this.busy=false;}
  }
  async start(){if(this.timer)return;await this.scan();this.timer=setInterval(()=>this.scan().catch(()=>{}),this.intervalMs);}
  setPaused(paused){this.paused=paused===true;if(this.paused)this.wasPaused=true;}
  clearGeneratedState(){
    if(this.busy)throw new Error('OBSERVER_BUSY');
    if(!this.paused&&!observationPaused(this.pauseFile))throw new Error('OBSERVERS_MUST_BE_PAUSED');
    this.wasPaused=true;this.tails.clear();this.checkpoints.clear();this.completedTurns.clear();this.discovery.reset();this.completed=0;this.completedAt=0;
    const names=fs.readdirSync(this.stateDir).filter(name=>/^[a-f0-9]{32}\.json$/.test(name)||['observer-health.json','observer-health.json.tmp'].includes(name));
    return clearOwnedFiles(this.stateDir,names);
  }
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;this.discovery.close();}
}

async function main(){
  const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];if(!args.includes('--state-dir'))return;
  const codexHome=args.includes('--codex-home')?get('--codex-home'):(process.env.CODEX_HOME||path.join(process.env.USERPROFILE||os.homedir(),'.codex'));
  const stateDir=get('--state-dir'),pauseFile=args.includes('--pause-file')?get('--pause-file'):null;
  const watcher=new ActivityWatch({codexHome,stateDir,pauseFile,healthFile:path.join(stateDir,'observer-health.json'),discoveryOptions:{watch:!args.includes('--clear-state')}});
  if(args.includes('--clear-state')){try{watcher.clearGeneratedState();}catch{process.exitCode=1;}return;}
  await watcher.start();
  if(args.includes('--once')){watcher.stop();return;}
  process.stdin.resume();process.stdin.on('end',()=>{watcher.stop();process.exit(0);});
  process.on('SIGTERM',()=>{watcher.stop();process.exit(0);});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.exitCode=1;});
