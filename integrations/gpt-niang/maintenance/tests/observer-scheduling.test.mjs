import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {RolloutDiscovery,writeObserverHealth} from '../runtime/observer-discovery.mjs';
import {CompletionMonitor} from '../runtime/completion-monitor.mjs';
import {ActivityWatch} from '../../animated/activity-watch.mjs';

const stamp=Date.now(),line=(type,payload,at=stamp)=>JSON.stringify({type,payload,timestamp:new Date(at).toISOString()})+'\n';
const header=(id='session-a',source='vscode')=>line('session_meta',{id,source});
const ending=(id,at=stamp)=>line('event_msg',{type:'task_complete',turn_id:id,last_agent_message:'FAKE_PRIVATE'},at);
function fixture(run){const root=fs.mkdtempSync(path.join(os.tmpdir(),'observer-scheduling-'));return Promise.resolve().then(()=>run(root)).finally(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'observer-scheduling-'));fs.rmSync(root,{recursive:true,force:true});});}
const write=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};

test('cold discovery avoids full walking, hot size changes ignore preserved mtime, and old months recover on periodic sweep',()=>fixture(root=>{
  let now=stamp;const old=path.join(root,'sessions','1999','01','01','old.jsonl');write(old,header());
  const discovery=new RolloutDiscovery({codexHome:root,now:()=>now,watch:false,fullScanMs:30000});
  assert.equal(discovery.scan().changed.length,1);const walks=discovery.metrics.walks;
  const times=fs.statSync(old);fs.appendFileSync(old,ending('hot'));fs.utimesSync(old,times.atime,times.mtime);
  assert.equal(discovery.scan().changed.length,1);assert.equal(discovery.metrics.walks,walks);
  const resumed=path.join(root,'sessions','2000','02','02','resumed.jsonl');write(resumed,header());
  assert.equal(discovery.scan().changed.length,0);now+=30000;
  assert.ok(discovery.scan().changed.some(x=>x.file===fs.realpathSync(resumed)));
  assert.equal(discovery.scan().changed.length,0);discovery.close();
}));

test('bounded hints discover archived paths immediately, and same-size replacement changes identity',()=>fixture(root=>{
  const callbacks=new Map();const io=Object.create(fs);io.watch=(root,_options,callback)=>{callbacks.set(root,callback);return {on(){return this;},close(){},unref(){}};};
  const sessions=path.join(root,'sessions'),archives=path.join(root,'archived_sessions');fs.mkdirSync(sessions);fs.mkdirSync(archives);
  const discovery=new RolloutDiscovery({codexHome:root,io,watch:true});discovery.scan();
  const file=path.join(archives,'old.jsonl');write(file,header());callbacks.get(fs.realpathSync(archives))('rename','old.jsonl');
  const first=discovery.scan().changed[0];assert.equal(first.file,fs.realpathSync(file));
  const replacement=path.join(root,'replacement');write(replacement,header());fs.unlinkSync(file);fs.renameSync(replacement,file);
  callbacks.get(fs.realpathSync(archives))('rename','old.jsonl');const second=discovery.scan().changed[0];assert.notEqual(second.identity,first.identity);
  callbacks.get(fs.realpathSync(archives))('rename','../../outside.jsonl');assert.equal(discovery.hints.size,0);discovery.close();
}));

test('metadata, hot and hint caches have hard bounds without losing complete sweep detection',()=>fixture(root=>{
  const sessions=path.join(root,'sessions');fs.mkdirSync(sessions);
  for(let i=0;i<1000;i++)write(path.join(sessions,`${i}.jsonl`),header('session-'+i));
  const discovery=new RolloutDiscovery({codexHome:root,watch:false,maxFiles:512,maxHot:4});
  assert.equal(discovery.scan().changed.length,1000);assert.equal(discovery.files.size,512);assert.equal(discovery.hot.size,4);
  const stats=discovery.metrics.stats;assert.equal(discovery.scan().changed.length,0);assert.equal(discovery.metrics.stats-stats,4);discovery.close();
}));

test('completion cold files are read only after metadata changes; archive/UTF8 and changed subagent identity remain correct',()=>fixture(root=>{
  let now=stamp;const sessions=path.join(root,'sessions'),archives=path.join(root,'archived_sessions');fs.mkdirSync(sessions);fs.mkdirSync(archives);
  const file=path.join(sessions,'a.jsonl');write(file,header());const found=[];
  const monitor=new CompletionMonitor({codexHome:root,now:()=>now,since:stamp,onNotification:e=>found.push(e),discoveryOptions:{watch:false,fullScanMs:100}});
  monitor.scan(true);const bytes=Buffer.from(ending('中文结束',stamp+1)),split=bytes.indexOf(Buffer.from('中'))+1;
  fs.appendFileSync(file,bytes.subarray(0,split));monitor.scan();
  const moved=path.join(archives,'a.jsonl');fs.renameSync(file,moved);fs.appendFileSync(moved,bytes.subarray(split));now+=100;monitor.scan();monitor.scan();
  assert.deepEqual(found.map(x=>x.turnId),['中文结束']);
  const child=path.join(sessions,'child.jsonl');write(child,header('child','subagent'));now+=100;monitor.scan();
  const replacement=path.join(root,'replacement');write(replacement,header()+ending('new-user',now));fs.unlinkSync(child);fs.renameSync(replacement,child);now+=100;monitor.scan();
  assert.ok(found.some(x=>x.turnId==='new-user'));monitor.stop();
}));

test('uniform pause performs no discovery, safe cleanup touches only owned state, and resume never replays paused completions',()=>fixture(async root=>{
  let now=stamp;const file=path.join(root,'sessions','a.jsonl'),state=path.join(root,'state'),activity=path.join(state,'activity'),flag=path.join(state,'task-observers-paused.flag');
  write(file,header());fs.mkdirSync(activity,{recursive:true});const found=[];
  const monitor=new CompletionMonitor({codexHome:root,since:stamp,now:()=>now,stateFile:path.join(state,'completion-monitor-state.json'),pauseFile:flag,onNotification:e=>found.push(e)});
  const watcher=new ActivityWatch({codexHome:root,stateDir:activity,now:()=>now,pauseFile:flag,healthFile:path.join(activity,'observer-health.json')});
  monitor.scan(true);await watcher.scan();assert.throws(()=>monitor.clearGeneratedState(),/OBSERVERS_MUST_BE_PAUSED/);assert.throws(()=>watcher.clearGeneratedState(),/OBSERVERS_MUST_BE_PAUSED/);
  write(flag,'');const walks=monitor.discovery.metrics.walks;monitor.scan();await watcher.scan();assert.equal(monitor.discovery.metrics.walks,walks);
  write(path.join(activity,'f'.repeat(32)+'.json'),'{}');write(path.join(activity,'chat.json'),'FAKE_PRIVATE_CHAT');write(path.join(state,'user-note.json'),'KEEP');
  monitor.clearGeneratedState();watcher.clearGeneratedState();assert.equal(fs.readFileSync(path.join(activity,'chat.json'),'utf8'),'FAKE_PRIVATE_CHAT');assert.equal(fs.readFileSync(path.join(state,'user-note.json'),'utf8'),'KEEP');assert.ok(fs.existsSync(file));
  fs.appendFileSync(file,ending('while-paused',now));now+=1000;fs.unlinkSync(flag);monitor.scan();await watcher.scan();assert.deepEqual(found,[]);
  fs.appendFileSync(file,ending('after-resume',now+1));monitor.scan();assert.deepEqual(found.map(x=>x.turnId),['after-resume']);
  monitor.stop();watcher.stop();
}));

test('activity eviction and archive checkpoints preserve a partial UTF8 tool record and later completion',()=>fixture(async root=>{
  const sessions=path.join(root,'sessions'),archives=path.join(root,'archived_sessions'),state=path.join(root,'activity');fs.mkdirSync(sessions);fs.mkdirSync(archives);
  for(let i=0;i<100;i++)write(path.join(sessions,String(i).padStart(3,'0')+'.jsonl'),header('session-'+i)+line('event_msg',{type:'task_started',turn_id:'turn-'+i}));
  fs.utimesSync(path.join(sessions,'000.jsonl'),new Date(stamp+5000),new Date(stamp+5000));
  const watcher=new ActivityWatch({codexHome:root,stateDir:state,now:()=>stamp+1000,discoveryOptions:{watch:false,fullScanMs:0}});await watcher.scan();assert.equal(watcher.tails.size,96);
  write(path.join(sessions,'100.jsonl'),header('session-100')+line('event_msg',{type:'task_started',turn_id:'turn-100'}));await watcher.scan();assert.ok(watcher.checkpoints.size>0);
  const file=path.join(sessions,'000.jsonl'),bytes=Buffer.from(line('response_item',{type:'function_call',call_id:'中文工具',name:'exec',arguments:'FAKE_PRIVATE'})),split=bytes.indexOf(Buffer.from('中'))+1;
  fs.appendFileSync(file,bytes.subarray(0,split));await watcher.scan();
  const moved=path.join(archives,'000.jsonl');fs.renameSync(file,moved);await watcher.scan();fs.appendFileSync(moved,bytes.subarray(split));await watcher.scan();
  fs.appendFileSync(moved,line('event_msg',{type:'task_complete',turn_id:'turn-0'},stamp+100));await watcher.scan();
  const snapshots=fs.readdirSync(state).filter(x=>/^[a-f0-9]{32}\.json$/.test(x)).map(x=>JSON.parse(fs.readFileSync(path.join(state,x),'utf8')));
  assert.ok(snapshots.some(x=>x.phase==='happy'));assert.doesNotMatch(JSON.stringify(snapshots),/FAKE_PRIVATE|中文工具|session-0/);watcher.stop();
}));

test('activity archive hint reuses the live tail before a periodic full sweep',()=>fixture(async root=>{
  const file=path.join(root,'sessions','a.jsonl'),moved=path.join(root,'archived_sessions','a.jsonl'),state=path.join(root,'activity');write(file,header()+line('event_msg',{type:'task_started',turn_id:'turn-a'}));fs.mkdirSync(path.dirname(moved));
  const watcher=new ActivityWatch({codexHome:root,stateDir:state,now:()=>stamp+100,discoveryOptions:{watch:false,fullScanMs:30000}});await watcher.scan();
  fs.renameSync(file,moved);fs.appendFileSync(moved,ending('turn-a',stamp+1));watcher.discovery.hints.add(fs.realpathSync(moved));await watcher.scan();
  const snapshots=fs.readdirSync(state).map(x=>JSON.parse(fs.readFileSync(path.join(state,x),'utf8')));assert.ok(snapshots.some(x=>x.phase==='happy'));assert.equal(watcher.discovery.metrics.walks,1);watcher.stop();
}));

test('health writer accepts fixed codes/counts only and failures never retain prose or paths',()=>fixture(root=>{
  const health=path.join(root,'health.json');writeObserverHealth(health,{at:stamp,status:'degraded',code:'FAKE_PRIVATE_ERROR',active:2,body:'FAKE_PRIVATE',path:'/FAKE_PRIVATE'});
  const value=JSON.parse(fs.readFileSync(health));assert.equal(value.code,'OBSERVER_READ_FAILED');assert.equal(value.active,2);assert.doesNotMatch(JSON.stringify(value),/FAKE_PRIVATE/);
  const watcher=new RolloutDiscovery({codexHome:path.join(root,'unavailable'),watch:false});assert.equal(watcher.scan().code,'OBSERVER_SOURCE_UNAVAILABLE');watcher.close();
}));

test('crash recovery still emits a completion inside the saved grace window exactly once',()=>fixture(root=>{
  const state=path.join(root,'state');fs.mkdirSync(state);const stateFile=path.join(state,'completion-monitor-state.json'),at=Date.now();
  write(path.join(root,'sessions','old-month','a.jsonl'),header()+ending('recovered',at-1000));
  write(stateFile,JSON.stringify({at:at-2000,lastEnded:0}));const found=[];
  const first=new CompletionMonitor({codexHome:root,since:at,stateFile,onNotification:e=>found.push(e)});first.start();first.stop();assert.deepEqual(found.map(x=>x.turnId),['recovered']);
  const second=new CompletionMonitor({codexHome:root,since:at,stateFile,onNotification:e=>found.push(e)});second.start();second.stop();assert.deepEqual(found.map(x=>x.turnId),['recovered']);
}));

test('activity clear CLI rejects invalid state before construction without reporting success or deleting anything',()=>fixture(root=>{
  const invalid=path.join(root,'not-a-directory'),flag=path.join(root,'task-observers-paused.flag'),sentinel=path.join(root,'keep.json');write(invalid,'KEEP');write(flag,'');write(sentinel,'FAKE_PRIVATE_KEEP');
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../animated/activity-watch.mjs',import.meta.url)),'--state-dir',invalid,'--codex-home',root,'--pause-file',flag,'--clear-state'],{encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'');assert.equal(fs.readFileSync(invalid,'utf8'),'KEEP');assert.equal(fs.readFileSync(sentinel,'utf8'),'FAKE_PRIVATE_KEEP');
}));

test('activity clear CLI rejects a linked state directory and preserves its target',t=>fixture(root=>{
  const target=path.join(root,'target'),linked=path.join(root,'linked'),flag=path.join(root,'task-observers-paused.flag');fs.mkdirSync(target);write(path.join(target,'f'.repeat(32)+'.json'),'KEEP');write(flag,'');
  try{fs.symlinkSync(target,linked,process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','EACCES','ENOSYS'].includes(error.code)){t.skip('Junction creation is unavailable; invalid-directory rejection remains covered');return;}throw error;}
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../animated/activity-watch.mjs',import.meta.url)),'--state-dir',linked,'--codex-home',root,'--pause-file',flag,'--clear-state'],{encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'');assert.equal(fs.readFileSync(path.join(target,'f'.repeat(32)+'.json'),'utf8'),'KEEP');
}));

test('activity clear CLI rejects a fake junction stat even when link creation is restricted',()=>fixture(root=>{
  const linked=path.join(root,'fake-junction'),flag=path.join(root,'task-observers-paused.flag'),preload=path.join(root,'fake-junction-preload.mjs');fs.mkdirSync(linked);write(path.join(linked,'f'.repeat(32)+'.json'),'KEEP');write(flag,'');
  write(preload,"import fs from 'node:fs';import path from 'node:path';const original=fs.lstatSync;fs.lstatSync=function(file,...args){if(path.resolve(file)==="+JSON.stringify(path.resolve(linked))+")return {isSymbolicLink:()=>true,isDirectory:()=>true};return original.call(this,file,...args);};");
  const result=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,fileURLToPath(new URL('../../animated/activity-watch.mjs',import.meta.url)),'--state-dir',linked,'--codex-home',root,'--pause-file',flag,'--clear-state'],{encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'');assert.equal(fs.readFileSync(path.join(linked,'f'.repeat(32)+'.json'),'utf8'),'KEEP');
}));
