'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./app/file-integrity.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const metadata=['animation.json','scenes.json','hit-masks.json'];
function apply(base,out){
 const [animation,scenes,masks]=metadata.map(n=>read(path.join(base,n))),receipts=[];
 for(const id of fs.readdirSync(path.join(__dirname,'media-additions')).sort()){
  if(!/^[a-z][a-z0-9]*$/.test(id))throw Error('ADDITION_ID');
  const dir=path.join(__dirname,'media-additions',id),c=read(path.join(dir,'clip.json')),r=read(path.join(dir,'review.json'));
  if(c.id!==id||c.fps!==30||!Number.isInteger(c.frames)||c.frames<2||c.loop!==false||c.videoFile!==id+'.webm'||c.maskFile!==id+'.bin'||c.maskBytes!==c.frames*384*384/8||r.acceptedForIntegrationTrial!==true||r.videoSha256!==c.videoSha256||r.sourceVideoSha256!==c.sourceVideoSha256)throw Error('ADDITION_REVIEW:'+id);
  for(const [file,hash,relative]of [[c.videoFile,c.videoSha256,'media/'+id+'.webm'],[c.maskFile,c.maskSha256,'hit-masks/'+id+'.bin']]){const from=path.join(dir,file),to=path.join(out,relative);if(sha(from)!==hash||fs.lstatSync(from).isSymbolicLink())throw Error('ADDITION_HASH:'+id);fs.mkdirSync(path.dirname(to),{recursive:true});if(fs.existsSync(to))fs.unlinkSync(to);fs.copyFileSync(from,to);}
  if(fs.statSync(path.join(dir,c.maskFile)).size!==c.maskBytes)throw Error('ADDITION_MASK_BYTES');
  animation.states[id]={label:c.label,frames:c.frames,fps:c.fps,loop:false,pages:[],sourceKind:c.sourceKind,playbackPolicy:'one-shot',representation:'vp9-alpha'};
  if(c.follows){
   if(!animation.states[c.follows]||c.follows===id||c.automatic===true)throw Error('ADDITION_FOLLOW_UP:'+id);
   animation.states[id].followUpOnly=true;
   animation.transitionClips[c.follows]=id;
  }
  if(c.automatic===true){
   if(c.entryPose!=='C'||c.exitPose!=='C'||!Number.isInteger(c.idleCooldownMs)||c.idleCooldownMs<22000)throw Error('ADDITION_AUTOMATIC_POLICY:'+id);
   animation.states[id].idleCooldownMs=c.idleCooldownMs;
   animation.idleInteractionPool=[...new Set([...(animation.idleInteractionPool||[]),id])];
  }
  animation.menuGroups[id]=c.menuGroup;animation.clipEntryPoses[id]=c.entryPose;animation.clipExitPoses[id]=c.exitPose;animation.returnPoses[id]='frontidle';
  scenes.clips[id]={frames:c.frames,fps:c.fps,loop:false,file:'media/'+id+'.webm'};
  masks.entries[id]={file:'hit-masks/'+id+'.bin',frames:c.frames,sha256:c.maskSha256,videoSha256:c.videoSha256,bytes:c.maskBytes};
  receipts.push({id,sourceVideoSha256:c.sourceVideoSha256,videoSha256:c.videoSha256,maskSha256:c.maskSha256,frames:c.frames,fps:c.fps,userVisualAcceptance:r.userVisualAcceptance===true});
 }
 if(!scenes.clips.frontlanding)throw Error('FRONTAL_LANDING_REQUIRED');animation.transitionClips.frontpose='frontlanding';
 for(const [i,name]of metadata.entries()){const to=path.join(out,name);if(fs.existsSync(to))fs.unlinkSync(to);fs.writeFileSync(to,JSON.stringify([animation,scenes,masks][i],null,2));}
 return {receipts,clips:Object.keys(scenes.clips).length,frames:Object.values(scenes.clips).reduce((n,c)=>n+c.frames,0)};
}
module.exports={apply,metadata};
