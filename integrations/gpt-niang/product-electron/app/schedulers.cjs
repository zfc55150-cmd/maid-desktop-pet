'use strict';
const catalog=require('./performance-catalog.js'),rhythm=require('./companion-rhythm.cjs');
class ProductScheduler {
 constructor({director,now=()=>Date.now(),random=Math.random}){Object.assign(this,{director,now,random});this.history=new Map();this.failedUntil=new Map();this.pending=null;this.due=0;this.wasIdle=false;this.lastTask='idle';this.nextTask=0;this.busyTurn=0;this.lastClip=null;this.frontTurns=0;}
 present(data){if(!this.director.matches(data)||!data.visible||!this.pending||data.requestId!==this.pending.requestId||data.clip!==this.pending.clip)return;this.history.set(this.pending.clip,this.now());this.pending=null;}
 mediaError(data){if(this.director.matches(data)&&this.pending?.requestId===data.requestId){this.failedUntil.set(this.pending.clip,this.now()+60000);this.pending=null;}}
 choose(rows,clips){const now=this.now(),eligible=rows.filter(a=>a.clips.every(c=>clips[c])&&now-(this.history.get(a.clip)??-Infinity)>=a.cooldownMs&&now>=(this.failedUntil.get(a.clip)||0)),fresh=eligible.filter(a=>a.clip!==this.lastClip),choices=fresh.length?fresh:eligible;if(!choices.length)return null;choices.sort((a,b)=>(this.history.get(a.clip)??-Infinity)-(this.history.get(b.clip)??-Infinity));const oldest=this.history.get(choices[0].clip)??-Infinity,same=choices.filter(a=>(this.history.get(a.clip)??-Infinity)===oldest);return same[Math.min(same.length-1,Math.floor(this.random()*same.length))];}
 gap(range){return range[0]+this.random()*(range[1]-range[0]);}
 launch(clip,origin,clips){if(!this.director.manual('clip:'+clip,{origin}))return false;this.lastClip=clip;this.pending={clip,requestId:this.director.requestId};return true;}
 tick(snapshot,{blocked=false,clips}={}){
  const now=this.now(),p=snapshot.prefs,phase=snapshot.task.phase,task=['thinking','working'].includes(phase)?'busy':phase,quiet=p.quietUntil===-1||p.quietUntil>now,policy=rhythm.profile(p.idleRhythm);
  if(blocked||p.form!=='full'||p.characterId!=='gpt-dragon'||!p.dragonAnimationEnabled||quiet){this.wasIdle=false;return null;}
  if(task!=='idle'){
   this.wasIdle=false;
   const changed=task!==this.lastTask;if(changed){this.lastTask=task;this.nextTask=0;this.busyTurn=0;}
   if(now<this.nextTask)return null;
   if(this.director.phase!=='idle'&&!(changed&&['task','automatic'].includes(this.director.current?.origin)))return null;
   let clip=task==='waiting'?'gentlereminder':task==='happy'?'happy':task==='confused'?'confused':'frontidle';
   if(task==='busy'){const variation=this.choose(rhythm.workPool(catalog.automatic,p.idleRhythm),clips),primary=this.busyTurn%policy.thinkingEvery===0&&(this.failedUntil.get('thinking')||0)<=now;clip=primary?'thinking':variation?.clip||'thinking';}
   if(task==='waiting'&&now-(this.history.get('gentlereminder')??-Infinity)<60000)clip='frontidle';
   if(!clips[clip]||!this.launch(clip,'task',clips))return null;this.busyTurn++;
   const duration=catalog.plan('clip:'+clip,clips,{fromPose:this.director.current.fromPose}).filter(s=>!s.loop).reduce((ms,s)=>ms+s.frames/s.fps*1000/(s.speed||1),0);this.nextTask=now+duration+this.gap(task==='busy'?policy.busy:[12000,18000]);return {origin:'task',clip};
  }
  this.lastTask='idle';
  if(this.director.phase!=='idle'){this.wasIdle=false;return null;}
  if(!this.wasIdle){this.wasIdle=true;this.schedule(p);return null;}
  if(now<this.due)return null;
  const pool=rhythm.idlePool(catalog.automatic,p.idleRhythm);
  const side=this.frontTurns>=2&&this.director.pose==='C'?this.choose(pool.filter(row=>row.idlePose==='B'),clips):null;
  const pick=side||this.choose(pool,clips);if(!pick){this.due=now+1000;return null;}
  if(!this.launch(pick.clip,'automatic',clips))return null;
  this.frontTurns=pick.idlePose==='C'?this.frontTurns+1:0;
  this.wasIdle=false;return {origin:'automatic',clip:pick.clip};
 }
 schedule(p){this.due=this.now()+this.gap(rhythm.profile(p.idleRhythm).idle);}
 reset(){this.wasIdle=false;this.pending=null;this.nextTask=0;}
}
module.exports={ProductScheduler};
