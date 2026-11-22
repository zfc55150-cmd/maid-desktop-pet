const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const arg=process.argv[2];
const isGitRef=typeof arg==='string'&&/^v\d+\.\d+\.\d+$/.test(arg);
const installed=!isGitRef?path.resolve(arg||path.join(require('node:os').homedir(),'AppData','Local','Programs','DeepSeekActionPet')):null;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let previousRef='v1.0.7',gitPrevMap=null;
const curManifestPath=path.join(root,'deployment.json');
if(fs.existsSync(curManifestPath)){try{const cur=JSON.parse(fs.readFileSync(curManifestPath,'utf8'));if(typeof cur.previousRef==='string'&&cur.previousRef.trim())previousRef=cur.previousRef.trim();}catch{}}
if(isGitRef){
 previousRef=arg;
 const res=spawnSync('git',['show',`${arg}:deployment.json`],{cwd:root,encoding:'utf8',windowsHide:true});
 if(res.status!==0)throw new Error('Unable to load previous manifest from git ref: '+arg);
 const parsed=JSON.parse(res.stdout);
 gitPrevMap=new Map((parsed.files||[]).map(e=>[String(e.target||'').replaceAll('\\','/').toLowerCase(),e.sha256||null]));
}
const RESTRICTED_SOURCES=new Set(['app/electron-helper/deepseek-bust.png','app/electron-helper/deepseek-bust-press.mp3','app/electron-helper/deepseek-bust-release.mp3','app/electron-helper/deepseek-bust-NOTICE.txt']);
const files=[];
function add(source,target){
 const key=target.replaceAll('\\','/').toLowerCase();
 const prev=gitPrevMap?gitPrevMap.get(key)??null:(fs.existsSync(path.join(installed,target))?hash(path.join(installed,target)):null);
 const entry={source,target,sha256:hash(path.join(root,source)),previousSha256:prev};
 if(RESTRICTED_SOURCES.has(source))entry.restricted=true;
 files.push(entry);
}
add('app/launcher.mjs','launcher.mjs');
add('app/standalone.mjs','node_modules/dsh-pet/lib/standalone.js');
for(const name of fs.readdirSync(path.join(root,'app/electron-helper'))){
 if(fs.statSync(path.join(root,'app/electron-helper',name)).isFile())add('app/electron-helper/'+name,'node_modules/dsh-pet/runtime/electron-helper/'+name);
}
for(const name of fs.readdirSync(path.join(root,'app/voice-runtime')))add('app/voice-runtime/'+name,'voice-runtime/'+name);
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
fs.writeFileSync(path.join(root,'deployment.json'),JSON.stringify({version,base:'dsh-pet@0.3.7',previousRef,files},null,2)+'\n');
console.log(JSON.stringify({previousRef,files:files.length,changed:files.filter(f=>f.sha256!==f.previousSha256).length}));
