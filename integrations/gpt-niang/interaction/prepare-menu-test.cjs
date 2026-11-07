'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const installed=''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'\\Programs\\GPTNiangUsage\\gpt-niang-usage';
const out=path.resolve(process.argv[2]);if(fs.existsSync(out))throw Error('Use a fresh stage');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'data'));fs.mkdirSync(path.join(out,'assets'));
fs.cpSync(path.join(installed,'runtime'),path.join(out,'runtime'),{recursive:true});
for(const file of fs.readdirSync(path.join(installed,'assets'))){const p=path.join(installed,'assets',file);if(fs.statSync(p).isFile())fs.copyFileSync(p,path.join(out,'assets',file));}
for(const file of ['widget.ps1','widget.xaml'])fs.copyFileSync(path.join(installed,file),path.join(out,file));
fs.copyFileSync(path.join(__dirname,'desktop-interaction.ps1'),path.join(out,'runtime/desktop-interaction.ps1'));
fs.writeFileSync(path.join(out,'installation.json'),JSON.stringify({nodePath:process.execPath,dataDir:path.join(out,'data')}));
fs.writeFileSync(path.join(out,'data/settings.json'),JSON.stringify({followHost:false,desktopTopmost:true,scale:1.4,bubbleScale:1,soundOn:false,dragonMotionVersion:1,side:'right'}));
const q=s=>"'"+s.replace(/'/g,"''")+"'";
const command='& ([ScriptBlock]::Create([IO.File]::ReadAllText('+q(path.join(__dirname,'test-menu.ps1'))+',[Text.Encoding]::UTF8))) -Stage '+q(out)+' -Report '+q(path.join(out,'menu-verification.json'));
const result=spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-Command',command],{encoding:'utf8',env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
