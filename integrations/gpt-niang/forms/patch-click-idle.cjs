'use strict';
function patch(bytes){
 const text=bytes.toString('utf8');if(text.includes('Invoke-WidgetFullIdleClick}'))return bytes;
 const old="$touch=$event.GetPosition($script:ui.Girl);$null=Invoke-DragonTouch ($touch.X/[Math]::Max(1.0,[double]$script:ui.Girl.ActualWidth)) ($touch.Y/[Math]::Max(1.0,[double]$script:ui.Girl.ActualHeight));Invoke-WidgetFullClick";
 if(text.split(old).length!==2)throw Error('Idle click release anchor changed');
 return Buffer.from(text.replace(old,'Invoke-WidgetFullIdleClick'),'utf8');
}
module.exports={patch};
