'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{sha}=require('./file-integrity.cjs');
test('streaming integrity covers chunk boundaries and empty files with the same SHA',()=>{
 const root=fs.mkdtempSync(path.resolve('work/architecture-hash-test-')),file=path.join(root,'fixture.bin');
 try{for(const size of [0,1,65535,65536,65537,1024*1024+7]){const bytes=Buffer.alloc(size);for(let i=0;i<size;i++)bytes[i]=i*17%251;fs.writeFileSync(file,bytes);assert.equal(sha(file),crypto.createHash('sha256').update(bytes).digest('hex'));}}
 finally{assert(root.startsWith(path.resolve('work')+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});
