const $=id=>document.getElementById(id);
const S=window.PetShared||{};
let revision,loaded=false,busy=false,sequence=0,pendingApply=false,applying=false,applyErrors=0,uiLang=S.resolveLanguage?S.resolveLanguage('auto'):'zh-CN';
const I18N={
 'zh-CN':{
  title:'调整大小',
  heading:'调整人物大小',
  sizeLabel:'人物大小',
  minLabel:'小 · 50%',
  maxLabel:'大 · 150%',
  desc:'100% 是现在这套默认大小。保存后人物会短暂重新加载，下次打开仍沿用你的选择。',
  resetBtn:'默认 100%',
  reloadBtn:'重新读取',
  saveBtn:'保存并应用',
  retryBtn:'重试应用',
  loading:'正在读取…',
  loaded:'已读取保存的大小。',
  pendingSave:'点击“保存并应用”后生效。',
  resetSelected:'已选默认大小，点击“保存并应用”后生效。',
  applying:'大小已保存，正在重新加载人物…'
 },
 ja:{
  title:'サイズ調整',
  heading:'キャラクターのサイズ調整',
  sizeLabel:'キャラクターサイズ',
  minLabel:'小 · 50%',
  maxLabel:'大 · 150%',
  desc:'100% が現在の標準サイズです。保存するとキャラクターが一時的に再読み込みされ、次回起動時もこの設定が維持されます。',
  resetBtn:'標準 100%',
  reloadBtn:'再読み込み',
  saveBtn:'保存して適用',
  retryBtn:'適用を再試行',
  loading:'読み込み中…',
  loaded:'保存されたサイズを読み込みました。',
  pendingSave:'「保存して適用」を押すと反映されます。',
  resetSelected:'標準サイズを選択しました。「保存して適用」を押すと反映されます。',
  applying:'サイズを保存しました。キャラクターを再読み込みしています…'
 }
};
const L=()=>I18N[uiLang]||I18N['zh-CN'];
function applyUiLanguage(lang){
 uiLang=lang==='ja'?'ja':'zh-CN';
 document.documentElement.lang=uiLang;
 const t=L();
 document.title=t.title;
 for(const el of document.querySelectorAll('[data-i18n]')){
  const key=el.getAttribute('data-i18n');
  if(t[key])el.textContent=t[key];
 }
 $('reset').textContent=t.resetBtn;
 $('reload').textContent=t.reloadBtn;
 $('save').textContent=pendingApply&&!applying?t.retryBtn:t.saveBtn;
}
applyUiLanguage(uiLang);
async function call(name,value){const r=await window.petSize[name](value);if(!r.ok)throw Error(r.error);return r.data;}
function controls(){for(const id of ['size','reset'])$(id).disabled=!loaded||busy||applying;$('save').disabled=(!loaded&&!pendingApply)||busy||applying;$('reload').disabled=busy||applying;}
function showValue(){$('value').textContent=$('size').value+'%';}
async function load(){if(busy||applying)return;const current=++sequence;loaded=false;pendingApply=false;$('save').textContent=L().saveBtn;$('status').textContent=L().loading;controls();try{const state=await call('state');if(current!==sequence)return;if(state.language)applyUiLanguage(state.language);revision=state.revision;$('size').value=Math.max(50,Math.min(150,state.percent));showValue();loaded=state.canSave;$('status').textContent=state.warning||L().loaded;}catch(e){if(current===sequence)$('status').textContent=e.message;}finally{if(current===sequence)controls();}}
$('size').oninput=()=>{showValue();$('status').textContent=L().pendingSave;};
$('reset').onclick=()=>{$('size').value='100';showValue();$('status').textContent=L().resetSelected;};
$('reload').onclick=load;
$('save').onclick=async()=>{if(busy||applying||(!loaded&&!pendingApply))return;busy=true;++sequence;const errorsBefore=applyErrors;controls();try{let warning='';if(pendingApply)await call('retry');else{const state=await call('save',{percent:Number($('size').value),revision});if(state.language)applyUiLanguage(state.language);revision=state.revision;warning=state.warning;}pendingApply=true;applying=applyErrors===errorsBefore;if(applying)$('status').textContent=warning||L().applying;}catch(e){$('status').textContent=e.message;}finally{busy=false;controls();}};
window.petSize.onApplyError(message=>{applyErrors++;applying=false;pendingApply=true;$('save').textContent=L().retryBtn;$('status').textContent=message;controls();});
load();
