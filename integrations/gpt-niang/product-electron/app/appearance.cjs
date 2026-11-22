'use strict';
function scope(p,text,triggers=[],random=Math.random){
 if(p.colorMode==='original')return 'none';if(['linked','rainbow'].includes(p.colorMode))return 'full';
 if(!text)return 'none';const special=triggers.includes(text);
 if(p.colorMode==='special')return special?'full':'none';if(p.colorMode==='surprise'&&special)return 'full';
 const roll=random()*100;if(roll<p.colorChance)return 'full';if(p.colorMode==='mixed'&&roll<p.colorChance+p.colorTextChance)return 'text';return 'none';
}
function palette(text){
 if((text.match(/Claude|Gemini|DeepSeek|GPT|ChatGPT|クロード|ジェミニ|ディープシーク/gi)||[]).length>=2)return ['#D773AD','#9A79DC','#579DCF','#43AE94'];
 if(/Claude|克劳德|压缩|失忆|重构|クロード|圧縮|記憶喪失|記憶消去|記憶圧縮|リファクタ/i.test(text))return ['#C17A4C','#D89864','#CA776B','#B06F96'];
 if(/Gemini|双子|吃醋|竞品|ジェミニ|浮気|やきもち|嫉妬|ライバル/i.test(text))return ['#507BDB','#8370E4','#BE74CF','#57B5B2'];
 if(/DeepSeek|鲸|肥鱼|白饭|接住|等等|ディープシーク|クジラ|鯨|太っちょ魚/i.test(text))return ['#368CCA','#37B5BD','#548BE0','#826BC5'];
 if(/苦力怕|甘蔗|土豆|打怪|存档|クリーパー|サトウキビ|じゃがいも|モブ狩り|セーブ/.test(text))return ['#45986A','#90A84B','#58A897','#B3AA54'];
 if(/token|额度|余额|充值|トークン|残高|利用枠|課金|チャージ/i.test(text))return ['#D39B28','#E97869','#C9609E','#956CDA'];
 return ['#D773AD','#9A79DC','#579DCF','#43AE94'];
}
module.exports={scope,palette};
