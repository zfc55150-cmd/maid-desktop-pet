const $=id=>document.getElementById(id);
let armed=false,revision,loaded=false,busy=false,readSequence=0;
async function call(name,arg){const r=await window.petSettings[name](arg);if(!r.ok)throw Error(r.error);return r.data;}
function controls(){for(const id of ['save','clear','copyHistory','includeBackup','clearMemory','prompt','memory','autoMemory','key'])$(id).disabled=!loaded||busy;$('reload').disabled=busy;}
function ready(value){loaded=value;controls();}
function resetClear(){armed=false;$('clear').textContent='清空聊天记录';}
function display(s){
 revision=s.revision;$('prompt').value=s.prompt;$('memory').value=s.memory||'';
 $('autoMemory').checked=s.autoMemoryEnabled!==false;
 $('memoryStatus').textContent=memoryStatus(s.memoryStatus,s.memoryUpdatedAt);
 $('key').placeholder=s.hasKey?'已保存；留空保留原密钥':'填写 DeepSeek API Key';
 $('historyCount').textContent='（'+s.messages.length+' 条）';
 $('history').value=s.messages.map(m=>(m.role==='user'?'我':'蓝鲸女仆')+'：\n'+m.content+(m.incomplete?'\n（回复未完整结束）':'')).join('\n\n');
 resetClear();ready(true);
}
function memoryStatus(status,updatedAt){
 if(!$('autoMemory').checked)return '自动记忆已关闭，已有记忆仍用于聊天。';
 if(status==='error')return '上次自动整理未完成，会稍后重试；聊天可正常继续。';
 if(status==='updating')return '正在后台整理记忆…';
 return '自动记忆已开启；关闭本页后继续。'+(updatedAt?'最近更新：'+new Date(updatedAt).toLocaleString('zh-CN'):'新聊天中的重要信息会逐步记录。');
}
async function reload(){
 if(busy)return;const sequence=++readSequence;resetClear();ready(false);
 try{const s=await call('state');if(sequence!==readSequence)return;display(s);$('status').textContent='已读取保存的设置与记录。';}
 catch(e){if(sequence===readSequence)$('status').textContent=e.message;}
}
$('reload').onclick=reload;
$('save').onclick=async()=>{
 if(!loaded||busy)return;busy=true;++readSequence;resetClear();controls();
 try{const s=await call('save',{apiKey:$('key').value,prompt:$('prompt').value,memory:$('memory').value,autoMemoryEnabled:$('autoMemory').checked,revision});$('key').value='';display(s);$('status').textContent='设置与长期记忆已保存。';}
 catch(e){ready(false);$('status').textContent=e.message;}
 finally{busy=false;controls();}
};
$('includeBackup').onchange=resetClear;$('clearMemory').onchange=resetClear;
$('clear').onclick=async()=>{
 if(!loaded||busy)return;
 if(!armed){armed=true;$('clear').textContent='再次点击确认清空';$('status').textContent='将清空近期聊天'+($('includeBackup').checked?'及上一版本备份中的聊天':'（保留上一版本备份）')+($('clearMemory').checked?'，并清空长期记忆':'，保留长期记忆')+'。';return;}
 busy=true;++readSequence;controls();
 try{display(await call('clear',{revision,includeBackup:$('includeBackup').checked,clearMemory:$('clearMemory').checked}));$('status').textContent='已按所选范围清空。';}
 catch(e){ready(false);$('status').textContent=e.message;}
 finally{resetClear();busy=false;controls();}
};
$('copyHistory').onclick=async()=>{if(!loaded||busy)return;try{await call('copyHistory');$('status').textContent='当前聊天记录已复制到剪贴板。';}catch(e){$('status').textContent=e.message;}};
$('voicePreview').onclick=async()=>{const b=$('voicePreview');b.disabled=true;try{$('voiceStatus').textContent='正在准备试听…';const r=await call('previewVoice');$('voiceStatus').textContent=r.stopped?'试听已停止或当前已静音。':'试听完成。';}catch(e){$('voiceStatus').textContent=e.message;}finally{b.disabled=false;}};
reload();
