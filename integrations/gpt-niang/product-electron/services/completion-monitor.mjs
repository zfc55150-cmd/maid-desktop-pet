import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {fileURLToPath} from 'node:url';
import {RolloutDiscovery,observationPaused,writeObserverHealth,clearOwnedFiles} from './observer-discovery.mjs';

const NORMAL_ENDINGS=new Set(['task_complete','turn_complete']);
const MAX_READ_BYTES=4*1024*1024,MAX_LINE_CHARACTERS=1024*1024,MAX_SEEN_TURNS=4096;
const RESUME_GRACE_MS=5000,RESUME_STATE_MAX_AGE_MS=5*60*1000;
const MAX_TRACKED_TAILS=256,MAX_TRACKED_SUBAGENTS=512,MAX_CHECKPOINTS=512;

// A crash can happen between a turn finishing and the monitor reading it.
// Remembering the last scan time (and the newest emitted completion) lets the
// next process re-read the short window before it instead of baselining those
// records away, without re-notifying a turn that was already shown.
function loadMonitorState(file){
  try{
    const value=JSON.parse(fs.readFileSync(file,'utf8'));
    if(value && Number.isFinite(value.at) && Date.now()-value.at<RESUME_STATE_MAX_AGE_MS){
      return {at:value.at,lastEnded:Number.isFinite(value.lastEnded)?value.lastEnded:0};
    }
  }catch{}
  return null;
}
function saveMonitorState(file,at,lastEnded){
  try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({at,lastEnded}));}catch{}
}

export function parseCompletionRecord(record,{sessionId='',seenTurns=null,since=0}={}) {
  if(record?.type!=='event_msg' || !NORMAL_ENDINGS.has(record.payload?.type))return null;
  const payload=record.payload;
  if(payload.error || ['failed','cancelled','canceled','aborted','interrupted'].includes(payload.status))return null;
  const turnId=payload.turn_id??record.turn_id;
  if(typeof turnId!=='string' || !turnId || turnId.length>256)return null;
  const endedAt=typeof record.timestamp==='number'?record.timestamp:Date.parse(record.timestamp);
  if(since && (!Number.isFinite(endedAt) || endedAt<since))return null;
  const key=sessionId+'\0'+turnId;
  if(seenTurns?.has(key))return null;
  if(seenTurns){seenTurns.add(key);if(seenTurns.size>MAX_SEEN_TURNS)seenTurns.delete(seenTurns.values().next().value);}
  return {type:'completion',sessionId,turnId,endedAt:Number.isFinite(endedAt)?endedAt:null};
}

function fileIdentity(stat){return `${stat.dev}:${stat.ino}`;}

export class CompletionRolloutTail {
  constructor(file,{sessionId=path.basename(file),baseline=false,since=0,seenTurns=null,recoverTail=false}={}) {
    this.file=file;this.sessionId=sessionId;this.since=since;this.offset=0;
    this.pending='';this.discardingLongLine=false;this.decoder=new StringDecoder('utf8');this.seenTurns=seenTurns??new Set();
    const stat=fs.statSync(file);this.identity=fileIdentity(stat);
    if(baseline)this.offset=stat.size;
    else if(recoverTail){this.offset=Math.max(0,stat.size-MAX_READ_BYTES);this.discardingLongLine=this.offset>0;}
    this.committedOffset=this.offset;
  }
  update() {
    this.readFailed=false;let stat;try{stat=fs.statSync(this.file);}catch{this.readFailed=true;return [];}
    const identity=fileIdentity(stat);
    if(identity!==this.identity || stat.size<this.offset){
      // Retain dedupe and the time boundary when a log rotates or is truncated.
      this.identity=identity;this.offset=0;this.committedOffset=0;this.pending='';this.discardingLongLine=false;this.decoder=new StringDecoder('utf8');
    }
    const remaining=Math.min(stat.size-this.offset,MAX_READ_BYTES);
    if(remaining<=0)return [];
    const buffer=Buffer.alloc(remaining);let count=0,fd;
    try{fd=fs.openSync(this.file,'r');count=fs.readSync(fd,buffer,0,remaining,this.offset);}catch{this.readFailed=true;return [];}
    finally{if(fd!==undefined)fs.closeSync(fd);}
    if(!count)return [];
    this.offset+=count;
    // Keep a byte boundary so a detached tail can release its private partial
    // text and later reread that unfinished line without losing a UTF-8 suffix.
    const lastNewline=buffer.subarray(0,count).lastIndexOf(10);
    if(lastNewline>=0)this.committedOffset=this.offset-(count-lastNewline-1);
    const lines=(this.pending+this.decoder.write(buffer.subarray(0,count))).split('\n');this.pending=lines.pop();
    const notifications=[];
    for(const raw of lines){
      if(this.discardingLongLine){this.discardingLongLine=false;continue;}
      const line=raw.endsWith('\r')?raw.slice(0,-1):raw;
      if(line.length>MAX_LINE_CHARACTERS || !line.includes('"event_msg"'))continue;
      try{const event=parseCompletionRecord(JSON.parse(line),{sessionId:this.sessionId,seenTurns:this.seenTurns,since:this.since});if(event)notifications.push(event);}catch{}
    }
    if(this.pending.length>MAX_LINE_CHARACTERS){this.pending='';this.discardingLongLine=true;}
    return notifications;
  }
}

function isWithin(root,file){const relative=path.relative(root,file);return relative!=='' && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);}
function readSessionHeader(file) {
  let fd;
  try{
    fd=fs.openSync(file,'r');const buffer=Buffer.alloc(64*1024),count=fs.readSync(fd,buffer,0,buffer.length,0);
    const contents=buffer.subarray(0,count).toString('utf8'),newline=contents.indexOf('\n');
    if(newline<0)return null;
    const record=JSON.parse(contents.slice(0,newline).replace(/^\uFEFF/,''));
    if(record?.type!=='session_meta')return null;
    const source=record.payload?.source;
    return {subagent:source==='subagent' || Boolean(source && typeof source==='object' && Object.hasOwn(source,'subagent'))};
  }catch{return null;}finally{if(fd!==undefined)fs.closeSync(fd);}
}

export function listRolloutFiles(codexHome) {
  const files=[];
  for(const name of ['sessions','archived_sessions']){
    let root;try{root=fs.realpathSync(path.join(codexHome,name));}catch{continue;}
    const pending=[root];
    while(pending.length){
      const current=pending.pop();let entries;try{entries=fs.readdirSync(current,{withFileTypes:true});}catch{continue;}
      for(const entry of entries){
        const candidate=path.join(current,entry.name);
        if(entry.isDirectory()){pending.push(candidate);continue;}
        if(!entry.isFile() || !entry.name.endsWith('.jsonl'))continue;
        try{const real=fs.realpathSync(candidate);if(isWithin(root,real))files.push(real);}catch{}
      }
    }
  }
  return [...new Set(files)];
}
export function defaultCodexHome(env=process.env){return path.resolve(env.CODEX_HOME || path.join(env.USERPROFILE || env.HOME || os.homedir(),'.codex'));}

export class CompletionMonitor {
  constructor({codexHome=defaultCodexHome(),intervalMs=1000,onNotification=()=>{},since=Date.now(),stateFile=null,now=()=>Date.now(),maxTrackedTails=MAX_TRACKED_TAILS,discoveryOptions={watch:false},pauseFile=null,healthFile=stateFile?path.join(path.dirname(stateFile),'completion-observer-health.json'):null}={}){
    this.codexHome=codexHome;this.intervalMs=intervalMs;this.onNotification=onNotification;this.since=since;
    this.stateFile=stateFile;this.resume=false;this.lastStateSave=0;this.lastEnded=0;
    this.now=now;this.maxTrackedTails=Number.isSafeInteger(maxTrackedTails)&&maxTrackedTails>0&&maxTrackedTails<=MAX_TRACKED_TAILS?maxTrackedTails:MAX_TRACKED_TAILS;
    this.tails=new Map();this.subagentSessions=new Set();this.subagentTouched=new Map();this.checkpoints=new Map();this.seenTurns=new Set();this.recoveryFloor=since;this.timer=null;
    this.discovery=new RolloutDiscovery({codexHome,now,...discoveryOptions});this.pauseFile=pauseFile;this.healthFile=healthFile;this.paused=false;this.wasPaused=false;this.completed=0;this.completedAt=0;this.subagentIdentity=new Map();
  }
  start(){
    if(this.timer)return;
    if(this.stateFile){
      const saved=loadMonitorState(this.stateFile);
      if(saved!==null){
        this.lastEnded=saved.lastEnded;
        this.since=Math.max(0,Math.max(saved.at-RESUME_GRACE_MS,saved.lastEnded+1));
        this.recoveryFloor=this.since;
        this.resume=true;
      }
    }
    this.scan(!this.resume);
    this.persistState(true);
    this.timer=setInterval(()=>this.scan(false),this.intervalMs);this.timer.unref?.();
  }
  persistState(force=false){
    if(!this.stateFile)return;
    const now=this.now();
    if(!force && now-this.lastStateSave<5000)return;
    this.lastStateSave=now;saveMonitorState(this.stateFile,now,this.lastEnded);
  }
  checkpoint(sessionId,tail,now){
    this.checkpoints.delete(sessionId);
    this.checkpoints.set(sessionId,{identity:tail.identity,offset:tail.discardingLongLine?tail.offset:tail.committedOffset,since:tail.since,discardingLongLine:tail.discardingLongLine,at:now});
    while(this.checkpoints.size>MAX_CHECKPOINTS){this.checkpoints.delete(this.checkpoints.keys().next().value);this.recoveryFloor=Math.max(this.recoveryFloor,now-RESUME_STATE_MAX_AGE_MS);}
  }
  retainTail(sessionId,tail,now){
    this.tails.delete(sessionId);this.tails.set(sessionId,tail);
    while(this.tails.size>this.maxTrackedTails){
      const oldest=this.tails.keys().next().value;this.checkpoint(oldest,this.tails.get(oldest),now);this.tails.delete(oldest);
    }
  }
  prune(files,now){
    const live=new Set(files.map(file=>path.basename(file)));
    for(const [id,tail] of this.tails)if(!live.has(id)){this.checkpoint(id,tail,now);this.tails.delete(id);}
    for(const [id,at] of this.subagentTouched)if(!live.has(id)||now-at>RESUME_STATE_MAX_AGE_MS){this.subagentTouched.delete(id);this.subagentSessions.delete(id);this.subagentIdentity.delete(id);}
    for(const [id,checkpoint] of this.checkpoints)if(now-checkpoint.at>RESUME_STATE_MAX_AGE_MS){this.checkpoints.delete(id);this.recoveryFloor=Math.max(this.recoveryFloor,now-RESUME_STATE_MAX_AGE_MS);}
  }
  scan(baseline=false){
    const now=this.now();
    if(this.paused||observationPaused(this.pauseFile)){
      this.wasPaused=true;writeObserverHealth(this.healthFile,{at:now,status:'paused',code:'OBSERVER_PAUSED',completed:0});return;
    }
    if(this.wasPaused){this.wasPaused=false;this.since=now;this.recoveryFloor=now;this.tails.clear();this.checkpoints.clear();this.subagentSessions.clear();this.subagentTouched.clear();this.subagentIdentity.clear();this.discovery.reset();baseline=true;}
    const found=this.discovery.scan();
    if(found.full&&found.complete)this.prune([...found.live],now);
    const pending=new Map(found.changed.map(entry=>[entry.file,entry]));
    for(const tail of this.tails.values()){const entry=this.discovery.files.get(tail.file);if(entry&&tail.offset<entry.size)pending.set(entry.file,entry);}
    let code=found.code;
    for(const entry of pending.values()){
      const file=entry.file;
      const sessionId=path.basename(file);
      if(this.subagentSessions.has(sessionId)&&this.subagentIdentity.get(sessionId)===entry.identity){this.subagentTouched.set(sessionId,now);continue;}
      this.subagentSessions.delete(sessionId);this.subagentTouched.delete(sessionId);this.subagentIdentity.delete(sessionId);
      let tail=this.tails.get(sessionId);
      if(!tail){
        const header=readSessionHeader(file);if(header===null){code='OBSERVER_READ_FAILED';continue;}
        if(header.subagent){
          this.subagentSessions.add(sessionId);this.subagentTouched.set(sessionId,now);this.subagentIdentity.set(sessionId,entry.identity);
          while(this.subagentSessions.size>MAX_TRACKED_SUBAGENTS){const oldest=this.subagentSessions.values().next().value;this.subagentSessions.delete(oldest);this.subagentTouched.delete(oldest);this.subagentIdentity.delete(oldest);}
          continue;
        }
        // During crash recovery, files touched inside the grace window are read
        // from their start and filtered by `since` instead of being skipped.
        let fileBaseline=baseline;
        if(fileBaseline && this.resume){try{if(fs.statSync(file).mtimeMs>=this.since)fileBaseline=false;}catch{}}
        const checkpoint=this.checkpoints.get(sessionId);
        // A bounded recovery window avoids replaying remote/imported history if
        // a session returns after its in-memory checkpoint has expired.
        const since=checkpoint?.since??Math.max(this.since,this.recoveryFloor,this.lastEnded-RESUME_STATE_MAX_AGE_MS);
        try{tail=new CompletionRolloutTail(file,{sessionId,baseline:fileBaseline,since,seenTurns:this.seenTurns,recoverTail:!fileBaseline&&!checkpoint});}catch{code='OBSERVER_READ_FAILED';continue;}
        if(checkpoint){tail.identity=checkpoint.identity;tail.offset=checkpoint.offset;tail.committedOffset=checkpoint.offset;tail.discardingLongLine=checkpoint.discardingLongLine;this.checkpoints.delete(sessionId);}
        this.retainTail(sessionId,tail,now);if(fileBaseline)continue;
      }else{tail.file=file;this.retainTail(sessionId,tail,now);}
      for(const event of tail.update()){
        if(Number.isFinite(event.endedAt) && event.endedAt>this.lastEnded)this.lastEnded=event.endedAt;
        this.completed=Math.min(Number.MAX_SAFE_INTEGER,this.completed+1);this.completedAt=now;
        try{this.onNotification(event);}catch{}
      }
      if(tail.readFailed)code='OBSERVER_READ_FAILED';
    }
    this.persistState();
    writeObserverHealth(this.healthFile,{at:now,lastScanAt:now,code,completed:this.completed,completedAt:this.completedAt,discovered:this.discovery.files.size,hot:this.discovery.hot.size});
  }
  setPaused(paused){this.paused=paused===true;if(this.paused)this.wasPaused=true;}
  clearGeneratedState(){
    if(!this.paused&&!observationPaused(this.pauseFile))throw new Error('OBSERVERS_MUST_BE_PAUSED');
    this.wasPaused=true;this.tails.clear();this.checkpoints.clear();this.seenTurns.clear();this.subagentSessions.clear();this.subagentTouched.clear();this.subagentIdentity.clear();this.discovery.reset();this.completed=0;this.completedAt=0;this.lastEnded=0;
    if(!this.stateFile||path.basename(this.stateFile)!=='completion-monitor-state.json')return 0;
    return clearOwnedFiles(path.dirname(this.stateFile),['completion-monitor-state.json','completion-observer-health.json','completion-observer-health.json.tmp']);
  }
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;this.discovery.close();}
}

function run(){
  const args=process.argv.slice(2),stateFile=args[0]&&!args[0].startsWith('--')?args[0]:null;
  const pauseFile=args.includes('--pause-file')?args[args.indexOf('--pause-file')+1]:null;
  const monitor=new CompletionMonitor({onNotification:event=>process.stdout.write(JSON.stringify(event)+'\n'),stateFile,pauseFile,discoveryOptions:{watch:!args.includes('--clear-state')}});
  if(args.includes('--clear-state')){try{monitor.clearGeneratedState();}catch{process.exitCode=1;}return;}
  monitor.start();process.stdin.resume();
  process.stdin.on('end',()=>{monitor.stop();process.exit(0);});
  process.on('SIGTERM',()=>{monitor.stop();process.exit(0);});
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))run();
