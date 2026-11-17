'use strict';
(async()=>{
 let state=null,dirty=false,saving=false,currentTab='quota';const draft=new PetPreferenceDraft.Draft();const el=id=>document.getElementById(id),form=el('preferences');
 const command=async(kind,values={})=>{try{const result=await window.product.command({kind,...values});if(result?.error){el('notice').textContent=result.error==='PREFERENCES_CHANGED'?'设置已在别处修改，输入已保留。请先重新读取再保存。':'操作未完成，请重新读取设置后重试。';return null;}return result;}catch{el('notice').textContent='操作未保存，请检查设置是否被其他窗口更改后重试。';return null;}};
 const node=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==null)n.textContent=text;for(const [k,v]of Object.entries(attrs))n[k]=v;return n;};
 const formatAmount=n=>Number.isInteger(n)?String(n):n.toFixed(2).replace(/\.?0+$/,'');
 function renderCodex(q,codex){
  const badge=el('codex-state'),summary=el('codex-summary'),refreshBtn=el('refresh'),loginBtn=el('codex-login');
  badge.className='pill';
  const authLabel=q.authType==='chatgptAuthTokens'?'ChatGPT 令牌':q.authType==='chatgpt'?'ChatGPT 订阅账号':q.authType==='apiKey'?'API Key 模式':(q.connected?'ChatGPT（已连接）':'未登录');
  if(q.ok&&q.queryOk){
   badge.classList.add('is-ok');
   badge.textContent='已连接'+(q.planLabel?' · '+q.planLabel:'');
   summary.textContent='套餐：'+(q.planLabel||'未知套餐')+' · 登录方式：'+authLabel+(codex?.installed?' · 本地 Codex 已就绪':'');
   refreshBtn.textContent='刷新额度';
  }else if(q.connected&&q.windows?.length){
   badge.classList.add('is-warn');
   badge.textContent='已连接 · 待刷新';
   summary.textContent='套餐：'+(q.planLabel||'未知套餐')+' · '+(q.errorMessage||'当前显示缓存用量，可点击刷新重新读取。');
   refreshBtn.textContent='刷新额度';
  }else if(q.errorCode==='AUTH_MODE_UNSUPPORTED'){
   badge.classList.add('is-warn');
   badge.textContent='需登录 ChatGPT';
   summary.textContent=q.errorMessage||'当前为 API Key 或未登录状态，请点击下方“登录 / 切换 ChatGPT 账号”完成连接。';
   refreshBtn.textContent='连接并刷新额度';
  }else if(q.errorCode==='ENOENT'||(codex&&codex.installed===false&&!q.connected)){
   badge.classList.add('is-off');
   badge.textContent='未检测到 Codex';
   summary.textContent=q.errorMessage||'未检测到本地 Codex 客户端或 CLI，请先安装 Codex 后再点击连接。';
   refreshBtn.textContent='重新检测连接';
  }else{
   badge.classList.add('is-off');
   badge.textContent='未连接';
   summary.textContent=q.errorMessage||'点击“连接并刷新额度”读取当前 Codex 登录与订阅额度；如未登录，可先登录 ChatGPT 账号。';
   refreshBtn.textContent='连接并刷新额度';
  }
  loginBtn.disabled=Boolean(codex&&codex.installed===false&&q.errorCode==='ENOENT');
 }
 function renderQuota(q,codex){
  renderCodex(q,codex);
  el('quota-windows').replaceChildren();
  if(!q.windows.length)el('quota-windows').append(node('p',q.errorMessage||'暂时没有可显示的额度窗口。点击上方「连接并刷新额度」获取最新余额与用量。'));
  for(const w of q.windows){
   const row=node('div',null,{className:'quota-row'}),label=node('div',null,{className:'quota-label'}),bar=node('div',null,{className:'bar'}),value=node('div',null);
   label.append(node('span',w.label),node('strong',w.remaining===null?'—':w.remaining.toFixed(0)+'%'));
   const detail=w.total!==null&&w.amountRemaining!==null
    ?'剩余 '+formatAmount(w.amountRemaining)+' / '+formatAmount(w.total)+'（已用 '+formatAmount(w.amountUsed??Math.max(0,w.total-w.amountRemaining))+'）'
    :(w.used!==null&&w.remaining!==null?'已用 '+w.used.toFixed(0)+'% · 剩余 '+w.remaining.toFixed(0)+'%':'');
   value.style.width=(w.remaining??0)+'%';
   bar.append(value);
   row.append(label);
   if(detail)row.append(node('div',detail,{className:'quota-meta'}));
   row.append(bar,node('small',w.resetsAt?'重置：'+new Date(w.resetsAt*1000).toLocaleString('zh-CN'):'重置时间待更新'));
   el('quota-windows').append(row);
  }
  el('quota-time').textContent=(q.observedAt?'最近读取 '+new Date(q.observedAt).toLocaleTimeString('zh-CN'):'尚未读取')+(q.queryOk?'':' · '+(q.errorMessage||'暂时无法刷新，保留已有数据'));
 }
 function render(next){state=next;draft.receive(next.prefs);el('save-preferences').disabled=saving||!next.settingsWritable;for(const section of form.querySelectorAll('fieldset'))section.disabled=saving||!next.settingsWritable;for(const button of document.querySelectorAll('[data-character-id]'))button.textContent=button.dataset.characterId===next.prefs.characterId?'使用中':'使用';const u=next.update||{};el('release-version').textContent='发布版 '+(u.releaseTag||'v1.0.0');el('core-version').textContent='本体 '+(u.appVersion||next.version||'0.8.38-electron');el('update-automatic').checked=u.automatic!==false;el('update-state').textContent=u.statusText||({checking:'本仓库新版本：正在检查 GitHub Release…',available:'本仓库新版本：发现新版本 '+(u.latestTag||''),current:'本仓库新版本：已是最新版本（'+(u.latestTag||u.releaseTag||'v1.0.0')+'）','rate-limited':'本仓库新版本：'+(u.errorReason||'GitHub 访问限流，请稍后再试'),failed:'本仓库新版本：'+(u.errorReason||'网络不可用，无法连接 GitHub Release')})[u.phase]||'本仓库新版本：仅检查与提醒，不自动下载或改写程序';const hasNewRelease=Boolean(u.hasUpdate&&u.latestTag&&u.url);el('release-download').hidden=!hasNewRelease;if(hasNewRelease)el('release-download').textContent='发现新版本 '+u.latestTag+' · 前往下载';const upstreamText=({checking:'正在检查',current:'上游版本已核对','blocked-customization':'发现上游更新，当前定制已保护',source:'源码目录请使用 Git 更新','disabled-portable':'便携版已关闭（防止自我改写）',failed:u.upstreamMessage||'检查未完成','rate-limited':'限流退避中'})[u.upstreamPhase]||'仅提示，保留当前定制';el('upstream-update-state').textContent='上游 GPT-Niang 更新（定制保护）：'+upstreamText;const p=next.prefs;el('status').textContent=({idle:'陪伴中',working:'工作中',thinking:'思考中',waiting:'等待操作',happy:'任务完成',confused:'稍作休息'})[next.task.phase]||'陪伴中';el('task-phase').textContent=({idle:'空闲',working:'工作中',thinking:'思考中',waiting:'等待操作',happy:'刚刚完成',confused:'遇到暂时问题'})[next.task.phase]||'空闲';el('observers').textContent=p.observationPaused?'恢复任务观察':'暂停任务观察';renderQuota(next.quota,next.codex);if(!dirty){for(const control of form.elements){if(!control.name||!(control.name in p))continue;if(control.type==='checkbox')control.checked=p[control.name];else control.value=p[control.name];}el('scale-value').textContent=p.scale.toFixed(1)+'×';el('bubble-value').textContent=p.bubbleScale.toFixed(1)+'×';}}
 async function tab(name){const pages={quota:['Codex 与用量','连接 Codex，查看套餐余额、额度窗口与当前任务。'],settings:['外观与交互','调整人物大小、窗口和陪伴方式。'],quotes:['我的语录','把想听的话留在这里。'],characters:['形象图库','选择你喜欢的陪伴形象。']};if(!pages[name])name='quota';currentTab=name;el('page-title').textContent=pages[name][0];el('page-description').textContent=pages[name][1];el('save-preferences').hidden=name!=='settings';el('reload-preferences').hidden=name!=='settings';el('save-hint').textContent=name==='settings'?'修改后点击保存':'设置只保存在本机';for(const section of document.querySelectorAll('.tab'))section.hidden=section.id!==name;for(const button of el('tabs').children)button.classList.toggle('active',button.dataset.tab===name);if(name==='quotes'){const triggers=await command('triggers-read');if(triggers)el('trigger-editor').value=triggers.join('\n');const rows=await command('quotes-read');if(rows)el('quote-editor').value=rows.map(r=>r.text).join('\n');}if(name==='characters'){const list=await command('characters');if(list){el('character-list').replaceChildren();for(const c of list){const card=node('div',null,{className:'character'}),img=node('img',null,{src:c.url,alt:c.name}),button=node('button',c.id===state.prefs.characterId?'使用中':'使用');button.dataset.characterId=c.id;button.onclick=()=>command('character-select',{id:c.id});card.append(img,node('p',c.id==='gpt-dragon'?'默认龙娘':c.name),button);el('character-list').append(card);}}}}
 el('tabs').onclick=e=>{if(e.target.dataset.tab)tab(e.target.dataset.tab);};
 form.oninput=e=>{const c=e.target;if(c.name)draft.change(c.name,c.type==='checkbox'?c.checked:c.type==='range'||c.type==='number'?Number(c.value):c.value);dirty=draft.dirty;el('scale-value').textContent=Number(form.elements.scale.value).toFixed(1)+'×';el('bubble-value').textContent=Number(form.elements.bubbleScale.value).toFixed(1)+'×';};
 form.onsubmit=async e=>{e.preventDefault();if(saving)return;saving=true;el('save-preferences').disabled=true;for(const section of form.querySelectorAll('fieldset'))section.disabled=true;try{const result=await command('preferences',draft.payload());if(result){draft.reset(result.prefs);dirty=false;render(result);el('notice').textContent='设置已保存。';}}finally{saving=false;if(state)render(state);}};
 el('reload-preferences').onclick=async()=>{const next=await command('reload-preferences');if(next){draft.reset(next.prefs);dirty=false;render(next);el('notice').textContent='已重新读取设置。';}};
 el('update-check').onclick=async()=>{const next=await command('update-check');if(next?.update)render(next);};el('release-download').onclick=()=>{if(state?.update?.url)command('open-external',{url:state.update.url});};el('update-automatic').onchange=()=>command('update-automatic',{enabled:el('update-automatic').checked});el('refresh').onclick=async()=>{el('refresh').disabled=true;el('notice').textContent='正在连接 Codex 读取额度…';try{const next=await command('refresh');if(next){render(next);el('notice').textContent=next.quota?.ok?'Codex 额度已更新。':(next.quota?.errorMessage||'暂时无法从 Codex 读取额度，请确认已在 Codex 中登录 ChatGPT 账号。');}}finally{el('refresh').disabled=false;}};el('codex-login').onclick=async()=>{el('codex-login').disabled=true;try{const res=await command('codex-login');if(res?.ok)el('notice').textContent='已打开 Codex 登录流程，请在浏览器完成 ChatGPT 登录后点击“刷新额度”。';else if(res?.errorMessage)el('notice').textContent=res.errorMessage;}finally{el('codex-login').disabled=false;}};el('observers').onclick=()=>command('observation',{paused:!state.prefs.observationPaused});
 el('close').onclick=()=>command('close-panel');
 el('save-triggers').onclick=()=>command('triggers-save',{rows:el('trigger-editor').value.split('\n').map(s=>s.trim()).filter(Boolean)});el('save-quotes').onclick=()=>command('quotes-save',{rows:el('quote-editor').value.split('\n').map(s=>s.trim()).filter(Boolean)});el('show-quote').onclick=()=>command('quote');el('import-character').onclick=async()=>{await command('character-import');tab('characters');};
 for(const slot of ['press','release'])el(slot+'-sound').onclick=()=>command('audio-import',{slot});el('builtin-sound').onclick=()=>command('audio-builtin');
 window.product.onState(render);window.product.onNotice(n=>{el('notice').textContent=n.message||'';if(n.tab)tab(n.tab);});render(await window.product.snapshot());await tab(new URLSearchParams(location.search).get('tab')||'quota');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.body.dataset.ready='true';await command('panel-ready');
})().catch(()=>{document.getElementById('notice').textContent='本地界面未能读取状态，请关闭面板后重试。';});
