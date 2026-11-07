import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const maintenance=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const installed=String.raw`C:\Users\USER\AppData\Local\Programs\GPTNiangUsage\gpt-niang-usage`;
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gpt-update-guard-'));
 const app=path.join(root,'app','gpt-niang-usage'),dataDir=path.join(root,'state'),agentDir=path.join(root,'agent');
 for(const p of [path.join(app,'runtime'),path.join(app,'.codex-plugin'),dataDir,agentDir])fs.mkdirSync(p,{recursive:true});
 for(const n of ['usage.mjs','metadata.mjs','plan.mjs'])fs.copyFileSync(path.join(installed,'runtime',n),path.join(app,'runtime',n));
 fs.copyFileSync(path.join(maintenance,'runtime/update.mjs'),path.join(app,'runtime/update.mjs'));
 fs.writeFileSync(path.join(app,'.codex-plugin/plugin.json'),JSON.stringify({version:'1.3.5'}));
 return {root,app,dataDir,agentDir,config:{appDir:app,dataDir,version:'1.3.5'},remove(){assert.ok(root.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}};
}
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
async function runtime(f){return import(pathToFileURL(path.join(f.app,'runtime/update.mjs')).href);}
function mark(f,relative='runtime/customization-update-policy.json'){
 const p=path.join(f.app,...relative.split('/'));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'{ intentionally malformed, presence still protects }');
}
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
function zipFixture(files){
 let offset=0;const local=[],central=[];
 for(const[name,value]of Object.entries(files)){
  const raw=Buffer.from(name),data=Buffer.from(value),h=Buffer.alloc(30),e=Buffer.alloc(46);
  h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt32LE(crc(data),14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(raw.length,26);
  e.writeUInt32LE(0x02014b50);e.writeUInt16LE(0x314,4);e.writeUInt16LE(20,6);e.writeUInt16LE(0x800,8);e.writeUInt32LE(crc(data),16);e.writeUInt32LE(data.length,20);e.writeUInt32LE(data.length,24);e.writeUInt16LE(raw.length,28);e.writeUInt32LE((0x8000<<16)>>>0,38);e.writeUInt32LE(offset,42);
  local.push(h,raw,data);central.push(e,raw);offset+=30+raw.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,directory,end]);
}
function upstream(){
 const version='1.3.6',name='gpt-niang-usage-widget-v1.3.6-windows.zip',prefix='Fixture/gpt-niang-usage/';
 const required=read(path.join(installed,'runtime/install-files.json'));
 const files=Object.fromEntries(required.map(n=>[prefix+n,'FAKE NEVER EXECUTED']));
 for(const n of ['package.json','.codex-plugin/plugin.json'])files[prefix+n]=JSON.stringify({version});
 files[prefix+'runtime/install-files.json']=JSON.stringify(required);files['Fixture/.agents/plugins/marketplace.json']='{}';
 const bytes=zipFixture(files),base='https://github.com/T7moris/GPT-Niang/releases/download/v1.3.6/';
 const sums=Buffer.from(createHash('sha256').update(bytes).digest('hex')+'  '+name+'\n');
 const release={tag_name:'v'+version,assets:[{name,size:bytes.length,browser_download_url:base+name},{name:'SHA256SUMS.txt',size:sums.length,browser_download_url:base+'SHA256SUMS.txt'}]};
 return {release,bytes,sums,fetch(url,api){if(api)return Buffer.from(JSON.stringify(release));return url.endsWith('SHA256SUMS.txt')?sums:bytes;}};
}

for(const mode of ['automatic','manual'])test(mode+' custom install only checks release metadata and never downloads, waits or launches',async()=>{
 const f=fixture();try{
  mark(f);const r=await runtime(f),up=upstream(),calls=[];
  await r.runUpdate(f.config,{mode,agentDir:f.agentDir,fetchBytes:async(url,o)=>{calls.push(url);return up.fetch(url,o?.api);},waitIdle:()=>{throw Error('must not wait');},launch:()=>{throw Error('must not launch');}});
  const status=read(path.join(f.dataDir,'update-status.json'));assert.equal(status.phase,'blocked-customization');assert.equal(status.version,'1.3.6');assert.match(status.message,/仅通知/);
  assert.deepEqual(calls,[r.RELEASE_API]);assert.equal(fs.existsSync(path.join(f.agentDir,'update-transaction.json')),false);assert.equal(fs.existsSync(path.join(f.dataDir,'updates')),false);
 }finally{f.remove();}
});
test('existing dragon manifest protects even without an explicit policy marker',async()=>{
 const f=fixture();try{mark(f,'runtime/dragon-animation/animation.json');const r=await runtime(f);assert.equal(r.customizationProtection(f.app).protected,true);}finally{f.remove();}
});
test('atlas directory presence also protects when manifest is absent or damaged',async()=>{
 const f=fixture();try{fs.mkdirSync(path.join(f.app,'assets/dragon-animation/motion-v1'),{recursive:true});const r=await runtime(f);assert.equal(r.customizationProtection(f.app).protected,true);}finally{f.remove();}
});
test('uncustomized install retains the existing validated download and launch path',async()=>{
 const f=fixture();try{
  const r=await runtime(f),up=upstream();let launches=0;
  await r.runUpdate(f.config,{mode:'manual',agentDir:f.agentDir,fetchBytes:async(u,o)=>up.fetch(u,o?.api),waitIdle:async()=>true,launch:async j=>{assert.equal(j.version,'1.3.6');launches++;}});
  assert.equal(launches,1);assert.equal(read(path.join(f.dataDir,'update-status.json')).phase,'installing');assert.equal(r.customizationProtection(f.app).protected,false);
 }finally{f.remove();}
});
test('a customization installed while idle is rechecked before transaction or launch',async()=>{
 const f=fixture();try{
  const r=await runtime(f),up=upstream();let launches=0;
  await r.runUpdate(f.config,{mode:'manual',agentDir:f.agentDir,fetchBytes:async(u,o)=>up.fetch(u,o?.api),waitIdle:async()=>{mark(f);return true;},launch:async()=>{launches++;}});
  assert.equal(launches,0);assert.equal(read(path.join(f.dataDir,'update-status.json')).phase,'blocked-customization');assert.equal(fs.existsSync(path.join(f.agentDir,'update-transaction.json')),false);
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir,'updates')),[]);
 }finally{f.remove();}
});
test('customized cleanup is still allowed and does not turn cleanup into a release check',async()=>{
 const f=fixture();try{
  mark(f);const r=await runtime(f);let cleanups=0;
  await r.runUpdate(f.config,{mode:'cleanup',agentDir:f.agentDir,cleanup:async()=>{cleanups++;},fetchBytes:async()=>{throw Error('must not check release');}});
  assert.equal(cleanups,1);assert.equal(fs.existsSync(path.join(f.dataDir,'update-installing.json')),false);
 }finally{f.remove();}
});
test('stable helper refuses a prepared customized transaction and rechecks after its idle wait',()=>{
 const f=fixture();try{
  fs.copyFileSync(path.join(maintenance,'update-agent/update-helper.ps1'),path.join(f.agentDir,'update-helper.ps1'));
  for(const n of ['supervisor-task.ps1','update-common.ps1','install-preflight.ps1'])fs.writeFileSync(path.join(f.agentDir,n),'# test-only dependency stubs\n');
  const script=path.join(maintenance,'tests/update-helper-customization.ps1'),q=s=>"'"+s.replace(/'/g,"''")+"'";
  const command='& ([ScriptBlock]::Create([IO.File]::ReadAllText('+q(script)+',[Text.Encoding]::UTF8))) -Root '+q(f.root)+' -Helper '+q(path.join(f.agentDir,'update-helper.ps1'))+' -UpdaterUi '+q(path.join(maintenance,'runtime/update-ui.ps1'));
  const r=spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',command],{encoding:'utf8',env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'},maxBuffer:2*1024*1024});
  assert.equal(r.status,0,r.stderr||r.stdout);const result=JSON.parse(r.stdout.trim());assert.equal(result.blockedPrepared,true);assert.equal(result.blockedLate,true);assert.equal(result.stops,0);assert.equal(result.recoveryAllowed,true);assert.equal(result.protectedUi,true);
 }finally{f.remove();}
});
