const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const installed=path.resolve(process.argv[2]||path.join(require('node:os').homedir(),'AppData','Local','Programs','DeepSeekActionPet'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=[];
function add(source,target){const live=path.join(installed,target);files.push({source,target,sha256:hash(path.join(root,source)),previousSha256:fs.existsSync(live)?hash(live):null});}
add('app/launcher.mjs','launcher.mjs');
add('app/standalone.mjs','node_modules/dsh-pet/lib/standalone.js');
for(const name of fs.readdirSync(path.join(root,'app/electron-helper'))){
 if(fs.statSync(path.join(root,'app/electron-helper',name)).isFile())add('app/electron-helper/'+name,'node_modules/dsh-pet/runtime/electron-helper/'+name);
}
for(const name of fs.readdirSync(path.join(root,'app/voice-runtime')))add('app/voice-runtime/'+name,'voice-runtime/'+name);
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
fs.writeFileSync(path.join(root,'deployment.json'),JSON.stringify({version,base:'dsh-pet@0.3.7',files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,changed:files.filter(f=>f.sha256!==f.previousSha256).length}));
