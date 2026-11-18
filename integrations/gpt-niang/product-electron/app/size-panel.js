'use strict';
const $=id=>document.getElementById(id),draft=new PetPreferenceDraft.Draft();
let dirty=false,busy=false,loaded=false,currentLang='zh-CN',statusKey='sizePanel.status.loading';
const tr=(key,vars)=>window.GptNiangI18n?GptNiangI18n.t(currentLang,key,vars):key;
function setStatus(key){statusKey=key;$('status').textContent=tr(key);}
function applyLanguage(lang){
 const next=lang==='ja'?'ja':'zh-CN';
 if(next===currentLang&&document.documentElement.lang===next)return;
 currentLang=next;
 if(window.GptNiangI18n){GptNiangI18n.applyDomTranslations(document,currentLang);document.title=tr('sizePanel.title');}
 show();
 if(statusKey)$('status').textContent=tr(statusKey);
}
function show(){const percent=Number($('size').value);$('value').textContent=percent+'%';$('height').textContent=tr('sizePanel.height',{px:Math.round(324*percent/100)});}
function buttons(){for(const id of ['size','reset','save','reload-size'])$(id).disabled=busy||!loaded;$('reload-size').disabled=busy;}
function sync(state){applyLanguage(state.resolvedLanguage);draft.receive(state.prefs);if(!dirty&&!busy){$('size').value=Math.max(45,Math.min(175,Math.round(state.prefs.scale/1.26*100)));show();}loaded=state.settingsWritable;buttons();if(!loaded)setStatus('sizePanel.status.readonly');else if(!dirty&&statusKey==='sizePanel.status.readonly')setStatus('sizePanel.status.loaded');}
function change(){draft.change('scale',Math.max(0.6,Math.min(2.5,Number($('size').value)*1.26/100)));dirty=draft.dirty;show();setStatus('sizePanel.status.dirty');}
$('size').oninput=change;
$('reset').onclick=()=>{$('size').value='100';change();};
$('reload-size').onclick=async()=>{if(busy)return;busy=true;buttons();try{const state=await window.product.command({kind:'reload-preferences'});if(state.error)throw Error('READ_FAILED');draft.reset(state.prefs);dirty=false;busy=false;sync(state);setStatus('sizePanel.status.reloaded');}catch{setStatus('sizePanel.status.reloadFailed');}finally{busy=false;buttons();}};
$('save').onclick=async()=>{if(busy||!loaded)return;busy=true;buttons();try{const state=await window.product.command(draft.payload());if(state.error){setStatus(state.error==='PREFERENCES_CHANGED'?'sizePanel.status.conflict':'sizePanel.status.saveFailed');return;}draft.reset(state.prefs);dirty=false;busy=false;sync(state);setStatus('sizePanel.status.saved');}catch{setStatus('sizePanel.status.saveCatch');}finally{busy=false;buttons();}};
window.product.onState(sync);window.product.snapshot().then(async state=>{sync(state);if(loaded)setStatus('sizePanel.status.loaded');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.body.dataset.ready='true';await window.product.command({kind:'size-ready'});}).catch(()=>{setStatus('sizePanel.status.initFailed');});
