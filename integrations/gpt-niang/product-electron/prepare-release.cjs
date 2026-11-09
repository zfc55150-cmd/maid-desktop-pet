'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./app/file-integrity.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),project=path.resolve(__dirname,'../../..'),stage=path.resolve(process.argv[2]);
if(!stage.startsWith(path.join(project,'work')+path.sep))throw Error('WORK_SCOPE');
const compat=path.join(process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData/Local'), 'Programs/GPTNiangUsage/gpt-niang-usage'),active=read(path.join(compat,'active-version.json')),base=path.join(compat,'versions',active.version),sourceVersion=require('./app/performance-catalog.js').revision;
if(sourceVersion===active.version||!/^\d+\.\d+\.\d+-electron(?:\.\d+)?$/.test(sourceVersion))throw Error('FRESH_RELEASE_VERSION_REQUIRED');
require(path.join(base,'app/package-doctor.cjs')).verify(base);
const baseline=read(path.join(base,'package-manifest.json')),out=path.join(stage,'candidate'),refresh=process.argv.includes('--refresh'),copyBaseline=process.argv.includes('--copy-baseline');
if(fs.existsSync(out)){if(!refresh||read(path.join(out,'builder-owner.json')).stage!==stage)throw Error('FRESH_CANDIDATE_REQUIRED');}else fs.mkdirSync(out,{recursive:true});
const additions=require('./media-additions.cjs');
const keepMedia=process.argv.includes('--keep-media');
const rowMap=new Map(baseline.files.map(r=>[r.path,r]));let sharedBytes=0;
const nativeBuild=path.join(stage,'native-product'),nativeUpdates=fs.existsSync(path.join(nativeBuild,'build.json'))?['build.json','native-lease.node']:[];
if(nativeUpdates.length){
 const build=read(path.join(nativeBuild,'build.json'));
 if(build.ok!==true||build.sourceSha256!==sha(path.join(__dirname,'native-lease.cpp'))||build.binarySha256!==sha(path.join(nativeBuild,'native-lease.node')))throw Error('NATIVE_BUILD_DRIFT');
}
const retiredNames=new Set(['app/flight-clock.js','runtime/music-monitor.ps1','runtime/music-audio.cs']),serviceUpdates=['control.mjs','release-notice.cjs'],retired=baseline.files.filter(r=>retiredNames.has(r.path)).map(r=>({path:r.path,previousSha256:r.sha256,bytes:r.bytes}));
for(const row of retired){const file=path.join(out,row.path);if(fs.existsSync(file)){if(sha(file)!==row.previousSha256)throw Error('RETIRED_CANDIDATE_DRIFT');fs.unlinkSync(file);}}
const replacedMetadata=['product.json','package.json','installation.json',...(keepMedia?[]:additions.metadata)];
for(const r of baseline.files){if(r.path.startsWith('app/')||retiredNames.has(r.path)||serviceUpdates.some(n=>r.path==='runtime/'+n)||nativeUpdates.some(n=>r.path==='native-product/'+n)||replacedMetadata.includes(r.path))continue;const to=path.join(out,r.path);fs.mkdirSync(path.dirname(to),{recursive:true});if(!fs.existsSync(to)){const from=path.join(base,r.path);if(copyBaseline)fs.copyFileSync(from,to);else fs.linkSync(from,to);}if(sha(to)!==r.sha256)throw Error('BASE_FILE_DRIFT:'+r.path);if(!copyBaseline)sharedBytes+=r.bytes;}
for(const name of nativeUpdates){
 const to=path.join(out,'native-product',name);
 fs.mkdirSync(path.dirname(to),{recursive:true});
 if(fs.existsSync(to))fs.unlinkSync(to);
 fs.copyFileSync(path.join(nativeBuild,name),to);
}
for(const name of serviceUpdates){const to=path.join(out,'runtime',name);fs.mkdirSync(path.dirname(to),{recursive:true});if(fs.existsSync(to))fs.unlinkSync(to);fs.copyFileSync(path.join(__dirname,'services',name),to);}
fs.cpSync(path.join(__dirname,'app'),path.join(out,'app'),{recursive:true});fs.copyFileSync(path.join(__dirname,'package.json'),path.join(out,'package.json'));
const cfg=read(path.join(base,'product.json')),pkg=read(path.join(__dirname,'package.json')),target=path.join(compat,'versions',sourceVersion);fs.writeFileSync(path.join(out,'product.json'),JSON.stringify({...cfg,version:sourceVersion,releaseTag:pkg.releaseTag||cfg.releaseTag||'v1.0.0',stage:true},null,2));
const installation=read(path.join(base,'installation.json'));fs.writeFileSync(path.join(out,'installation.json'),JSON.stringify({...installation,appDir:target,nodePath:path.join(target,'node/node.exe')},null,2));
const media=keepMedia?{clips:baseline.clips,frames:baseline.frames,receipts:baseline.mediaAdditions||[]}:additions.apply(base,out);
const files=[];function visit(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,d.name),relative=path.relative(out,full).replaceAll('\\','/');if(d.isSymbolicLink())throw Error('SYMLINK');if(d.isDirectory()){if(['test-state','test-profile'].includes(relative))continue;visit(full);}else if(!['package-manifest.json','builder-owner.json'].includes(relative)&&!relative.startsWith('test-')&&!['product-smoke.json','product-test-status.json','settings-preview.png','bust-preview.png','ui-settings-preview.png','ui-narrow-preview.png','quota-card-preview.png','menu-preview.png','size-preview.png','automatic-brelaxed-preview.png','automatic-footrelax-preview.png','automatic-response-preview.png','front-flight-tail-preview.png','front-flight-landing-preview.png','front-flight-rest-preview.png','airborne-coast-preview.png','press-continuity-preview.png'].includes(relative))files.push({path:relative,bytes:fs.statSync(full).size,sha256:sha(full)});}}visit(out);
const manifest={schema:1,version:sourceVersion,renderer:'electron',baseline:active.version,files,clips:media.clips,frames:media.frames,mediaAdditions:media.receipts,paidCalls:0};fs.writeFileSync(path.join(out,'package-manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(out,'builder-owner.json'),JSON.stringify({stage,base,version:sourceVersion},null,2));
const changes=files.filter(r=>rowMap.get(r.path)?.sha256!==r.sha256).map(r=>({...r,previousSha256:rowMap.get(r.path)?.sha256||null}));
const delivery=path.join(stage,'files');for(const r of changes){const to=path.join(delivery,r.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(out,r.path),to);}
fs.writeFileSync(path.join(stage,'deployment.json'),JSON.stringify({schema:1,version:sourceVersion,base:active.version,baseRoot:base,compatRoot:compat,target,candidate:out,baseManifestSha256:active.manifestSha256,previousActiveSha256:sha(path.join(compat,'active-version.json')),files:changes,retired,mediaAdditions:media.receipts,immutableHardlinkedBytes:sharedBytes,paidCalls:0},null,2));
console.log(JSON.stringify({candidate:out,version:sourceVersion,changedFiles:changes.length,updateBytes:changes.reduce((n,r)=>n+r.bytes,0),immutableHardlinkedBytes:sharedBytes}));
