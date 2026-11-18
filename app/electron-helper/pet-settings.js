const $=id=>document.getElementById(id);
const S=window.PetShared||{};
let armed=false,revision,loaded=false,busy=false,readSequence=0,currentState=null,uiLang='zh-CN';
const I18N={
 'zh-CN':{
  title:'蓝鲸女仆 · 设置与记录',
  heading:'设置与聊天记录',
  languageLabel:'语言 / 言語',
  langAuto:'跟随系统',
  apiKeyLabel:'DeepSeek API Key',
  promptLabel:'聊天人设',
  autoMemoryLabel:'让她自动整理长期记忆',
  memoryLabel:'长期记忆',
  memoryPlaceholder:'她会从你之后的聊天里记住稳定的称呼、偏好和约定；你也可以在这里修改。',
  memoryDesc1:'开启后通常每 4 轮或空闲 2 分钟后台整理；说“记住”“忘掉”“别记这个”会优先处理。整理会额外调用 DeepSeek 并产生费用；记忆也会随聊天发送。密码、验证码等不自动记录，仍可能误记，请随时纠正。',
  memoryDesc2:'本页打开时暂停后台整理，关闭后继续。修改或删除后保存，旧的待处理聊天不会再把它恢复；需要清理最近对话和备份时使用下面的清空选项。',
  saveBtn:'保存设置与记忆',
  reloadBtn:'重新读取',
  historyTitle:'最近聊天记录',
  historyNote:'最多保留最近 80 条消息。重新读取可刷新记录；记录不会包含 API 密钥。',
  copyBtn:'复制聊天记录',
  clearSummary:'清空记录',
  clearDesc:'清空近期记录会重置后续对话上下文，并丢弃旧的待整理内容。默认保留上一版本备份，便于恢复。',
  includeBackupLabel:'同时清空上一版本备份中的聊天记录',
  clearMemoryLabel:'同时清空长期记忆',
  clearScopeNote:'此操作只处理当前配置及勾选的上一版本备份，不会删除你另外导出的文件。',
  clearBtn:'清空聊天记录',
  clearConfirmBtn:'再次点击确认清空',
  voiceSummary:'本地声音',
  voiceDesc:'当前音色：原版 B · 温柔甜糯（本地 Base）。声音开关在人物右键菜单。',
  voicePreviewBtn:'试听当前音色',
  keySaved:'已保存；留空保留原密钥',
  keyMissing:'填写 DeepSeek API Key',
  countFmt:n=>'（'+n+' 条）',
  userLabel:'我',
  petLabel:'蓝鲸女仆',
  incompleteSuffix:'\n（回复未完整结束）',
  memOff:'自动记忆已关闭，已有记忆仍用于聊天。',
  memError:'上次自动整理未完成，会稍后重试；聊天可正常继续。',
  memUpdating:'正在后台整理记忆…',
  memOnPrefix:'自动记忆已开启；关闭本页后继续。',
  memUpdatedPrefix:'最近更新：',
  memAutoHint:'新聊天中的重要信息会逐步记录。',
  reloaded:'已读取保存的设置与记录。',
  saved:'设置与长期记忆已保存。',
  clearPrompt:(b,m)=>'将清空近期聊天'+(b?'及上一版本备份中的聊天':'（保留上一版本备份）')+(m?'，并清空长期记忆':'，保留长期记忆')+'。',
  cleared:'已按所选范围清空。',
  copied:'当前聊天记录已复制到剪贴板。',
  voicePreparing:'正在准备试听…',
  voiceMutedOrStopped:'试听已停止或当前已静音。',
  voiceDone:'试听完成。'
 },
 ja:{
  title:'ブルークジラメイド · 設定と履歴',
  heading:'設定とチャット履歴',
  languageLabel:'表示・会話の言語 / 语言',
  langAuto:'システムに従う',
  apiKeyLabel:'DeepSeek API Key',
  promptLabel:'キャラクター設定（プロンプト）',
  autoMemoryLabel:'長期記憶を自動で整理する',
  memoryLabel:'長期記憶',
  memoryPlaceholder:'今後の会話から呼び名・好み・約束などを自動で覚えます。ここで直接編集もできます。',
  memoryDesc1:'オンにすると通常 4 ターンごと、または 2 分間の待機後にバックグラウンドで整理されます。「覚えて」「忘れて」「これ覚えないで」は優先処理されます。整理には追加の DeepSeek API 呼び出しと料金が発生し、記憶は毎回の会話に送信されます。パスワード等は自動記録されませんが、誤記があればいつでも修正できます。',
  memoryDesc2:'この画面を開いている間は自動整理を一時停止し、閉じると再開します。編集・削除して保存すると、処理待ちの古い会話から復元されなくなります。履歴やバックアップの削除は下の「履歴をクリア」を使用してください。',
  saveBtn:'設定と記憶を保存',
  reloadBtn:'再読み込み',
  historyTitle:'最近のチャット履歴',
  historyNote:'直近 80 件まで保持されます。「再読み込み」で更新できます。APIキーは含まれません。',
  copyBtn:'履歴をコピー',
  clearSummary:'履歴をクリア',
  clearDesc:'最近の履歴をクリアすると会話コンテキストがリセットされ、未整理の待機データも破棄されます。通常は前回バックアップを保持します。',
  includeBackupLabel:'前回バックアップ内のチャット履歴も同時に削除する',
  clearMemoryLabel:'長期記憶も同時に削除する',
  clearScopeNote:'現在の設定ファイルと選択したバックアップのみを対象とし、別途書き出したファイルは削除しません。',
  clearBtn:'チャット履歴をクリア',
  clearConfirmBtn:'もう一度押して確定',
  voiceSummary:'ローカル音声',
  voiceDesc:'現在の声質：オリジナル B · やさしく甘め（ローカル Base）。オン/オフはキャラクターの右クリックメニューから切り替えられます。',
  voicePreviewBtn:'現在の声を試聴',
  keySaved:'保存済み（変更しない場合は空欄）',
  keyMissing:'DeepSeek API Key を入力',
  countFmt:n=>'（'+n+' 件）',
  userLabel:'私',
  petLabel:'ブルークジラメイド',
  incompleteSuffix:'\n（返答が途中で終了しました）',
  memOff:'自動記憶はオフです。既存の記憶は引き続き会話に使われます。',
  memError:'前回の自動整理が完了しませんでした。後ほど再試行します（会話は通常通り続けられます）。',
  memUpdating:'バックグラウンドで記憶を整理中…',
  memOnPrefix:'自動記憶はオンです（この画面を閉じると続行します）。',
  memUpdatedPrefix:'最終更新：',
  memAutoHint:'今後の会話から大切な情報が少しずつ記録されます。',
  reloaded:'保存された設定と履歴を読み込みました。',
  saved:'設定と長期記憶を保存しました。',
  clearPrompt:(b,m)=>'最近のチャット履歴'+(b?'および前回バックアップの履歴':'（前回バックアップは保持）')+(m?'と長期記憶をクリアします。':'をクリアします（長期記憶は保持）。'),
  cleared:'選択した範囲をクリアしました。',
  copied:'現在のチャット履歴をクリップボードにコピーしました。',
  voicePreparing:'試聴の準備中…',
  voiceMutedOrStopped:'試聴を停止したか、現在ミュートになっています。',
  voiceDone:'試聴が完了しました。'
 }
};
const resolveLang=pref=>S.resolveLanguage?S.resolveLanguage(pref):(pref==='ja'?'ja':'zh-CN');
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
 $('memory').placeholder=t.memoryPlaceholder;
 $('save').textContent=t.saveBtn;
 $('reload').textContent=t.reloadBtn;
 $('copyHistory').textContent=t.copyBtn;
 $('clear').textContent=armed?t.clearConfirmBtn:t.clearBtn;
 $('voicePreview').textContent=t.voicePreviewBtn;
 $('history').setAttribute('aria-label',t.historyTitle);
 if(currentState){
  $('memoryStatus').textContent=memoryStatus(currentState.memoryStatus,currentState.memoryUpdatedAt);
  $('key').placeholder=currentState.hasKey?t.keySaved:t.keyMissing;
  $('historyCount').textContent=t.countFmt(currentState.messages.length);
  $('history').value=currentState.messages.map(m=>(m.role==='user'?t.userLabel:t.petLabel)+'：\n'+m.content+(m.incomplete?t.incompleteSuffix:'')).join('\n\n');
 }
}
async function call(name,arg){const r=await window.petSettings[name](arg);if(!r.ok)throw Error(r.error);return r.data;}
function controls(){for(const id of ['language','save','clear','copyHistory','includeBackup','clearMemory','prompt','memory','autoMemory','key'])$(id).disabled=!loaded||busy;$('reload').disabled=busy;}
function ready(value){loaded=value;controls();}
function resetClear(){armed=false;$('clear').textContent=L().clearBtn;}
function display(s){
 currentState=s;
 revision=s.revision;$('language').value=s.language||'auto';$('prompt').value=s.prompt;$('memory').value=s.memory||'';
 $('autoMemory').checked=s.autoMemoryEnabled!==false;
 applyUiLanguage(s.resolvedLanguage||resolveLang($('language').value));
 resetClear();ready(true);
}
function memoryStatus(status,updatedAt){
 const t=L();
 if(!$('autoMemory').checked)return t.memOff;
 if(status==='error')return t.memError;
 if(status==='updating')return t.memUpdating;
 return t.memOnPrefix+(updatedAt?t.memUpdatedPrefix+new Date(updatedAt).toLocaleString(uiLang):t.memAutoHint);
}
async function reload(){
 if(busy)return;const sequence=++readSequence;resetClear();ready(false);
 try{const s=await call('state');if(sequence!==readSequence)return;display(s);$('status').textContent=L().reloaded;}
 catch(e){if(sequence===readSequence)$('status').textContent=e.message;}
}
$('language').onchange=()=>{applyUiLanguage(resolveLang($('language').value));};
$('reload').onclick=reload;
$('save').onclick=async()=>{
 if(!loaded||busy)return;busy=true;++readSequence;resetClear();controls();
 try{const s=await call('save',{language:$('language').value,apiKey:$('key').value,prompt:$('prompt').value,memory:$('memory').value,autoMemoryEnabled:$('autoMemory').checked,revision});$('key').value='';display(s);$('status').textContent=L().saved;}
 catch(e){ready(false);$('status').textContent=e.message;}
 finally{busy=false;controls();}
};
$('includeBackup').onchange=resetClear;$('clearMemory').onchange=resetClear;
$('clear').onclick=async()=>{
 if(!loaded||busy)return;
 const t=L();
 if(!armed){armed=true;$('clear').textContent=t.clearConfirmBtn;$('status').textContent=t.clearPrompt($('includeBackup').checked,$('clearMemory').checked);return;}
 busy=true;++readSequence;controls();
 try{display(await call('clear',{revision,includeBackup:$('includeBackup').checked,clearMemory:$('clearMemory').checked}));$('status').textContent=L().cleared;}
 catch(e){ready(false);$('status').textContent=e.message;}
 finally{resetClear();busy=false;controls();}
};
$('copyHistory').onclick=async()=>{if(!loaded||busy)return;try{await call('copyHistory');$('status').textContent=L().copied;}catch(e){$('status').textContent=e.message;}};
$('voicePreview').onclick=async()=>{const b=$('voicePreview');b.disabled=true;try{$('voiceStatus').textContent=L().voicePreparing;const r=await call('previewVoice');$('voiceStatus').textContent=r.stopped?L().voiceMutedOrStopped:L().voiceDone;}catch(e){$('voiceStatus').textContent=e.message;}finally{b.disabled=false;}};
reload();
