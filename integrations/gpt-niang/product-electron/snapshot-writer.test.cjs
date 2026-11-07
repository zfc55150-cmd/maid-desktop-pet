'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{snapshotWriter}=require('./app/snapshot-writer.cjs');
test('sharing violations retry atomically, coalesce latest snapshots and flush shutdown state',async()=>{
 const dir=await fs.mkdtemp(path.resolve('work/product-snapshot-')),file=path.join(dir,'state.json');let renames=0;await fs.writeFile(file,'{"old":true}');
 try{const io={...fs,rename:async(a,b)=>{if(++renames<=2){assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{old:true});throw Object.assign(Error('busy'),{code:'EPERM'});}return fs.rename(a,b);}};const writer=snapshotWriter(file,{io,pause:async()=>{}});await Promise.all(Array.from({length:30},(_,i)=>writer.write({i})));await writer.flush();assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{i:29});assert(renames>=3);assert.deepEqual(await fs.readdir(dir),['state.json']);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('permanent errors preserve last valid snapshot and never retry forever',async()=>{
 const dir=await fs.mkdtemp(path.resolve('work/product-snapshot-')),file=path.join(dir,'state.json');await fs.writeFile(file,'{"old":true}');let attempts=0;
 try{const writer=snapshotWriter(file,{io:{...fs,rename:async()=>{attempts++;throw Object.assign(Error('busy'),{code:'EPERM'});}},pause:async()=>{}});await assert.rejects(writer.write({new:true}),{code:'EPERM'});assert.equal(attempts,8);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{old:true});assert.deepEqual(await fs.readdir(dir),['state.json']);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('a last update arriving during temporary cleanup is included before flush resolves',async()=>{
 const dir=await fs.mkdtemp(path.resolve('work/product-snapshot-')),file=path.join(dir,'state.json');let writer,late,inserted=false;
 try{const io={...fs,unlink:async p=>{if(!inserted){inserted=true;late=writer.write({latest:true});}return fs.unlink(p);}};writer=snapshotWriter(file,{io});await writer.write({first:true});await late;await writer.flush();assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{latest:true});}finally{await fs.rm(dir,{recursive:true,force:true});}
});
