'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./app/file-integrity.cjs');
const stage=path.resolve(process.argv[2]),read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),plan=read(path.join(stage,'promotion-plan.json')),root=path.resolve(plan.target),out=path.join(stage,'package');
if(fs.existsSync(path.join(stage,'finalized.json')))throw Error('FORMAL_RELEASE_FROZEN_USE_NEW_TRANSACTION');
if(root!==path.resolve(path.join(process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData/Local'), 'Programs/GPTNiangUsage/gpt-niang-usage/versions/0.8.0-electron')))throw Error('FIX_SCOPE');
const activeFile=path.join(root,'../../active-version.json'),active=read(activeFile),manifest=read(path.join(root,'package-manifest.json'));
if(active.version!==plan.version||sha(path.join(root,'package-manifest.json'))!==active.manifestSha256)throw Error('FIX_DRIFT');
for(const row of manifest.files)if(sha(path.join(root,row.path))!==row.sha256)throw Error('FILE_DRIFT:'+row.path);
const changes=[];
for(const name of ['main.cjs','speech.js','product-smoke.cjs','hit-cache.cjs','desktop-renderer.js','desktop.html','snapshot-writer.cjs']){const row=manifest.files.find(f=>f.path==='app/'+name),source=path.join(__dirname,'app',name);changes.push({path:row.path,previousSha256:row.sha256,sha256:sha(source)});for(const folder of [root,out])fs.copyFileSync(source,path.join(folder,row.path));row.sha256=sha(source);row.bytes=fs.statSync(source).size;}
for(const folder of [root,out])fs.writeFileSync(path.join(folder,'package-manifest.json'),JSON.stringify(manifest,null,2));
active.mainSha256=sha(path.join(root,'app/main.cjs'));active.manifestSha256=sha(path.join(root,'package-manifest.json'));plan.active=active;
fs.writeFileSync(activeFile+'.tmp',JSON.stringify(active,null,2));fs.renameSync(activeFile+'.tmp',activeFile);for(const name of ['active-version.json'])fs.writeFileSync(path.join(stage,name),JSON.stringify(active,null,2));fs.writeFileSync(path.join(stage,'promotion-plan.json'),JSON.stringify(plan,null,2));fs.writeFileSync(path.join(stage,'snapshot-sharing-fix.json'),JSON.stringify({changes,manifestSha256:active.manifestSha256},null,2));console.log(JSON.stringify({updated:changes.length}));
