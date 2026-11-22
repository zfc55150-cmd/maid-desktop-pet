'use strict';
(async()=>{
 let state=null,dirty=false,saving=false,currentTab='quota',appliedLang='';
 const draft=new PetPreferenceDraft.Draft();
 const el=id=>document.getElementById(id),form=el('preferences');
 const lang=()=>state?.resolvedLanguage==='ja'?'ja':'zh-CN';
 const tr=(key,vars)=>window.GptNiangI18n?GptNiangI18n.t(lang(),key,vars):key;
 const locale=()=>window.GptNiangI18n?GptNiangI18n.intlLocale(lang()):(lang()==='ja'?'ja-JP':'zh-CN');
 const command=async(kind,values={})=>{try{const result=await window.product.command({kind,...values});if(result?.error){el('notice').textContent=result.error==='PREFERENCES_CHANGED'?tr('notice.preferencesChanged'):tr('panel.notice.saveFailed');return null;}return result;}catch{el('notice').textContent=tr('panel.notice.saveCatch');return null;}};
 const node=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==null)n.textContent=text;for(const [k,v]of Object.entries(attrs))n[k]=v;return n;};
 const formatAmount=n=>Number.isInteger(n)?String(n):n.toFixed(2).replace(/\.?0+$/,'');
 function updateHeader(){
  const keys={quota:['panel.page.quota.title','panel.page.quota.desc'],settings:['panel.page.settings.title','panel.page.settings.desc'],quotes:['panel.page.quotes.title','panel.page.quotes.desc'],characters:['panel.page.characters.title','panel.page.characters.desc']};
  const pair=keys[currentTab]||keys.quota;
  el('page-title').textContent=tr(pair[0]);
  el('page-description').textContent=tr(pair[1]);
  el('save-hint').textContent=currentTab==='settings'?tr('panel.footer.hintSave'):tr('panel.footer.hintLocal');
 }
 function renderCodex(q,codex){
  const badge=el('codex-state'),summary=el('codex-summary'),refreshBtn=el('refresh'),loginBtn=el('codex-login');
  badge.className='pill';
  const authLabel=q.authType==='chatgptAuthTokens'?tr('panel.codex.auth.tokens'):q.authType==='chatgpt'?tr('panel.codex.auth.chatgpt'):q.authType==='apiKey'?tr('panel.codex.auth.apiKey'):(q.connected?tr('panel.codex.auth.connected'):tr('panel.codex.auth.none'));
  const plan=q.planLabel||tr('panel.codex.unknownPlan');
  if(q.ok&&q.queryOk){
   badge.classList.add('is-ok');
   badge.textContent=tr('panel.codex.state.connected')+(q.planLabel?' · '+q.planLabel:'');
   summary.textContent=tr('panel.codex.summary.connected',{plan,auth:authLabel,ready:codex?.installed?tr('panel.codex.readySuffix'):''});
   refreshBtn.textContent=tr('panel.codex.refresh');
  }else if(q.connected&&q.windows?.length){
   badge.classList.add('is-warn');
   badge.textContent=tr('panel.codex.state.cached');
   summary.textContent=tr('panel.codex.summary.cached',{plan,msg:q.errorMessage||tr('panel.codex.summary.cachedDefault')});
   refreshBtn.textContent=tr('panel.codex.refresh');
  }else if(q.errorCode==='AUTH_MODE_UNSUPPORTED'){
   badge.classList.add('is-warn');
   badge.textContent=tr('panel.codex.state.needLogin');
   summary.textContent=q.errorMessage||tr('panel.codex.summary.needLogin');
   refreshBtn.textContent=tr('panel.codex.refreshConnect');
  }else if(q.errorCode==='ENOENT'||(codex&&codex.installed===false&&!q.connected)){
   badge.classList.add('is-off');
   badge.textContent=tr('panel.codex.state.missing');
   summary.textContent=q.errorMessage||tr('panel.codex.summary.missing');
   refreshBtn.textContent=tr('panel.codex.recheck');
  }else{
   badge.classList.add('is-off');
   badge.textContent=tr('panel.codex.state.off');
   summary.textContent=q.errorMessage||tr('panel.codex.summary.off');
   refreshBtn.textContent=tr('panel.codex.refreshConnect');
  }
  loginBtn.disabled=Boolean(codex&&codex.installed===false&&q.errorCode==='ENOENT');
 }
 function renderQuota(q,codex){
  renderCodex(q,codex);
  el('quota-windows').replaceChildren();
  if(!q.windows.length)el('quota-windows').append(node('p',q.errorMessage||tr('panel.quota.empty')));
  const loc=locale(),l=lang();
  for(const w of q.windows){
   const row=node('div',null,{className:'quota-row'}),label=node('div',null,{className:'quota-label'}),bar=node('div',null,{className:'bar'}),value=node('div',null);
   const wLabel=window.GptNiangI18n?GptNiangI18n.translateQuotaLabel(w.label,l):w.label;
   label.append(node('span',wLabel),node('strong',w.remaining===null?'—':w.remaining.toFixed(0)+'%'));
   const detail=w.total!==null&&w.amountRemaining!==null
    ?tr('panel.quota.detailAmount',{rem:formatAmount(w.amountRemaining),total:formatAmount(w.total),used:formatAmount(w.amountUsed??Math.max(0,w.total-w.amountRemaining))})
    :(w.used!==null&&w.remaining!==null?tr('panel.quota.detailPct',{used:w.used.toFixed(0),rem:w.remaining.toFixed(0)}):'');
   value.style.width=(w.remaining??0)+'%';
   bar.append(value);
   row.append(label);
   if(detail)row.append(node('div',detail,{className:'quota-meta'}));
   row.append(bar,node('small',w.resetsAt?tr('panel.quota.resetAt',{time:new Date(w.resetsAt*1000).toLocaleString(loc)}):tr('panel.quota.resetPending')));
   el('quota-windows').append(row);
  }
  el('quota-time').textContent=(q.observedAt?tr('panel.quota.observedAt',{time:new Date(q.observedAt).toLocaleTimeString(loc)}):tr('panel.quota.notObserved'))+(q.queryOk?'':tr('panel.quota.staleSuffix',{msg:q.errorMessage||tr('panel.quota.staleDefault')}));
 }
 function render(next){
  state=next;
  const l=lang();
  if(l!==appliedLang){
   appliedLang=l;
   if(window.GptNiangI18n)GptNiangI18n.applyDomTranslations(document,l);
   document.title=tr('panel.title');
   updateHeader();
  }
  if(el('f-language'))el('f-language').value=next.prefs.language||'auto';
  draft.receive(next.prefs);
  el('save-preferences').disabled=saving||!next.settingsWritable;
  for(const section of form.querySelectorAll('fieldset'))section.disabled=saving||!next.settingsWritable;
  if(!next.settingsWritable){
   const base=tr('panel.notice.readonly');
   el('notice').textContent=next.settingsLoadFailure?`${base} (${next.settingsLoadFailure})`:base;
  }
  for(const button of document.querySelectorAll('[data-character-id]'))button.textContent=button.dataset.characterId===next.prefs.characterId?tr('panel.characters.inUse'):tr('panel.characters.use');
  for(const label of document.querySelectorAll('[data-default-character]'))label.textContent=tr('panel.characters.defaultName');
  const u=next.update||{};
  el('release-version').textContent=tr('panel.update.releaseVersion',{tag:u.releaseTag||'v1.0.9'});
  el('core-version').textContent=tr('panel.update.coreVersion',{version:u.appVersion||next.version||'0.8.42-electron'});
  el('update-automatic').checked=u.automatic!==false;
  const updateFallback={
   checking:tr('panel.update.checking'),
   available:tr('panel.update.available',{tag:u.latestTag||''}),
   current:tr('panel.update.current',{tag:u.latestTag||u.releaseTag||'v1.0.0'}),
   'rate-limited':tr('panel.update.rateLimited',{reason:u.errorReason||tr('panel.update.rateLimitedDefault')}),
   failed:tr('panel.update.failed',{reason:u.errorReason||tr('panel.update.failedDefault')})
  };
  el('update-state').textContent=u.statusText||updateFallback[u.phase]||tr('panel.update.idle');
  const hasNewRelease=Boolean(u.hasUpdate&&u.latestTag&&u.url);
  el('release-download').hidden=!hasNewRelease;
  if(hasNewRelease)el('release-download').textContent=tr('panel.update.downloadTag',{tag:u.latestTag});
  const upstreamMap={
   checking:tr('panel.upstream.checking'),
   current:tr('panel.upstream.current'),
   'blocked-customization':tr('panel.upstream.blocked'),
   source:tr('panel.upstream.source'),
   'disabled-portable':tr('panel.upstream.portable'),
   failed:u.upstreamMessage||tr('panel.upstream.failedDefault'),
   'rate-limited':tr('panel.upstream.rateLimited')
  };
  el('upstream-update-state').textContent=tr('panel.upstream.prefix')+(upstreamMap[u.upstreamPhase]||tr('panel.upstream.default'));
  const p=next.prefs,phase=['idle','working','thinking','waiting','happy','confused'].includes(next.task?.phase)?next.task.phase:'idle';
  el('status').textContent=tr('panel.railPhase.'+phase);
  el('task-phase').textContent=tr('panel.taskPhase.'+phase);
  el('observers').textContent=p.observationPaused?tr('panel.task.resumeObservers'):tr('panel.task.pauseObservers');
  renderQuota(next.quota,next.codex);
  if(!dirty){
   for(const control of form.elements){
    if(!control.name||!(control.name in p))continue;
    if(control.type==='checkbox')control.checked=p[control.name];
    else control.value=p[control.name];
   }
   el('scale-value').textContent=p.scale.toFixed(1)+'×';
   el('bubble-value').textContent=p.bubbleScale.toFixed(1)+'×';
  }
 }
 async function tab(name){
  if(!['quota','settings','quotes','characters'].includes(name))name='quota';
  currentTab=name;
  updateHeader();
  el('save-preferences').hidden=name!=='settings';
  el('reload-preferences').hidden=name!=='settings';
  for(const section of document.querySelectorAll('.tab'))section.hidden=section.id!==name;
  for(const button of el('tabs').children)button.classList.toggle('active',button.dataset.tab===name);
  if(name==='quotes'){
   const triggers=await command('triggers-read');
   if(triggers)el('trigger-editor').value=triggers.join('\n');
   const rows=await command('quotes-read');
   if(rows)el('quote-editor').value=rows.map(r=>r.text).join('\n');
  }
  if(name==='characters'){
   const list=await command('characters');
   if(list){
    el('character-list').replaceChildren();
    for(const c of list){
     const card=node('div',null,{className:'character'}),img=node('img',null,{src:c.url,alt:c.name}),button=node('button',c.id===state.prefs.characterId?tr('panel.characters.inUse'):tr('panel.characters.use')),title=node('p',c.id==='gpt-dragon'?tr('panel.characters.defaultName'):c.name);
     if(c.id==='gpt-dragon')title.dataset.defaultCharacter='true';
     button.dataset.characterId=c.id;
     button.onclick=()=>command('character-select',{id:c.id});
     card.append(img,title,button);
     el('character-list').append(card);
    }
   }
  }
 }
 el('tabs').onclick=e=>{if(e.target.dataset.tab)tab(e.target.dataset.tab);};
 el('f-language').onchange=async()=>{
  const next=await command('language',{language:el('f-language').value});
  if(next){render(next);el('notice').textContent=tr('panel.notice.languageChanged');}
  else{el('f-language').value=state?.prefs?.language||'auto';}
 };
 form.oninput=e=>{const c=e.target;if(c.name)draft.change(c.name,c.type==='checkbox'?c.checked:c.type==='range'||c.type==='number'?Number(c.value):c.value);dirty=draft.dirty;el('scale-value').textContent=Number(form.elements.scale.value).toFixed(1)+'×';el('bubble-value').textContent=Number(form.elements.bubbleScale.value).toFixed(1)+'×';};
 form.onsubmit=async e=>{e.preventDefault();if(saving)return;saving=true;el('save-preferences').disabled=true;for(const section of form.querySelectorAll('fieldset'))section.disabled=true;try{const result=await command('preferences',draft.payload());if(result){draft.reset(result.prefs);dirty=false;render(result);el('notice').textContent=tr('panel.notice.saved');}}finally{saving=false;if(state)render(state);}};
 el('reload-preferences').onclick=async()=>{const next=await command('reload-preferences');if(next){draft.reset(next.prefs);dirty=false;render(next);el('notice').textContent=tr('panel.notice.reloaded');}};
 el('update-check').onclick=async()=>{const next=await command('update-check');if(next?.update)render(next);};
 el('release-download').onclick=()=>{if(state?.update?.url)command('open-external',{url:state.update.url});};
 el('update-automatic').onchange=()=>command('update-automatic',{enabled:el('update-automatic').checked});
 el('refresh').onclick=async()=>{el('refresh').disabled=true;el('notice').textContent=tr('panel.notice.refreshing');try{const next=await command('refresh');if(next){render(next);el('notice').textContent=next.quota?.ok?tr('panel.notice.refreshed'):(next.quota?.errorMessage||tr('panel.notice.refreshFailed'));}}finally{el('refresh').disabled=false;}};
 el('codex-login').onclick=async()=>{el('codex-login').disabled=true;try{const res=await command('codex-login');if(res?.ok)el('notice').textContent=tr('panel.notice.loginStarted');else if(res?.errorMessage)el('notice').textContent=res.errorMessage;}finally{el('codex-login').disabled=false;}};
 el('observers').onclick=()=>command('observation',{paused:!state.prefs.observationPaused});
 el('close').onclick=()=>command('close-panel');
 el('save-triggers').onclick=()=>command('triggers-save',{rows:el('trigger-editor').value.split('\n').map(s=>s.trim()).filter(Boolean)});
 el('save-quotes').onclick=()=>command('quotes-save',{rows:el('quote-editor').value.split('\n').map(s=>s.trim()).filter(Boolean)});
 el('show-quote').onclick=()=>command('quote');
 el('import-character').onclick=async()=>{await command('character-import');tab('characters');};
 for(const slot of ['press','release'])el(slot+'-sound').onclick=()=>command('audio-import',{slot});
 el('builtin-sound').onclick=()=>command('audio-builtin');
 window.product.onState(render);
 window.product.onNotice(n=>{el('notice').textContent=n.message||'';if(n.tab)tab(n.tab);});
 render(await window.product.snapshot());
 await tab(new URLSearchParams(location.search).get('tab')||'quota');
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 document.body.dataset.ready='true';
 await command('panel-ready');
})().catch(()=>{
 const lang=document.documentElement.lang==='ja'?'ja':'zh-CN';
 document.getElementById('notice').textContent=window.GptNiangI18n?GptNiangI18n.t(lang,'panel.notice.initFailed'):'本地界面未能读取状态，请关闭面板后重试。';
});
