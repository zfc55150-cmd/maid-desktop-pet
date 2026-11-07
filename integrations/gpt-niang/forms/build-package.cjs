'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,installed=''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'\\Programs\\GPTNiangUsage\\gpt-niang-usage';
const out=path.resolve(process.argv[2]);if(fs.existsSync(out))throw Error('Use a new output directory');
const hash=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const known=JSON.parse(fs.readFileSync(path.join(root,'../animated/deployment.json'),'utf8'));
const interaction=JSON.parse(fs.readFileSync(path.join(root,'../interaction/deployment.json'),'utf8'));
const previousPath=path.join(root,'deployment.json'),previous=fs.existsSync(previousPath)?JSON.parse(fs.readFileSync(previousPath,'utf8')):{files:[]};
// The complete deployment ledger also records later artwork/runtime releases.
const reviewed=new Map([...interaction.files,...previous.files,...known.files].map(item=>[item.target,item]));
for(const item of reviewed.values())if(hash(path.join(installed,item.target))!==item.sha256)throw Error('Installed GPT baseline changed: '+item.target);
const config=JSON.parse(fs.readFileSync(path.join(installed,'installation.json'),'utf8'));
fs.mkdirSync(path.join(out,'files'),{recursive:true});
const current=fs.readFileSync(path.join(installed,'widget.ps1')),widgetHash=hash(path.join(installed,'widget.ps1'));
const currentReviewed=previous.files.find(item=>item.target==='widget.ps1');
let widget=widgetHash==='30dcb186961a870b5ac37314604798ed59673bb41d4aa67a84345aa01b505cd3'?require('./patch-widget.cjs').patch(current):current;
if(widget===current&&widgetHash!==currentReviewed?.sha256)throw Error('Unknown dual-form widget');
widget=require('./patch-native-motion.cjs').patch(widget);
fs.writeFileSync(path.join(out,'files/widget.ps1'),widget);
const entries=[['../animated/motion-decoder.cs','runtime/dragon-animation/motion-decoder.cs'],['../interaction/desktop-interaction.ps1','runtime/desktop-interaction.ps1'],['../animated/motion-runtime.ps1','runtime/dragon-animation/motion-runtime.ps1'],['pet-forms.ps1','runtime/pet-forms.ps1'],['pet-presentation.ps1','runtime/pet-presentation.ps1'],['pet-throw.ps1','runtime/pet-throw.ps1'],['native-motion.cs','runtime/native-motion.cs'],['catch-feedback.cs','runtime/catch-feedback.cs'],['native-motion-adapter.ps1','runtime/native-motion-adapter.ps1'],['assets/font-reference.json','assets/pet-forms/font-reference.json'],['assets/soft-candy.ttf','assets/pet-forms/soft-candy.ttf'],['assets/FONT-NOTICE.txt','assets/pet-forms/FONT-NOTICE.txt'],['assets/frost-glass-cheek.png','assets/pet-forms/frost-glass-cheek.png'],['assets/NOTICE.txt','assets/pet-forms/NOTICE.txt']];
for(const [source,target] of entries){fs.mkdirSync(path.dirname(path.join(out,'files',target)),{recursive:true});fs.copyFileSync(path.join(root,source),path.join(out,'files',target));}
const files=['widget.ps1',...entries.map(x=>x[1])].map(target=>({target,sha256:hash(path.join(out,'files',target)),previousSha256:hash(path.join(installed,target))}));
for(const file of files)if(file.previousSha256){const p=path.join(out,'baseline',file.target);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(installed,file.target),p);}
fs.copyFileSync(path.join(root,'../animated/apply-update.ps1'),path.join(out,'apply-update.ps1'));
fs.writeFileSync(path.join(out,'dragon-hooks.json'),'{}\n');
const manifest={application:'GPT-Niang',version:'forms-1.14-idle-click',upstreamVersion:'1.3.5',targetRoot:installed,dataDir:config.dataDir,hooksPath:''+(process.env.USERPROFILE||require('node:os').homedir())+'\\.codex\\hooks.json',previousHooksSha256:null,hooksTemplateSha256:hash(path.join(out,'dragon-hooks.json')),files};
fs.writeFileSync(path.join(out,'deployment.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output:out,files:files.length,baselineFiles:known.files.length,installedChanges:false}));

