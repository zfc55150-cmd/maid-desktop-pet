// Keep punctuation and captions intact; only change where synthesis restarts.
function cutPoint(text, force=false, firstDeadline=false){
 const limit=40;
 const endings=/[。！？!?；;\n]/g;let match;
 while((match=endings.exec(text))){
  let end=match.index+1;
  while(end<text.length&&/[。！？!?；;”’」』）)\n]/.test(text[end]))end++;
  if(end>=6&&end<=limit)return end;
 }
 if(text.length>=limit){
  let boundary=0;
  for(let i=0;i<limit;i++)if(i>=11&&/[，,、：:\s]/.test(text[i]))boundary=i+1;
  if(boundary)return boundary;
  // Do not split a UTF-16 surrogate pair.
  return /[\uD800-\uDBFF]/.test(text[limit-1])?limit-1:limit;
 }
 if(force)return text.length;
 if(firstDeadline){
  let boundary=0;
  for(let i=0;i<text.length;i++)if(i>=5&&/[，,。！？!?；;\n]/.test(text[i]))boundary=i+1;
  return boundary;
 }
 return 0;
}
class SpeechPhraser {
 constructor(emit,{firstWaitMs=600,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  this.emit=emit;this.firstWaitMs=firstWaitMs;this.setTimer=setTimer;this.clearTimer=clearTimer;
  this.buffer='';this.caption='';this.started=false;this.deadline=false;this.timer=null;this.closed=false;
 }
 push(text){
  if(this.closed||!text)return;
  this.buffer+=text;this.flush(false);
  // Start the allowance when the old splitter could first have spoken.
  if(!this.started&&!this.deadline&&this.timer===null&&cutPoint(this.buffer,false,true)){
   this.timer=this.setTimer(()=>{this.timer=null;this.deadline=true;this.flush(false);},this.firstWaitMs);
  }
 }
 flush(force){
  while(this.buffer){
   const cut=cutPoint(this.buffer,force,!this.started&&this.deadline);if(!cut)return;
   const part=this.buffer.slice(0,cut);this.buffer=this.buffer.slice(cut);this.caption+=part;
   this.started=true;if(this.timer!==null){this.clearTimer(this.timer);this.timer=null;}
   this.emit(part,this.caption);
  }
 }
 end(){if(this.closed)return;this.flush(true);this.close();}
 close(){this.closed=true;this.buffer='';if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
}
module.exports={SpeechPhraser,cutPoint};
