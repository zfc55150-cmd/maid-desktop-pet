'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),work=path.join(root,'work/optimization-20261101'),visual=path.join(work,'visual');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const percentile=(a,p)=>a.length?a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor((a.length-1)*p))]:null;
const outputs=[];
for(const name of ['baseline-full','candidate-full','candidate-input2','candidate-idle','candidate-idle-final']){
 const p=path.join(visual,name,'result.json');if(!fs.existsSync(p))continue;
 const r=JSON.parse(fs.readFileSync(p));
 const frames=(r.frameSamples||[]).filter(f=>f.video===undefined||f.video===f.front),intervals=[];
 for(let i=1;i<frames.length;i++)if(frames[i].anim===frames[i-1].anim&&frames[i].front===frames[i-1].front)intervals.push(frames[i].at-frames[i-1].at);
 const slices=[];for(const f of frames){const last=slices.at(-1);if(!last||last.anim!==f.anim)slices.push({anim:f.anim,firstMs:f.at,lastMs:f.at,frames:1});else{last.lastMs=f.at;last.frames++;}}
 const currentHashes=(r.loadedCodeHashes||[]).map(e=>({...e,currentSha256:hash(path.join(root,'app/electron-helper',e.name)),matchesCurrent:hash(path.join(root,'app/electron-helper',e.name))===e.sha256}));
 outputs.push({name,ok:r.ok,reportSha256:hash(p),durationSec:r.durationSec,scenes:r.scenes?.length,frameCallbacks:frames.length,
  intervalsMs:{p50:percentile(intervals,.5),p95:percentile(intervals,.95),p99:percentile(intervals,.99),max:intervals.length?Math.max(...intervals):null},
  method:r.method,frontVideoOwnershipRecorded:(r.frameSamples||[]).every(f=>f.video!==undefined),slices,environment:r.environment,loadedCode:currentHashes,configSha256:r.configSha256,
  processSamples:r.processSamples?.length||0,performanceAcceptance:'pending; long gaps require investigation',artApproval:false});
}
const baseline=JSON.parse(fs.readFileSync(path.join(work,'baseline/baseline.json')));
const code=baseline.code.map(e=>({target:e.target,unchanged:hash(path.join(baseline.installedRoot,e.target))===e.installedSha256}));
const localAppData=process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local');
const mediaRoot=path.join(localAppData,'DeepSeekActionPet/dsh-pet/pet/gptniang-animation');
const media=baseline.media.map(e=>({name:e.name,unchanged:hash(path.join(mediaRoot,e.name))===e.sha256}));
const configs=baseline.configs.map(e=>({path:e.path,unchanged:hash(e.path)===e.sha256}));
const wpfRoot=path.join(localAppData,'Programs/GPTNiangUsage/gpt-niang-usage');
const wpf=baseline.wpf.map(e=>({path:e.path,unchanged:hash(path.join(wpfRoot,e.path))===e.sha256}));
const protection={at:new Date().toISOString(),code,media,configs,wpf,allUnchanged:[...code,...media,...configs,...wpf].every(e=>e.unchanged)};
fs.writeFileSync(path.join(work,'protected-assets-check.json'),JSON.stringify(protection,null,2)+'\n');
fs.writeFileSync(path.join(visual,'verification-summary.json'),JSON.stringify({at:new Date().toISOString(),outputs,limitations:['Hidden-window callback intervals are not physical monitor scanout measurements.','Old paired recordings lack per-video ownership; interval percentiles there include fade overlap.','Final lifecycle cancellation patch postdates long idle recordings; those exact loaded hashes are preserved, not relabeled as final.','No controlled WPF performance baseline or native multi-DPI acceptance.']},null,2)+'\n');
console.log(JSON.stringify({reports:outputs.map(e=>({name:e.name,ok:e.ok,frames:e.frameCallbacks,duration:e.durationSec})),protectedAllUnchanged:protection.allUnchanged,counts:{code:code.length,media:media.length,configs:configs.length,wpf:wpf.length}}));
