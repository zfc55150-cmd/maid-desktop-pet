const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let count=0;
for(const name of fs.readdirSync(path.join(root,'app/electron-helper'))){
 if(!name.endsWith('.js'))continue;
 new vm.Script(fs.readFileSync(path.join(root,'app/electron-helper',name),'utf8'),{filename:name});count++;
}
for(const name of ['launcher.mjs','standalone.mjs']){
 const r=spawnSync(process.execPath,['--check',path.join(root,'app',name)],{encoding:'utf8'});
 if(r.status!==0)throw new Error(r.stderr);count++;
}
console.log(`Syntax OK: ${count} JavaScript files`);
