// Use the original input dialog and the original pet-bubble renderer unchanged.
class PetInlineChat {
 constructor(pet){this.pet=pet;this.state=null;this.draft='';this.sequence=0;this.pending=false;this.dialog=null;this.phase='idle';this.pagesTimer=null;this.replyText='';this.voiceStatus='off';this.voiceError='';this.ready=this.call('chatState').then(s=>this.state=s).catch(()=>null);this.unsubscribe=window.petBridge.onChatEvent(m=>this.onEvent(m));}
 onEvent(m){
   if(m.type==='reset'){++this.sequence;this.pending=false;this.replyText='';this.fullText='';this.draft='';this.closeInput();this.state=null;this.idle();this.hideBubble();return;}
  if(m.requestId!==this.sequence)return;
  if(m.type==='text'){
   this.fullText=m.text;
   if(this.voiceStatus!=='playing'&&this.voiceStatus!=='error')this.voiceStatus=m.voiceStatus;
   if(!m.syncVoice){this.replyText=m.text;this.renderReply();}
   else if(!this.replyText)this.bubble(this.voiceStatus==='loading'?'语音准备中…':'准备开口啦…',0);
  }
  if(m.type==='caption'){this.replyText=m.text;this.renderReply();}
  if(m.type==='text-done'){if(this.state)this.state.voiceEnabled=m.voiceEnabled;}
  if(m.type==='voice'){
   this.voiceStatus=m.status;
   if(m.status==='error')this.voiceError=m.message;
   if((m.status==='error'||m.status==='muted')&&this.fullText)this.replyText=this.fullText;
   if(m.status==='playing'){this.phase='speaking';const talk=this.pet.animations.events?.whisper?.[2];this.animation(Array.isArray(talk)?talk[0]:talk,true);}
   if(this.replyText)this.renderReply();
  }
 }
 renderReply(){
  const chars=Array.from(this.replyText);let text=chars.length>140?'…'+chars.slice(-140).join(''):this.replyText;
  if(this.voiceStatus==='loading')text+='\n（语音准备中，首次约 30 秒）';
  if(this.voiceStatus==='error')text+='\n（'+this.voiceError+'）';
  this.bubble(text,0);
 }
 prewarm(){
  if(!this.state?.voiceEnabled)return;
  if(this.state.voiceStatus!=='ready'&&!this.pending&&!this.replyText)this.bubble('语音准备中，可以先输入；首次约 30 秒。',0);
  this.call('chatWarmup').then(r=>{if(this.state)this.state.voiceStatus=r.ready?'ready':'off';if(this.dialog&&!this.pending&&!this.replyText&&r.ready)this.bubble('语音已就绪，想聊什么？');}).catch(e=>{if(this.dialog&&!this.replyText)this.bubble(e.message);});
 }
 async call(name,value){const r=await window.petBridge[name](value);if(!r.ok)throw Error(r.error);return r.data;}
 animation(name,loop=false){if(!name)return;const p=this.pet;p.stopMove();p.facing='left';p.anim=name;p.once=!loop;p.switchTo(name,!loop);}
 idle(){this.phase='idle';this.animation(this.pet.animations.idle[0]);}
 hideBubble(){clearTimeout(this.pagesTimer);clearTimeout(this.pet.whisperTimer);this.pagesTimer=null;this.pet.whisperOn=false;this.pet.renderBubble();}
 bubble(text,timeout=10000){
  this.hideBubble();const p=this.pet;p.whisperOn=true;p.whisperImage='';p.whisperView=S.whisperBubbleView({ok:true,text,ts:0});p.renderBubble();
  if(timeout>0)this.pagesTimer=setTimeout(()=>this.hideBubble(),timeout);
 }
 showReply(text,hold=false){
  this.hideBubble();const chars=Array.from(text);const pages=[];for(let i=0;i<chars.length;i+=140)pages.push(chars.slice(i,i+140).join(''));
  let n=0;const show=()=>{this.bubble(pages[n]+(pages.length>1?'\n（'+(n+1)+'/'+pages.length+'）':''),0);n++;this.pagesTimer=setTimeout(()=>n<pages.length?show():hold?null:this.hideBubble(),Math.max(10000,Math.min(18000,pages[n-1].length*100)));};if(pages.length)show();
 }
 finishVoice(){this.idle();clearTimeout(this.pagesTimer);this.pagesTimer=setTimeout(()=>this.hideBubble(),6000);}
 closeInput(){this.dialog?.close();}
 async open(){
  await this.ready;
  if(this.pending){this.bubble('正在回复或朗读，可以右键选择“停止回复 / 朗读”。',0);return;}
  if(this.dialog){this.closeInput();return;}
  try{this.state=await this.call('chatState');}catch(e){this.bubble(e.message);return;}
  if(!this.state.hasKey){this.bubble('先在“聊天设置”中填写 DeepSeek 密钥。');this.openSettings();return;}
  this.call('chatInput',true).catch(()=>{});this.prewarm();
  const p=this.pet;p.stopMove();p.stopThrow();p.setTip(false);
  this.dialog=S.mountChatDialog({petId:p.pet.id,x:Math.max(4,p.hit.getBoundingClientRect().right+6),y:Math.max(4,p.hit.getBoundingClientRect().top+6),clamp:p.visibleClampRect(),closeOnSend:true,initialText:this.draft,onDraft:text=>this.draft=text,
   sendText:async text=>{await this.send(text);return {ok:true};},
   onClose:()=>{this.dialog=null;this.call('chatInput',false).catch(()=>{});p.chatClose=null;p.chatOpen=false;p.syncInputBusy();if(!p.menuOpen)p.setInteractive(false);},
   onError:error=>{this.pending=false;this.idle();this.bubble(error);}
  });
  p.chatClose=()=>this.closeInput();p.chatOpen=true;p.syncInputBusy();p.setInteractive(true);
 }
 async send(text){
  this.draft=text;const seq=++this.sequence;this.pending=true;this.replyText='';this.fullText='';this.voiceError='';this.voiceStatus=this.state?.voiceEnabled?'loading':'muted';this.phase='thinking';this.bubble('让我想想…',0);
  const thinking=this.pet.animations.events?.workStatus?.[0];this.animation(Array.isArray(thinking)?thinking[0]:thinking,true);
  try{
   const result=await this.call('chatSend',{text,requestId:seq});if(seq!==this.sequence||result.cancelled)return;this.state=result;this.draft='';
   this.pending=false;this.replyText=this.state.messages.at(-1).content;this.idle();
   this.showReply(this.replyText+(this.state.replyWarning?'\n（'+this.state.replyWarning+'）':'')+(this.state.voiceError?'\n（'+this.state.voiceError+'）':''),false);
  }catch(e){if(seq===this.sequence){this.pending=false;this.idle();this.bubble(e.message+'\n输入已保留，重新打开“对话”可重试。');}}
 }
 async toggleVoice(){await this.ready;try{const s=await this.call('chatState');this.state=await this.call('chatVoice',!s.voiceEnabled);if(!this.state.voiceEnabled&&this.phase==='speaking')this.idle();if(!this.pending)this.bubble(this.state.voiceEnabled?'已开启语音回复。':'已静音。');}catch(e){this.bubble(e.message);}}
 async stop(){++this.sequence;this.pending=false;try{await this.call('chatCancel');}catch{}this.closeInput();this.idle();this.bubble('已停止。');}
 async openSettings(){this.closeInput();try{await this.call('chatOpenSettings');}catch(e){this.bubble(e.message);}}
 async preview(){
  if(this.pending){this.bubble('请先等待当前回复，或选择停止。',0);return;}
  const seq=++this.sequence;this.replyText='你好，我在这里陪你。';this.voiceError='';this.voiceStatus='loading';this.renderReply();this.phase='speaking';
  const talk=this.pet.animations.events?.whisper?.[2];this.animation(Array.isArray(talk)?talk[0]:talk);
  try{this.state=await this.call('chatState');if(this.state.voiceEnabled)await this.call('chatPreviewVoice',{requestId:seq});else{this.voiceStatus='muted';this.renderReply();}}catch(e){this.bubble(e.message);}finally{if(seq===this.sequence)this.finishVoice();}
 }
}
window.PetInlineChat=PetInlineChat;
