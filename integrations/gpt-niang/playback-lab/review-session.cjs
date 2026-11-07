'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const {read}=require('./video-visibility.cjs');
const crypto=require('node:crypto');
const {launch:restoreOfficial}=require('./restore-widget.cjs');
const root=path.resolve(process.argv[2]||''),apply=process.argv.includes('--apply');
const allowTaskDisplay=process.argv.includes('--allow-task-display');
const desktop=process.argv.includes('--desktop');
const manualExit=desktop&&process.argv.includes('--manual-exit');
const stateRoot=''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'/GPTNiangUsage/state';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function busy(p,{allowTaskDisplay=false}={}){if(!p||Math.abs(Date.now()-p.at)>6000)return 'STALE_PRESENCE';if(!allowTaskDisplay&&['thinking','working','waiting'].includes(p.dragonMotion?.phase))return 'TASK_ACTIVE';if(p.motion?.active||p.scene?.open||p.music?.enabled||p.character?.galleryOpen)return 'INTERACTION_ACTIVE';if([p.sound?.press,p.sound?.release].some(x=>x?.configured&&x.active))return 'AUDIO_ACTIVE';return null;}
module.exports={busy};
if(require.main===module)(async()=>{
 if(fs.existsSync(path.join(root,'candidate-manifest.json')))require('./candidate-package.cjs').verify(root);
 const baseline=read(path.join(root,'baseline.json'));
 if(path.win32.normalize(baseline.gptRoot)!==''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'\\Programs\\GPTNiangUsage\\gpt-niang-usage')throw new Error('OFFICIAL_ROOT_MISMATCH');
 if(!root.startsWith(path.resolve(__dirname,'../../../work')+path.sep))throw new Error('SESSION_SCOPE');
 if(!apply){console.log(JSON.stringify({apply:false,busy:busy(read(path.join(stateRoot,'presence.json'))),wouldStopOnlyAfterIdle:true}));return;}
 const session=path.join(root,'session-'+Date.now());fs.mkdirSync(session);
 const settingsHash=()=>crypto.createHash('sha256').update(fs.readFileSync(path.join(stateRoot,'settings.json'))).digest('hex');
 const state={at:Date.now(),phase:'waiting-for-idle',needsRestore:false,paidCalls:0,controllerPid:process.pid,manualExit};
 console.log('正在准备独立预览；如挂件忙碌，最多等待120秒。');
 const save=()=>{fs.writeFileSync(path.join(session,'controller.tmp'),JSON.stringify(state,null,2));fs.renameSync(path.join(session,'controller.tmp'),path.join(session,'controller.json'));};save();
 let child,oldPid,restoreNeeded=false;
 try{
  let p;const until=Date.now()+120000;
  do{p=read(path.join(stateRoot,'presence.json'));state.busy=busy(p,{allowTaskDisplay});save();if(!state.busy)break;await pause(1000);}while(Date.now()<until);
  if(state.busy){state.phase='cancelled-still-busy';save();console.log('挂件仍忙碌，本次预览已取消，正式挂件保持运行。');return;}
  oldPid=p.pid;
  child=spawn(''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'/Programs/DeepSeekActionPet/electron/electron.exe',[path.join(__dirname,desktop?'desktop-main.cjs':'review-video.cjs'),root,'--managed='+session,...(manualExit?['--manual-exit']:[])],{windowsHide:true,stdio:'ignore'});
  const ready=Date.now()+10000;while(!fs.existsSync(path.join(session,'candidate-ready.json'))&&Date.now()<ready){if(child.exitCode!==null)throw new Error('Candidate exited before ready');await pause(50);}
  if(!fs.existsSync(path.join(session,'candidate-ready.json')))throw new Error('Candidate readiness timeout');
  state.settingsSha256Before=settingsHash();state.needsRestore=true;restoreNeeded=true;state.phase='stopping-widget';save();
  const q=s=>"'"+s.replaceAll("'","''")+"'";
  const handoff=execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-Command',`& ([ScriptBlock]::Create([IO.File]::ReadAllText(${q(path.join(__dirname,'stop-for-review.ps1'))}))) -Baseline ${q(root)} -LabRoot ${q(__dirname)} -ExpectedPid ${oldPid} -CandidatePid ${child.pid} -CandidateVisibleFile ${q(path.join(session,'candidate-visible.json'))} ${allowTaskDisplay?'-AllowTaskDisplay':''}`],{windowsHide:true,stdio:'pipe',encoding:'utf8',timeout:15000,env:{...process.env,PSModulePath:'C:/Windows/System32/WindowsPowerShell/v1.0/Modules'}});
  state.handoff=JSON.parse(handoff);
  const visibleUntil=Date.now()+10000;while(!fs.existsSync(path.join(session,'candidate-visible.json'))&&Date.now()<visibleUntil){if(child.exitCode!==null)throw new Error('Candidate exited before showing');await pause(50);}
  if(!fs.existsSync(path.join(session,'candidate-visible.json')))throw new Error('Candidate visibility timeout');
  state.phase='preview';state.candidatePid=child.pid;save();
  console.log(manualExit?'独立架构候选已打开。请右键退出以恢复正式挂件，本次不自动到时切换。':'预览已打开。关闭窗口或5分钟到时，会恢复正式挂件。');
  if(child.exitCode===null)await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
 }catch(error){state.error=error.code||error.message;state.outcome='preview-failed';state.phase='failed';save();console.error('预览启动失败，正在检查并恢复正式挂件。记录：'+session);if(child&&child.exitCode===null){child.kill();await pause(500);}}
 finally{
  if(restoreNeeded){
   state.phase='restoring';save();
   await pause(1500);
   let p;try{p=read(path.join(stateRoot,'presence.json'));}catch{}
   if(!p||p.pid===oldPid||Date.now()-p.at>6000)state.restorePid=restoreOfficial(baseline);
   const until=Date.now()+15000;do{await pause(250);try{p=read(path.join(stateRoot,'presence.json'));}catch{};if(p&&p.pid!==oldPid&&Date.now()-p.at<6000)break;}while(Date.now()<until);
   state.restored=!!(p&&p.pid!==oldPid&&Date.now()-p.at<6000);state.settingsSha256After=settingsHash();state.settingsPreserved=state.settingsSha256Before===state.settingsSha256After;state.phase=state.restored?(state.outcome==='preview-failed'?'restored-after-failure':'restored'):'restore-needs-attention';save();
   console.log(state.restored?'正式挂件已恢复。':'恢复需要检查，请保留会话记录：'+session);
  }
 }
})().catch(error=>{process.stderr.write(error.message);process.exitCode=1;});
