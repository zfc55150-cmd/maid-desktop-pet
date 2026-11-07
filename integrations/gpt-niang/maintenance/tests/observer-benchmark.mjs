import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CompletionMonitor} from '../runtime/completion-monitor.mjs';
import {ActivityWatch} from '../../animated/activity-watch.mjs';

const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];
if(!args.includes('--baseline-dir')||!args.includes('--report'))throw Error('Explicit baseline and report paths required');
const baselineDir=path.resolve(get('--baseline-dir')),report=path.resolve(get('--report'));
const passes=args.includes('--passes')?Math.max(1,Math.min(3,Number(get('--passes'))||1)):3;
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
const oldActivityFile=path.join(baselineDir,'benchmark-baseline-activity.mjs');
const baselineActivity=fs.readFileSync(path.join(baselineDir,'baseline-activity-watch.mjs'),'utf8')
  .replace("'./codex-hook.mjs'",JSON.stringify(pathToFileURL(path.join(sourceRoot,'animated','codex-hook.mjs')).href))
  .replace("'./activity-state.mjs'",JSON.stringify(pathToFileURL(path.join(sourceRoot,'animated','activity-state.mjs')).href));
fs.writeFileSync(oldActivityFile,baselineActivity);
const {CompletionMonitor:BeforeCompletion}=await import(pathToFileURL(path.join(baselineDir,'baseline-completion-monitor.mjs')).href);
const {ActivityWatch:BeforeActivity}=await import(pathToFileURL(oldActivityFile).href);

async function measured(run){
  const counts={readdir:0,stat:0,realpath:0,open:0,read:0,readBytes:0},originals={};
  for(const [name,key] of [['readdirSync','readdir'],['statSync','stat'],['lstatSync','stat'],['realpathSync','realpath'],['openSync','open'],['readSync','read']]){
    originals[name]=fs[name];fs[name]=function(...values){counts[key]++;const result=originals[name].apply(this,values);if(name==='readSync')counts.readBytes+=result;return result;};
  }
  const started=performance.now();
  try{await run();return {...counts,elapsedMs:Math.round((performance.now()-started)*1000)/1000};}
  finally{for(const [name,fn] of Object.entries(originals))fs[name]=fn;}
}
const rows=[];
try{
 for(const size of [1000,10000]){
  const fixture=fs.mkdtempSync(path.join(baselineDir,'benchmark-fixture-'));
  try{
   const now=Date.now(),date=new Date(now),day=path.join(fixture,'sessions',String(date.getFullYear()),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0'));
   fs.mkdirSync(day,{recursive:true});const files=[];
   for(let i=0;i<size;i++){
    const file=path.join(day,String(i).padStart(5,'0')+'.jsonl');files.push(file);
    fs.writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id:'fake-session-'+i,source:'vscode'}})+'\n'+JSON.stringify({type:'event_msg',timestamp:new Date(now-3600000).toISOString(),payload:{type:'task_complete',turn_id:'old-'+i}})+'\n');
   }
   const found=[];
   for(const [kind,Before,After] of [['completion',BeforeCompletion,CompletionMonitor],['activity',BeforeActivity,ActivityWatch]]){
    const before=new Before({codexHome:fixture,stateDir:path.join(fixture,'state-before'),since:now,now:()=>now});
    const after=new After({codexHome:fixture,stateDir:path.join(fixture,'state-after'),since:now,now:()=>now,onNotification:event=>found.push(event),discoveryOptions:{watch:false,fullScanMs:30000}});
    const firstBefore=await measured(()=>before.scan(kind==='completion'));
    const firstAfter=await measured(()=>after.scan(kind==='completion'));
    const steadyBefore=[],steadyAfter=[];
    for(let n=0;n<passes;n++)steadyBefore.push(await measured(()=>before.scan()));
    for(let n=0;n<passes;n++)steadyAfter.push(await measured(()=>after.scan()));
    const file=files[0];
    fs.appendFileSync(file,JSON.stringify({type:'event_msg',timestamp:new Date(now+1).toISOString(),payload:{type:kind==='completion'?'task_complete':'task_started',turn_id:'current-'+kind}})+'\n');
    after.discovery.hints.add(fs.realpathSync(file));await after.scan();
    if(kind==='completion')assert.ok(found.some(x=>x.turnId==='current-completion'));
    else assert.ok(fs.readdirSync(path.join(fixture,'state-after')).some(x=>/^[a-f0-9]{32}\.json$/.test(x)));
    rows.push({files:size,kind,firstBefore,firstAfter,steadyBefore,steadyAfter,changedColdHintDetected:true,discoveryCache:after.discovery.files.size,hotCache:after.discovery.hot.size});
    before.stop();after.stop();
   }
  }finally{
   assert.ok(path.resolve(fixture).startsWith(baselineDir+path.sep+'benchmark-fixture-'));
   fs.rmSync(fixture,{recursive:true,force:true});
  }
 }
 fs.writeFileSync(report,JSON.stringify({ok:true,fakeLogsOnly:true,productionInstalled:false,fixturesRemoved:true,steadyPasses:passes,watchDisabledForDeterministicBenchmark:true,rows},null,2));
 process.stdout.write(JSON.stringify({ok:true,rows:rows.map(row=>({files:row.files,kind:row.kind,before:row.steadyBefore[0],after:row.steadyAfter[0],firstBeforeMs:row.firstBefore.elapsedMs,firstAfterMs:row.firstAfter.elapsedMs})),fixturesRemoved:true})+'\n');
}finally{try{fs.unlinkSync(oldActivityFile);}catch{}}
