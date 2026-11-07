'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./file-integrity.cjs'),{read}=require('./video-visibility.cjs');
function audit(root){
 root=path.resolve(root);const baseline=read(path.join(root,'baseline.json')),m=read(path.join(root,'animation.json')),scenes=read(path.join(root,'scenes.json'));
 const project=path.resolve(__dirname,'../../..'),sourceRoot=path.join(project,'integrations/gpt-niang/animated/assets/motion-v1'),installedRoot=path.join(baseline.gptRoot,'assets/dragon-animation/motion-v1'),rows=[],issues=[],warnings=[],pages=new Set();
 const ready=new Set(Object.keys(scenes.clips)),returns=new Set(Object.values(m.transitionClips));
 for(const [name,s]of Object.entries(m.states)){
  let count=0;const pageIssues=[];for(const p of s.pages){pages.add(p.file);const file=path.join(installedRoot,p.file),bytes=fs.readFileSync(file),header=bytes.subarray(12,16).toString(),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
   if(header!=='IHDR'||width!==m.cellSize*m.columns||height!==m.cellSize*p.rows||sha(file)!==p.sha256||p.start!==count)pageIssues.push(p.file);
   if(fs.existsSync(path.join(sourceRoot,p.file))&&sha(path.join(sourceRoot,p.file))!==p.sha256){
    const approved=path.join(project,'work/gpt-walking-expression-approved-20261101-02/files/assets/dragon-animation/motion-v1',p.file);
    if(name==='walking'&&s.approvedCandidate==='wan3-walking-expression-gemini-20261101-03'&&fs.existsSync(approved)&&sha(approved)===p.sha256)warnings.push({clip:name,file:p.file,code:'LEGACY_ATLAS_NOT_CURRENT',currentSource:path.relative(project,approved)});
    else pageIssues.push('maintenance-source:'+p.file);
   }
   count+=p.count;
  }
  if(count!==s.frames)pageIssues.push('FRAME_COUNT');if(!m.menuGroups[name])pageIssues.push('NO_MANUAL_GROUP');if(pageIssues.length)issues.push({clip:name,issues:pageIssues});
  const bridge=m.transitionClips[name],back=m.returnPoses[name];if(bridge&&!m.states[bridge])issues.push({clip:name,issues:['MISSING_RETURN_CLIP']});if(back&&!m.states[back])issues.push({clip:name,issues:['MISSING_RETURN_POSE']});
  const auto=m.idleInteractionPool.includes(name);if(auto&&(m.clipEntryPoses[name]!=='C'||m.clipExitPoses[name]!=='C'||m.propPolicies[name]==='held-prop-fade'))issues.push({clip:name,issues:['UNSAFE_AUTO_ENTRY']});
  rows.push({clip:name,label:s.label,frames:s.frames,fps:s.fps||m.fps,manualGroup:m.menuGroups[name],automaticInFormal:auto,returnClip:bridge||null,returnPose:back||null,entryPose:m.clipEntryPoses[name],exitPose:m.clipExitPoses[name]||null,propPolicy:m.propPolicies[name]||null,candidateVideoReady:ready.has(name),candidateRole:returns.has(name)?'return':name==='flutter'?'drag':name==='draglanding'?'landing':name==='frontidle'?'idle':ready.has(name)?'manual-performance':'not-migrated',idleCooldownMs:s.idleCooldownMs||m.idleInteractionCooldownMs||null});
 }
 const report={at:new Date().toISOString(),version:m.releaseVersion,ok:issues.length===0,clips:rows.length,frames:rows.reduce((n,r)=>n+r.frames,0),atlases:pages.size,formalAutomatic:rows.filter(r=>r.automaticInFormal).length,candidateReady:ready.size,notMigrated:rows.filter(r=>!r.candidateVideoReady).length,issues,warnings,rows,artworkAccepted:false,newEncoding:false,paidCalls:0};
 fs.writeFileSync(path.join(root,'material-audit.json'),JSON.stringify(report,null,2));return report;
}
if(require.main===module){const r=audit(process.argv[2]);console.log(JSON.stringify({...r,rows:undefined}));if(!r.ok)process.exitCode=1;}
module.exports={audit};
