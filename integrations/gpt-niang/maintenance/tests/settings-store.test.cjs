'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('real Windows settings store recovers backups and refuses unsafe ordinary writes',()=>{
 const fixtureRoot=path.resolve(__dirname,'../../../../work/optimization-implementation-20261028-01/maintenance');fs.mkdirSync(fixtureRoot,{recursive:true});
 const temp=fs.mkdtempSync(path.join(fixtureRoot,'gpt-settings-store-'));
 try{
  const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'settings-store.ps1'),'-Module',path.resolve(__dirname,'../runtime/settings-store.ps1'),'-Fixture',temp],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr||r.stdout);const out=JSON.parse(r.stdout);assert.equal(out.ok,true);assert.ok(out.count>=16);
  const animated=path.resolve(__dirname,'../../animated'),patched=path.join(temp,'widget.ps1');
  const build=spawnSync(process.execPath,[path.join(animated,'patch-widget.cjs'),path.join(animated,'baseline/widget-1.3.5-patched.ps1'),patched],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
  const w=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'settings-widget-wrapper.ps1'),'-Module',path.resolve(__dirname,'../runtime/settings-store.ps1'),'-Patched',patched,'-Fixture',temp],{encoding:'utf8',timeout:30000});assert.equal(w.status,0,w.stderr||w.stdout);assert.equal(JSON.parse(w.stdout).count,2);
 }
 finally{fs.rmSync(temp,{recursive:true,force:true});}
});
