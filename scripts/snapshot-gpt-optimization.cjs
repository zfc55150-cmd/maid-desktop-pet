'use strict';
// Small code/config baseline + hashes only for media. Never reads chat or credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const local=process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local');
const installed=path.join(local,'Programs/DeepSeekActionPet');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const out=path.resolve(process.argv[2]||path.join(root,'work/optimization-20261101/baseline'));
if(fs.existsSync(out))throw Error('Use a new baseline directory');
fs.mkdirSync(out,{recursive:true});
const copy=(src,dst)=>{fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);};
const manifest=JSON.parse(fs.readFileSync(path.join(root,'deployment.json'),'utf8'));
const result={at:new Date().toISOString(),installedRoot:installed,code:[],configs:[],media:[],wpf:[]};
copy(path.join(root,'deployment.json'),path.join(out,'deployment-before.json'));
for(const e of manifest.files){
 const s=path.join(root,e.source),i=path.join(installed,e.target);
 result.code.push({...e,sourceSha256:hash(s),installedSha256:hash(i)});
 copy(s,path.join(out,'source',e.source));copy(i,path.join(out,'installed',e.target));
}
for(const rel of ['DeepSeekActionPet/dsh-pet/pet/gptniang-config.json','GPTNiangActionPet/dsh-pet/pet/gptniang-config.json']){
 const p=path.join(local,rel);if(fs.existsSync(p)){copy(p,path.join(out,'config',rel));result.configs.push({path:p,sha256:hash(p)});}
}
const media=path.join(local,'DeepSeekActionPet/dsh-pet/pet/gptniang-animation');
for(const name of fs.readdirSync(media).filter(n=>n.endsWith('.webm')).sort())result.media.push({name,bytes:fs.statSync(path.join(media,name)).size,sha256:hash(path.join(media,name))});
// Preserve WPF code, but hash atlas/media in place instead of duplicating libraries.
const wpf=path.join(local,'Programs/GPTNiangUsage/gpt-niang-usage');
function scan(dir,rel=''){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.isSymbolicLink()||['node_modules','.git','config','logs'].includes(e.name))continue;
  const p=path.join(dir,e.name),r=path.join(rel,e.name);
  if(e.isDirectory())scan(p,r);
  else if(/\.(ps1|xaml|cs|json|mjs|png)$/.test(e.name)&&!/(credential|secret|token|chat|settings|state|usage|cache|history)/i.test(e.name)){
   result.wpf.push({path:r,bytes:fs.statSync(p).size,sha256:hash(p)});
   if(/\.(ps1|xaml|cs|mjs)$/.test(e.name))copy(p,path.join(out,'wpf-code',r));
  }
 }
}
scan(wpf);
fs.writeFileSync(path.join(out,'baseline.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({out,code:result.code.length,configs:result.configs.length,media:result.media.length,wpf:result.wpf.length,mediaCopied:false}));
