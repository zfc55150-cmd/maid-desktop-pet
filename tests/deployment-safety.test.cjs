'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {preflight,rollbackPreflight,rehearse,hash}=require('../scripts/deployment-safety.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'work/optimization-20261101/deployment-tests');fs.mkdirSync(work,{recursive:true});
function fixture(t){
 const base=fs.mkdtempSync(path.join(work,'case-')),source=path.join(base,'source'),stage=path.join(base,'stage');fs.mkdirSync(source,{recursive:true});fs.mkdirSync(stage,{recursive:true});
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const files=[];
 for(const [name,old] of [['fake-one.js','old'],['fake-two.js',null]]){
  const sourceName='app/electron-helper/'+name,targetName='node_modules/dsh-pet/runtime/electron-helper/'+name;
  const src=path.join(source,sourceName),dest=path.join(stage,targetName);fs.mkdirSync(path.dirname(src),{recursive:true});fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(src,'new '+name);if(old!==null)fs.writeFileSync(dest,old);
  files.push({source:sourceName,target:targetName,sha256:hash(src),previousSha256:old===null?null:hash(dest)});
 }
 const manifestFile=path.join(base,'deployment.json'),manifest={version:'test',files};fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 const baselineFile=path.join(base,'baseline.json');fs.writeFileSync(baselineFile,JSON.stringify({installedRoot:stage,code:files.slice(0,1).map(e=>({...e,installedSha256:e.previousSha256}))}));
 fs.writeFileSync(path.join(stage,'.code-deployment-rehearsal'),'code-only-rehearsal-v1');
 return {base,sourceRoot:source,installedRoot:stage,stageRoot:stage,manifestFile,manifest,baselineFile,workRoot:work};
}
test('preflight links exact candidate and captured installed hashes without reading data',t=>{
 const f=fixture(t),result=preflight(f);assert.equal(result.files,2);assert.equal(result.manifestSha256,hash(f.manifestFile));assert.equal(result.baselineSha256,hash(f.baselineFile));assert.equal(result.busyState,'unknown');assert.deepEqual(result.productionInstallBlocked,['generation-or-speech-state-not-confirmed']);
});
test('preflight rejects drift, false previous hashes and missing captured entries',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.installedRoot,f.manifest.files[0].target),'foreign');assert.throws(()=>preflight(f),/changed since review/);
 fs.writeFileSync(path.join(f.installedRoot,f.manifest.files[0].target),'old');f.manifest.files[0].previousSha256='0'.repeat(64);fs.writeFileSync(f.manifestFile,JSON.stringify(f.manifest));assert.throws(()=>preflight(f),/captured installation/);
 f.manifest.files.shift();fs.writeFileSync(f.manifestFile,JSON.stringify(f.manifest));assert.throws(()=>preflight(f),/missing from manifest/);
});
test('preflight rejects duplicate target, traversal and foreign installation root',t=>{
 const f=fixture(t);const original=JSON.parse(JSON.stringify(f.manifest));f.manifest.files.push(f.manifest.files[0]);fs.writeFileSync(f.manifestFile,JSON.stringify(f.manifest));assert.throws(()=>preflight(f),/Duplicate/);
 f.manifest=original;f.manifest.files[0].target='../escape.js';fs.writeFileSync(f.manifestFile,JSON.stringify(f.manifest));assert.throws(()=>preflight(f),/Unreviewed|escapes/);
 fs.writeFileSync(f.manifestFile,JSON.stringify(original));assert.throws(()=>preflight({...f,installedRoot:f.sourceRoot}),/another installation/);
});
test('rehearsal failure automatically restores original bytes and removes newly added module',t=>{
 const f=fixture(t),result=rehearse({...f,failAfter:2});assert.equal(result.ok,false);assert.equal(result.rolledBack,true);assert.equal(result.errorCode,'injected-copy-failure');assert.equal(fs.readFileSync(path.join(f.stageRoot,f.manifest.files[0].target),'utf8'),'old');assert.equal(fs.existsSync(path.join(f.stageRoot,f.manifest.files[1].target)),false);
});
test('rehearsal success checks every new hash; unknown stages are refused',t=>{
 const f=fixture(t);fs.unlinkSync(path.join(f.stageRoot,'.code-deployment-rehearsal'));assert.throws(()=>rehearse(f),/Unknown rehearsal/);fs.writeFileSync(path.join(f.stageRoot,'.code-deployment-rehearsal'),'code-only-rehearsal-v1');
 const result=rehearse(f);assert.equal(result.ok,true);for(const e of f.manifest.files)assert.equal(hash(path.join(f.stageRoot,e.target)),e.sha256);
 assert.throws(()=>rehearse({...f,stageRoot:root}),/inside work root/);
});

test('rollback preflight rejects unfamiliar installed code before any stop or overwrite',t=>{
 const f=fixture(t),backup=path.join(f.base,'backup');fs.mkdirSync(backup);fs.copyFileSync(f.manifestFile,path.join(backup,'deployment.json'));
 const entry=f.manifest.files[0],dest=path.join(backup,entry.target);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,'old');
 assert.equal(rollbackPreflight({backupRoot:backup,installedRoot:f.stageRoot}).ok,true);
 assert.equal(rehearse(f).ok,true);assert.equal(rollbackPreflight({backupRoot:backup,installedRoot:f.stageRoot}).ok,true);
 fs.writeFileSync(path.join(f.stageRoot,entry.target),'concurrent-change');assert.throws(()=>rollbackPreflight({backupRoot:backup,installedRoot:f.stageRoot}),/refuses modified/);
 assert.equal(fs.readFileSync(path.join(f.stageRoot,entry.target),'utf8'),'concurrent-change');
});
