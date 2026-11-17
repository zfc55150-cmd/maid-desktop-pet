'use strict';
const catalog=require('./performance-catalog.js'),rhythm=require('./companion-rhythm.cjs');
class ProductScheduler {
 constructor({director,now=()=>Date.now(),random=Math.random}){Object.assign(this,{director,now,random});this.history=new Map();this.failedUntil=new Map();this.pending=null;this.due=0;this.wasIdle=false;this.lastTask='idle';this.nextTask=0;this.busyTurn=0;this.lastClip=null;this.restFrame=null;this.rotationPose=null;this.localBeats=0;this.lastShowcase=now()-rhythm.policy.showcaseGapMs+10000;this.pendingCue=null;}
 present(data){
  if(!this.director.matches(data)||data.visible!==true)return;
  const now=this.now();
  if(catalog.idlePose(data.clip)&&Number.isInteger(data.frame))this.restFrame={...data,at:now};
  if(!this.pending||data.requestId!==this.pending.requestId||data.clip!==this.pending.clip)return;
  this.history.set(data.clip,now);
  if(this.pending.beat&&this.pending.pose===this.rotationPose)this.localBeats++;
  if(catalog.isShowcase(data.clip))this.lastShowcase=now;
  this.pending=null;
 }
 mediaError(data){if(this.director.matches(data)&&this.pending?.requestId===data.requestId){this.failedUntil.set(this.pending.clip,this.now()+60000);this.pending=null;}}
 choose(rows,clips,pose){const now=this.now(),eligible=rows.filter(a=>a.clips.every(c=>clips[c])&&(!pose||catalog.route(pose,a.entryPose,clips)!==null)&&now-(this.history.get(a.clip)??-Infinity)>=a.cooldownMs&&now>=(this.failedUntil.get(a.clip)||0)),fresh=eligible.filter(a=>a.clip!==this.lastClip),choices=fresh.length?fresh:eligible;if(!choices.length)return null;choices.sort((a,b)=>(this.history.get(a.clip)??-Infinity)-(this.history.get(b.clip)??-Infinity));const oldest=this.history.get(choices[0].clip)??-Infinity,same=choices.filter(a=>(this.history.get(a.clip)??-Infinity)===oldest);return same[Math.min(same.length-1,Math.floor(this.random()*same.length))];}
 gap(range){return range[0]+this.random()*(range[1]-range[0]);}
 launch(clip,origin,beat){if(!this.director.manual('clip:'+clip,{origin}))return false;this.lastClip=clip;this.pending={clip,requestId:this.director.requestId,beat,pose:this.rotationPose};return true;}
 stableRest(clips,now){
  const f=this.restFrame,c=f&&clips[f.clip];
  if(!c||!this.director.matches(f)||now-f.at>1000)return false;
  const edge=Math.ceil(c.fps*.4);
  return f.frame<edge||f.frame>=c.frames-edge;
 }
 choosePerformance(rows,clips,pose,now){
  if(now-this.lastShowcase>=rhythm.policy.showcaseGapMs){
   const showcase=this.choose(rows.filter(a=>catalog.isShowcase(a.clip)),clips,pose);
   if(showcase)return showcase;
  }
  return this.choose(rows.filter(a=>!catalog.isShowcase(a.clip)),clips,pose);
 }
 nextIdle(clips,now){
  const pose=this.director.pose,rows=catalog.automatic;
  if(pose!==this.rotationPose){this.rotationPose=pose;this.localBeats=0;}
  const exact=id=>this.choose(rows.filter(a=>a.clip===id),clips,pose);
  let pick;
  if(pose==='A'){
   if(this.localBeats===0&&this.restFrame.clip!=='idlesway')pick=exact('idlesway');
   if(!pick&&this.localBeats<2&&this.restFrame.clip==='idlesway')pick=exact('weightshift');
  }else if(this.localBeats<(pose==='C'?8:2)){
   pick=this.choosePerformance(rhythm.performances(rows,pose),clips,pose,now);
  }
  if(pick)return {pick,beat:true};
  // Brief visits to the side and long-dress stances leave more room for the front-facing performances.
  pick=pose==='C'?exact('brelaxed'):pose==='B'?exact('idle')||exact('frontidle'):exact('frontidle');
  return {pick,beat:false};
 }
 tick(snapshot,{blocked=false,clips}={}){
  const now=this.now(),p=snapshot.prefs,phase=snapshot.task.phase;
  const task=['thinking','working'].includes(phase)?'busy':phase;
  const quiet=p.quietUntil===-1||p.quietUntil>now,policy=rhythm.policy;
  if(blocked||p.form!=='full'||p.characterId!=='gpt-dragon'||!p.dragonAnimationEnabled||quiet){this.wasIdle=false;return null;}
  const changed=task!==this.lastTask;
  if(changed){
   this.lastTask=task;this.nextTask=0;this.busyTurn=0;
   this.pendingCue={waiting:'gentlereminder',happy:'happy',confused:'confused'}[task]||null;
  }
  if(this.pendingCue&&this.director.phase==='idle'){
   const clip=this.pendingCue;
   this.pendingCue=null;
   const sinceLast=now-(this.history.get(clip)??-Infinity);
   if(sinceLast>=20000&&clips[clip]&&this.launch(clip,'task')){
    this.wasIdle=false;
    return {origin:'task',clip};
   }
  }
  if(task==='busy'){
   this.wasIdle=false;
   if(now<this.nextTask)return null;
   if(this.director.phase!=='idle'&&!(changed&&['task','automatic'].includes(this.director.current?.origin)))return null;
   const primary=this.busyTurn%policy.thinkingEvery===0&&(this.failedUntil.get('thinking')||0)<=now;
   const variation=primary?null:this.choosePerformance(rhythm.performances(catalog.automatic),clips,this.director.pose,now);
   const clip=primary?'thinking':variation?.clip||'thinking';
   if(!clips[clip]||!this.launch(clip,'task'))return null;
   this.busyTurn++;
   const duration=catalog.plan('clip:'+clip,clips,{fromPose:this.director.current.fromPose})
    .filter(step=>!step.loop)
    .reduce((ms,step)=>ms+step.frames/step.fps*1000/(step.speed||1),0);
   this.nextTask=now+duration+this.gap(policy.busy);
   return {origin:'task',clip};
  }
  if(this.director.phase!=='idle'){this.wasIdle=false;return null;}
  if(!this.wasIdle){this.wasIdle=true;this.schedule();return null;}
  if(now<this.due||!this.stableRest(clips,now))return null;
  const {pick,beat}=this.nextIdle(clips,now);
  if(!pick){this.due=now+1000;return null;}
  if(!this.launch(pick.clip,'automatic',beat))return null;
  this.wasIdle=false;return {origin:'automatic',clip:pick.clip};
 }
 schedule(){
  const policy=rhythm.policy,rest=this.localBeats>0&&this.localBeats%4===0;
  this.due=this.now()+this.gap(rest?policy.rest:policy.idle);
 }
 reset(){this.wasIdle=false;this.pending=null;this.nextTask=0;}
}
module.exports={ProductScheduler};
