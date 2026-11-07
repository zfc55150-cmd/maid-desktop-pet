'use strict';
// Freeze current owners and reuse small lab dependencies. Never copies atlases,
// personal JSON, original media, or a complete runtime.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {read}=require('./video-visibility.cjs');
const project=path.resolve(__dirname,'../../..');
const {sha}=require('./file-integrity.cjs');
function check(root,files){return files.map(f=>{const actual=sha(path.join(root,f.target));if(actual!==f.sha256)throw new Error('BASELINE_DRIFT:'+f.target);return {target:f.target,sha256:actual};});}
function prepare(output){
 const out=path.resolve(output),work=path.join(project,'work')+path.sep;
 if(!out.startsWith(work)||fs.existsSync(out))throw new Error('FRESH_WORK_DIRECTORY_REQUIRED');
 const manifestPath=path.join(project,'work/gpt-idle-variety-20261102-01/deployment.json'),receiptPath=path.join(project,'work/gpt-idle-variety-20261102-01/live-install.json');
 const gm=read(manifestPath),receipt=read(receiptPath),dm=read(path.join(project,'deployment.json'));
 if(!receipt.ok||receipt.version!==gm.version)throw new Error('RECEIPT_VERSION');
 const gptFiles=check(gm.targetRoot,[...gm.files,...gm.hostFiles]);
 const deepseekRoot=''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'/Programs/DeepSeekActionPet';
 const deepseekFiles=check(deepseekRoot,dm.files);check(project,dm.files.map(f=>({...f,target:f.source})));
 const stableFiles=check(gm.stableAgent.targetRoot,[...new Map([...gm.stableHostFiles,...gm.stableAgent.files].map(f=>[f.target,f])).values()]);
 const old=path.join(project,'work/gpt-playback-lab-20261102-12');
 fs.mkdirSync(out);fs.mkdirSync(path.join(out,'before-source'));fs.mkdirSync(path.join(out,'native'));
 const sourceBefore={};for(const name of fs.readdirSync(__dirname)){if(!/\.(cjs|js|html|md)$/.test(name))continue;fs.copyFileSync(path.join(__dirname,name),path.join(out,'before-source',name));sourceBefore[name]=sha(path.join(__dirname,name));}
 for(const name of ['scenes.json','hit-masks.json']){const spec=read(path.join(old,name));if(name==='scenes.json')spec.baselineVersion=gm.version;fs.writeFileSync(path.join(out,name),JSON.stringify(spec,null,2));}
 for(const name of ['native-lease.node','build.json'])fs.copyFileSync(path.join(old,'native',name),path.join(out,'native',name));
 fs.copyFileSync(path.join(gm.targetRoot,'runtime/dragon-animation/animation.json'),path.join(out,'animation.json'));
 const baseline={at:new Date().toISOString(),gptVersion:gm.version,deepseekVersion:dm.version,gptRoot:gm.targetRoot,gptFiles,deepseekRoot,deepseekFiles,stableRoot:gm.stableAgent.targetRoot,stableFiles,receipt,receiptSha256:sha(receiptPath),manifestSha256:sha(manifestPath),sourceBefore,paidCalls:0,formalInstallChanged:false,screenPresentationVerified:false};
 fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(baseline,null,2));return {out,gptVersion:gm.version,gptFiles:gptFiles.length,stableFiles:stableFiles.length,deepseekFiles:deepseekFiles.length};
}
if(require.main===module)console.log(JSON.stringify(prepare(process.argv[2])));
module.exports={prepare,check};
