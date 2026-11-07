'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),work=path.join(root,'work/gpt-niang-interaction');
const pack=process.env.GPT_INTERACTION_PACKAGE||path.join(work,'package-v1'),manifest=JSON.parse(fs.readFileSync(path.join(pack,'deployment.json'),'utf8'));
const hash=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const q=s=>"'"+s.replace(/'/g,"''")+"'";
const ps='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
function run(command){return spawnSync(ps,['-NoProfile','-STA','-ExecutionPolicy','Bypass','-Command',command],{encoding:'utf8',env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});}
test('two-file install, preservation, unknown-change refusal and exact rollback',()=>{
 const temp=fs.mkdtempSync(path.join(work,'install-test-')),fakePack=path.join(temp,'package'),target=path.join(temp,'target'),data=path.join(temp,'data');
 fs.cpSync(pack,fakePack,{recursive:true});fs.mkdirSync(target);fs.mkdirSync(data);
 const spec=structuredClone(manifest);spec.targetRoot=target;spec.dataDir=data;
 for(const file of spec.files)if(file.previousSha256){fs.mkdirSync(path.dirname(path.join(target,file.target)),{recursive:true});fs.copyFileSync(path.join(pack,'baseline',file.target),path.join(target,file.target));}
 fs.writeFileSync(path.join(target,'installation.json'),JSON.stringify({nodePath:process.execPath,dataDir:data}));
 const settings=path.join(data,'settings.json');fs.writeFileSync(settings,'{"scale":1.4,"followHost":false,"keep":"FAKE"}');const before=hash(settings);
 fs.writeFileSync(path.join(fakePack,'deployment.json'),JSON.stringify(spec));
 const apply=extra=>run('& '+q(path.join(fakePack,'apply-update.ps1'))+' -PackageRoot '+q(fakePack)+' -NoRestart '+extra);
 let result=apply('');assert.equal(result.status,0,result.stderr);
 result=apply('-Apply');assert.equal(result.status,0,result.stderr);
 for(const file of spec.files)assert.equal(hash(path.join(target,file.target)),file.sha256);
 assert.equal(hash(settings),before);
 const backup=path.join(data,'animation-backups',fs.readdirSync(path.join(data,'animation-backups'))[0]);
 const changed=spec.files[0].target;
 fs.appendFileSync(path.join(target,changed),'\n# unknown change');
 result=apply('-RollbackBackup '+q(backup));assert.notEqual(result.status,0);
 fs.copyFileSync(path.join(fakePack,'files',changed),path.join(target,changed));
 result=apply('-RollbackBackup '+q(backup)+' -Apply');assert.equal(result.status,0,result.stderr);
 for(const file of spec.files)assert.equal(hash(path.join(target,file.target)),file.previousSha256);
 assert.equal(hash(settings),before);
});
test('complete widget initializes against isolated fake settings',()=>{
 const stage=fs.mkdtempSync(path.join(work,'startup-test-'));
 fs.mkdirSync(path.join(stage,'assets'));fs.mkdirSync(path.join(stage,'runtime'));fs.mkdirSync(path.join(stage,'data'));
 for(const name of fs.readdirSync(path.join(manifest.targetRoot,'assets'))){const p=path.join(manifest.targetRoot,'assets',name);if(fs.statSync(p).isFile())fs.copyFileSync(p,path.join(stage,'assets',name));}
 fs.cpSync(path.join(manifest.targetRoot,'runtime'),path.join(stage,'runtime'),{recursive:true});
 fs.copyFileSync(path.join(manifest.targetRoot,'widget.xaml'),path.join(stage,'widget.xaml'));
 fs.copyFileSync(path.join(manifest.targetRoot,'widget.ps1'),path.join(stage,'widget.ps1'));
 for(const file of manifest.files){fs.mkdirSync(path.dirname(path.join(stage,file.target)),{recursive:true});fs.copyFileSync(path.join(pack,'files',file.target),path.join(stage,file.target));}
 fs.writeFileSync(path.join(stage,'installation.json'),JSON.stringify({nodePath:process.execPath,dataDir:path.join(stage,'data')}));
 fs.writeFileSync(path.join(stage,'data/settings.json'),JSON.stringify({followHost:false,desktopLeft:-120,desktopTop:900,scale:1.4,bubbleScale:1,dragonMotionVersion:1}));
 const result=run('& '+q(path.join(stage,'runtime/start-widget.ps1'))+' -CheckOnly');assert.equal(result.status,0,result.stderr);
 const status=JSON.parse(result.stdout);assert.equal(status.ok,true);assert.equal(status.imageLoaded,true);assert.equal(status.sizing.character,1.4);
 assert.equal(fs.existsSync(path.join(stage,'data/runtime.json')),false);
});
