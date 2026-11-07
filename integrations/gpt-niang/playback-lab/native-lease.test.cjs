const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const binary=path.resolve(process.env.LAB_LEASE_BINARY||'work/gpt-playback-lab-20261102-05/native/native-lease.node'),lease=require(binary);
test('native mutex excludes another process and releases on explicit close',()=>{
 const key='Local\\PlaybackLab_'+crypto.randomUUID();assert.equal(lease.tryAcquire(key),true);assert.equal(lease.tryAcquire(key),false);
 const child=execFileSync(process.execPath,['-e',`const l=require(process.argv[1]);process.stdout.write(String(l.tryAcquire(process.argv[2])));`,binary,key],{encoding:'utf8',windowsHide:true});assert.equal(child,'false');
 lease.release();assert.equal(lease.tryAcquire(key),true);lease.release();
});
test('kernel cleanup on process exit permits acquisition',()=>{
 const key='Local\\PlaybackLab_'+crypto.randomUUID();
 const child=execFileSync(process.execPath,['-e',`const l=require(process.argv[1]);process.stdout.write(String(l.tryAcquire(process.argv[2])));`,binary,key],{encoding:'utf8',windowsHide:true});assert.equal(child,'true');assert.equal(lease.tryAcquire(key),true);lease.release();
});
