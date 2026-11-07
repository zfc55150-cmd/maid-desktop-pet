'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./app/file-integrity.cjs');
const project=path.resolve(__dirname,'../../..'),stage=path.resolve(process.argv[2]),version='0.8.0-electron';
if(!stage.startsWith(path.join(project,'work')+path.sep))throw Error('WORK_SCOPE');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),baseline=read(path.join(stage,'baseline.json')),target=path.join(baseline.gptRoot,'versions',version),out=path.join(stage,'package');
if(fs.existsSync(out))throw Error('FRESH_PACKAGE_REQUIRED');
const smoke=read(path.join(stage,'product-smoke.json'));if(!smoke.ok||smoke.checks.filter(c=>c.name.startsWith('select-')).length!==43)throw Error('COMPLETE_SMOKE_REQUIRED');
fs.mkdirSync(out,{recursive:true});
fs.copyFileSync(path.join(__dirname,'package.json'),path.join(out,'package.json'));
function copy(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);if(sha(from)!==sha(to))throw Error('COPY_HASH');}
fs.cpSync(path.join(__dirname,'app'),path.join(out,'app'),{recursive:true});
fs.cpSync(path.join(__dirname,'services'),path.join(out,'runtime'),{recursive:true});
fs.cpSync(path.join(stage,'assets'),path.join(out,'assets'),{recursive:true});
fs.cpSync(path.join(stage,'native-product'),path.join(out,'native-product'),{recursive:true});
fs.cpSync(path.join(stage,'.codex-plugin'),path.join(out,'.codex-plugin'),{recursive:true});
// Reuse the verified runtime bytes in a private directory; never modify DeepSeek.
const electronRoot=path.join(path.dirname(baseline.gptRoot),'..','DeepSeekActionPet','electron');
fs.cpSync(electronRoot,path.join(out,'electron'),{recursive:true});
copy(path.join(electronRoot,'..','node.exe'),path.join(out,'node','node.exe'));
const scenes=read(path.join(stage,'scenes.json')),masks=read(path.join(stage,'hit-masks.json'));
for(const [name,clip]of Object.entries(scenes.clips)){
 const source=path.resolve(stage,clip.file),mask=masks.entries[name];
 if(sha(source)!==mask.videoSha256)throw Error('VIDEO_SOURCE_HASH:'+name);
 copy(source,path.join(out,'media',name+'.webm'));clip.file='media/'+name+'.webm';
 const maskSource=path.resolve(stage,mask.file);if(sha(maskSource)!==mask.sha256)throw Error('MASK_SOURCE_HASH:'+name);
 copy(maskSource,path.join(out,'hit-masks',name+'.bin'));mask.file='hit-masks/'+name+'.bin';
}
const config=read(path.join(stage,'installation.json'));
fs.writeFileSync(path.join(out,'installation.json'),JSON.stringify({...config,appDir:target,nodePath:path.join(target,'node','node.exe')},null,2));
fs.writeFileSync(path.join(out,'product.json'),JSON.stringify({version,stage:false,dataDir:config.dataDir,compatRoot:baseline.gptRoot,serviceRoot:'runtime',nativeRoot:'native-product'},null,2));
fs.writeFileSync(path.join(out,'scenes.json'),JSON.stringify(scenes,null,2));fs.writeFileSync(path.join(out,'hit-masks.json'),JSON.stringify(masks,null,2));copy(path.join(stage,'animation.json'),path.join(out,'animation.json'));
const files=[];function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,d.name);if(d.isSymbolicLink())throw Error('SYMLINK');if(d.isDirectory())walk(file);else files.push({path:path.relative(out,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:sha(file)});}}walk(out);
const manifest={schema:1,version,renderer:'electron',baseline:baseline.gptVersion,files,clips:43,frames:7500,paidCalls:0};
fs.writeFileSync(path.join(out,'package-manifest.json'),JSON.stringify(manifest,null,2));
const active={version,renderer:'electron',mainSha256:sha(path.join(out,'app/main.cjs')),electronSha256:sha(path.join(out,'electron/electron.exe')),manifestSha256:sha(path.join(out,'package-manifest.json'))};
fs.writeFileSync(path.join(stage,'active-version.json'),JSON.stringify(active,null,2));
const replacements=['widget.ps1','runtime/start-widget.ps1','runtime/supervisor.ps1'].map(relative=>({path:relative,previousSha256:sha(path.join(baseline.gptRoot,relative)),sha256:sha(path.join(__dirname,'compat',path.basename(relative)))}));
fs.writeFileSync(path.join(stage,'promotion-plan.json'),JSON.stringify({schema:1,version,baseline:baseline.gptVersion,package:out,target,replacements,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),active},null,2));
console.log(JSON.stringify({package:out,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),version}));
