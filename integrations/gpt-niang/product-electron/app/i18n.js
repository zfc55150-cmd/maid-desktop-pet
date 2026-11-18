(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.GptNiangI18n=api;
})(globalThis,()=>{
 'use strict';

 const SUPPORTED_LANGUAGES=Object.freeze(['auto','zh-CN','ja']);
 const EFFECTIVE_LANGUAGES=Object.freeze(['zh-CN','ja']);
 const DEFAULT_LANGUAGE='auto';

 const JA_FONT_FALLBACK="'Yu Gothic UI','Meiryo','BIZ UDPGothic','Hiragino Kaku Gothic ProN','Segoe UI',sans-serif";
 const ZH_UI_FONT="'Microsoft YaHei UI','Segoe UI',sans-serif";
 const ZH_BUBBLE_FONT="'ShangshouSoftCandy','Yuanti SC','YouYuan','幼圆','Comic Sans MS','PingFang SC','Microsoft YaHei',sans-serif";
 const JA_BUBBLE_FONT="'ShangshouSoftCandy','Yu Gothic UI','Meiryo','BIZ UDPGothic','Hiragino Kaku Gothic ProN','Segoe UI',sans-serif";

 function normalizeLanguageTag(tag){
  if(typeof tag!=='string')return null;
  const lower=tag.trim().toLowerCase();
  if(!lower)return null;
  if(lower==='auto')return 'auto';
  if(lower==='ja'||lower.startsWith('ja-')||lower.startsWith('ja_'))return 'ja';
  if(lower==='zh'||lower.startsWith('zh-')||lower.startsWith('zh_'))return 'zh-CN';
  return null;
 }

 function detectSystemLanguage({env=(typeof process!=='undefined'&&process.env)||{},systemLocale=null,navigatorObj=(typeof navigator!=='undefined'?navigator:null)}={}){
  const candidates=[
   env?.GPT_NIANG_LANG,
   env?.LC_ALL,
   env?.LC_MESSAGES,
   env?.LANG,
   ...(typeof env?.LANGUAGE==='string'?env.LANGUAGE.split(':'):[]),
   systemLocale,
   ...(Array.isArray(navigatorObj?.languages)?navigatorObj.languages:[]),
   navigatorObj?.language
  ];
  for(const candidate of candidates){
   const norm=normalizeLanguageTag(candidate);
   if(norm==='ja'||norm==='zh-CN')return norm;
  }
  try{
   const intlLocale=Intl.DateTimeFormat().resolvedOptions().locale;
   const norm=normalizeLanguageTag(intlLocale);
   if(norm==='ja'||norm==='zh-CN')return norm;
  }catch{}
  return 'zh-CN';
 }

 function resolveLanguage(language,options){
  const norm=normalizeLanguageTag(language);
  if(norm==='ja'||norm==='zh-CN')return norm;
  return detectSystemLanguage(options);
 }

 function intlLocale(language,options){
  return resolveLanguage(language,options)==='ja'?'ja-JP':'zh-CN';
 }

 function fontStack(language,kind='ui',options){
  const ja=resolveLanguage(language,options)==='ja';
  if(kind==='bubble')return ja?JA_BUBBLE_FONT:ZH_BUBBLE_FONT;
  return ja?JA_FONT_FALLBACK:ZH_UI_FONT;
 }

 const ACTION_GROUP_MAP=Object.freeze({
  '待机':'待機',
  '转向':'向き変更',
  '拖拽':'ドラッグ',
  '点击回应':'クリック反応',
  '移动':'移動',
  '小动作':'仕草',
  '玩耍':'遊び',
  '吃什么':'おやつ・お茶',
  '工作状态':'作業ステータス',
  '其他动作':'その他のアクション'
 });

 const ACTION_LABEL_MAP=Object.freeze({
  frontidle:'正面立ち',
  brelaxed:'横向き立ち',
  idle:'ロングドレス立ち',
  idlesway:'リラックス揺れ',
  turnfront:'正面を向く',
  turnside:'正面から横向き',
  poserelax:'ドレスから横向き',
  flutter:'ぶら下がりバタバタ',
  happy:'嬉しそうに笑う',
  wave:'振り返って手を振る',
  response:'横向きで返事',
  complimentavert:'褒められてチラ見',
  cheekpuff:'ぷくっと頬ふくらまし',
  tickledodge:'くすぐり回避ステップ',
  walking:'その場歩き',
  cbrushfringe:'前髪を整える',
  chandsrest:'両手をそっと合わせる',
  cnoticeuser:'こっそり横目',
  csmallweightsettle:'ちょっと体重移動',
  csoftbreathblink:'そっとまばたき',
  csuppressedyawn:'あくびを噛み殺す',
  ctailtipsettle:'尻尾の先がゆらり',
  sleeveside:'袖口を整える',
  footrelax:'片足を上げてリラックス',
  weightshift:'足を踏み換える',
  lookaround:'振り返ってキョロキョロ',
  sleeping:'うたた寝',
  stretching:'横向きストレッチ',
  bow:'胸に手を当てお辞儀',
  proudarms:'腕組みドヤ顔',
  confusedquiet:'横向きで首かしげ',
  frontpose:'正面ポーズ',
  flutterplay:'軽やかに羽ばたく',
  skirtbeat:'スカートつまんでステップ',
  bodybalance:'髪と体のバランス揺れ',
  fanmishap:'扇子ひらりハプニング',
  lanterninvite:'提灯で案内',
  dragonflame:'竜炎うっかり暴走',
  stargift:'星屑の竜息ギフト',
  mirroradmire:'手鏡でうっとり',
  scrollcatch:'巻物キャッチ',
  tea:'お茶をひと口',
  thinking:'頬杖ついて考え中',
  confused:'首かしげお手上げ',
  gentlereminder:'そっとリマインド',
  challengeaccept:'挑戦を受ける'
 });

 const ACTION_QUOTES_JA=Object.freeze({
  happy:'ふ、ふんっ、あんたがそこまで言うなら、特別に笑ってあげてもいいわよ？',
  wave:'私が手を振ってるのに気づかない気？まったく、しょうがないわね。',
  response:'なに用よ？……ずっと見てたこと、バレてないわよね？',
  complimentavert:'べ、別にお世辞なんか嬉しくないし！……ほ、ほんとだからねっ！',
  cheekpuff:'むぅ……この竜娘をからかうのもいい加減にしなさいよっ！',
  tickledodge:'ひゃっ！？そこはくすぐったいってば、やめなさいよぉ！',
  walking:'ちょっと体をほぐすわよ。ずっと画面を見てるあんたも疲れるでしょ？',
  cbrushfringe:'髪型が乱れるわけにいかないでしょ、ツンデレ竜娘の基本のたしなみなんだから。',
  chandsrest:'静かにそばにいてあげるのも……まあ、嫌いじゃないわよ。',
  cnoticeuser:'今、こっそり私のこと見てたでしょ？バッチリ捕まえたんだから！',
  csuppressedyawn:'ふわぁ……ね、眠くなんかないし！まだまだ付き合ってあげるわよ！',
  ctailtipsettle:'尻尾が揺れてるのはただの気まぐれよ、機嫌がいいわけじゃないんだからっ！',
  sleeping:'ちょっとだけお昼寝……用があったら起こしなさいよね……すぅ……',
  stretching:'ん〜っ！あんたも座りっぱなしなんだから、肩と首くらい伸ばしなさいよ！',
  bow:'ごきげんよう♪ 今日もせいぜいよろしく頼むわよ。',
  proudarms:'ふふん、この竜娘がついてるんだから、今日の作業効率は二倍確定ね！',
  confusedquiet:'ん？さっきのって、どういう意味なのかしら……',
  frontpose:'どう？この立ち姿、なかなか凛々しくて迫力あるでしょ？',
  flutterplay:'たまには竜の翼をちょっと広げて、空気の入れ替えをしないとね〜',
  skirtbeat:'リズムに合わせてゆらゆらしてたら、なんだか気分も上がってきたわ♪',
  bodybalance:'ふぅ〜、バランスを保つのは意外とテクニックがいるのよ！',
  fanmishap:'きゃっ！扇子が滑りそうになったじゃない……今の、何も見てないわよね！？',
  lanterninvite:'夜が暗くなっても怖がらないで、私が提灯で道を照らしてあげるから♪',
  dragonflame:'うわっ！竜炎がちょっとだけ出すぎちゃった……早く吹き消して、早くっ！',
  stargift:'星屑を紡いだこの竜息、特別にあんたへのプレゼントにしてあげる✨',
  mirroradmire:'うふん、今日のツノも髪飾りも完璧すぎるわね！',
  scrollcatch:'キャッチ成功！これしきのこと、私にかかれば朝飯前なんだから〜',
  tea:'まずは温かいお茶で喉を潤しなさい。あんたもちゃんと水分補給して休憩するのよ？',
  thinking:'むむ……この難問、この竜娘が一緒に知恵を絞ってあげるわ。',
  confused:'えっ？これはさすがに私でもちょっと不思議だわ……',
  gentlereminder:'ねぇ、だいぶ頑張り続けてるでしょ？少し息抜きしなさい、倒れたら困るんだから。',
  challengeaccept:'どんと来なさい！その程度の挑戦、この竜娘が受けて立ってあげるっ！'
 });

 const DEFAULT_QUOTES_JA=Object.freeze([
  'べ、別にあんたのために待ってたわけじゃないんだからねっ！……でも、そばにいてあげてもいいわよ？',
  'ちゃんと作業進んでる？サボってないか、この竜娘が見張ってるんだから！',
  '疲れたら少し休みなさいよね。倒れられたら私が困るんだから……べ、別に心配してるわけじゃないし！'
 ]);

 const QUOTA_LABEL_JA=Object.freeze({
  '5小时':'5時間',
  '每周':'週間',
  '每月':'月間',
  '个人额度':'個人枠',
  '额度':'クレジット'
 });

 const MESSAGES=Object.freeze({
  'zh-CN':{
   'desktop.title':'桌宠',
   'desktop.trayTooltip':'桌宠',
   'desktop.defaultCharacterName':'ChatGPT 傲娇龙娘',
   'desktop.defaultQuote':'我在这里陪着你。',
   'desktop.taskCompletionText':'Codex\n有回复已结束',
   'menu.windowTitle':'功能菜单',
   'menu.ariaLabel':'人物功能',
   'menu.toggleForm':'切换形态',
   'menu.resize':'调整大小',
   'menu.actions':'动作',
   'menu.moreSettings':'更多设置',
   'menu.reloadConfig':'重载配置',
   'menu.quit':'退出',
   'dialog.importCharacterTitle':'导入本地形象',
   'dialog.pngFilter':'PNG图片',
   'dialog.importAudioTitle':'导入5秒以内WAV短音效',
   'dialog.wavFilter':'WAV音效',
   'notice.preferencesChanged':'设置已在别处修改，输入已保留。请先重新读取再保存。',
   'notice.actionFailed':'操作未能完成，请重新读取并核对设置。',
   'notice.observersFailed':'任务观察暂不可用，人物与设置仍可使用。',
   'notice.safeMode':'动画配置异常，已进入静态安全模式。请检查或重新加载配置。',
   'notice.manifestFallback':'当前动画配置异常，已自动回退至上一次可用配置。',
   'notice.configFallback':'未找到外部配置或配置不可读，已回退至默认设置。',
   'codex.noConfig':'缺少安装配置，暂时无法连接 Codex',
   'codex.noCli':'未找到本地 Codex 客户端或 CLI，请先安装 Codex 后重试。',
   'codex.loginFailed':'未能启动 Codex 登录窗口，请手动打开 Codex 登录后点击刷新。',
   'speech.title':'文字卡片',
   'speech.codexPrefix':'Codex · ',
   'speech.remainingAmount':'余额 {remaining}/{total}',
   'speech.usedPct':'已用 {used}%',
   'speech.resetAt':'重置 {time}',
   'speech.noQuotaFallback':'未连接 Codex 或额度暂不可读，右键设置可连接。',
   'sizePanel.title':'调整大小',
   'sizePanel.heading':'调整人物大小',
   'sizePanel.intro':'拖动滑块选择大小，保存后立即生效。',
   'sizePanel.label':'人物大小',
   'sizePanel.minEnd':'小 · 48%',
   'sizePanel.maxEnd':'大 · 175%',
   'sizePanel.height':'人物高度约 {px} 像素',
   'sizePanel.menuKeep':'菜单大小保持',
   'sizePanel.hint':'100% 为默认大小。调整人物不会缩小右键菜单和文字卡片；位置会以脚底为基准保持。',
   'sizePanel.reset':'默认 100%',
   'sizePanel.reload':'重新读取',
   'sizePanel.save':'保存并应用',
   'sizePanel.status.loading':'正在读取…',
   'sizePanel.status.readonly':'设置暂时无法写入，修复后可点击重新读取。',
   'sizePanel.status.dirty':'点击“保存并应用”后生效。',
   'sizePanel.status.reloaded':'已重新读取当前大小。',
   'sizePanel.status.reloadFailed':'暂时无法读取，请稍后重试。',
   'sizePanel.status.conflict':'大小已在别处修改，输入已保留，请先重新读取。',
   'sizePanel.status.saveFailed':'暂未保存，请重新读取后重试。',
   'sizePanel.status.saved':'已保存，人物大小已立即应用。',
   'sizePanel.status.saveCatch':'暂未保存，请重试。',
   'sizePanel.status.loaded':'已读取当前大小。',
   'sizePanel.status.initFailed':'读取失败，请关闭后重试。',
   'panel.title':'设置',
   'panel.railHeading':'桌面陪伴',
   'panel.navAriaLabel':'功能分区',
   'panel.tab.quota':'Codex 与用量',
   'panel.tab.settings':'外观与交互',
   'panel.tab.quotes':'我的语录',
   'panel.tab.characters':'形象图库',
   'panel.status.loading':'正在读取…',
   'panel.page.quota.title':'Codex 与用量',
   'panel.page.quota.desc':'连接 Codex，查看套餐余额、额度窗口与当前任务。',
   'panel.page.settings.title':'外观与交互',
   'panel.page.settings.desc':'调整人物大小、窗口和陪伴方式。',
   'panel.page.quotes.title':'我的语录',
   'panel.page.quotes.desc':'把想听的话留在这里。',
   'panel.page.characters.title':'形象图库',
   'panel.page.characters.desc':'选择你喜欢的陪伴形象。',
   'panel.codex.heading':'Codex 连接',
   'panel.codex.checking':'检测中',
   'panel.codex.checkingSummary':'正在检测本地 Codex 连接状态…',
   'panel.codex.refreshConnect':'连接并刷新额度',
   'panel.codex.refresh':'刷新额度',
   'panel.codex.recheck':'重新检测连接',
   'panel.codex.loginBtn':'登录 / 切换 ChatGPT 账号',
   'panel.codex.auth.tokens':'ChatGPT 令牌',
   'panel.codex.auth.chatgpt':'ChatGPT 订阅账号',
   'panel.codex.auth.apiKey':'API Key 模式',
   'panel.codex.auth.connected':'ChatGPT（已连接）',
   'panel.codex.auth.none':'未登录',
   'panel.codex.state.connected':'已连接',
   'panel.codex.state.cached':'已连接 · 待刷新',
   'panel.codex.state.needLogin':'需登录 ChatGPT',
   'panel.codex.state.missing':'未检测到 Codex',
   'panel.codex.state.off':'未连接',
   'panel.codex.unknownPlan':'未知套餐',
   'panel.codex.readySuffix':' · 本地 Codex 已就绪',
   'panel.codex.summary.connected':'套餐：{plan} · 登录方式：{auth}{ready}',
   'panel.codex.summary.cached':'套餐：{plan} · {msg}',
   'panel.codex.summary.cachedDefault':'当前显示缓存用量，可点击刷新重新读取。',
   'panel.codex.summary.needLogin':'当前为 API Key 或未登录状态，请点击下方“登录 / 切换 ChatGPT 账号”完成连接。',
   'panel.codex.summary.missing':'未检测到本地 Codex 客户端或 CLI，请先安装 Codex 后再点击连接。',
   'panel.codex.summary.off':'点击“连接并刷新额度”读取当前 Codex 登录与订阅额度；如未登录，可先登录 ChatGPT 账号。',
   'panel.quota.heading':'余额与用量',
   'panel.quota.empty':'暂时没有可显示的额度窗口。点击上方「连接并刷新额度」获取最新余额与用量。',
   'panel.quota.detailAmount':'剩余 {rem} / {total}（已用 {used}）',
   'panel.quota.detailPct':'已用 {used}% · 剩余 {rem}%',
   'panel.quota.resetAt':'重置：{time}',
   'panel.quota.resetPending':'重置时间待更新',
   'panel.quota.observedAt':'最近读取 {time}',
   'panel.quota.notObserved':'尚未读取',
   'panel.quota.staleSuffix':' · {msg}',
   'panel.quota.staleDefault':'暂时无法刷新，保留已有数据',
   'panel.task.heading':'任务状态',
   'panel.task.desc':'她会跟随任务进入思考、工作或等待状态。',
   'panel.task.pauseObservers':'暂停任务观察',
   'panel.task.resumeObservers':'恢复任务观察',
   'panel.railPhase.idle':'陪伴中',
   'panel.railPhase.working':'工作中',
   'panel.railPhase.thinking':'思考中',
   'panel.railPhase.waiting':'等待操作',
   'panel.railPhase.happy':'任务完成',
   'panel.railPhase.confused':'稍作休息',
   'panel.taskPhase.idle':'空闲',
   'panel.taskPhase.working':'工作中',
   'panel.taskPhase.thinking':'思考中',
   'panel.taskPhase.waiting':'等待操作',
   'panel.taskPhase.happy':'刚刚完成',
   'panel.taskPhase.confused':'遇到暂时问题',
   'panel.lang.label':'界面语言',
   'panel.lang.auto':'跟随系统',
   'panel.lang.zhCN':'简体中文',
   'panel.lang.ja':'日本語',
   'panel.settings.formSection':'形态与大小',
   'panel.settings.formLabel':'显示形态',
   'panel.settings.formFull':'全身',
   'panel.settings.formBust':'半身',
   'panel.settings.scaleLabel':'人物大小',
   'panel.settings.bubbleScaleLabel':'文字卡片大小',
   'panel.settings.windowSection':'窗口与点击',
   'panel.settings.topmost':'桌面置顶',
   'panel.settings.topmostSub':'让人物保持在其他窗口上方',
   'panel.settings.touch':'触摸反馈',
   'panel.settings.clickCards':'大形态点击显示额度和语录',
   'panel.settings.bustClickCards':'小形态点击显示额度和语录',
   'panel.settings.bustClickCardsSub':'自动语录和任务提醒可在下方分别设置',
   'panel.settings.hideMenu':'隐藏文字卡片菜单按钮',
   'panel.settings.actionSection':'动作与提醒',
   'panel.settings.dragonAnim':'播放人物动作',
   'panel.settings.dragonCodex':'任务动作反馈',
   'panel.settings.taskBubble':'任务完成时提醒',
   'panel.settings.autoQuote':'自动显示语录',
   'panel.settings.autoBubble':'半身自动语录',
   'panel.settings.quoteInterval':'语录间隔',
   'panel.settings.seconds':'秒',
   'panel.settings.soundSection':'点击声音',
   'panel.settings.soundOn':'开启短音效',
   'panel.settings.soundOnSub':'用于半身点击，全身保持静音',
   'panel.settings.soundVolume':'音量',
   'panel.settings.pressSound':'按下音效',
   'panel.settings.releaseSound':'松开音效',
   'panel.settings.builtinSound':'恢复内置',
   'panel.settings.colorSection':'配色',
   'panel.settings.colorMode':'人物配色',
   'panel.settings.colorOriginal':'原色',
   'panel.settings.colorLinked':'联动',
   'panel.settings.colorRainbow':'彩虹',
   'panel.settings.colorSurprise':'惊喜',
   'panel.settings.colorRare':'稀有',
   'panel.settings.colorSpecial':'特别',
   'panel.settings.colorMixed':'混合',
   'panel.settings.colorPaused':'暂停流动配色',
   'panel.settings.colorOdds':'概率设置',
   'panel.settings.colorChance':'人物变色概率',
   'panel.settings.colorTextChance':'文字变色概率',
   'panel.update.summary':'更新检查',
   'panel.update.releaseVersion':'发布版 {tag}',
   'panel.update.coreVersion':'本体 {version}',
   'panel.update.desc':'本仓库新版本只检查与提醒，不自动安装；上游 GPT-Niang 更新保持定制保护。',
   'panel.update.check':'检查更新',
   'panel.update.downloadDefault':'发现新版本 · 前往下载',
   'panel.update.downloadTag':'发现新版本 {tag} · 前往下载',
   'panel.update.automatic':'自动检查',
   'panel.update.checking':'本仓库新版本：正在检查 GitHub Release…',
   'panel.update.available':'本仓库新版本：发现新版本 {tag}',
   'panel.update.current':'本仓库新版本：已是最新版本（{tag}）',
   'panel.update.rateLimited':'本仓库新版本：{reason}',
   'panel.update.rateLimitedDefault':'GitHub 访问限流，请稍后再试',
   'panel.update.failed':'本仓库新版本：{reason}',
   'panel.update.failedDefault':'网络不可用，无法连接 GitHub Release',
   'panel.update.idle':'本仓库新版本：仅检查与提醒，不自动下载或改写程序',
   'panel.upstream.prefix':'上游 GPT-Niang 更新（定制保护）：',
   'panel.upstream.checking':'正在检查',
   'panel.upstream.current':'上游版本已核对',
   'panel.upstream.blocked':'发现上游更新，当前定制已保护',
   'panel.upstream.source':'源码目录请使用 Git 更新',
   'panel.upstream.portable':'便携版已关闭（防止自我改写）',
   'panel.upstream.rateLimited':'限流退避中',
   'panel.upstream.failedDefault':'检查未完成',
   'panel.upstream.default':'仅提示，保留当前定制',
   'panel.quotes.heading':'我的语录',
   'panel.quotes.desc':'每行一条，最多5000条，每条200字。',
   'panel.quotes.aria':'语录内容',
   'panel.quotes.save':'保存语录',
   'panel.quotes.show':'显示一条',
   'panel.quotes.triggersSummary':'特殊台词与配色',
   'panel.quotes.triggersDesc':'在“特别”和“惊喜”配色中，按这些台词触发。一行一句。',
   'panel.quotes.triggersAria':'特殊台词',
   'panel.quotes.saveTriggers':'保存特殊台词',
   'panel.characters.heading':'形象图库',
   'panel.characters.import':'导入图片',
   'panel.characters.desc':'使用默认龙娘，或导入本地 PNG 图片。',
   'panel.characters.defaultName':'默认龙娘',
   'panel.characters.inUse':'使用中',
   'panel.characters.use':'使用',
   'panel.footer.hintSave':'修改后点击保存',
   'panel.footer.hintLocal':'设置只保存在本机',
   'panel.footer.reload':'重新读取',
   'panel.footer.close':'关闭',
   'panel.footer.save':'保存设置',
   'panel.notice.saveFailed':'操作未完成，请重新读取设置后重试。',
   'panel.notice.saveCatch':'操作未保存，请检查设置是否被其他窗口更改后重试。',
   'panel.notice.saved':'设置已保存。',
   'panel.notice.reloaded':'已重新读取设置。',
   'panel.notice.refreshing':'正在连接 Codex 读取额度…',
   'panel.notice.refreshed':'Codex 额度已更新。',
   'panel.notice.refreshFailed':'暂时无法从 Codex 读取额度，请确认已在 Codex 中登录 ChatGPT 账号。',
   'panel.notice.loginStarted':'已打开 Codex 登录流程，请在浏览器完成 ChatGPT 登录后点击“刷新额度”。',
   'panel.notice.initFailed':'本地界面未能读取状态，请关闭面板后重试。',
   'panel.notice.languageChanged':'界面语言已更新。',
   'panel.notice.readonly':'设置文件暂时无法写入，已转为只读保护；修复后可点击“重新读取”。'
  },
  'ja':{
   'desktop.title':'デスクトップペット',
   'desktop.trayTooltip':'デスクトップペット',
   'desktop.defaultCharacterName':'ChatGPT ツンデレ竜娘',
   'desktop.defaultQuote':'ここにいるわよ。べ、別にあんたのために待ってたわけじゃないんだからねっ！',
   'desktop.taskCompletionText':'Codex\n応答が完了しました',
   'menu.windowTitle':'機能メニュー',
   'menu.ariaLabel':'キャラクター操作',
   'menu.toggleForm':'フォーム切替',
   'menu.resize':'サイズ調整',
   'menu.actions':'アクション',
   'menu.moreSettings':'詳細設定',
   'menu.reloadConfig':'設定を再読み込み',
   'menu.quit':'終了',
   'dialog.importCharacterTitle':'ローカル画像を読み込む',
   'dialog.pngFilter':'PNG 画像',
   'dialog.importAudioTitle':'5秒以内の WAV 効果音を読み込む',
   'dialog.wavFilter':'WAV 効果音',
   'notice.preferencesChanged':'他の画面で設定が変更されました（入力は保持されています）。先に「再読み込み」してから保存してください。',
   'notice.actionFailed':'操作を完了できませんでした。設定を再読み込みして確認してください。',
   'notice.observersFailed':'タスク監視を一時的に利用できません。キャラクターと設定は引き続き利用できます。',
   'notice.safeMode':'アニメーション設定に異常が見つかったため、静的セーフモードで起動しました。設定を確認して再読み込みしてください。',
   'notice.manifestFallback':'アニメーション設定に異常があるため、前回の正常な設定にフォールバックしました。',
   'notice.configFallback':'外部設定ファイルが見つからないか読み込めないため、デフォルト設定で起動しました。',
   'codex.noConfig':'インストール設定が見つからないため、Codex に接続できません',
   'codex.noCli':'ローカルの Codex クライアントまたは CLI が見つかりません。Codex をインストールしてから再試行してください。',
   'codex.loginFailed':'Codex のログイン画面を起動できませんでした。手動で Codex にログインしてから「更新」を押してください。',
   'speech.title':'テキストカード',
   'speech.codexPrefix':'Codex · ',
   'speech.remainingAmount':'残高 {remaining}/{total}',
   'speech.usedPct':'使用済み {used}%',
   'speech.resetAt':'リセット {time}',
   'speech.noQuotaFallback':'Codex 未接続、または利用枠を取得できません。右クリックの設定から接続できます。',
   'sizePanel.title':'サイズ調整',
   'sizePanel.heading':'キャラクターサイズ調整',
   'sizePanel.intro':'スライダーで大きさを選び、保存するとすぐ反映されます。',
   'sizePanel.label':'サイズ',
   'sizePanel.minEnd':'小 · 48%',
   'sizePanel.maxEnd':'大 · 175%',
   'sizePanel.height':'高さ 約 {px} px',
   'sizePanel.menuKeep':'メニューサイズはそのまま',
   'sizePanel.hint':'100% が標準サイズです。メニューやテキストカードは縮小されず、足元を基準に位置を維持します。',
   'sizePanel.reset':'標準 100%',
   'sizePanel.reload':'再読み込み',
   'sizePanel.save':'保存して適用',
   'sizePanel.status.loading':'読み込み中…',
   'sizePanel.status.readonly':'設定を書き込めません。修復後に「再読み込み」をお試しください。',
   'sizePanel.status.dirty':'「保存して適用」をクリックすると反映されます。',
   'sizePanel.status.reloaded':'現在のサイズを再読み込みしました。',
   'sizePanel.status.reloadFailed':'読み込めませんでした。しばらくしてから再試行してください。',
   'sizePanel.status.conflict':'他の画面で変更されました（入力は保持中）。先に「再読み込み」してください。',
   'sizePanel.status.saveFailed':'保存できませんでした。再読み込みして再試行してください。',
   'sizePanel.status.saved':'保存しました。サイズが即座に反映されました。',
   'sizePanel.status.saveCatch':'保存できませんでした。再試行してください。',
   'sizePanel.status.loaded':'現在のサイズを読み込みました。',
   'sizePanel.status.initFailed':'読み込みに失敗しました。閉じてやり直してください。',
   'panel.title':'設定',
   'panel.railHeading':'おともパートナー',
   'panel.navAriaLabel':'機能セクション',
   'panel.tab.quota':'Codex と使用量',
   'panel.tab.settings':'外観と操作',
   'panel.tab.quotes':'マイセリフ',
   'panel.tab.characters':'キャラ図鑑',
   'panel.status.loading':'読み込み中…',
   'panel.page.quota.title':'Codex と使用量',
   'panel.page.quota.desc':'Codex に接続し、プラン残高・利用枠ウィンドウ・現在のタスクを確認します。',
   'panel.page.settings.title':'外観と操作',
   'panel.page.settings.desc':'キャラクターのサイズやウィンドウ、おとも動作を調整します。',
   'panel.page.quotes.title':'マイセリフ',
   'panel.page.quotes.desc':'聞きたいセリフをここに登録できます。',
   'panel.page.characters.title':'キャラ図鑑',
   'panel.page.characters.desc':'お気に入りのパートナー姿を選択します。',
   'panel.codex.heading':'Codex 接続',
   'panel.codex.checking':'確認中',
   'panel.codex.checkingSummary':'ローカルの Codex 接続状態を確認中…',
   'panel.codex.refreshConnect':'接続して使用量を更新',
   'panel.codex.refresh':'使用量を更新',
   'panel.codex.recheck':'接続を再確認',
   'panel.codex.loginBtn':'ChatGPT アカウントでログイン / 切替',
   'panel.codex.auth.tokens':'ChatGPT トークン',
   'panel.codex.auth.chatgpt':'ChatGPT サブスクリプション',
   'panel.codex.auth.apiKey':'API Key モード',
   'panel.codex.auth.connected':'ChatGPT（接続済み）',
   'panel.codex.auth.none':'未ログイン',
   'panel.codex.state.connected':'接続済み',
   'panel.codex.state.cached':'接続済み · 更新待ち',
   'panel.codex.state.needLogin':'ChatGPT ログインが必要',
   'panel.codex.state.missing':'Codex 未検出',
   'panel.codex.state.off':'未接続',
   'panel.codex.unknownPlan':'不明なプラン',
   'panel.codex.readySuffix':' · ローカル Codex 準備完了',
   'panel.codex.summary.connected':'プラン：{plan} · ログイン方式：{auth}{ready}',
   'panel.codex.summary.cached':'プラン：{plan} · {msg}',
   'panel.codex.summary.cachedDefault':'キャッシュされた使用量を表示中です。「使用量を更新」で再取得できます。',
   'panel.codex.summary.needLogin':'API Key モードまたは未ログイン状態です。下の「ChatGPT アカウントでログイン / 切替」から接続してください。',
   'panel.codex.summary.missing':'ローカルの Codex クライアントまたは CLI が見つかりません。Codex をインストールしてから再試行してください。',
   'panel.codex.summary.off':'「接続して使用量を更新」をクリックして現在の Codex ログインと利用枠を取得します。未ログインの場合は先に ChatGPT へログインしてください。',
   'panel.quota.heading':'残高と使用量',
   'panel.quota.empty':'表示できる利用枠ウィンドウがまだありません。上の「接続して使用量を更新」から最新データを取得してください。',
   'panel.quota.detailAmount':'残り {rem} / {total}（使用済み {used}）',
   'panel.quota.detailPct':'使用済み {used}% · 残り {rem}%',
   'panel.quota.resetAt':'リセット：{time}',
   'panel.quota.resetPending':'リセット時刻未定',
   'panel.quota.observedAt':'最終取得 {time}',
   'panel.quota.notObserved':'未取得',
   'panel.quota.staleSuffix':' · {msg}',
   'panel.quota.staleDefault':'更新できないため、既存のデータを保持しています',
   'panel.task.heading':'タスク状態',
   'panel.task.desc':'タスクの進行に合わせて、思考・作業・待機のモーションに切り替わります。',
   'panel.task.pauseObservers':'タスク監視を一時停止',
   'panel.task.resumeObservers':'タスク監視を再開',
   'panel.railPhase.idle':'おとも中',
   'panel.railPhase.working':'作業中',
   'panel.railPhase.thinking':'思考中',
   'panel.railPhase.waiting':'操作待ち',
   'panel.railPhase.happy':'タスク完了',
   'panel.railPhase.confused':'ひと休み中',
   'panel.taskPhase.idle':'待機中',
   'panel.taskPhase.working':'作業中',
   'panel.taskPhase.thinking':'思考中',
   'panel.taskPhase.waiting':'操作待ち',
   'panel.taskPhase.happy':'完了直後',
   'panel.taskPhase.confused':'一時的な問題',
   'panel.lang.label':'表示言語',
   'panel.lang.auto':'システムに合わせる',
   'panel.lang.zhCN':'简体中文',
   'panel.lang.ja':'日本語',
   'panel.settings.formSection':'フォームとサイズ',
   'panel.settings.formLabel':'表示フォーム',
   'panel.settings.formFull':'全身',
   'panel.settings.formBust':'半身（バストアップ）',
   'panel.settings.scaleLabel':'キャラクターサイズ',
   'panel.settings.bubbleScaleLabel':'テキストカードサイズ',
   'panel.settings.windowSection':'ウィンドウとクリック',
   'panel.settings.topmost':'常に手前に表示',
   'panel.settings.topmostSub':'他のウィンドウより前面に固定します',
   'panel.settings.touch':'タッチ反応',
   'panel.settings.clickCards':'全身クリックで使用量・セリフを表示',
   'panel.settings.bustClickCards':'半身クリックで使用量・セリフを表示',
   'panel.settings.bustClickCardsSub':'自動セリフや完了通知は下で個別に設定できます',
   'panel.settings.hideMenu':'テキストカードのメニューボタンを隠す',
   'panel.settings.actionSection':'アクションと通知',
   'panel.settings.dragonAnim':'キャラクター動作を再生',
   'panel.settings.dragonCodex':'タスク連動モーション',
   'panel.settings.taskBubble':'タスク完了時に通知',
   'panel.settings.autoQuote':'セリフを自動表示',
   'panel.settings.autoBubble':'半身モードでも自動セリフ',
   'panel.settings.quoteInterval':'セリフ間隔',
   'panel.settings.seconds':'秒',
   'panel.settings.soundSection':'クリック効果音',
   'panel.settings.soundOn':'効果音を鳴らす',
   'panel.settings.soundOnSub':'半身クリック時に再生（全身時はミュート）',
   'panel.settings.soundVolume':'音量',
   'panel.settings.pressSound':'押下時の音',
   'panel.settings.releaseSound':'離した時の音',
   'panel.settings.builtinSound':'標準音に戻す',
   'panel.settings.colorSection':'カラー演出',
   'panel.settings.colorMode':'キャラクター配色',
   'panel.settings.colorOriginal':'オリジナル',
   'panel.settings.colorLinked':'連動',
   'panel.settings.colorRainbow':'レインボー',
   'panel.settings.colorSurprise':'サプライズ',
   'panel.settings.colorRare':'レア',
   'panel.settings.colorSpecial':'スペシャル',
   'panel.settings.colorMixed':'ミックス',
   'panel.settings.colorPaused':'カラーアニメーションを一時停止',
   'panel.settings.colorOdds':'確率設定',
   'panel.settings.colorChance':'キャラ変色確率',
   'panel.settings.colorTextChance':'テキスト変色確率',
   'panel.update.summary':'アップデート確認',
   'panel.update.releaseVersion':'リリース版 {tag}',
   'panel.update.coreVersion':'本体 {version}',
   'panel.update.desc':'本リポジトリの更新は確認と通知のみ行い、自動インストールはしません。上流 GPT-Niang のカスタム保護は維持されます。',
   'panel.update.check':'更新を確認',
   'panel.update.downloadDefault':'新バージョンあり · ダウンロードへ',
   'panel.update.downloadTag':'新バージョン {tag} · ダウンロードへ',
   'panel.update.automatic':'自動確認',
   'panel.update.checking':'最新リリース：GitHub Release を確認中…',
   'panel.update.available':'最新リリース：新しいバージョン {tag} が見つかりました',
   'panel.update.current':'最新リリース：最新バージョンです（{tag}）',
   'panel.update.rateLimited':'最新リリース：{reason}',
   'panel.update.rateLimitedDefault':'GitHub のレート制限に達しました。後ほど再試行してください',
   'panel.update.failed':'最新リリース：{reason}',
   'panel.update.failedDefault':'ネットワークに接続できず、GitHub Release を確認できません',
   'panel.update.idle':'最新リリース：確認と通知のみ行い、自動ダウンロードや書き換えは行いません',
   'panel.upstream.prefix':'上流 GPT-Niang 更新（カスタム保護）：',
   'panel.upstream.checking':'確認中',
   'panel.upstream.current':'上流バージョン確認済み',
   'panel.upstream.blocked':'上流の更新を検出（現在のカスタムを保護中）',
   'panel.upstream.source':'ソースディレクトリは Git で更新してください',
   'panel.upstream.portable':'ポータブル版では無効（自己書き換え防止）',
   'panel.upstream.rateLimited':'レート制限バックオフ中',
   'panel.upstream.failedDefault':'確認未完了',
   'panel.upstream.default':'通知のみ（現在のカスタムを保持）',
   'panel.quotes.heading':'マイセリフ',
   'panel.quotes.desc':'1行につき1セリフ、最大5000件・各200文字まで入力できます。',
   'panel.quotes.aria':'セリフ内容',
   'panel.quotes.save':'セリフを保存',
   'panel.quotes.show':'1つ表示',
   'panel.quotes.triggersSummary':'スペシャルセリフと配色',
   'panel.quotes.triggersDesc':'「スペシャル」「サプライズ」配色時、ここで指定したセリフに反応して発光します（1行1フレーズ）。',
   'panel.quotes.triggersAria':'スペシャルセリフ',
   'panel.quotes.saveTriggers':'スペシャルセリフを保存',
   'panel.characters.heading':'キャラ図鑑',
   'panel.characters.import':'画像を読み込む',
   'panel.characters.desc':'デフォルトの竜娘を使うか、ローカルの PNG 画像を読み込めます。',
   'panel.characters.defaultName':'デフォルト竜娘',
   'panel.characters.inUse':'使用中',
   'panel.characters.use':'使用する',
   'panel.footer.hintSave':'変更後は「設定を保存」をクリック',
   'panel.footer.hintLocal':'設定はこの端末にのみ保存されます',
   'panel.footer.reload':'再読み込み',
   'panel.footer.close':'閉じる',
   'panel.footer.save':'設定を保存',
   'panel.notice.saveFailed':'操作を完了できませんでした。設定を再読み込みして再試行してください。',
   'panel.notice.saveCatch':'設定を保存できませんでした。他の画面で変更されていないか確認して再試行してください。',
   'panel.notice.saved':'設定を保存しました。',
   'panel.notice.reloaded':'設定を再読み込みしました。',
   'panel.notice.refreshing':'Codex に接続して使用量を取得中…',
   'panel.notice.refreshed':'Codex の使用量を更新しました。',
   'panel.notice.refreshFailed':'Codex から使用量を取得できませんでした。Codex で ChatGPT アカウントにログインしているか確認してください。',
   'panel.notice.loginStarted':'Codex のログイン画面を開きました。ブラウザで ChatGPT にログインした後、「使用量を更新」を押してください。',
   'panel.notice.initFailed':'ローカル画面の状態を読み込めませんでした。パネルを閉じてやり直してください。',
   'panel.notice.languageChanged':'表示言語を切り替えました。',
   'panel.notice.readonly':'設定ファイルを書き込めないため、読み取り専用保護に切り替えました。修復後に「再読み込み」をお試しください。'
  }
 });

 function formatTemplate(template,vars){
  if(!vars||typeof template!=='string')return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g,(_,k)=>Object.hasOwn(vars,k)&&vars[k]!==undefined&&vars[k]!==null?String(vars[k]):'');
 }

 function t(language,key,vars){
  const lang=resolveLanguage(language);
  const table=MESSAGES[lang]||MESSAGES['zh-CN'];
  const raw=table[key]??MESSAGES['zh-CN'][key]??key;
  return formatTemplate(raw,vars);
 }

 function translateActionGroup(group,language){
  if(resolveLanguage(language)==='ja')return ACTION_GROUP_MAP[group]||group;
  return group;
 }

 function translateActionLabel(clip,fallback,language){
  if(resolveLanguage(language)==='ja')return ACTION_LABEL_MAP[clip]||fallback;
  return fallback;
 }

 function actionQuoteJa(clip){
  return ACTION_QUOTES_JA[clip]||null;
 }

 function translateQuotaLabel(label,language){
  if(typeof label!=='string')return resolveLanguage(language)==='ja'?'クレジット':'额度';
  if(resolveLanguage(language)==='ja')return QUOTA_LABEL_JA[label]||label;
  return label;
 }

 function defaultCharacterName(language){
  return t(language,'desktop.defaultCharacterName');
 }

 function defaultQuote(language){
  return t(language,'desktop.defaultQuote');
 }

 function defaultQuotes(language){
  if(resolveLanguage(language)==='ja')return [...DEFAULT_QUOTES_JA];
  return [MESSAGES['zh-CN']['desktop.defaultQuote']];
 }

 function defaultColorTriggers(language){
  return resolveLanguage(language)==='ja'?['トークン来い、トークン来い']:['Token来，Token来'];
 }

 function applyDomTranslations(doc,language){
  if(!doc)return;
  const lang=resolveLanguage(language);
  doc.documentElement.lang=lang;
  for(const el of doc.querySelectorAll('[data-i18n]')){
   el.textContent=t(lang,el.dataset.i18n);
  }
  for(const el of doc.querySelectorAll('[data-i18n-aria]')){
   el.setAttribute('aria-label',t(lang,el.dataset.i18nAria));
  }
 }

 return {
  SUPPORTED_LANGUAGES,
  EFFECTIVE_LANGUAGES,
  DEFAULT_LANGUAGE,
  ACTION_GROUP_MAP,
  ACTION_LABEL_MAP,
  ACTION_QUOTES_JA,
  DEFAULT_QUOTES_JA,
  normalizeLanguageTag,
  detectSystemLanguage,
  resolveLanguage,
  intlLocale,
  fontStack,
  t,
  translateActionGroup,
  translateActionLabel,
  actionQuoteJa,
  translateQuotaLabel,
  defaultCharacterName,
  defaultQuote,
  defaultQuotes,
  defaultColorTriggers,
  applyDomTranslations
 };
});
