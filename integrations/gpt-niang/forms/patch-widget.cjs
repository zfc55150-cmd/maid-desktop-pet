'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
function patch(bytes){
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 if(hash!=='30dcb186961a870b5ac37314604798ed59673bb41d4aa67a84345aa01b505cd3')throw Error('Unknown GPT dual-form baseline');
 let text=bytes.toString('utf8');const nl=text.includes('\r\n')?'\r\n':'\n';
 function replace(a,b){if(text.split(a).length!==2)throw Error('Expected one form anchor: '+a);text=text.replace(a,b);}
 const dot=". ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime\\desktop-interaction.ps1'),[Text.Encoding]::UTF8)))";
 replace(dot,dot+nl+". ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime\\pet-forms.ps1'),[Text.Encoding]::UTF8)))");
 replace('Initialize-WidgetDesktopInteraction'+nl,'Initialize-WidgetDesktopInteraction'+nl+'Initialize-WidgetPetForms'+nl);
 replace('function Click-Character {'+nl,'function Click-Character {'+nl+"  if($script:widgetPetForm-eq 'bust' -and $script:characterId-eq 'gpt-dragon'){if(!$script:completionPending){Show-Quote};return}"+nl);
 const touch="if(!$moved){Click-Character;$touch=$event.GetPosition($script:ui.Girl);$null=Invoke-DragonTouch ($touch.X/[Math]::Max(1.0,[double]$script:ui.Girl.ActualWidth)) ($touch.Y/[Math]::Max(1.0,[double]$script:ui.Girl.ActualHeight))}";
 replace(touch,"if(!$moved){Click-Character;if($script:widgetPetForm-ne 'bust'){$touch=$event.GetPosition($script:ui.Girl);$null=Invoke-DragonTouch ($touch.X/[Math]::Max(1.0,[double]$script:ui.Girl.ActualWidth)) ($touch.Y/[Math]::Max(1.0,[double]$script:ui.Girl.ActualHeight))}}");
 replace("elseif($request.mode-eq 'close-menu')", "elseif($request.mode-in @('form-full','form-bust')){Set-WidgetPetForm ($request.mode.Substring(5))}"+nl+"        elseif($request.mode-eq 'close-menu')");
 replace('dragonMotion=@{timerRunning=', 'dragonMotion=@{form=$script:widgetPetForm;transitioning=[bool]$script:petFormTransition;timerRunning=');
 return require('./patch-native-motion.cjs').patch(Buffer.from(text,'utf8'));
}
module.exports={patch};
if(require.main===module)fs.writeFileSync(process.argv[3],patch(fs.readFileSync(process.argv[2])));
