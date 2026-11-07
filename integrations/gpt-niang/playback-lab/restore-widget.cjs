'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
function command(baseline){
 const root=path.win32.normalize(baseline.gptRoot);
 if(root!==''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'\\Programs\\GPTNiangUsage\\gpt-niang-usage')throw new Error('RESTORE_ROOT');
 for(const target of ['runtime/start-widget.ps1','widget.ps1']){
  const entry=baseline.gptFiles.find(e=>e.target===target);if(!entry||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,target))).digest('hex')!==entry.sha256)throw new Error('RESTORE_ENTRY_DRIFT');
 }
 return {file:'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',args:['-NoLogo','-NoProfile','-STA','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',path.join(root,'runtime/start-widget.ps1'),'-WidgetPath',path.join(root,'widget.ps1')]};
}
function launch(baseline){
 const c=command(baseline),q=s=>"'"+s.replaceAll("'","''")+"'";
 // The official maintenance identity check expects quoted launcher paths even
 // on machines where those paths currently contain no spaces.
 const args=c.args.map(a=>q(/^[A-Za-z]:[\\/]/.test(a)?'"'+a+'"':a)).join(',');
 const script=`$p=Start-Process -FilePath ${q(c.file)} -ArgumentList @(${args}) -WindowStyle Hidden -PassThru;Write-Output $p.Id`;
 return Number(execFileSync(c.file,['-NoProfile','-Command',script],{windowsHide:true,encoding:'utf8',timeout:10000,env:{...process.env,PSModulePath:'C:/Windows/System32/WindowsPowerShell/v1.0/Modules'}}).trim());
}
module.exports={command,launch};
if(require.main===module){const baseline=JSON.parse(fs.readFileSync(path.join(path.resolve(process.argv[2]),'baseline.json'),'utf8').replace(/^\uFEFF/,''));console.log(JSON.stringify({requested:true,pid:launch(baseline)}));}
