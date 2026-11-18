const $=id=>document.getElementById(id);
const S=window.PetShared||{};
let busy=false, current=null, clearArmed=false, uiLang='zh-CN';
const I18N={
 'zh-CN':{
  title:'蓝鲸女仆 · 对话',
  petName:'蓝鲸女仆',
  subtitle:'陪你聊一会儿',
  settingsBtn:'设置',
  languageLabel:'语言 / 言語',
  langAuto:'跟随系统',
  apiKeyLabel:'DeepSeek API Key',
  promptLabel:'聊天人设',
  saveBtn:'保存设置',
  clearBtn:'清空聊天记录',
  clearConfirmBtn:'确定清空？再点一次',
  msgPlaceholder:'说点什么吧…',
  msgAria:'输入消息',
  historyAria:'聊天记录',
  enterHint:'Enter 发送 · Shift+Enter 换行',
  sendBtn:'发送',
  stopBtn:'停止',
  emptyText:'我在这里。\n今天想聊些什么？',
  userSpeaker:'你',
  keySavedHint:'密钥已加密保存；留空可继续使用。',
  keyMissingHint:'密钥仅保存在本机，使用系统加密。',
  keySavedPh:'已保存；更换时填写新密钥',
  keyMissingPh:'填写你的 DeepSeek API Key',
  savedWithKey:'设置已保存，可以开始聊天了。',
  savedNoKey:'人设已保存，还需要填写 API Key。',
  cleared:'聊天记录已清空。',
  needKey:'请先填写 DeepSeek API Key。',
  replying:'正在回复…',
  firstKeyHint:'填写一次密钥，以后直接聊天。'
 },
 ja:{
  title:'ブルークジラメイド · 会話',
  petName:'ブルークジラメイド',
  subtitle:'少しお話ししませんか',
  settingsBtn:'設定',
  languageLabel:'表示・会話の言語 / 语言',
  langAuto:'システムに従う',
  apiKeyLabel:'DeepSeek API Key',
  promptLabel:'キャラクター設定（プロンプト）',
  saveBtn:'設定を保存',
  clearBtn:'履歴をクリア',
  clearConfirmBtn:'本当にクリアしますか？もう一度押す',
  msgPlaceholder:'何か話してみて…',
  msgAria:'メッセージを入力',
  historyAria:'チャット履歴',
  enterHint:'Enter で送信 · Shift+Enter で改行',
  sendBtn:'送信',
  stopBtn:'停止',
  emptyText:'私はここにいますよ。\n今日はどんなお話をしましょうか？',
  userSpeaker:'あなた',
  keySavedHint:'APIキーは暗号化して保存済みです（変更しない場合は空欄でOK）。',
  keyMissingHint:'APIキーはこの端末内にシステム暗号化で安全に保存されます。',
  keySavedPh:'保存済み（変更時のみ入力）',
  keyMissingPh:'DeepSeek API Key を入力してください',
  savedWithKey:'設定を保存しました。お話を始められます！',
  savedNoKey:'設定を保存しました。続けて API Key を入力してください。',
  cleared:'チャット履歴をクリアしました。',
  needKey:'先に DeepSeek API Key を入力してください。',
  replying:'お返事を考えています…',
  firstKeyHint:'一度 APIキーを登録すれば、そのまま会話を楽しめます。'
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
 $('settingsButton').textContent=t.settingsBtn;
 $('save').textContent=t.saveBtn;
 $('clear').textContent=clearArmed?t.clearConfirmBtn:t.clearBtn;
 $('message').placeholder=t.msgPlaceholder;
 $('message').setAttribute('aria-label',t.msgAria);
 $('messages').setAttribute('aria-label',t.historyAria);
 $('enterHint').textContent=t.enterHint;
 $('send').textContent=t.sendBtn;
 $('stop').textContent=t.stopBtn;
 if(current){keyHint();renderMessages(current);}
}
function status(text){$('status').textContent=text;}
async function call(name,arg){const r=await window.simpleChat[name](arg);if(!r.ok)throw new Error(r.error);return r.data;}
function renderMessages(state){
 const t=L(), list=$('messages');list.replaceChildren();
 if(!state.messages.length){const e=document.createElement('div');e.className='empty';e.textContent=t.emptyText;list.append(e);}
 for(const message of state.messages){const b=document.createElement('div');b.className='bubble '+message.role;const who=document.createElement('div');who.className='speaker';who.textContent=message.role==='user'?t.userSpeaker:t.petName;const text=document.createElement('div');text.textContent=message.content;b.append(who,text);list.append(b);}
 list.scrollTop=list.scrollHeight;
}
function render(state){
 current=state;
 $('language').value=state.language||'auto';
 applyUiLanguage(state.resolvedLanguage||resolveLang($('language').value));
}
function setBusy(value){busy=value;$('send').hidden=value;$('stop').hidden=!value;for(const id of ['language','save','clear','message'])$(id).disabled=value;}
function keyHint(){ const t=L(); $('keyHint').textContent=current.hasKey?t.keySavedHint:t.keyMissingHint;$('apiKey').placeholder=current.hasKey?t.keySavedPh:t.keyMissingPh; }
$('language').onchange=()=>{applyUiLanguage(resolveLang($('language').value));};
$('settingsButton').onclick=()=>{$('settings').hidden=!$('settings').hidden;};
$('save').onclick=async()=>{try{const state=await call('save',{language:$('language').value,apiKey:$('apiKey').value,prompt:$('prompt').value});$('apiKey').value='';$('prompt').value=state.prompt;render(state);keyHint();status(state.hasKey?L().savedWithKey:L().savedNoKey);if(state.hasKey)$('settings').hidden=true;}catch(e){status(e.message);}};
$('clear').onclick=async()=>{const t=L();if(!clearArmed){clearArmed=true;$('clear').textContent=t.clearConfirmBtn;return;}try{render(await call('clear'));status(t.cleared);}catch(e){status(e.message);}clearArmed=false;$('clear').textContent=L().clearBtn;};
$('composer').onsubmit=async e=>{e.preventDefault();if(busy)return;const text=$('message').value.trim();if(!text)return;if(!current?.hasKey){$('settings').hidden=false;status(L().needKey);$('apiKey').focus();return;}setBusy(true);status(L().replying);try{render(await call('send',text));$('message').value='';status('');}catch(e){status(e.message);}finally{setBusy(false);$('message').focus();}};
$('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}};
$('stop').onclick=async()=>{try{await call('cancel');}catch(e){status(e.message);}};
(async()=>{try{render(await call('state'));$('prompt').value=current.prompt;keyHint();if(!current.hasKey){$('settings').hidden=false;status(L().firstKeyHint);}}catch(e){status(e.message);$('send').disabled=true;}})();
