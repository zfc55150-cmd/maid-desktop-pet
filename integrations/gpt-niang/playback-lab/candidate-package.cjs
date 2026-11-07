'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {read}=require('./video-visibility.cjs');
const {sha}=require('./file-integrity.cjs');
function verify(root){
 root=path.resolve(root);const manifest=read(path.join(root,'candidate-manifest.json'));
 for(const entry of [...manifest.files,...manifest.media,...manifest.dependencies])if(sha(path.resolve(root,entry.file))!==entry.sha256)throw new Error('CANDIDATE_HASH_DRIFT:'+entry.file);
 const baseline=read(path.join(root,'baseline.json'));
 for(const [owner,files]of [[baseline.gptRoot,baseline.gptFiles],[baseline.deepseekRoot,baseline.deepseekFiles],[baseline.stableRoot,baseline.stableFiles]])for(const f of files)if(sha(path.join(owner,f.target))!==f.sha256)throw new Error('INSTALLED_BASELINE_DRIFT:'+f.target);
 return {ok:true,revision:manifest.revision,manifestSha256:sha(path.join(root,'candidate-manifest.json')),sourceFiles:manifest.files.length,mediaFiles:manifest.media.length,formalVersion:baseline.gptVersion};
}
function seal(root){
 root=path.resolve(root);const project=path.resolve(__dirname,'../../..');if(!root.startsWith(path.join(project,'work')+path.sep))throw new Error('WORK_SCOPE');
 const dest=path.join(root,'candidate-source');if(fs.existsSync(dest))throw new Error('FRESH_CANDIDATE_SOURCE_REQUIRED');fs.mkdirSync(dest);
 const files=[];const copy=(dir,relative='')=>{for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),rel=path.join(relative,name);if(fs.statSync(file).isDirectory()){if(name==='vendor'){fs.mkdirSync(path.join(dest,rel));copy(file,rel);}continue;}if(!/\.(cjs|js|html|ps1|py|cpp|md|json|txt)$/.test(name))continue;fs.copyFileSync(file,path.join(dest,rel));files.push({file:path.join('candidate-source',rel).replaceAll('\\','/'),sha256:sha(file)});}};copy(__dirname);
 for(const file of ['baseline.json','scenes.json','hit-masks.json','native/native-lease.node','native/build.json'])files.push({file,sha256:sha(path.join(root,file))});
 const scenes=read(path.join(root,'scenes.json')),masks=read(path.join(root,'hit-masks.json'));const media=[];
 for(const [name,spec]of Object.entries(scenes.clips)){for(const file of [spec.file,masks.entries[name].file])media.push({file,sha256:sha(path.resolve(root,file))});}
 const dependencies=[''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'/Programs/DeepSeekActionPet/electron/electron.exe',''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'/Programs/DeepSeekActionPet/node.exe'].map(file=>({file,sha256:sha(file)}));
 const manifest={revision:require('./performance-catalog.js').revision,at:new Date().toISOString(),scope:'independent candidate, not a formal deployment',files,media,dependencies,settingsWrites:false,paidCalls:0,independentRuntimePackaged:false};
 fs.writeFileSync(path.join(root,'candidate-manifest.json'),JSON.stringify(manifest,null,2));return verify(root);
}
if(require.main===module){const [mode,root]=process.argv.slice(2);if(mode==='seal')console.log(JSON.stringify(seal(root)));else if(mode==='check')console.log(JSON.stringify(verify(root)));else throw new Error('USE seal|check <candidate-root>');}
module.exports={seal,verify};
