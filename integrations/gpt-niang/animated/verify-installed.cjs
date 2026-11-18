'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function entries(list,label){
 if(!Array.isArray(list)||list.length>10000)throw Error('INVALID_'+label+'_LIST');
 const out=new Map();
 for(const e of list){
  if(!e||typeof e.target!=='string'||!e.target||/[:\0]/.test(e.target)||/^[\\/]/.test(e.target)||typeof e.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(e.sha256))throw Error('INVALID_'+label+'_ENTRY');
  const relative=e.target.replace(/\\/g,'/');
  if(relative.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('INVALID_'+label+'_PATH');
  const key=relative.toLowerCase();if(out.has(key))throw Error('DUPLICATE_'+label+'_ENTRY');
  out.set(key,{target:relative,sha256:e.sha256.toLowerCase()});
 }
 return out;
}
function child(root,relative){
 const base=path.resolve(root),target=path.resolve(base,relative),tail=path.relative(base,target);
 if(!tail||tail==='..'||tail.startsWith('..'+path.sep)||path.isAbsolute(tail))throw Error('VERIFY_PATH_ESCAPED');
 let current=base;
 for(const component of [''].concat(tail.split(path.sep))){if(component)current=path.join(current,component);if(fs.lstatSync(current).isSymbolicLink())throw Error('VERIFY_LINKED_PATH');}
 if(!fs.statSync(target).isFile())throw Error('VERIFY_FILE_REQUIRED');return target;
}
function verifyInstalled({manifest,baseline=null,installedRoot=null,agentRoot=null}){
 if(!manifest||!manifest.version||!manifest.stableAgent)throw Error('INVALID_DEPLOYMENT_MANIFEST');
 if(baseline&&baseline.schema!==1)throw Error('INVALID_HOST_BASELINE_SCHEMA');
 const host=entries(manifest.hostFiles??baseline?.hostFiles,'HOST'),stableHost=entries(manifest.stableHostFiles??baseline?.stableHostFiles,'STABLE_HOST');
 if(!host.size||!stableHost.size)throw Error('HOST_BASELINE_REQUIRED');
 const custom=entries(manifest.files,'CUSTOM'),stable=entries(manifest.stableAgent.files,'STABLE');
 const app=new Map([...host,...custom]),agent=new Map([...stableHost,...stable]);
 const required=['runtime/supervisor.ps1','runtime/supervisor-task.ps1','runtime/start-supervisor.ps1','runtime/start-widget.ps1','runtime/update-common.ps1','runtime/watch.mjs','runtime/worker-state.mjs','runtime/worker-ipc.mjs','runtime/usage.mjs','runtime/mcp.mjs','runtime/refresh-client.mjs','launch.vbs'];
 const requiredStable=['agent-launch.vbs','agent-supervisor.vbs','update-agent.ps1','update-common.ps1','supervisor-task.ps1','update-helper.ps1'];
 if(required.some(x=>!app.has(x))||requiredStable.some(x=>!agent.has(x)))throw Error('HOST_BASELINE_INCOMPLETE');
 const roots={app:path.resolve(installedRoot||manifest.targetRoot),agent:path.resolve(agentRoot||manifest.stableAgent.targetRoot)};
 const failures=[];
 for(const [scope,files] of [['app',app],['agent',agent]])for(const entry of files.values()){
  try{if(hash(child(roots[scope],entry.target))!==entry.sha256)failures.push({scope,target:entry.target,code:'HASH_MISMATCH'});}
  catch(error){failures.push({scope,target:entry.target,code:error.code==='ENOENT'?'FILE_MISSING':error.message==='VERIFY_LINKED_PATH'?'LINKED_PATH':'FILE_UNREADABLE'});}
 }
 return {ok:failures.length===0,checkedAt:new Date().toISOString(),version:manifest.version,upstreamVersion:manifest.upstreamVersion??baseline?.upstreamVersion,customFiles:custom.size,hostFiles:host.size,uniqueApplicationFiles:app.size,stableFiles:agent.size,failures,paidApi:false,restartsPet:false,copiesMaterial:false};
}
function main(args){
 const options={manifest:path.join(__dirname,'deployment.json')};
 const names={'--manifest':'manifest','--host-baseline':'baseline','--installed-root':'installedRoot','--agent-root':'agentRoot','--report':'report'};
 for(let i=0;i<args.length;i++){if(!names[args[i]]||!args[i+1]||args[i+1].startsWith('--'))throw Error('USAGE_VERIFY_INSTALLED');options[names[args[i]]]=path.resolve(args[++i]);}
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
 const fallback=path.resolve(__dirname,'../maintenance/host-baseline.json');
 const baseline=options.baseline?read(options.baseline):fs.existsSync(fallback)?read(fallback):null;
 const result=verifyInstalled({manifest:read(options.manifest),baseline,installedRoot:options.installedRoot,agentRoot:options.agentRoot});
 if(options.report){fs.mkdirSync(path.dirname(options.report),{recursive:true});const temp=options.report+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(result,null,2)+'\n');fs.renameSync(temp,options.report);}
 console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;return result;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={verifyInstalled,main};
