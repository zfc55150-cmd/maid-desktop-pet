'use strict';
const fs=require('node:fs'),path=require('node:path');
const pack=path.resolve(process.argv[2]),stage=path.resolve(process.argv[3]);if(fs.existsSync(stage))throw Error('Fresh stage required');
const spec=JSON.parse(fs.readFileSync(path.join(pack,'deployment.json'),'utf8')),installed=spec.targetRoot;
fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(path.join(stage,'data'));
fs.cpSync(path.join(installed,'runtime'),path.join(stage,'runtime'),{recursive:true});
fs.cpSync(path.join(installed,'assets'),path.join(stage,'assets'),{recursive:true});
for(const name of ['widget.ps1','widget.xaml'])fs.copyFileSync(path.join(installed,name),path.join(stage,name));
for(const file of spec.files){const p=path.join(stage,file.target);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(pack,'files',file.target),p);}
fs.writeFileSync(path.join(stage,'installation.json'),JSON.stringify({nodePath:process.execPath,dataDir:path.join(stage,'data')}));
fs.writeFileSync(path.join(stage,'data/settings.json'),JSON.stringify({followHost:false,desktopTopmost:false,scale:1.4,bubbleScale:1,soundOn:false,dragonMotionVersion:1,side:'right',desktopLeft:180,desktopTop:320}));
console.log(JSON.stringify({stage,personalData:false}));
