'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
function patch(bytes){
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(hash!=='cc6345c34e89fe37f34db81dbfb06ea46b5f7a037793f62ec4a599c071483d03')throw Error('Unknown interaction baseline; inspect changes first');
  let text=bytes.toString('utf8');const nl=text.includes('\r\n')?'\r\n':'\n';
  function replace(a,b){if(text.split(a).length!==2)throw Error('Expected one anchor: '+a);text=text.replace(a,b);}
  replace('Set-Appearance;Set-BubbleState;Initialize-WidgetColors;Update-Quota',". ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime\\desktop-interaction.ps1'),[Text.Encoding]::UTF8)))"+nl+'Set-Appearance;Set-BubbleState;Initialize-WidgetColors;Update-Quota');
  replace('Initialize-WidgetSettingsMenu'+nl,'Initialize-WidgetSettingsMenu'+nl+'Initialize-WidgetDesktopInteraction'+nl);
  replace('  $y=Limit-WidgetVerticalPosition $frame $dpi ($script:drag.top+$dy)','  $y=if($script:followHost){Limit-WidgetVerticalPosition $frame $dpi ($script:drag.top+$dy)}else{[int]($script:drag.top+$dy)}');
  const turnStart=text.indexOf('  $nextSide=if($cursor.X-lt');
  const turnEnd=text.indexOf('  $x=Limit-WidgetHorizontalPosition $frame $dpi $x',turnStart);
  if(turnStart<0||turnEnd<turnStart)throw Error('Missing automatic facing block');
  text=text.slice(0,turnStart)+'  # Keep the current facing and grab offset throughout a drag.'+nl+text.slice(turnEnd);
  replace(nl+'  $x=Limit-WidgetHorizontalPosition $frame $dpi $x',nl+'  if($script:followHost){$x=Limit-WidgetHorizontalPosition $frame $dpi $x}'+nl+'  else{$free=Get-WidgetFreeDesktopPosition $x $y $dpi;$x=$free.X;$y=$free.Y}');
  replace('        $x=Limit-WidgetHorizontalPosition $frame $dpi $x'+nl+'        $y=Limit-WidgetVerticalPosition $frame $dpi $desiredY','        $free=Get-WidgetFreeDesktopPosition $x $desiredY $dpi;$x=$free.X;$y=$free.Y');
  return Buffer.from(text,'utf8');
}
module.exports={patch};
if(require.main===module){const [input,output]=process.argv.slice(2);fs.writeFileSync(output,patch(fs.readFileSync(input)));}
