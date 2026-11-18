const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let count=0;
const cjsDirs=['app/electron-helper','scripts','tests','integrations/deepseek-portable','integrations/gpt-niang/electron','integrations/gpt-niang/maintenance','integrations/gpt-niang/maintenance/tests','integrations/gpt-niang/playback-lab','integrations/gpt-niang/product-electron','integrations/gpt-niang/product-electron/app','integrations/gpt-niang/product-electron/services'];
for(const rel of cjsDirs){
 const dir=path.join(root,rel);if(!fs.existsSync(dir))continue;
 for(const name of fs.readdirSync(dir)){
  const full=path.join(dir,name);
  if(!fs.statSync(full).isFile())continue;
  if(name.endsWith('.js')||name.endsWith('.cjs')){
   new vm.Script(fs.readFileSync(full,'utf8'),{filename:path.join(rel,name)});count++;
  }else if(name.endsWith('.mjs')){
   const r=spawnSync(process.execPath,['--check',full],{encoding:'utf8'});
   if(r.status!==0)throw new Error(r.stderr);count++;
  }
 }
}
for(const name of ['launcher.mjs','standalone.mjs']){
 const r=spawnSync(process.execPath,['--check',path.join(root,'app',name)],{encoding:'utf8'});
 if(r.status!==0)throw new Error(r.stderr);count++;
}
console.log(`Syntax OK: ${count} JavaScript files`);
