'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./file-integrity.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function verify(root,{allowLegacy=false}={}){
 root=path.resolve(root);const m=read(path.join(root,'package-manifest.json')),cfg=read(path.join(root,'product.json'));
 if(m.renderer!=='electron'||cfg.version!==m.version||!Array.isArray(m.files))throw Error('MANIFEST_SCHEMA');
 const releaseTag=m.releaseTag??cfg.releaseTag??null;
 if(m.releaseTag!==undefined){
  const pkg=read(path.join(root,'package.json'));
  if(!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(releaseTag)||
     cfg.releaseTag!==releaseTag||pkg.releaseTag!==releaseTag||pkg.version!==m.version)throw Error('RELEASE_METADATA');
 }
 const names=new Set();let bytes=0;
 for(const row of m.files){if(typeof row.path!=='string'||row.path.includes('\\')||path.posix.isAbsolute(row.path)||row.path.split('/').some(n=>!n||n==='.'||n==='..')||names.has(row.path))throw Error('MANIFEST_PATH');names.add(row.path);const file=path.join(root,row.path),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==row.bytes||sha(file)!==row.sha256)throw Error('FILE_HASH:'+row.path);bytes+=stat.size;}
 const scenes=read(path.join(root,'scenes.json')),masks=read(path.join(root,'hit-masks.json')),animation=read(path.join(root,'animation.json'));let frames=0;
 const keys=o=>Object.keys(o).sort().join(',');if(keys(scenes.clips)!==keys(masks.entries)||keys(scenes.clips)!==keys(animation.states)||masks.size!==384||masks.threshold!==10)throw Error('MEDIA_REGISTRATION');
 for(const [name,c]of Object.entries(scenes.clips)){const mask=masks.entries[name],state=animation.states[name];if(!Number.isInteger(c.frames)||c.frames<2||c.frames!==state.frames||c.fps!==(state.fps||animation.fps)||c.fps<1||c.fps>60||!names.has(c.file)||!names.has(mask?.file)||c.frames!==mask.frames||mask.bytes!==c.frames*384*384/8||sha(path.join(root,c.file))!==mask.videoSha256||sha(path.join(root,mask.file))!==mask.sha256||fs.statSync(path.join(root,mask.file)).size!==mask.bytes)throw Error('MEDIA_LINK:'+name);frames+=c.frames;}
 if(!Number.isInteger(m.clips)||!Number.isInteger(m.frames)||Object.keys(scenes.clips).length!==m.clips||frames!==m.frames)throw Error('MEDIA_COUNT');
 const compat=path.resolve(cfg.compatRoot),active=path.join(compat,'active-version.json');let legacyRemaining=null;
 if(fs.existsSync(active)&&path.resolve(compat,'versions',m.version)===root){const a=read(active);if(a.version!==m.version||a.mainSha256!==sha(path.join(root,'app/main.cjs'))||a.manifestSha256!==sha(path.join(root,'package-manifest.json')))throw Error('ACTIVATION_HASH');const receipt=read(path.join(compat,'electron-deployment.json'));for(const row of receipt.rootFiles)if(sha(path.join(compat,row.path))!==row.sha256)throw Error('COMPAT_HASH:'+row.path);legacyRemaining=receipt.retired.filter(row=>fs.existsSync(path.join(compat,row.path))).length;if(legacyRemaining&&!allowLegacy)throw Error('LEGACY_FILES_REMAIN:'+legacyRemaining);}
 return {ok:true,version:m.version,releaseTag,files:m.files.length,bytes,clips:m.clips,frames,legacyRemaining,screenPresentationVerified:false};
}
module.exports={verify};if(require.main===module){try{console.log(JSON.stringify(verify(process.argv[2],{allowLegacy:process.argv.includes('--allow-legacy')})));}catch(e){console.error(e.message);process.exitCode=1;}}
