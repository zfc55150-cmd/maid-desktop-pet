'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {patch}=require('./patch-widget.cjs');
const installed=''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'\\Programs\\GPTNiangUsage\\gpt-niang-usage';
const out=path.resolve(process.argv[2]);
if(fs.existsSync(out))throw Error('Use a new output directory');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hash=p=>fs.existsSync(p)?sha(fs.readFileSync(p)):null;
const config=JSON.parse(fs.readFileSync(path.join(installed,'installation.json'),'utf8'));
const widget=fs.readFileSync(path.join(installed,'widget.ps1'));
const known=JSON.parse(fs.readFileSync(path.join(__dirname,'../animated/deployment.json'),'utf8'));
const knownWidget=known.files.find(x=>x.target==='widget.ps1');
const updated=sha(widget)==='cc6345c34e89fe37f34db81dbfb06ea46b5f7a037793f62ec4a599c071483d03'?patch(widget):widget;
if(updated===widget&&sha(widget)!==knownWidget.sha256)throw Error('Unknown installed widget');
fs.mkdirSync(path.join(out,'files','runtime'),{recursive:true});
fs.mkdirSync(path.join(out,'baseline'),{recursive:true});
fs.writeFileSync(path.join(out,'files','widget.ps1'),updated);
fs.copyFileSync(path.join(__dirname,'desktop-interaction.ps1'),path.join(out,'files','runtime','desktop-interaction.ps1'));
fs.copyFileSync(path.join(__dirname,'../animated/apply-update.ps1'),path.join(out,'apply-update.ps1'));
fs.writeFileSync(path.join(out,'dragon-hooks.json'),'{}\n');
const files=['widget.ps1','runtime/desktop-interaction.ps1'].map(target=>({target,sha256:hash(path.join(out,'files',target)),previousSha256:hash(path.join(installed,target))})).filter(file=>file.sha256!==file.previousSha256);
for(const file of files){
 const previous=known.files.find(x=>x.target===file.target);
 if(file.previousSha256&&file.previousSha256!==previous?.sha256)throw Error('Unknown installed baseline: '+file.target);
 if(file.previousSha256){const saved=path.join(out,'baseline',file.target);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(path.join(installed,file.target),saved);}
}
const manifest={application:'GPT-Niang',version:'interaction-1.1-menu',upstreamVersion:'1.3.5',targetRoot:installed,dataDir:config.dataDir,hooksPath:path.join(''+(process.env.USERPROFILE||require('node:os').homedir())+'\\.codex','hooks.json'),previousHooksSha256:null,hooksTemplateSha256:hash(path.join(out,'dragon-hooks.json')),files};
fs.writeFileSync(path.join(out,'deployment.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output:out,files:files.length,previousWidgetSha256:sha(widget)}));
