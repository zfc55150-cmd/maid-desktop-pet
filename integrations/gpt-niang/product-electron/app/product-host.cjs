'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url'),{spawn}=require('node:child_process'),{SettingsStore}=require('./settings-store.cjs'),i18n=require('./i18n.js');
const bounded=(n,low,high,fallback)=>Number.isFinite(n)&&n>=low&&n<=high?n:fallback;
function readJson(file,fallback=null){try{if(fs.statSync(file).size>1024*1024)return fallback;return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return fallback;}}
function safeQuotaError(value){
 if(typeof value!=='string')return '';
 const cleaned=value.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,160);
 if(!cleaned||/sk-[a-zA-Z0-9_-]{8,}|Bearer\s+\S+|[^\s@]+@[^\s@]+\.[^\s@]+/i.test(cleaned))return '';
 return cleaned;
}
function resolveCodexCli(configuredPath,{env=process.env,platform=process.platform}={}) {
 const isFile=file=>{try{return fs.statSync(file).isFile();}catch{return false;}};
 if(typeof configuredPath==='string'&&isFile(configuredPath))return configuredPath;
 const executable=platform==='win32'?'codex.exe':'codex';
 if(platform==='darwin'){
  const applications=env.GPT_NIANG_CODEX_APP?[env.GPT_NIANG_CODEX_APP]:[
   '/Applications/Codex.app',
   ...(env.HOME?[path.join(env.HOME,'Applications','Codex.app')]:[]),
   '/Applications/ChatGPT.app',
   ...(env.HOME?[path.join(env.HOME,'Applications','ChatGPT.app')]:[])
  ];
  for(const appDir of applications){
   for(const relative of ['Contents/Resources/codex-cli/bin/codex','Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex','Contents/Resources/codex']){
    const file=path.join(appDir,relative);
    if(isFile(file))return file;
   }
  }
 }
 const localData=env.LOCALAPPDATA??env.LocalAppData;
 if(platform==='win32'&&localData){
  const binRoot=path.join(localData,'OpenAI','Codex','bin');
  const candidates=[];
  const add=file=>{try{const stat=fs.statSync(file);if(stat.isFile())candidates.push({file,modified:stat.mtimeMs});}catch{}};
  add(path.join(binRoot,executable));
  try{for(const entry of fs.readdirSync(binRoot,{withFileTypes:true})){if(entry.isDirectory())add(path.join(binRoot,entry.name,executable));}}catch{}
  candidates.sort((a,b)=>b.modified-a.modified||a.file.localeCompare(b.file));
  if(candidates.length)return candidates[0].file;
 }
 for(const directory of (env.PATH??env.Path??'').split(platform==='win32'?';':':')){
  const trimmed=directory.trim().replace(/^"(.*)"$/,'$1');
  if(!trimmed)continue;
  const file=path.join(trimmed,executable);
  if(isFile(file))return file;
 }
 return null;
}
function publicQuota(value){
 const ok=value?.ok===true,queryOk=value?.queryOk===true;
 const authType=['chatgpt','chatgptAuthTokens','apiKey'].includes(value?.authType)?value.authType:null;
 const connected=ok||authType==='chatgpt'||authType==='chatgptAuthTokens';
 const errorCode=ok&&queryOk?null:(typeof value?.errorCode==='string'&&/^[A-Z0-9_]{2,60}$/.test(value.errorCode)?value.errorCode:'QUOTA_UNAVAILABLE');
 return {
  ok,
  queryOk,
  connected,
  authType,
  planLabel:typeof value?.planLabel==='string'?value.planLabel.slice(0,80):'',
  planKnown:value?.planKnown===true,
  observedAt:Number.isFinite(value?.observedAt)?value.observedAt:null,
  checkedAt:Number.isFinite(value?.checkedAt)?value.checkedAt:null,
  windows:(Array.isArray(value?.windows)?value.windows:[]).slice(0,8).map(w=>({
   kind:w.kind==='individual'?'individual':'window',
   label:typeof w.label==='string'?w.label.slice(0,60):'额度',
   remaining:bounded(w.remaining,0,100,null),
   used:bounded(w.used,0,100,null),
   minutes:Number.isFinite(w.minutes)?w.minutes:null,
   resetsAt:Number.isFinite(w.resetsAt)?w.resetsAt:null,
   total:bounded(w.total,0,1e12,null),
   amountUsed:bounded(w.amountUsed,0,1e12,null),
   amountRemaining:bounded(w.amountRemaining,0,1e12,null)
  })),
  errorCode,
  errorMessage:ok&&queryOk?'':safeQuotaError(value?.error)
 };
}
function loadReleaseNotice(serviceRoot){
 for(const candidate of [serviceRoot&&path.join(serviceRoot,'release-notice.cjs'),path.join(__dirname,'../services/release-notice.cjs'),path.join(__dirname,'release-notice.cjs')].filter(Boolean)){
  if(fs.existsSync(candidate))return require(candidate);
 }
 return require('../services/release-notice.cjs');
}
class ProductHost {
 constructor({root,dataDir,serviceRoot,configPath,compatRoot=root,testOnly=false,systemLocale=null,onCompletion=()=>{},onReleaseNotice=()=>{},fetchImpl=globalThis.fetch,spawnNode=spawn}){
  Object.assign(this,{root:path.resolve(root),dataDir:path.resolve(dataDir),serviceRoot:path.resolve(serviceRoot),compatRoot:path.resolve(compatRoot),configPath,testOnly,systemLocale,onCompletion,onReleaseNotice,fetchImpl,spawnNode});
  const prod=readJson(path.join(this.root,'product.json')),pkg=readJson(path.join(this.root,'package.json'));
  this.releaseTag=prod?.releaseTag||pkg?.releaseTag||'v1.0.0';
  this.appVersion=prod?.version||pkg?.version||require('./performance-catalog.js').revision||'0.8.17-electron';
  this.isPortable=Boolean(prod?.portable||fs.existsSync(path.join(this.root,'portable')));
  this.releaseNotice=loadReleaseNotice(this.serviceRoot);
  this.settings=new SettingsStore(path.join(dataDir,'settings.json'));this.forms=new SettingsStore(path.join(dataDir,'pet-form.json'));this.experience=new SettingsStore(path.join(dataDir,'experience-preferences.json'));this.audio=new SettingsStore(path.join(dataDir,'audio-preferences.json'));this.updatePreferences=new SettingsStore(path.join(dataDir,'update-preferences.json'));this.startedAt=Date.now();this.updateChild=null;this.releaseCheckPromise=null;this.children=new Set();this.detachedChildren=new Set();this.task={phase:'idle',active:0};this.closed=false;this.lastWorkerProbe=0;this.workerFailures=0;this.lastCodexProbe=0;this.codexInstalledCache=false;this.lastRefreshQuota=null;this.lastAutoQuote=0;this.lastQuote=null;this.lastCompletion=0;this.errors=[];this.activityCache=new Map();
  if(!this.testOnly&&this.settings.canSave&&this.settings.value.followHost!==false){try{this.settings.update({followHost:false});}catch{}}
 }
 codexInstalled(force=false){
  if(this.testOnly)return false;
  const now=Date.now();
  if(!force&&now-this.lastCodexProbe<15000)return this.codexInstalledCache;
  this.lastCodexProbe=now;
  const configured=this.configPath?readJson(this.configPath)?.codexPath:null;
  this.codexInstalledCache=Boolean(resolveCodexCli(configured));
  return this.codexInstalledCache;
 }
 isUpdateAutomatic(){const v=this.updatePreferences.value;if(typeof v.userSetAutomatic==='boolean')return v.automatic!==false;if(this.isPortable)return true;return v.automatic!==false;}
 setUpdateAutomatic(enabled){return this.updatePreferences.update({automatic:enabled===true,userSetAutomatic:true});}
 isAllowedReleaseUrl(url){return this.releaseNotice.isAllowedReleaseUrl(url);}
 resolvedLanguage(language=this.settings?.value?.language){const configured=['auto','zh-CN','ja'].includes(language)?language:'auto';return i18n.resolveLanguage(configured,{systemLocale:this.systemLocale});}
 defaultCharacterName(){return i18n.defaultCharacterName(this.resolvedLanguage());}
 prefs(){const p=this.settings.value,e=this.experience.value,language=['auto','zh-CN','ja'].includes(p.language)?p.language:'auto',resolvedLanguage=this.resolvedLanguage(language);return {scale:bounded(p.scale,.6,2.5,1.26),bubbleScale:bounded(p.bubbleScale,.6,2.5,1.4),soundOn:p.soundOn!==false,soundVolume:bounded(p.soundVolume,0,1,.9),followHost:false,desktopTopmost:p.desktopTopmost===true,desktopLeft:bounded(p.desktopLeft,-100000,100000,null),desktopTop:bounded(p.desktopTop,-100000,100000,null),anchor:['left','right','free'].includes(p.anchor)?p.anchor:'right',side:p.side==='left'?'left':'right',left:bounded(p.left,-100000,100000,0),right:bounded(p.right,-100000,100000,0),bottom:bounded(p.bottom,-100000,100000,0),collapsed:p.collapsed!==false,hideMenu:p.hideMenu===true,clickCardsEnabled:p.clickCardsEnabled===true,bustClickCardsEnabled:p.bustClickCardsEnabled!==false,autoQuoteEnabled:p.autoQuoteEnabled!==false,autoQuoteIntervalSeconds:bounded(p.autoQuoteIntervalSeconds,30,3600,180),taskCompletionBubble:p.taskCompletionBubble!==false,dragonAnimationEnabled:p.dragonAnimationEnabled!==false,dragonCodexEnabled:p.dragonCodexEnabled!==false,dragonTouchEnabled:p.dragonTouchEnabled!==false,idleRhythm:'active',smoothManualRoutes:e.smoothManualRoutes!==false,quietUntil:this.testOnly?bounded(e.quietUntil,-1,1e16,0):0,observationPaused:fs.existsSync(path.join(this.dataDir,'task-observers-paused.flag')),form:this.forms.value.form==='bust'?'bust':'full',autoBubble:this.forms.value.autoBubble!==false,characterId:typeof p.characterId==='string'?p.characterId:'gpt-dragon',colorMode:typeof p.colorMode==='string'?p.colorMode:'original',colorChance:bounded(p.colorChance,0,30,2),colorTextChance:bounded(p.colorTextChance,0,30,2),colorPaused:p.colorPaused===true,bubbleTapAdvance:p.bubbleTapAdvance===true,language,resolvedLanguage};}
 safeAudio(){const p=this.prefs(),a=this.audio.value,mode=['builtin','custom','none'].includes(a.mode)?a.mode:'builtin';const url=slot=>{let file=path.join(this.root,'assets',slot+'.wav');if(mode==='none')return null;if(mode==='custom'){const entry=a[slot];if(!entry||typeof entry.file!=='string'||!/^[a-f0-9-]+\.wav$/i.test(entry.file))return null;file=path.join(this.dataDir,'sounds',entry.file);}return fs.existsSync(file)?pathToFileURL(file).href:null;};return {enabled:p.soundOn,volume:p.soundVolume,press:url('press'),release:url('release'),mode};}
 snapshot(){const prefs=this.prefs(),lang=prefs.resolvedLanguage,upstream=readJson(path.join(this.dataDir,'update-status.json')),upstreamPhase=this.isPortable?'disabled-portable':(upstream?.phase||'idle'),notice=this.releaseNotice.normalizeReleaseState(this.updatePreferences.value,this.releaseTag);const rawStatus=readJson(path.join(this.dataDir,'status.json')),fileQuota=publicQuota(rawStatus);if(fileQuota.ok&&fileQuota.queryOk&&(fileQuota.checkedAt??0)>=(this.lastRefreshQuota?.checkedAt??0))this.lastRefreshQuota=null;const quota=(this.lastRefreshQuota&&(!rawStatus||!this.lastRefreshQuota.ok&&(this.lastRefreshQuota.checkedAt??0)>=(fileQuota.checkedAt??0)))?{...fileQuota,queryOk:false,errorCode:this.lastRefreshQuota.errorCode,errorMessage:this.lastRefreshQuota.errorMessage||fileQuota.errorMessage}:fileQuota;const codex={installed:this.codexInstalled(),connected:quota.connected,authType:quota.authType,planLabel:quota.planLabel};return {update:{automatic:this.isUpdateAutomatic(),releaseTag:this.releaseTag,appVersion:this.appVersion,portable:this.isPortable,latestTag:notice.latestTag,url:notice.url,checkedAt:notice.checkedAt,phase:notice.phase,lastNotifiedTag:notice.lastNotifiedTag,retryAfterAt:notice.retryAfterAt,errorReason:notice.errorReason,hasUpdate:notice.hasUpdate,statusText:this.releaseNotice.formatReleaseStatusText(notice,this.releaseTag,lang),upstreamPhase,upstreamMessage:typeof upstream?.message==='string'?upstream.message.slice(0,160):''},prefs,resolvedLanguage:lang,task:this.task,quota,codex,audio:this.safeAudio(),settingsWritable:this.settings.canSave&&this.forms.canSave&&this.experience.canSave,settingsLoadFailure:[this.settings,this.forms,this.experience].map(s=>s.loadFailure).filter(Boolean).join('; ')||null};}
 validatePreferences(values){
  if(!values||typeof values!=='object')throw Error('INVALID_PREFERENCES');const bool=['soundOn','desktopTopmost','hideMenu','clickCardsEnabled','bustClickCardsEnabled','autoQuoteEnabled','taskCompletionBubble','dragonAnimationEnabled','dragonCodexEnabled','dragonTouchEnabled','colorPaused','bubbleTapAdvance'],ranges={scale:[.6,2.5],bubbleScale:[.6,2.5],soundVolume:[0,1],desktopLeft:[-100000,100000],desktopTop:[-100000,100000],left:[-100000,100000],right:[-100000,100000],bottom:[-100000,100000],autoQuoteIntervalSeconds:[30,3600],colorChance:[0,30],colorTextChance:[0,30]},patch={};
  for(const [key,value]of Object.entries(values)){if(key==='followHost'){if(value!==false)throw Error('INVALID_PREFERENCE');patch.followHost=false;}else if(key==='language'){if(!['auto','zh-CN','ja'].includes(value))throw Error('INVALID_PREFERENCE');patch.language=value;}else if(bool.includes(key)){if(typeof value!=='boolean')throw Error('INVALID_PREFERENCE');patch[key]=value;}else if(ranges[key]){if(bounded(value,...ranges[key],null)===null)throw Error('INVALID_PREFERENCE');patch[key]=value;}else if(key==='anchor'&&['left','right','free'].includes(value)||key==='side'&&['left','right'].includes(value)||key==='colorMode'&&['original','linked','rainbow','surprise','rare','special','mixed'].includes(value)){patch[key]=value;}else throw Error('UNKNOWN_PREFERENCE');}
  return patch;
 }
 update(values){this.settings.update(this.validatePreferences(values));return this.snapshot();}
 reloadPreferences(){for(const store of [this.settings,this.forms,this.experience]){const current=store.read(store.file);if(current.revision!==store.revision||!store.canSave)store.load();if(!store.canSave)throw Error('SETTINGS_SAVE_BLOCKED');}return this.snapshot();}
 savePreferences(data){this.reloadPreferences();const values={...data.prefs},forms={},experience={};if('autoBubble'in values){if(typeof values.autoBubble!=='boolean')throw Error('INVALID_FORM');forms.autoBubble=values.autoBubble;delete values.autoBubble;}const settings=this.validatePreferences(values);if(data.form!==undefined){if(!['full','bust'].includes(data.form))throw Error('INVALID_FORM');forms.form=data.form;}if(data.idleRhythm!==undefined){if(!['active','natural','quiet'].includes(data.idleRhythm))throw Error('INVALID_EXPERIENCE');experience.idleRhythm=data.idleRhythm;}const requested={...settings,...forms,...experience},current=this.prefs();if(data.expected!==undefined){if(!data.expected||typeof data.expected!=='object'||Array.isArray(data.expected))throw Error('INVALID_PREFERENCES');for(const [key,value]of Object.entries(data.expected)){if(!Object.hasOwn(requested,key))throw Error('INVALID_PREFERENCES');if(!Object.is(current[key],value)&&!Object.is(current[key],requested[key]))throw Error('PREFERENCES_CHANGED');}}const plans=[];if(Object.keys(settings).length)plans.push({store:this.settings,patch:settings});if(Object.keys(forms).length)plans.push({store:this.forms,patch:{version:1,...forms}});if(Object.keys(experience).length)plans.push({store:this.experience,patch:{version:1,...experience}});require('./settings-store.cjs').updateBatch(plans);return this.snapshot();}
 setForm(form){if(!['full','bust'].includes(form))throw Error('INVALID_FORM');this.forms.update({version:1,form,autoBubble:this.forms.value.autoBubble!==false});return this.snapshot();}
 setExperience(patch){const allowed={};for(const [key,value]of Object.entries(patch)){if(key==='idleRhythm'&&['active','quiet','natural'].includes(value)||key==='smoothManualRoutes'&&typeof value==='boolean'||key==='quietUntil'&&Number.isSafeInteger(value)&&value>=-1&&value<Date.now()+86400000)allowed[key]=value;else throw Error('INVALID_EXPERIENCE');}this.experience.update({version:1,...allowed});return this.snapshot();}
 setObservationPaused(paused){const file=path.join(this.dataDir,'task-observers-paused.flag');if(paused)fs.writeFileSync(file,'paused');else if(fs.existsSync(file))fs.unlinkSync(file);this.activity?.setPaused(paused);this.completion?.setPaused(paused);if(paused)this.task={phase:'idle',active:0};return this.snapshot();}
 quoteRows(){const normalize=value=>{const rows=Array.isArray(value)?value:value?.quotes;return (Array.isArray(rows)?rows:[]).map(r=>typeof r==='string'?{text:r,weight:1}:r).filter(r=>typeof r?.text==='string'&&r.text.trim()&&r.text.length<=200&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(r.text)&&bounded(r.weight??1,0.0001,1000,null)!==null).map(r=>({text:r.text.trim(),weight:r.weight??1})).slice(0,5000);};const custom=normalize(readJson(path.join(this.dataDir,'quotes.json')));return custom.length?custom:normalize(readJson(path.join(this.root,'assets/quotes.json')));}
 nextQuote(){const rows=this.quoteRows(),choices=rows.filter(r=>r.text!==this.lastQuote),pool=choices.length?choices:rows;if(!pool.length){const defaults=i18n.defaultQuotes(this.resolvedLanguage()),alt=defaults.filter(t=>t!==this.lastQuote),picked=(alt.length?alt:defaults)[0]||i18n.defaultQuote(this.resolvedLanguage());this.lastQuote=picked;return picked;}let n=Math.random()*pool.reduce((sum,r)=>sum+r.weight,0);const picked=pool.find(r=>(n-=r.weight)<0)||pool.at(-1);this.lastQuote=picked.text;return picked.text;}
 saveQuotes(rows){if(!Array.isArray(rows)||rows.length>5000)throw Error('INVALID_QUOTES');const prior=new Map(this.quoteRows().map(r=>[r.text,r.weight]));const value=rows.map(r=>({text:typeof r==='string'?r:r?.text,weight:typeof r==='string'?prior.get(r.trim())??1:r?.weight??1}));if(value.some(r=>typeof r.text!=='string'||!r.text.trim()||r.text.length>200||bounded(r.weight,.0001,1000,null)===null))throw Error('INVALID_QUOTES');const store=new SettingsStore(path.join(this.dataDir,'quotes.json'));store.update({version:1,quotes:value});return this.quoteRows();}
 note(code){if(this.errors.at(-1)!==code){if(this.errors.length===64)this.errors.shift();this.errors.push(code);}}
 async start(){
  if(this.testOnly)return;const state=await import(pathToFileURL(path.join(this.serviceRoot,'dragon-animation/activity-state.mjs')).href);this.selectDisplay=state.selectDisplay;
  const {ActivityWatch}=await import(pathToFileURL(path.join(this.serviceRoot,'dragon-animation/activity-watch.mjs')).href),{CompletionMonitor}=await import(pathToFileURL(path.join(this.serviceRoot,'completion-monitor.mjs')).href);
  const codexHome=process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),pauseFile=path.join(this.dataDir,'task-observers-paused.flag');
  this.activity=new ActivityWatch({codexHome,stateDir:path.join(this.dataDir,'activity'),pauseFile,healthFile:path.join(this.dataDir,'activity/observer-health.json')});
  this.completion=new CompletionMonitor({codexHome,stateFile:path.join(this.dataDir,'completion-monitor-state.json'),pauseFile,onNotification:()=>{if(this.prefs().taskCompletionBubble)this.onCompletion();}});
  await this.activity.start();if(this.closed){this.activity.stop();return;}this.completion.start();this.ensureWorker();
 }
 ensureWorker(){if(this.testOnly||this.closed||this.workerFailures>=8)return;const backoff=Math.min(60000,5000*Math.pow(2,this.workerFailures));if(Date.now()-this.lastWorkerProbe<backoff)return;this.lastWorkerProbe=Date.now();const health=readJson(path.join(this.dataDir,'worker-status.json'));if(health&&Date.now()-health.at<5000){try{process.kill(health.pid,0);this.workerFailures=0;return;}catch{}}
  const config=readJson(this.configPath);if(!config?.nodePath)return;const spawnedAt=Date.now(),child=this.spawnNode(config.nodePath,[path.join(this.serviceRoot,'watch.mjs'),this.configPath,String(process.pid),'--inherit-stop'],{windowsHide:true,stdio:'ignore'});this.children.add(child);child.once('exit',code=>{this.children.delete(child);if(code!==0&&Date.now()-spawnedAt<10000)this.workerFailures++;else this.workerFailures=0;});child.once('error',()=>{this.children.delete(child);this.workerFailures++;this.note('QUOTA_WORKER_START_FAILED');});
 }
 tick(){this.ensureWorker();this.checkAutomaticUpdate();const prefs=this.prefs();if(!prefs.dragonCodexEnabled||prefs.observationPaused){this.task={phase:'idle',active:0};return this.snapshot();}if(this.selectDisplay){const folder=path.join(this.dataDir,'activity');let files=[];try{files=fs.readdirSync(folder).filter(n=>/^[a-f0-9]{32}\.json$/.test(n)).slice(0,512);}catch{}const seen=new Set(files),items=[];for(const k of this.activityCache.keys())if(!seen.has(k))this.activityCache.delete(k);for(const n of files){const full=path.join(folder,n);try{const mtime=fs.statSync(full).mtimeMs,cached=this.activityCache.get(n);if(cached&&cached.mtime===mtime){if(cached.val)items.push(cached.val);continue;}const val=readJson(full);this.activityCache.set(n,{mtime,val});if(val)items.push(val);}catch{}}this.task=this.selectDisplay(items);}return this.snapshot();}
 async checkReleaseNotice(mode='automatic',options={}){
  if(this.closed)return null;
  if(this.releaseCheckPromise)return this.releaseCheckPromise;
  const run=this.releaseNotice.checkReleaseNotice({store:this.updatePreferences,localTag:this.releaseTag,assetKind:'gpt',mode,force:options.force??(mode==='manual'),fetchImpl:options.fetchImpl||this.fetchImpl,now:options.now||Date.now,lang:this.resolvedLanguage(),onNotify:info=>this.onReleaseNotice?.(info)}).catch(()=>{this.note('RELEASE_NOTICE_FAILED');return {ok:false,notified:false};}).finally(()=>{if(this.releaseCheckPromise===run)this.releaseCheckPromise=null;});
  this.releaseCheckPromise=run;return run;
 }
 spawnUpstreamUpdate(mode='manual'){if(this.testOnly||this.isPortable||this.closed||this.updateChild)return false;const node=readJson(this.configPath)?.nodePath;if(!node)return false;const child=this.spawnNode(node,[path.join(this.compatRoot,'runtime/update.mjs'),path.join(this.compatRoot,'installation.json'),mode],{windowsHide:true,stdio:'ignore'});this.updateChild=child;this.children.add(child);const done=()=>{this.children.delete(child);if(this.updateChild===child)this.updateChild=null;};child.once('exit',done);child.once('error',()=>{done();this.note('UPDATE_CHECK_FAILED');});return true;}
 checkAutomaticUpdate(){if(this.testOnly||this.closed||Date.now()-this.startedAt<30000||!this.isUpdateAutomatic())return;this.checkReleaseNotice('automatic');if(this.isPortable)return;const status=readJson(path.join(this.dataDir,'update-status.json'));if(Date.now()<(status?.nextCheckAt||0))return;this.spawnUpstreamUpdate('automatic');}
 checkUpdate(mode='manual'){if(this.closed)return false;const noticePromise=this.checkReleaseNotice(mode);this.spawnUpstreamUpdate(mode);return noticePromise;}
 async refresh(){if(this.testOnly)return {ok:false,testOnly:true};this.codexInstalled(true);const {requestRefresh}=await import(pathToFileURL(path.join(this.serviceRoot,'refresh-client.mjs')).href);const config=readJson(this.configPath);if(!config){this.lastRefreshQuota=publicQuota({ok:false,queryOk:false,checkedAt:Date.now(),errorCode:'NO_CONFIG',error:i18n.t(this.resolvedLanguage(),'codex.noConfig')});return this.lastRefreshQuota;}const raw=await requestRefresh(config,this.configPath);this.lastRefreshQuota=publicQuota({...raw,checkedAt:Number.isFinite(raw?.checkedAt)?raw.checkedAt:Date.now()});return this.lastRefreshQuota;}
 async loginCodex(){
  if(this.testOnly)return {ok:false,testOnly:true};
  const configured=this.configPath?readJson(this.configPath)?.codexPath:null;
  const cli=resolveCodexCli(configured);
  this.lastCodexProbe=Date.now();
  this.codexInstalledCache=Boolean(cli);
  if(!cli)return {ok:false,errorCode:'ENOENT',errorMessage:i18n.t(this.resolvedLanguage(),'codex.noCli')};
  try{
   // Interactive `codex login` must outlive pet restarts so the user can finish OAuth in browser/terminal.
   const child=this.spawnNode(cli,['login'],{windowsHide:false,detached:true,stdio:'ignore'});
   this.detachedChildren.add(child);
   const cleanup=()=>this.detachedChildren.delete(child);
   child.once('exit',cleanup);
   child.on('error',cleanup);
   child.unref();
   return {ok:true,started:true};
  }catch{return {ok:false,errorCode:'CODEX_LOGIN_FAILED',errorMessage:i18n.t(this.resolvedLanguage(),'codex.loginFailed')};}
 }
 async close(){this.closed=true;this.activity?.stop();this.completion?.stop();for(const child of this.children){try{child.kill();}catch{}}this.children.clear();if(this.detachedChildren.size>0){this.note('CODEX_LOGIN_DETACHED');this.detachedChildren.clear();}}
}
module.exports={ProductHost,publicQuota,readJson,resolveCodexCli};
