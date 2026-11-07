'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('supervisor startup deadlines, bounded backoff, health and process identity use isolated functions',()=>{
 const work=path.resolve(__dirname,'../../../../work/optimization-implementation-20261028-01/maintenance');fs.mkdirSync(work,{recursive:true});const temp=fs.mkdtempSync(path.join(work,'supervisor-recovery-'));
 try{const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'supervisor-recovery.ps1'),'-Module',path.resolve(__dirname,'../runtime/supervisor.ps1'),'-Fixture',temp],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr||r.stdout);const out=JSON.parse(r.stdout);assert.equal(out.ok,true);assert.ok(out.count>=16);}
 finally{fs.rmSync(temp,{recursive:true,force:true});}
});
