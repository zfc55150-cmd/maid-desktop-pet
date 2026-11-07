'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.argv[2]||'');
if(!out.startsWith(path.join(root,'work')+path.sep))throw new Error('Workspace output required');
const load=n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8').replace(/^\uFEFF/,''));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const baseline=load('baseline.json'),drift=[];
for(const f of baseline.gptFiles)if(sha(path.join(baseline.gptRoot,f.target))!==f.sha256)drift.push(f.target);
for(const f of baseline.deepseekFiles)if(sha(path.join(''+(process.env.LOCALAPPDATA||path.join(require('node:os').homedir(),'AppData/Local'))+'/Programs/DeepSeekActionPet',f.target))!==f.sha256)drift.push('DeepSeek/'+f.target);
if(drift.length)throw new Error('Installed drift: '+drift.join(','));
const sequence=load('sequence-verification.json'),basic=load('candidate-verification.json'),video=load('electron-sequence-verification.json'),lease=load('lease-verification.json'),probe=load('visibility-probe.json'),scenes=load('scenes.json');
if(![sequence,basic,video,lease,probe].every(r=>r.ok))throw new Error('Required verification failed');
if(sequence.sourceSha256!==sha(path.join(__dirname,'CompiledPlayer.cs'))||basic.candidateSha256!==sequence.sourceSha256)throw new Error('C# report/source mismatch');
if(!video.checks.includes('every-action-commits-source-frame-zero')||video.trace.filter(t=>t.event==='commit').some(t=>Math.abs(t.firstMediaTime)>0.005))throw new Error('Video frame-zero regression');
const videos=[];
for(const [name,clip]of Object.entries(scenes.clips)){
 const meta=load(name==='frontidle'?'encoding-control.json':name+'-encoding.json');
 if(sha(path.join(out,clip.file))!==meta.fileSha256)throw new Error('Encoded control hash mismatch');
 videos.push({clip:name,sha256:meta.fileSha256,bytes:meta.bytes,sourceFrames:meta.frames});
}
const snapshot=path.join(out,'candidate-source');fs.mkdirSync(snapshot);
const source=[];for(const name of fs.readdirSync(__dirname).filter(n=>/\.(cs|cjs|js|ps1|html|md)$/.test(n))){fs.copyFileSync(path.join(__dirname,name),path.join(snapshot,name));source.push({file:name,sha256:sha(path.join(snapshot,name))});}
const reports=['baseline.json','run.json','sequence-verification.json','candidate-verification.json','electron-sequence-verification.json','lease-verification.json','visibility-probe.json','scenes.json'];
const report={at:new Date().toISOString(),gptVersion:baseline.gptVersion,gptFilesChecked:baseline.gptFiles.length,deepseekFilesChecked:baseline.deepseekFiles.length,endDrift:[],sources:source,reports:reports.map(file=>({file,sha256:sha(path.join(out,file))})),videos,videoFirstFrameZeroVerified:true,productionMutexBusy:probe.productionMutexBusy,visibleCandidateOpened:false,screenPresentationVerified:false,artworkAccepted:false,unverified:['current A versus B/C under identical screen conditions','visible preview rendering and measured character height','real pointer/window physics','product status and bust integration','B/C transition pixel equivalence','60-minute resource convergence'],paidCalls:0};
fs.writeFileSync(path.join(out,'phase2-summary.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({gptVersion:report.gptVersion,endDrift:[],videoSamples:videos.length,videoFirstFrameZeroVerified:true,screenPresentationVerified:false}));
