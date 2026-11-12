'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{snapshotWriter}=require('./app/snapshot-writer.cjs');
test('real Windows reader denies immediate replacement, bounded retry survives and retains JSON',
 {skip:process.platform!=='win32'&&'Requires Windows file-sharing semantics and Windows PowerShell'},async()=>{
 const dir=await fs.mkdtemp(path.resolve('work/product-sharing-')),file=path.join(dir,'state.json'),ready=path.join(dir,'ready'),temp=path.join(dir,'old-writer.tmp');await fs.writeFile(file,'{"old":true}');await fs.writeFile(temp,'{"replaced":true}');
 const q=s=>"'"+s.replaceAll("'","''")+"'",script='$s=[IO.File]::Open('+q(file)+',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite);try{[IO.File]::WriteAllText('+q(ready)+",'ready');Start-Sleep -Milliseconds 300}finally{$s.Dispose()}";
 const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
 const child=spawn(powershell,['-NoProfile','-Command',script],{windowsHide:true,stdio:'ignore'});
 const exited=new Promise(resolve=>child.once('close',resolve));
 let spawnError=null;child.once('error',error=>{spawnError=error;});
 try{const deadline=Date.now()+5000;while(true){try{await fs.stat(ready);break;}catch{}if(spawnError)throw spawnError;if(Date.now()>deadline)throw Error('LOCK_HELPER_TIMEOUT');await new Promise(r=>setTimeout(r,5));}
  await assert.rejects(fs.rename(temp,file),e=>['EPERM','EACCES','EBUSY'].includes(e.code));const writer=snapshotWriter(file);await writer.write({latest:true});await writer.flush();assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{latest:true});await exited;
 }finally{child.kill();await exited;await fs.rm(dir,{recursive:true,force:true});}
});
