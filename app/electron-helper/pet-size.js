const $=id=>document.getElementById(id);let revision,loaded=false,busy=false,sequence=0,pendingApply=false,applying=false,applyErrors=0;
async function call(name,value){const r=await window.petSize[name](value);if(!r.ok)throw Error(r.error);return r.data;}
function controls(){for(const id of ['size','reset'])$(id).disabled=!loaded||busy||applying;$('save').disabled=(!loaded&&!pendingApply)||busy||applying;$('reload').disabled=busy||applying;}
function showValue(){$('value').textContent=$('size').value+'%';}
async function load(){if(busy||applying)return;const current=++sequence;loaded=false;pendingApply=false;$('save').textContent='保存并应用';controls();try{const state=await call('state');if(current!==sequence)return;revision=state.revision;$('size').value=Math.max(50,Math.min(150,state.percent));showValue();loaded=state.canSave;$('status').textContent=state.warning||'已读取保存的大小。';}catch(e){if(current===sequence)$('status').textContent=e.message;}finally{if(current===sequence)controls();}}
$('size').oninput=()=>{showValue();$('status').textContent='点击“保存并应用”后生效。';};
$('reset').onclick=()=>{$('size').value='100';showValue();$('status').textContent='已选默认大小，点击“保存并应用”后生效。';};
$('reload').onclick=load;
$('save').onclick=async()=>{if(busy||applying||(!loaded&&!pendingApply))return;busy=true;++sequence;const errorsBefore=applyErrors;controls();try{let warning='';if(pendingApply)await call('retry');else{const state=await call('save',{percent:Number($('size').value),revision});revision=state.revision;warning=state.warning;}pendingApply=true;applying=applyErrors===errorsBefore;if(applying)$('status').textContent=warning||'大小已保存，正在重新加载人物…';}catch(e){$('status').textContent=e.message;}finally{busy=false;controls();}};
window.petSize.onApplyError(message=>{applyErrors++;applying=false;pendingApply=true;$('save').textContent='重试应用';$('status').textContent=message;controls();});
load();
