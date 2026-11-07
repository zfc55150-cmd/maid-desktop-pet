'use strict';
const catalog=require('./performance-catalog.js');
// Candidate-local variety only. It never reads/writes product settings or
// infers the user's task status. Product task-aware scheduling is separate.
class IdleScheduler {
 constructor({director,clips,now=()=>Date.now(),random=Math.random,enabled=true,minGapMs=12000,maxGapMs=24000}){
  Object.assign(this,{director,clips,now,random,enabled,minGapMs,maxGapMs});this.history=new Map();this.last=null;this.blocked=false;this.reset();
 }
 reset(){this.due=this.now()+this.minGapMs+(this.maxGapMs-this.minGapMs)*this.random();}
 setEnabled(value){this.enabled=!!value;this.reset();}
 tick({blocked=false}={}){
  const now=this.now();
  if(!this.enabled||blocked||this.director.phase!=='idle'){this.blocked=true;return null;}
  if(this.blocked){this.blocked=false;this.reset();return null;}
  if(now<this.due)return null;
  const choices=catalog.automatic.filter(a=>a.clips.every(c=>this.clips[c])&&now-(this.history.get(a.name)??-Infinity)>=a.cooldownMs);
  if(!choices.length){this.due=now+1000;return null;}
  choices.sort((a,b)=>(this.history.get(a.name)??-Infinity)-(this.history.get(b.name)??-Infinity));
  const oldest=this.history.get(choices[0].name)??-Infinity,same=choices.filter(a=>(this.history.get(a.name)??-Infinity)===oldest),pick=same[Math.min(same.length-1,Math.floor(this.random()*same.length))];
  if(!this.director.manual(pick.name))return null;
  this.history.set(pick.name,now);this.last=pick.name;this.reset();return pick.name;
 }
}
module.exports={IdleScheduler};
