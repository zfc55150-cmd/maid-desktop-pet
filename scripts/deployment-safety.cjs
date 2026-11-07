'use strict';
// Code-only deployment checks. This module never opens personal data or contacts an API.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function child(root,relative){
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||/[:\0]/.test(relative))throw Error('Invalid deployment path');
 const base=path.resolve(root),full=path.resolve(base,relative),tail=path.relative(base,full);
 if(!tail||tail==='..'||tail.startsWith('..'+path.sep)||path.isAbsolute(tail))throw Error('Deployment path escapes root');
 let cursor=base;
 for(const part of ['',...tail.split(path.sep)]){if(part)cursor=path.join(cursor,part);if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('Refusing reparse point');}
 return full;
}
function allowed(entry,baselineTargets){
 const source=entry.source.replaceAll('\\','/'),target=entry.target.replaceAll('\\','/');
 // Existing reviewed entries, or new JavaScript helper modules only. Never models/data/assets.
 const mapping = source==='app/launcher.mjs' ? target==='launcher.mjs' : source==='app/standalone.mjs' ? target==='node_modules/dsh-pet/lib/standalone.js' :
  /^app\/electron-helper\/[^/]+$/.test(source) ? target==='node_modules/dsh-pet/runtime/electron-helper/'+path.posix.basename(source) :
  /^app\/voice-runtime\/(fast_predictor\.py|voice_worker\.py|wave_queue\.py|requirements\.lock\.txt|voice-settings\.json)$/.test(source) && target==='voice-runtime/'+path.posix.basename(source);
 return mapping && (baselineTargets.has(target.toLowerCase()) || /^app\/electron-helper\/[a-z0-9-]+\.js$/i.test(source));
}
function preflight({sourceRoot,installedRoot,manifestFile=path.join(sourceRoot,'deployment.json'),baselineFile}){
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8').replace(/^\uFEFF/,''));
 if(!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Empty deployment');
 const baseline=baselineFile?JSON.parse(fs.readFileSync(baselineFile,'utf8').replace(/^\uFEFF/,'')):null;
 const baselineEntries=baseline?.code||manifest.files;
 const baselineTargets=new Set(baselineEntries.map(e=>e.target.replaceAll('\\','/').toLowerCase()));
 if(baseline&&path.resolve(baseline.installedRoot).toLowerCase()!==path.resolve(installedRoot).toLowerCase())throw Error('Baseline belongs to another installation');
 const sourceSet=new Set(),targetSet=new Set(),checked=[];
 for(const entry of manifest.files){
  if(!/^[a-f0-9]{64}$/i.test(entry.sha256)||!(entry.previousSha256===null||/^[a-f0-9]{64}$/i.test(entry.previousSha256)))throw Error('Invalid hash');
  if(!allowed(entry,baselineTargets))throw Error('Unreviewed deployment target: '+entry.target);
  const source=child(sourceRoot,entry.source),target=child(installedRoot,entry.target),sId=source.toLowerCase(),tId=target.toLowerCase();
  if(sourceSet.has(sId)||targetSet.has(tId))throw Error('Duplicate deployment entry');sourceSet.add(sId);targetSet.add(tId);
  if(hash(source)!==entry.sha256.toLowerCase())throw Error('Source hash mismatch: '+entry.source);
  const reviewed=baselineEntries.find(e=>e.target.replaceAll('\\','/').toLowerCase()===entry.target.replaceAll('\\','/').toLowerCase());
  const before=reviewed&&Object.hasOwn(reviewed,'installedSha256')?reviewed.installedSha256:entry.previousSha256;
  if(baseline&&before!==entry.previousSha256)throw Error('previousSha256 does not match captured installation: '+entry.target);
  const actual=fs.existsSync(target)?hash(target):null;
  if(actual!==(before||null))throw Error('Installed file changed since review: '+entry.target);
  checked.push({target:entry.target,before:actual,after:entry.sha256,changed:actual!==entry.sha256});
 }
 for(const prior of baselineEntries){if(!targetSet.has(child(installedRoot,prior.target).toLowerCase()))throw Error('Captured baseline item missing from manifest: '+prior.target);}
 return {ok:true,version:manifest.version,manifestSha256:hash(manifestFile),baselineSha256:baselineFile?hash(baselineFile):null,files:checked.length,changed:checked.filter(e=>e.changed).length,checked,busyState:'unknown',productionInstallBlocked:['generation-or-speech-state-not-confirmed'],paidApi:false,restartsPet:false};
}
function rollbackPreflight({backupRoot,installedRoot}){
 const manifestFile=child(backupRoot,'deployment.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8').replace(/^\uFEFF/,''));
 if(!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Empty rollback manifest');
 const targets=new Set(),baselineTargets=new Set(manifest.files.map(e=>e.target.replaceAll('\\','/').toLowerCase()));
 for(const entry of manifest.files){
  if(!allowed(entry,baselineTargets))throw Error('Unreviewed rollback target');
  if(!/^[a-f0-9]{64}$/i.test(entry.sha256)||!(entry.previousSha256===null||/^[a-f0-9]{64}$/i.test(entry.previousSha256)))throw Error('Invalid rollback hash');
  const target=child(installedRoot,entry.target);if(targets.has(target.toLowerCase()))throw Error('Duplicate rollback target');targets.add(target.toLowerCase());
  if(entry.previousSha256&&hash(child(backupRoot,entry.target))!==entry.previousSha256.toLowerCase())throw Error('Backup verification failed');
  const actual=fs.existsSync(target)?hash(target):null;
  if(actual!==entry.sha256.toLowerCase()&&actual!==(entry.previousSha256?.toLowerCase()||null))throw Error('Rollback refuses modified installed file: '+entry.target);
 }
 return {ok:true,files:targets.size,manifestSha256:hash(manifestFile),restartsPet:false,personalDataRead:false};
}
function rehearse({sourceRoot,manifestFile,stageRoot,workRoot,failAfter=0}){
 // A throwaway code-only stage is mandatory. Never accept a real installation root.
 const work=fs.realpathSync(workRoot),stage=path.resolve(stageRoot);
 const rel=path.relative(work,stage);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Rehearsal stage must be inside work root');
 const marker=child(stage,'.code-deployment-rehearsal');
 if(!fs.existsSync(marker)||fs.readFileSync(marker,'utf8')!=='code-only-rehearsal-v1')throw Error('Unknown rehearsal target');
 const result=preflight({sourceRoot,installedRoot:stage,manifestFile});
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 const previous=new Map();let replaced=0,rolledBack=false,errorCode=null;
 try{
  for(const entry of manifest.files){
   if(entry.sha256===entry.previousSha256)continue;
   const target=child(stage,entry.target);previous.set(target,fs.existsSync(target)?fs.readFileSync(target):null);
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(child(sourceRoot,entry.source),target);
   if(hash(target)!==entry.sha256)throw Error('copy-hash');
   if(failAfter&&++replaced>=failAfter)throw Error('injected-copy-failure');
  }
  for(const entry of manifest.files){if(hash(child(stage,entry.target))!==entry.sha256)throw Error('post-copy-hash');}
 }catch(error){
  errorCode=error.message;
  for(const [target,bytes] of [...previous].reverse()){if(bytes===null)fs.rmSync(target,{force:true});else fs.writeFileSync(target,bytes);}
  for(const entry of manifest.files){const target=child(stage,entry.target),actual=fs.existsSync(target)?hash(target):null;if(actual!==entry.previousSha256)throw Error('Rollback hash mismatch');}
  rolledBack=true;
 }
 return {ok:!errorCode,manifestSha256:result.manifestSha256,files:result.files,rolledBack,errorCode,productionModified:false};
}
if(require.main===module){
 try{const args=process.argv.slice(2);let result;
  if(args[0]==='preflight')result=preflight({sourceRoot:args[1],installedRoot:args[2],baselineFile:args[3]});
  else if(args[0]==='rollback-preflight')result=rollbackPreflight({backupRoot:args[1],installedRoot:args[2]});
  else throw Error('Usage: deployment-safety.cjs preflight SOURCE_ROOT INSTALLED_ROOT [BASELINE] | rollback-preflight BACKUP INSTALLED_ROOT');
  console.log(JSON.stringify(result,null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={child,hash,preflight,rollbackPreflight,rehearse};
