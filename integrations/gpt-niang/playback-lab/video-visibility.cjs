'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sha}=require('./file-integrity.cjs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function acquire(root,{synthetic=false}={}){
 const baseline=read(path.join(root,'baseline.json'));
 for(const f of baseline.gptFiles)if(sha(path.join(baseline.gptRoot,f.target))!==f.sha256)throw new Error('INSTALLED_BASELINE_DRIFT');
 const binary=path.join(root,'native/native-lease.node'),build=read(path.join(root,'native/build.json'));
 if(sha(binary)!==build.binarySha256)throw new Error('NATIVE_BUILD_HASH');
 const canonical=path.win32.normalize(baseline.gptRoot);
 const key=synthetic?'Local\\PlaybackLab_'+crypto.randomUUID():'Local\\GPTNiangUsage_'+Buffer.from(canonical,'utf8').toString('base64').replaceAll('/','_').replaceAll('+','-');
 const native=require(binary),owned=native.tryAcquire(key);
 return {owned,tryAgain(){this.owned=native.tryAcquire(key);return this.owned;},release:()=>native.release(),leftDown:()=>native.leftDown(),keySha256:crypto.createHash('sha256').update(key).digest('hex'),baseline};
}
module.exports={acquire,read};
