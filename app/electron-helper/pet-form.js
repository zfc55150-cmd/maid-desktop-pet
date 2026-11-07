/* Local appearance only: one shared window/position, no per-form coordinates. */
(function (root) {
  'use strict';
  const imageURL = root.document?.currentScript?.src
    ? new URL('deepseek-bust.png', root.document.currentScript.src).href : './deepseek-bust.png';
  // Default lines adapted from MeteorNOX's MIT-licensed bubbleDefaultRandomLines.
  // Full attribution is retained in deepseek-bust-NOTICE.txt; audio has a separate scope.
  const PHRASES = ['好模型…↓', '好女孩…↓', '哦鲸鲸…', '难道说…', '没吃饱喵',
    '终于上当了！', '不知道用户有什么用，先养着吧～', '我…我…我也要挣钱吗？',
    '我去吃饭啦！测完叫我', '压力一只蓝色大肥鱼？！'];
  function bustBox(size, height, bottomPad, bodyWidth) {
    const edge=bodyWidth*0.8;
    return {left:(size-edge)/2, top:height-bottomPad-edge, width:edge, height:edge, bottom:bottomPad};
  }
  class Controller {
    constructor(sprite, options={}) {
      this.sprite=sprite;this.storage=options.storage||root.localStorage;
      this.random=options.random||Math.random;this.lastLine=-1;this.lastChatterAt=-Infinity;this.pressed=false;this.chatterView=null;
      this.key='deepseek-pet-form:'+sprite.pet.id;this.mode='full';this.target='full';this.disposed=false;this.task=null;
      this.full=sprite.fullLayer;this.image=root.document.createElement('img');
      this.image.className='pet-bust';this.image.alt='蓝鲸女仆半身';this.image.draggable=false;
      const box=bustBox(sprite.size,sprite.height,sprite.bottomPad,sprite.hitRect.w);
      this.box=box;
      Object.assign(this.image.style,{left:box.left+'px',width:box.width+'px',height:box.height+'px',bottom:box.bottom+'px'});
      sprite.stage.insertBefore(this.image,sprite.hit);
      this.load=new Promise((resolve,reject)=>{
        const finish=(error)=>{root.clearTimeout(timer);this.image.onload=this.image.onerror=null;error?reject(error):resolve();};
        const timer=root.setTimeout(()=>finish(new Error('半身图片暂时无法读取，已保留全身形象。')),5000);
        this.image.onload=()=>finish();this.image.onerror=()=>finish(new Error('半身图片暂时无法读取，已保留全身形象。'));
      });
      // Handle errors even when this session stays in full-body mode.
      this.load.catch(()=>{});this.image.src=options.src||imageURL;
      let saved;try{saved=this.storage.getItem(this.key);}catch{}
      if(saved==='bust'){
        this.target='bust';
        this.full.style.opacity='0';
        this.ready=this.load.then(()=>{if(!this.disposed){this.apply('bust');this.image.style.opacity='1';}}).catch(error=>{if(!this.disposed){this.apply('full');this.full.style.opacity='1';sprite.inlineChat.bubble(error.message);}});
      }else this.ready=Promise.resolve();
    }
    apply(mode) {
      this.mode=mode;
      this.full.style.opacity=mode==='full'?'1':'0';this.image.style.opacity=mode==='bust'?'1':'0';
      this.sprite.stage.dataset.form=mode;
      if(mode==='bust')this.sprite.el.style.setProperty('--pet-bubble-bottom',(this.box.width+8)+'px');
      else this.sprite.el.style.removeProperty('--pet-bubble-bottom');
      root.__dshPetDebug.form=mode;
    }
    async fade(element,from,to,duration) {
      if(this.disposed)return;
      if(!element.animate||root.matchMedia?.('(prefers-reduced-motion: reduce)').matches){element.style.opacity=String(to);return;}
      const animation=element.animate([{opacity:from},{opacity:to}],{duration,easing:'ease-in-out',fill:'forwards'});
      this.animation=animation;
      try{await animation.finished;}catch{}
      if(!this.disposed)element.style.opacity=String(to);
      animation.cancel();if(this.animation===animation)this.animation=null;
    }
    set(mode) {
      if(mode!=='full'&&mode!=='bust')return Promise.reject(new Error('无效的形态。'));
      this.stopSound();this.pressed=false;this.pressAnimation?.cancel();this.image.style.transform='';
      this.target=mode;
      if(!this.task)this.task=this.run().catch(error=>{
        if(!this.disposed){this.target=this.mode;this.apply(this.mode);this.sprite.inlineChat.bubble(error.message);}
        return false;
      }).finally(()=>{this.task=null;});
      return this.task;
    }
    async run() {
      await this.ready;
      while(!this.disposed&&this.mode!==this.target){
        const wanted=this.target;
        if(wanted==='bust')await this.load;
        if(wanted!==this.target)continue;
        this.sprite.stopThrow();this.sprite.stopMove();this.sprite.stopSquash();
        const previous=this.mode==='full'?this.full:this.image;
        await this.fade(previous,1,0,90);
        if(this.disposed)return false;
        // A rapid second choice wins, including cancelling back to the old form.
        const next=this.target;this.apply(next);
        const current=next==='full'?this.full:this.image;current.style.opacity='0';
        await this.fade(current,0,1,130);
        if(this.disposed)return false;
        try{this.storage.setItem(this.key,this.mode);}catch{this.sprite.inlineChat.bubble('形态已切换，但本次偏好未能保存。');}
        this.sprite.syncInputRegions();
      }
      return true;
    }
    press(down) {
      if(this.mode!=='bust'||this.task||this.disposed)return;
      if(!down&&!this.pressed)return; // pointerup + lostpointercapture must release only once.
      this.pressed=down;this.playSound(down);
      this.pressAnimation?.cancel();
      if(down)this.image.style.transform='scale(0.97,0.94)';
      else{
        this.image.style.transform='';
        if(this.image.animate&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
          this.pressAnimation=this.image.animate([{transform:'scale(0.97,0.94)'},{transform:'scale(1.015,1.025)'},{transform:'scale(1)'}],{duration:220,easing:'ease-out'});
      }
    }
    protectedInteraction() {
      const chat=this.sprite.inlineChat;
      return !!(this.sprite.chatOpen||chat.pending||chat.phase==='thinking'||chat.phase==='speaking'||
        chat.voiceStatus==='playing'||(this.sprite.whisperOn&&chat.replyText&&this.sprite.whisperView!==this.chatterView));
    }
    click() {
      if(this.mode!=='bust')return false;
      if(this.task||this.disposed||this.protectedInteraction())return true;
      const now=Date.now();if(now-this.lastChatterAt<350)return true;
      let next=Math.floor(this.random()*(PHRASES.length-(this.lastLine<0?0:1)));
      if(this.lastLine>=0&&next>=this.lastLine)next++;
      this.lastLine=next;this.lastChatterAt=now;
      this.sprite.inlineChat.bubble(PHRASES[next],5500);
      this.chatterView=this.sprite.whisperView;
      return true;
    }
    soundEnabled() {return !this.disposed&&this.mode==='bust'&&this.sprite.inlineChat.state?.voiceEnabled===true&&!this.protectedInteraction();}
    playSound(down) {
      if(!this.soundEnabled()||!root.Audio){this.stopSound();return;}
      if(down){
        this.stopSound();
        this.sounds=this.sounds||['press','release'].map(name=>{const a=new root.Audio(new URL('deepseek-bust-'+name+'.mp3',imageURL).href);a.volume=0.35;return a;});
        const token=this.soundToken;this.pressPlaying=true;
        this.sounds[0].onended=()=>{if(token!==this.soundToken)return;this.pressPlaying=false;if(this.releaseQueued)this.releaseSound();};
        this.sounds[0].play().catch(()=>{if(token===this.soundToken){this.pressPlaying=false;if(this.releaseQueued)this.releaseSound();}});
      }else if(this.sounds){
        if(this.pressPlaying)this.releaseQueued=true;
        else this.releaseSound();
      }
    }
    releaseSound() {
      this.releaseQueued=false;
      if(this.soundEnabled())this.sounds[1].play().catch(()=>{});
    }
    stopSound() {
      this.soundToken=(this.soundToken||0)+1;this.releaseQueued=false;this.pressPlaying=false;
      for(const sound of this.sounds||[]){sound.onended=null;sound.pause();sound.currentTime=0;}
    }
    dispose() {this.disposed=true;this.animation?.cancel();this.pressAnimation?.cancel();this.stopSound();}
  }
  const api={Controller,bustBox};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PetForms=api;
})(typeof window==='object'?window:globalThis);
