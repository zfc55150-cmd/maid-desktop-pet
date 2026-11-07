'use strict';
function patch(bytes){
 let text=bytes.toString('utf8');if(text.includes('Invoke-WidgetSmallClick;return'))return require('./patch-full-click.cjs').patch(bytes);
 const nl=text.includes('\r\n')?'\r\n':'\n';
 function replace(a,b){if(text.split(a).length!==2)throw Error('Compact quota anchor changed: '+a);text=text.replace(a,b);}
 replace("if($script:widgetPetForm-eq 'bust' -and $script:characterId-eq 'gpt-dragon'){if(!$script:completionPending){Show-Quote};return}","if($script:widgetPetForm-eq 'bust' -and $script:characterId-eq 'gpt-dragon'){Invoke-WidgetSmallClick;return}");
 replace('184*[double]$q.remaining/100','(Get-WidgetQuotaContentWidth)*[double]$q.remaining/100');
 replace("  $script:ui.Header.ToolTip=if($script:status.planLabel){'当前套餐：'+$script:status.planLabel+' · 重置时间按本机时间显示'}else{'重置时间按本机时间显示'}"+nl,
 "  $script:ui.Header.ToolTip=if($script:status.planLabel){'当前套餐：'+$script:status.planLabel+' · 重置时间按本机时间显示'}else{'重置时间按本机时间显示'}"+nl+"  if($script:bubbleMode-eq 'quota' -and $script:characterId-eq 'gpt-dragon'){Set-WidgetPetSpeechLayout}"+nl);
 return require('./patch-full-click.cjs').patch(Buffer.from(text,'utf8'));
}
module.exports={patch};
