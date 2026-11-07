'use strict';
const $=id=>document.getElementById(id),draft=new PetPreferenceDraft.Draft();let dirty=false,busy=false,loaded=false;
function show(){const percent=Number($('size').value);$('value').textContent=percent+'%';$('height').textContent='人物高度约 '+Math.round(324*percent/100)+' 像素';}
function buttons(){for(const id of ['size','reset','save','reload-size'])$(id).disabled=busy||!loaded;$('reload-size').disabled=busy;}
function sync(state){draft.receive(state.prefs);if(!dirty&&!busy){$('size').value=Math.max(45,Math.min(175,Math.round(state.prefs.scale/1.26*100)));show();}loaded=state.settingsWritable;buttons();if(!loaded)$('status').textContent='设置暂时无法写入，修复后可点击重新读取。';}
function change(){draft.change('scale',Number($('size').value)*1.26/100);dirty=draft.dirty;show();$('status').textContent='点击“保存并应用”后生效。';}
$('size').oninput=change;
$('reset').onclick=()=>{$('size').value='100';change();};
$('reload-size').onclick=async()=>{if(busy)return;busy=true;buttons();try{const state=await window.product.command({kind:'reload-preferences'});if(state.error)throw Error('READ_FAILED');draft.reset(state.prefs);dirty=false;busy=false;sync(state);$('status').textContent='已重新读取当前大小。';}catch{$('status').textContent='暂时无法读取，请稍后重试。';}finally{busy=false;buttons();}};
$('save').onclick=async()=>{if(busy||!loaded)return;busy=true;buttons();try{const state=await window.product.command(draft.payload());if(state.error){$('status').textContent=state.error==='PREFERENCES_CHANGED'?'大小已在别处修改，输入已保留，请先重新读取。':'暂未保存，请重新读取后重试。';return;}draft.reset(state.prefs);dirty=false;busy=false;sync(state);$('status').textContent='已保存，人物大小已立即应用。';}catch{$('status').textContent='暂未保存，请重试。';}finally{busy=false;buttons();}};
window.product.onState(sync);window.product.snapshot().then(async state=>{sync(state);if(loaded)$('status').textContent='已读取当前大小。';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.body.dataset.ready='true';await window.product.command({kind:'size-ready'});}).catch(()=>{$('status').textContent='读取失败，请关闭后重试。';});
