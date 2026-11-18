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
  const PHRASES_JA = ['いいモデル…↓', 'いい子だね…↓', 'おぉクジラ…', 'もしかして…', 'お腹すいたにゃ',
    'やっと引っかかった！', 'ユーザーって役に立つかわからないけど、とりあえず飼っておこう～', 'わ…わたしもお金を稼がなきゃダメ？',
    'ごはん行ってくる！テスト終わったら呼んでね', '青いおデブなクジラにプレッシャーかける気？！'];
  const DRAGON_PHRASES = ['哼，本龙娘今天也很精神哦~', '别一直盯着本龙娘的龙角看啦！',
    '主人在忙什么呢？陪我玩嘛~', '再戳我脸颊，本龙娘要鼓腮帮子咯！',
    '尾巴可不能随便乱摸的！', '夸夸本龙娘，今天给你加满好运~'];
  const DRAGON_PHRASES_JA = ['ふん、このドラゴン娘は今日も元気いっぱいなんだから～', 'ちょっと、角ばっかりじろじろ見ないでよ！',
    'ご主人、何してるの？かまってよ～', 'これ以上ほっぺをツンツンしたら、ぷくーって怒るからね！',
    'しっぽはむやみに触っちゃダメなんだから！', 'いっぱい褒めてくれたら、今日は幸運をたっぷりあげちゃう～'];
  const FORM_MESSAGES = {
    'zh-CN': {
      whaleAlt: '蓝鲸女仆半身',
      otherAltSuffix: '半身',
      loadFailed: '半身图片暂时无法读取，已保留全身形象。',
      fullOnly: '当前角色仅支持全身动态形态。',
      invalidForm: '无效的形态。',
      saveFailed: '形态已切换，但本次偏好未能保存。'
    },
    ja: {
      whaleAlt: 'ブルークジラメイド（半身）',
      otherAltSuffix: '（半身）',
      loadFailed: '半身画像を読み込めなかったため、全身表示を維持しました。',
      fullOnly: 'このキャラクターは全身アニメーションのみ対応しています。',
      invalidForm: '無効なフォームです。',
      saveFailed: 'フォームを切り替えましたが、設定を保存できませんでした。'
    }
  };
  function bustBox(size, height, bottomPad, bodyWidth) {
    const edge=bodyWidth*0.8;
    return {left:(size-edge)/2, top:height-bottomPad-edge, width:edge, height:edge, bottom:bottomPad};
  }
  class Controller {
    constructor(sprite, options={}) {
      this.sprite=sprite;this.storage=options.storage||root.localStorage;
      this.random=options.random||Math.random;this.lastLine=-1;this.lastChatterAt=-Infinity;this.pressed=false;this.chatterView=null;
      const petId=sprite.pet?.id||'main',isWhale=petId==='main';
      this.petId=petId;this.isWhale=isWhale;this.src=options.src||sprite.pet?.bustSrc||(isWhale?imageURL:null);
      this.supported=Boolean(this.src);
      this.customPhrases=Array.isArray(sprite.pet?.bustPhrases)&&sprite.pet.bustPhrases.length?sprite.pet.bustPhrases:null;
      this.phrases=this.customPhrases||(petId==='gptniang'?DRAGON_PHRASES:PHRASES);
      this.key='deepseek-pet-form:'+petId;this.mode='full';this.target='full';this.disposed=false;this.task=null;
      this.full=sprite.fullLayer;this.image=root.document.createElement('img');
      this.image.className='pet-bust';this.image.alt=isWhale?this.msg('whaleAlt'):(sprite.pet?.name||'桌宠')+this.msg('otherAltSuffix');this.image.draggable=false;
      const box=bustBox(sprite.size,sprite.height,sprite.bottomPad,sprite.hitRect.w);
      this.box=box;
      Object.assign(this.image.style,{left:box.left+'px',width:box.width+'px',height:box.height+'px',bottom:box.bottom+'px'});
      sprite.stage.insertBefore(this.image,sprite.hit);
      if(this.supported){
        this.load=new Promise((resolve,reject)=>{
          const finish=(error)=>{root.clearTimeout(timer);this.image.onload=this.image.onerror=null;error?reject(error):resolve();};
          const timer=root.setTimeout(()=>finish(new Error(this.msg('loadFailed'))),5000);
          this.image.onload=()=>finish();this.image.onerror=()=>finish(new Error(this.msg('loadFailed')));
        });
        // Handle errors even when this session stays in full-body mode.
        this.load.catch(()=>{});this.image.src=this.src;
      }else{
        this.load=Promise.reject(new Error(this.msg('fullOnly')));
        this.load.catch(()=>{});
      }
      let saved;try{saved=this.storage.getItem(this.key);}catch{}
      if(saved==='bust'&&this.supported){
        this.target='bust';
        this.full.style.opacity='0';
        this.ready=this.load.then(()=>{if(!this.disposed){this.apply('bust');this.image.style.opacity='1';}}).catch(error=>{if(!this.disposed){this.apply('full');this.full.style.opacity='1';sprite.inlineChat.bubble(error.message);}});
      }else this.ready=Promise.resolve();
    }
    getLang() {
      const lang=this.sprite?.getLang?.()||this.sprite?.inlineChat?.state?.resolvedLanguage||root.document?.documentElement?.lang||'zh-CN';
      return lang==='ja'?'ja':'zh-CN';
    }
    msg(key) { return (FORM_MESSAGES[this.getLang()]||FORM_MESSAGES['zh-CN'])[key]; }
    currentPhrases() {
      if(this.customPhrases)return this.customPhrases;
      const ja=this.getLang()==='ja';
      if(this.petId==='gptniang')return ja?DRAGON_PHRASES_JA:DRAGON_PHRASES;
      return ja?PHRASES_JA:PHRASES;
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
      if(mode!=='full'&&mode!=='bust')return Promise.reject(new Error(this.msg('invalidForm')));
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
        try{this.storage.setItem(this.key,this.mode);}catch{this.sprite.inlineChat.bubble(this.msg('saveFailed'));}
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
      const phrases=this.currentPhrases();
      let next=Math.floor(this.random()*(phrases.length-(this.lastLine<0?0:1)));
      if(this.lastLine>=0&&next>=this.lastLine)next++;
      this.lastLine=next;this.lastChatterAt=now;
      this.sprite.inlineChat.bubble(phrases[next],5500);
      this.chatterView=this.sprite.whisperView;
      return true;
    }
    soundEnabled() {return !this.disposed&&(this.isWhale||Boolean(this.sprite.pet?.bustSound))&&this.mode==='bust'&&this.sprite.inlineChat.state?.voiceEnabled===true&&!this.protectedInteraction();}
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
