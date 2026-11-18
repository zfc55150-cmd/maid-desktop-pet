(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabPerformanceCatalog=api;})(globalThis,()=>{
 'use strict';
 let manifest=null,automaticCache=null;
 let currentLanguage='zh-CN';
 const getI18n=()=>{
  if(typeof globalThis.GptNiangI18n==='object'&&globalThis.GptNiangI18n)return globalThis.GptNiangI18n;
  if(typeof require==='function'){try{return require('./i18n.js');}catch{}}
  return null;
 };
 const normalizeLang=lang=>{
  if(lang==='ja'||lang==='zh-CN')return lang;
  const i18n=getI18n();
  return i18n?i18n.resolveLanguage(lang):'zh-CN';
 };
 const setLanguage=lang=>{currentLanguage=normalizeLang(lang);};
 const takeoff=Object.freeze({clip:'flutter',airborneFrame:66,preparationMs:1200,airSpeed:1.25});
 const geometry=Object.freeze({sourceSize:384,idleBodyHeight:335,feetY:360,targetBodyHeight:300});
 const aliases={proud:'proudarms',walking:'walking',fan:'fanmishap',lantern:'lanterninvite'};
 const idleClips={A:'idle',B:'brelaxed',C:'frontidle'};
 const idlePose=clip=>clip==='idlesway'?'A':Object.keys(idleClips).find(pose=>idleClips[pose]===clip);
 // These clips finish above the standing baseline. Their complete performance
 // includes a pose-matched landing, for both menu selection and automatic play.
 const landingReturns=Object.freeze({frontpose:'frontlanding',flutter:'draglanding'});
 const returnClip=clip=>manifest?.transitionClips?.[clip]||landingReturns[clip];
 const selectableClip=clip=>!!manifest?.states[clip]&&!manifest.states[clip].followUpOnly;
 const needsLanding=name=>Object.hasOwn(landingReturns,aliases[name]||String(name).replace(/^clip:/,''));
 const configure=value=>{
  if(!value?.states?.frontidle||!value.transitionClips||typeof value.transitionClips!=='object')throw Error('INVALID_CHARACTER_MANIFEST');
  for(const [from,to]of Object.entries(value.transitionClips)){if(!value.states[from]||!value.states[to])throw Error('INVALID_CHARACTER_MANIFEST:transitionClips.'+from+'->'+to);}
  for(const [from,to]of Object.entries(value.returnPoses||{})){if(!value.states[from]||!value.states[to])throw Error('INVALID_CHARACTER_MANIFEST:returnPoses.'+from+'->'+to);}
  for(const clip of value.idleInteractionPool||[]){if(!value.states[clip])throw Error('INVALID_CHARACTER_MANIFEST:idleInteractionPool.'+clip);}
  manifest=value;automaticCache=null;
  for(const clip of Object.keys(value.states)){if(selectableClip(clip)){for(const p of ['A','B','C'])plan('clip:'+clip,value.states,{fromPose:p});}}
 };
 const reset=()=>{manifest=null;automaticCache=null;};
 function route(from,to,clips=manifest?.states){if(from===to)return [];const edges=[['A','B','poserelax'],['B','C','turnfront'],['C','B','turnside'],['B','A','btoabridge'],['A','C','atocbridge']],queue=[[from,[]]],seen=new Set([from]);while(queue.length){const [pose,list]=queue.shift();for(const [a,b,clip]of edges)if(a===pose&&!seen.has(b)&&clips?.[clip]){if(b===to)return [...list,clip];seen.add(b);queue.push([b,[...list,clip]]);}}return null;}
 function plan(name,clips,{fromPose='C'}={}){
  const step=(clip,extra={})=>{if(!clips[clip])throw Error('MISSING_CLIP:'+clip);return {...clips[clip],clip,loop:false,...extra};};
  const idle=(clip='frontidle',fadeMs=80)=>step(clip,{loop:true,fadeMs});
  if(['idle','hold','recover','click'].includes(name))return [idle()];
  if(name==='coast')return [];
  if(name==='takeoff')return [step(takeoff.clip,{holdLast:true,fadeMs:80,rateTransition:{frame:takeoff.airborneFrame,afterMs:takeoff.preparationMs,speed:takeoff.airSpeed}})];
  if(name==='landing')return [step('draglanding',{speed:1.2,fadeMs:80}),idle()];
  const clip=aliases[name]||name.replace(/^clip:/,'');if(!selectableClip(clip)||!clips[clip])throw Error('UNKNOWN_PERFORMANCE');
  const entry=manifest.clipEntryPoses?.[clip]||'C',head=route(fromPose,entry,clips),steps=(head||[]).filter(n=>n!==clip).map(n=>step(n));
  if(idlePose(clip))return [...steps,idle(clip,head===null?180:80)];
  steps.push(step(clip,{fadeMs:head===null?180:80}));
  const bridge=returnClip(clip);if(bridge)steps.push(step(bridge,clip==='frontpose'&&bridge==='frontlanding'?{speed:1,fadeMs:0}:landingReturns[clip]===bridge?{speed:1.2,fadeMs:120}:{}));
  let pose=manifest.clipExitPoses?.[bridge||clip]||'C';const heldProp=manifest.propPolicies?.[clip]==='held-prop-fade';
  if(heldProp&&!bridge)return [...steps,idle('frontidle',180)];
  const back=manifest.returnPoses?.[clip];
  if(!bridge&&back&&back!==clip&&!idlePose(back)){steps.push(step(back));pose=manifest.clipExitPoses?.[back]||pose;}
  const rest=idleClips[pose];
  if(rest&&clips[rest])return [...steps,idle(rest)];
  return [...steps,...(route(pose,'C',clips)||[]).map(n=>step(n)),idle()];
 }
 // Only performances with a valid return can be picked by the idle scheduler.
 // Stance loops and task feedback remain available for their own triggers.
 const extraAutomatic={
  frontidle:1,brelaxed:1,idle:1,idlesway:1,weightshift:1,footrelax:25000,response:30000,
  thinking:60000,sleeping:75000,confused:45000,confusedquiet:35000,cheekpuff:35000,
  tickledodge:40000,bodybalance:50000,fanmishap:75000,lanterninvite:75000,dragonflame:100000
 };
 const propsWithReturn=new Set(['fanmishap','lanterninvite']);
 const automatic=()=>{
  if(automaticCache)return automaticCache;
  if(!manifest?.states)return [];
  try{
   automaticCache=[...new Set([...(manifest.idleInteractionPool||[]),...Object.keys(extraAutomatic)])].filter(clip=>
    selectableClip(clip)&&(!propsWithReturn.has(clip)||manifest.states[manifest.transitionClips[clip]]))
   .flatMap(clip=>{
    try{
     const name='clip:'+clip,entryPose=manifest.clipEntryPoses?.[clip]||'C',steps=plan(name,manifest.states,{fromPose:entryPose});
     return [{name,clip,entryPose,clips:[...new Set(steps.map(s=>s.clip))],idlePose:idlePose(steps.at(-1).clip),cooldownMs:manifest.states[clip].idleCooldownMs||extraAutomatic[clip]||manifest.idleInteractionCooldownMs||22000}];
    }catch{return [];}
   });
   return automaticCache;
  }catch{return [];}
 };
 const actionGroups=[
  ['待机',{frontidle:'正面站姿',brelaxed:'侧身站姿',idle:'长裙站姿',idlesway:'放松换重心'}],
  ['转向',{turnfront:'转为正面',turnside:'正面转侧身',poserelax:'长裙转侧身'}],
  ['拖拽',{flutter:'屈膝悬空'}],
  ['点击回应',{happy:'开心一笑',wave:'转身挥手',response:'侧身回应',complimentavert:'被夸后偷看',cheekpuff:'鼓腮抗议',tickledodge:'躲痒侧步'}],
  ['移动',{walking:'原地走动'}],
  ['小动作',{cbrushfringe:'整理额发',chandsrest:'双手轻合',cnoticeuser:'悄悄侧目',csmallweightsettle:'换换重心',csoftbreathblink:'轻轻眨眼',csuppressedyawn:'忍住哈欠',ctailtipsettle:'尾尖轻摆',sleeveside:'整理袖口',footrelax:'抬脚放松',weightshift:'挪脚站稳',lookaround:'回身张望',sleeping:'打个盹',stretching:'侧向伸展',bow:'心口致意',proudarms:'抱臂矜持',confusedquiet:'侧身疑惑'}],
  ['玩耍',{frontpose:'正面轻展',flutterplay:'轻盈舒展',skirtbeat:'提裙踏拍',bodybalance:'发梢与身体摇摆',fanmishap:'展扇小意外',lanterninvite:'提灯引路',dragonflame:'龙焰失控',stargift:'龙息凝星',mirroradmire:'揽镜自赏',scrollcatch:'执卷巧接'}],
  ['吃什么',{tea:'提杯小饮'}],
  ['工作状态',{thinking:'托腮思考',confused:'歪头摊掌',gentlereminder:'温柔提醒',challengeaccept:'接下挑战'}]
 ];
 const getActions=(lang=currentLanguage)=>{
  const resolved=normalizeLang(lang),i18n=getI18n();
  return actionGroups.flatMap(([group,rows])=>Object.entries(rows).filter(([clip])=>selectableClip(clip)).map(([clip,label])=>({
   name:'clip:'+clip,
   clip,
   label:resolved==='ja'?(i18n?.translateActionLabel(clip,label,'ja')||label):label,
   group:resolved==='ja'?(i18n?.translateActionGroup(group,'ja')||group):group,
   groupKey:group
  })));
 };
 const getSelectable=(lang=currentLanguage)=>{
  const resolved=normalizeLang(lang),i18n=getI18n();
  return Object.keys(manifest?.states||{}).filter(selectableClip).map(clip=>{
   const rawLabel=manifest.states[clip].label;
   const rawGroup=manifest.menuGroups?.[clip]||'其他动作';
   return {
    name:'clip:'+clip,
    clip,
    label:resolved==='ja'?(i18n?.translateActionLabel(clip,rawLabel,'ja')||rawLabel):rawLabel,
    group:resolved==='ja'?(i18n?.translateActionGroup(rawGroup,'ja')||rawGroup):rawGroup
   };
  });
 };
 const actions=()=>getActions(currentLanguage);
 const showcase=new Set(['fanmishap','lanterninvite','dragonflame']);
 const isShowcase=name=>showcase.has(String(name).replace(/^clip:/,''));
 const actionQuotes=Object.freeze({
  happy:'哼，看你这么诚心，本龙娘就勉强对你笑一下吧~',
  wave:'看到我挥手还不快点回应？真是拿你没办法。',
  response:'叫我干嘛？我一直都在看着你呢。',
  complimentavert:'哼、少说这种好听的话啦……我才没有开心呢！',
  cheekpuff:'唔……不许随便欺负本龙娘！',
  tickledodge:'呀！那里很痒啦，快住手！',
  walking:'起来活动一下筋骨，陪你盯屏幕也是很累的。',
  cbrushfringe:'发型可不能乱，这可是傲娇龙娘的基本修养。',
  chandsrest:'安静陪你待一会儿……也不算讨厌啦。',
  cnoticeuser:'被我抓到你在偷偷看我了吧？',
  csuppressedyawn:'哈欠……才、才没有困呢，我还能继续陪你！',
  ctailtipsettle:'尾巴只是随便晃晃，才不是因为心情好！',
  sleeping:'稍微打个小盹……有事再叫醒我哦……呼……',
  stretching:'伸个懒腰~ 坐久了你也要记得活动一下肩颈！',
  bow:'贵安~ 今天也请多多指教咯。',
  proudarms:'哼哼，有本龙娘坐镇，今天效率肯定翻倍！',
  confusedquiet:'嗯？刚才那个是什么意思呀……',
  frontpose:'怎么样，这个站姿是不是很有气势？',
  flutterplay:'偶尔稍微展开一下龙翼，透透气~',
  skirtbeat:'跟着节奏轻轻晃两下，心情都变好了呢。',
  bodybalance:'呼~ 保持平衡也是很讲究技巧的！',
  fanmishap:'呀！扇子怎么差点滑手了……你刚才什么都没看见对吧！',
  lanterninvite:'天色暗下来也别怕，本龙娘替你提灯引路~',
  dragonflame:'呜哇！龙焰稍微冒多了一点点……快吹灭快吹灭！',
  stargift:'这点星光凝成的龙息，就特别赏给你当礼物吧✨',
  mirroradmire:'嗯哼，今天的龙角和发饰也是完美无瑕！',
  scrollcatch:'接住啦！这种小场面怎么可能难得倒我~',
  tea:'先喝口热茶润润嗓子，你也记得喝水休息一下。',
  thinking:'唔……让本龙娘帮你参谋参谋这道难题。',
  confused:'欸？这题连我也觉得有点奇妙呢……',
  gentlereminder:'喂，已经忙了好一阵子了，稍微歇口气，别累坏自己。',
  challengeaccept:'放马过来吧！这点挑战本龙娘接下了！'
 });
 const actionQuote=(name,lang=currentLanguage)=>{
  const clip=aliases[name]||String(name||'').replace(/^clip:/,'');
  if(normalizeLang(lang)==='ja'){
   const ja=getI18n()?.actionQuoteJa(clip);
   if(ja)return ja;
  }
  return actionQuotes[clip]||null;
 };
 const airborne=f=>f?.clip===takeoff.clip&&Number.isInteger(f.frame)&&f.frame>=takeoff.airborneFrame&&f.visible===true;
 return {configure,reset,plan,route,idlePose,needsLanding,isShowcase,actionQuote,airborne,takeoff,geometry,revision:'0.8.40-electron',setLanguage,getActions,getSelectable,isSelectable:name=>selectableClip(aliases[name]||name.replace(/^clip:/,'')),get actions(){return actions();},get selectable(){return getSelectable(currentLanguage);},get automatic(){return automatic();}};
});
