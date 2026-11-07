'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{sha}=require('./app/file-integrity.cjs'),{snapshotWriter}=require('./app/snapshot-writer.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),stage=path.resolve(process.argv[2]),plan=read(path.join(stage,'deployment.json')),mode=process.argv[3],compat=path.resolve(plan.compatRoot),target=path.resolve(plan.target),candidate=path.resolve(plan.candidate);
if(compat!==path.resolve(path.join(process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData/Local'), 'Programs/GPTNiangUsage/gpt-niang-usage'))||target!==path.resolve(compat,'versions',plan.version)||!/^\d+\.\d+\.\d+-electron(?:\.\d+)?$/.test(plan.version)||!stage.startsWith(path.resolve(__dirname,'../../../work')+path.sep))throw Error('INSTALL_SCOPE');
const activeFile=path.join(compat,'active-version.json'),receiptFile=path.join(compat,'electron-deployment.json'),journalFile=path.join(stage,'install-state.json');
const atomic=(file,value)=>snapshotWriter(file).write(value);
function assertHash(file,hash){if(sha(file)!==hash)throw Error('HASH_DRIFT:'+path.basename(file));}
function safeRelative(relative){if(path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(v=>!v||v==='.'||v==='..'))throw Error('UNSAFE_PATH');}
function copy(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
async function prepare(){
 assertHash(activeFile,plan.previousActiveSha256);assertHash(path.join(plan.baseRoot,'package-manifest.json'),plan.baseManifestSha256);
 const checked=read(path.join(stage,'candidate-verification.json'));if(!checked.ok||checked.manifestSha256!==sha(path.join(candidate,'package-manifest.json')))throw Error('VERIFIED_CANDIDATE_REQUIRED');
 require(path.join(candidate,'app/package-doctor.cjs')).verify(candidate);if(fs.existsSync(target))throw Error('FRESH_VERSION_REQUIRED');
 for(const row of plan.retired||[]){safeRelative(row.path);assertHash(path.join(plan.baseRoot,row.path),row.previousSha256);if(fs.existsSync(path.join(candidate,row.path)))throw Error('RETIRED_FILE_IN_CANDIDATE');}
 fs.mkdirSync(target,{recursive:true});const manifest=read(path.join(candidate,'package-manifest.json'));
 for(const row of manifest.files){safeRelative(row.path);const from=path.join(candidate,row.path),to=path.join(target,row.path);fs.mkdirSync(path.dirname(to),{recursive:true});if(row.path.startsWith('app/')||['package.json','product.json','installation.json'].includes(row.path))copy(from,to);else fs.linkSync(from,to);assertHash(to,row.sha256);}
 const config=read(path.join(target,'product.json'));config.stage=false;await atomic(path.join(target,'product.json'),config);
 const productRow=manifest.files.find(r=>r.path==='product.json');productRow.sha256=sha(path.join(target,'product.json'));productRow.bytes=fs.statSync(path.join(target,'product.json')).size;await atomic(path.join(target,'package-manifest.json'),manifest);
 const overlay=path.join(stage,'root-overlay'),backup=path.join(stage,'root-backup');fs.mkdirSync(path.join(overlay,'runtime'),{recursive:true});fs.mkdirSync(backup,{recursive:true});copy(activeFile,path.join(backup,'active-version.json'));copy(receiptFile,path.join(backup,'electron-deployment.json'));
 const metadata=read(path.join(compat,'installation.json'));metadata.nodePath=path.join(target,'node/node.exe');metadata.desktopVersion=plan.version;metadata.renderer='electron';await atomic(path.join(overlay,'installation.json'),metadata);
 const mcp=read(path.join(compat,'.mcp.json'));mcp.mcpServers['gpt-niang-usage'].command=metadata.nodePath;await atomic(path.join(overlay,'.mcp.json'),mcp);
 const pkg=read(path.join(compat,'package.json'));pkg.scripts.verify='node versions/'+plan.version+'/app/package-doctor.cjs versions/'+plan.version;await atomic(path.join(overlay,'package.json'),pkg);
 const required=read(path.join(compat,'runtime/install-files.json')).filter(r=>!r.startsWith('versions/'));required.push(...manifest.files.map(r=>'versions/'+plan.version+'/'+r.path),'versions/'+plan.version+'/package-manifest.json');await atomic(path.join(overlay,'runtime/install-files.json'),[...new Set(required)]);
 const readme=fs.readFileSync(path.join(compat,'README.md'),'utf8').replaceAll(plan.base,plan.version);fs.writeFileSync(path.join(overlay,'README.md'),readme);
 const rootFiles=['installation.json','.mcp.json','package.json','runtime/install-files.json','README.md'].map(relative=>{copy(path.join(compat,relative),path.join(backup,relative));return {path:relative,previousSha256:sha(path.join(compat,relative)),sha256:sha(path.join(overlay,relative))};});
 const active={version:plan.version,renderer:'electron',mainSha256:sha(path.join(target,'app/main.cjs')),electronSha256:sha(path.join(target,'electron/electron.exe')),manifestSha256:sha(path.join(target,'package-manifest.json'))};
 const record={phase:'prepared',at:new Date().toISOString(),version:plan.version,target,active,rootFiles,oldActiveSha256:plan.previousActiveSha256,oldReceiptSha256:sha(receiptFile),candidateManifestSha256:checked.manifestSha256};await atomic(journalFile,record);console.log(JSON.stringify({ok:true,phase:record.phase,version:plan.version,files:manifest.files.length,rootChanges:rootFiles.length}));
}
async function rollback(){
 const journal=read(journalFile),backup=path.join(stage,'root-backup');for(const row of journal.rootFiles){const current=sha(path.join(compat,row.path));if(![row.sha256,row.previousSha256].includes(current))throw Error('ROLLBACK_CONCURRENT_CHANGE:'+row.path);}
 for(const row of journal.rootFiles){copy(path.join(backup,row.path),path.join(compat,row.path));assertHash(path.join(compat,row.path),row.previousSha256);}
 await atomic(receiptFile,read(path.join(backup,'electron-deployment.json')));await atomic(activeFile,read(path.join(backup,'active-version.json')));journal.phase='rolled-back';journal.at=new Date().toISOString();await atomic(journalFile,journal);
}
async function activate(){
 const journal=read(journalFile);if(journal.phase!=='prepared')throw Error('PREPARED_RELEASE_REQUIRED');assertHash(activeFile,journal.oldActiveSha256);assertHash(receiptFile,journal.oldReceiptSha256);
 const metadata=read(path.join(compat,'installation.json'));if(!fs.existsSync(path.join(metadata.dataDir,'supervisor-stop.flag')))throw Error('STOP_SUPERVISOR_FIRST');
 let runtime;try{runtime=read(path.join(metadata.dataDir,'runtime.json'));}catch{}if(runtime){try{process.kill(runtime.pid,0);throw Error('CHARACTER_STILL_RUNNING');}catch(e){if(e.message==='CHARACTER_STILL_RUNNING')throw e;}}
 for(const row of journal.rootFiles){assertHash(path.join(compat,row.path),row.previousSha256);assertHash(path.join(stage,'root-overlay',row.path),row.sha256);}
 const manifest=read(path.join(target,'package-manifest.json'));for(const row of manifest.files)assertHash(path.join(target,row.path),row.sha256);
 const displayBackup=path.join(metadata.dataDir,'electron-display-backups',Date.now()+'-'+crypto.randomUUID());fs.mkdirSync(displayBackup,{recursive:true});if(fs.existsSync(path.join(metadata.dataDir,'settings.json')))copy(path.join(metadata.dataDir,'settings.json'),path.join(displayBackup,'settings.json'));
 const preserved=[];for(const name of ['settings.json','pet-form.json','quotes.json','audio-preferences.json','experience-preferences.json','characters.json'])if(fs.existsSync(path.join(metadata.dataDir,name)))preserved.push({file:name,sha256:sha(path.join(metadata.dataDir,name))});await atomic(path.join(stage,'personal-state-before.json'),preserved);
 try{for(const row of journal.rootFiles){const from=path.join(stage,'root-overlay',row.path),to=path.join(compat,row.path);if(row.path==='README.md'){const temporary=to+'.'+crypto.randomUUID()+'.tmp';try{copy(from,temporary);fs.renameSync(temporary,to);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}}else await atomic(to,read(from));assertHash(to,row.sha256);}}
 catch(e){await rollback();throw e;}
 const receipt=read(path.join(stage,'root-backup/electron-deployment.json'));receipt.previousVersion=receipt.version;receipt.version=plan.version;receipt.phase='updated';receipt.updatedAt=new Date().toISOString();for(const row of journal.rootFiles){const existing=receipt.rootFiles.find(r=>r.path===row.path);if(existing)existing.sha256=row.sha256;else receipt.rootFiles.push({path:row.path,sha256:row.sha256});}
 await atomic(receiptFile,receipt);await atomic(activeFile,journal.active);journal.phase='activated';journal.at=new Date().toISOString();journal.displayBackup=displayBackup;await atomic(journalFile,journal);console.log(JSON.stringify({ok:true,phase:'activated',version:plan.version}));
}
(async()=>{if(mode==='--prepare')await prepare();else if(mode==='--activate')await activate();else if(mode==='--rollback')await rollback();else throw Error('INSTALL_MODE');})().catch(e=>{console.error(e.message);process.exitCode=1;});
