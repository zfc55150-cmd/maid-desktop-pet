'use strict';
const fs=require('node:fs'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run({win,director,metrics,close,root}){
 const start=Date.now(),segments=[];
 // Native idle baseline, rapid cancellations, native performances, then idle
 // recovery. No accelerated media, input injection, GC, or desktop display.
 segments.push({name:'idle-baseline',at:Date.now()});await sleep(30000);
 segments.push({name:'rapid-switch',at:Date.now()});
 for(let n=0;n<150;n++){director.manual(['proud','lantern','walking','idle'][n%4]);await sleep(800);}
 segments.push({name:'native-performances',at:Date.now()});
 for(const name of ['proud','lantern','walking','proud','lantern']){director.manual(name);await sleep(14000);}
 segments.push({name:'idle-recovery',at:Date.now()});director.manual('idle');await sleep(80000);
 const resources=metrics.resource.map(s=>({...s,totalReportedPrivateKB:s.processes.reduce((n,p)=>n+(p.memory.privateBytes||0),0),totalReportedWorkingSetKB:s.processes.reduce((n,p)=>n+(p.memory.workingSetSize||0),0)}));
 const report={durationMs:Date.now()-start,segments,resources,mediaStats:metrics.mediaStats,errors:metrics.errors,visibleWindow:win.isVisible(),screenPresentationVerified:false,gpuUsageMeasured:false,sixtyMinuteConvergenceVerified:false};
 report.ok=!report.visibleWindow&&report.errors.length===0&&report.mediaStats.videoElements===2&&report.mediaStats.trace<=512&&report.mediaStats.frameSamples<=16384;
 metrics.smokeOk=report.ok;fs.writeFileSync(path.join(root,'soak-smoke.json'),JSON.stringify(report,null,2));close();
}
module.exports={run};
