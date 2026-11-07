'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [mode,output]=process.argv.slice(2);
if(!['capture','verify','sequence','encode','scenes','electron','video-sequence','review-wpf','visibility-probe','lease-test'].includes(mode)||!output)throw new Error('Usage: run-lab.cjs <capture|verify|sequence|encode|scenes|electron|video-sequence|review-wpf|visibility-probe|lease-test> <report-directory>');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(output);
if(!out.startsWith(path.join(root,'work')+path.sep))throw new Error('Output must be a workspace work subdirectory');
if(mode==='electron'||mode==='video-sequence'){
 const executable=''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'/Programs/DeepSeekActionPet/electron/electron.exe';
 const extra=mode==='video-sequence'?['--sequence']:[];
 execFileSync(executable,[path.join(__dirname,'electron-probe.cjs'),out,...extra],{stdio:'inherit',windowsHide:true,timeout:60000});
 const result=JSON.parse(fs.readFileSync(path.join(out,mode==='video-sequence'?'electron-sequence-verification.json':'electron-verification.json'),'utf8'));
 if(!result.ok)throw new Error(result.error);console.log(JSON.stringify({ok:result.ok,mode:result.mode,frames:result.frames.length,screenPresentationVerified:false}));
}else{
 const q=s=>"'"+s.replaceAll("'","''")+"'";
 const script={capture:'capture-baseline.ps1',verify:'verify-candidate.ps1',sequence:'verify-sequences.ps1',encode:'encode-control.ps1',scenes:'encode-scenes.ps1','review-wpf':'review-wpf.ps1','visibility-probe':'review-wpf.ps1','lease-test':'verify-lease.ps1'}[mode];
 const command=`& ([ScriptBlock]::Create([IO.File]::ReadAllText(${q(path.join(__dirname,script))}))) ${mode==='capture'?'-Out':'-Baseline'} ${q(out)} ${mode==='visibility-probe'?'-ProbeOnly':''}`;
 execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-STA','-Command',command],{stdio:'inherit',cwd:root,windowsHide:true,timeout:mode==='review-wpf'?3600000:180000,env:{...process.env,PSModulePath:'C:/Windows/System32/WindowsPowerShell/v1.0/Modules'}});
}
