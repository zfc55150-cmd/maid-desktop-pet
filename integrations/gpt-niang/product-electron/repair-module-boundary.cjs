'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./app/file-integrity.cjs');
const stage=path.resolve(process.argv[2]),read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),plan=read(path.join(stage,'promotion-plan.json')),root=path.resolve(plan.target),out=path.join(stage,'package');
if(fs.existsSync(path.join(stage,'finalized.json')))throw Error('FORMAL_RELEASE_FROZEN_USE_NEW_TRANSACTION');
if(root!==path.resolve(path.join(process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData/Local'), 'Programs/GPTNiangUsage/gpt-niang-usage/versions/0.8.0-electron')))throw Error('REPAIR_SCOPE');
const activeFile=path.join(root,'../../active-version.json'),active=read(activeFile),manifest=read(path.join(root,'package-manifest.json'));
if(active.version!==plan.version||sha(path.join(root,'package-manifest.json'))!==plan.active.manifestSha256||active.manifestSha256!==plan.active.manifestSha256||fs.existsSync(path.join(root,'package.json')))throw Error('REPAIR_DRIFT');
for(const row of manifest.files)if(sha(path.join(root,row.path))!==row.sha256)throw Error('REPAIR_FILE_DRIFT');
const source=path.join(__dirname,'package.json'),bytes=fs.readFileSync(source);for(const dir of [root,out])fs.writeFileSync(path.join(dir,'package.json'),bytes,{flag:'wx'});
manifest.files.push({path:'package.json',bytes:bytes.length,sha256:sha(source)});
for(const dir of [root,out])fs.writeFileSync(path.join(dir,'package-manifest.json'),JSON.stringify(manifest,null,2));
const previous=active.manifestSha256;active.manifestSha256=sha(path.join(root,'package-manifest.json'));plan.active=active;plan.files=manifest.files.length;plan.bytes=manifest.files.reduce((n,f)=>n+f.bytes,0);
fs.writeFileSync(activeFile+'.tmp',JSON.stringify(active,null,2));fs.renameSync(activeFile+'.tmp',activeFile);
fs.writeFileSync(path.join(stage,'active-version.json'),JSON.stringify(active,null,2));fs.writeFileSync(path.join(stage,'promotion-plan.json'),JSON.stringify(plan,null,2));
// Keep the original install/re-enable file list aware of the package boundary.
const requiredFile=path.join(root,'../../runtime/install-files.json'),required=read(requiredFile);required.push('versions/'+plan.version+'/package.json');fs.writeFileSync(requiredFile,JSON.stringify(required,null,2));fs.copyFileSync(requiredFile,path.join(stage,'root-overlay/runtime/install-files.json'));
const receiptFile=path.join(root,'../../electron-deployment.json'),receipt=read(receiptFile),row=receipt.rootFiles.find(f=>f.path==='runtime/install-files.json');row.sha256=sha(requiredFile);plan.replacements.find(f=>f.path===row.path).sha256=row.sha256;fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2));fs.writeFileSync(path.join(stage,'promotion-plan.json'),JSON.stringify(plan,null,2));
fs.writeFileSync(path.join(stage,'module-boundary-fix.json'),JSON.stringify({previousManifestSha256:previous,manifestSha256:active.manifestSha256,files:manifest.files.length,cause:'installed-parent-package-type-module',fix:'private-package-commonjs-boundary'},null,2));console.log(JSON.stringify({repaired:true,files:manifest.files.length}));
