'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {child,hash,rollbackPreflight}=require('./deployment-safety.cjs');
const fields=['characterId','geometry','humanoid','animations','animationWeights','hitBox'];
const localAppData=process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local');
const productionTargets=['DeepSeekActionPet','GPTNiangActionPet'].map(name=>path.join(localAppData,name,'dsh-pet/pet/gptniang-config.json'));
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const digestOK=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function exactTarget(target,targets=productionTargets){
 const full=path.resolve(target);if(!targets.some(t=>path.resolve(t).toLowerCase()===full.toLowerCase()))throw Error('Profile target is not allowlisted');
 // Check every ancestor; a redirected personal-data directory must not be followed.
 let cursor=full;while(true){if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('Refusing profile reparse point');const next=path.dirname(cursor);if(next===cursor)break;cursor=next;}
 return full;
}
function preservePreferences(before,after){
 const rest=o=>Object.fromEntries(Object.entries(o).filter(([k])=>!fields.includes(k)));
 assert.deepEqual(rest(after),rest(before),'Unapproved personal preference change');
 if(after.characterId!=='gptniang'||!after.animations?.actionRegistry)throw Error('Unreviewed profile identity or registry');
}
function preflight({manifestFile,workspace,targets=productionTargets}){
 const work=path.join(path.resolve(workspace),'work'),relative=path.relative(work,path.resolve(manifestFile));
 const approvedManifest=child(work,relative),manifest=json(approvedManifest);
 if(!Array.isArray(manifest.targets)||manifest.targets.length!==targets.length)throw Error('Profile must contain the two reviewed targets');
 if(!digestOK(manifest.profileSha256)||hash(child(workspace,path.relative(workspace,manifest.canonicalProfile)))!==manifest.profileSha256)throw Error('Canonical profile hash mismatch');
 const canonical=json(manifest.canonicalProfile);
 if(canonical.characterId!=='gptniang'||!canonical.animations?.actionRegistry)throw Error('Unreviewed canonical profile');
 const seen=new Set(),entries=[];
 for(const item of manifest.targets){
  const target=exactTarget(item.target,targets),key=target.toLowerCase();if(seen.has(key))throw Error('Duplicate profile target');seen.add(key);
  if(!digestOK(item.sha256)||!digestOK(item.previousSha256))throw Error('Invalid profile hash');
  const candidate=child(path.dirname(approvedManifest),item.file);
  if(hash(target)!==item.previousSha256||hash(candidate)!==item.sha256)throw Error('Profile configuration changed since review');
  const original=json(target),proposed=json(candidate),expected={...original};
  preservePreferences(original,proposed);
  for(const field of fields)if(canonical[field]!==undefined)expected[field]=canonical[field];
  assert.deepEqual(proposed,expected,'Candidate fields do not match canonical profile');
  entries.push({...item,target,candidate});
 }
 return {ok:true,manifestSha256:hash(approvedManifest),profileSha256:manifest.profileSha256,entries};
}
function prepare(options){
 const result=preflight(options),dest=child(options.backupRoot,'profile-configs');if(fs.existsSync(dest))throw Error('Profile backup already exists');
 fs.mkdirSync(dest,{recursive:true});const receipt={schema:1,manifestSha256:result.manifestSha256,profileSha256:result.profileSha256,entries:[]};
 for(const [i,e] of result.entries.entries()){
  const backup=`${i}.original.json`,candidate=`${i}.candidate.json`;fs.copyFileSync(e.target,child(dest,backup));fs.copyFileSync(e.candidate,child(dest,candidate));
  receipt.entries.push({target:e.target,backup,candidate,previousSha256:e.previousSha256,sha256:e.sha256});
 }
 fs.writeFileSync(child(dest,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');return {ok:true,files:receipt.entries.length,manifestSha256:result.manifestSha256};
}
function receiptCheck({backupRoot,targets=productionTargets,mode='rollback'}){
 const base=child(backupRoot,'profile-configs'),receipt=json(child(base,'receipt.json'));
 if(receipt.schema!==1||receipt.entries?.length!==targets.length)throw Error('Invalid profile receipt');const seen=new Set();
 for(const e of receipt.entries){
  const target=exactTarget(e.target,targets);if(seen.has(target.toLowerCase()))throw Error('Duplicate profile receipt target');seen.add(target.toLowerCase());
  if(!digestOK(e.sha256)||!digestOK(e.previousSha256)||hash(child(base,e.backup))!==e.previousSha256||hash(child(base,e.candidate))!==e.sha256)throw Error('Profile backup hash mismatch');
  preservePreferences(json(child(base,e.backup)),json(child(base,e.candidate)));
  const actual=hash(target);if(mode==='apply'?actual!==e.previousSha256:actual!==e.previousSha256&&actual!==e.sha256)throw Error('Profile target changed after backup');
 }
 return {base,receipt};
}
function transact(options,mode){
 const {base,receipt}=receiptCheck({...options,mode}),touched=[];
 try{
  for(const [i,e] of receipt.entries.entries()){
   const target=exactTarget(e.target,options.targets),src=child(base,mode==='apply'?e.candidate:e.backup),expected=mode==='apply'?e.sha256:e.previousSha256;
   touched.push({target,bytes:fs.readFileSync(target)});
   // Same-directory rename avoids exposing a truncated JSON file.
   const temporary=target+'.maintenance-profile-new';if(fs.existsSync(temporary))throw Error('Profile temporary target already exists');
   fs.copyFileSync(src,temporary);try{if(hash(temporary)!==expected)throw Error('Profile copy hash mismatch');fs.renameSync(temporary,target);if(hash(target)!==expected)throw Error('Installed profile hash mismatch');}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
   if(options.failAfter===i+1)throw Error('injected-profile-copy-failure');
  }
 }catch(error){for(const e of touched.reverse())fs.writeFileSync(e.target,e.bytes);throw error;}
 return {ok:true,files:receipt.entries.length,mode,manifestSha256:receipt.manifestSha256};
}
function rollbackCombined(options){
 rollbackPreflight(options);const {base,receipt}=receiptCheck(options),manifest=json(child(options.backupRoot,'deployment.json'));
 const plans=manifest.files.map(e=>({target:child(options.installedRoot,e.target),bytes:e.previousSha256?fs.readFileSync(child(options.backupRoot,e.target)):null,expected:e.previousSha256}));
 for(const e of receipt.entries)plans.push({target:exactTarget(e.target,options.targets),bytes:fs.readFileSync(child(base,e.backup)),expected:e.previousSha256});
 const touched=[];
 try{for(const [i,p] of plans.entries()){
  touched.push({target:p.target,bytes:fs.existsSync(p.target)?fs.readFileSync(p.target):null});
  if(p.bytes===null)fs.rmSync(p.target,{force:true});else fs.writeFileSync(p.target,p.bytes);
  if((fs.existsSync(p.target)?hash(p.target):null)!==p.expected)throw Error('Combined rollback checksum mismatch');
  if(options.failAfter===i+1)throw Error('injected-combined-rollback-failure');
 }}catch(error){for(const p of touched.reverse()){if(p.bytes===null)fs.rmSync(p.target,{force:true});else fs.writeFileSync(p.target,p.bytes);}throw error;}
 return {ok:true,files:plans.length,mode:'combined-rollback',manifestSha256:hash(child(options.backupRoot,'deployment.json'))};
}
if(require.main===module){try{
 const [mode,arg,workspace]=process.argv.slice(2);let result;
 if(mode==='preflight')result=preflight({manifestFile:arg,workspace});
 else if(mode==='prepare')result=prepare({manifestFile:arg,workspace:process.argv[5],backupRoot:workspace});
 else if(mode==='rollback-preflight'){const r=receiptCheck({backupRoot:arg});result={ok:true,files:r.receipt.entries.length};}
 else if(mode==='apply'||mode==='rollback')result=transact({backupRoot:arg},mode);
 else if(mode==='combined-rollback')result=rollbackCombined({backupRoot:arg,installedRoot:workspace});
 else throw Error('Unknown profile deployment command');
 // Never print config content or preferences.
 console.log(JSON.stringify({ok:result.ok,files:result.files||result.entries?.length,mode,manifestSha256:result.manifestSha256,profileSha256:result.profileSha256}));
}catch(error){console.error(error.message==='Unapproved personal preference change'?'Unapproved personal preference change':String(error.message).split('\n')[0]);process.exitCode=1;}}
module.exports={preflight,prepare,receiptCheck,transact,preservePreferences,productionTargets,rollbackCombined};
