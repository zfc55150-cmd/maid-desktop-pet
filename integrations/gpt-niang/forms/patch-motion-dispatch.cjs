'use strict';
function patch(bytes){
 let text=bytes.toString('utf8');if(text.includes('$script:petWindowMessageRelay='))return require('./patch-catch-feedback.cjs').patch(bytes);
 const nl=text.includes('\r\n')?'\r\n':'\n';
 function replace(a,b){if(text.split(a).length!==2)throw Error('Motion dispatch anchor changed: '+a);text=text.replace(a,b);}
 replace('function Animate-Press([bool]$down) {'+nl+'  $x=if($down){1.05}else{1.0};$y=if($down){0.88}else{1.0}',
 'function Animate-Press([bool]$down) {'+nl+"  $small=$script:characterId-eq 'gpt-dragon' -and $script:widgetPetForm-eq 'bust'"+nl+'  $x=if($down){if($small){0.96}else{1.05}}else{1.0};$y=if($down){if($small){0.96}else{0.88}}else{1.0}');
 replace('  if($msg-eq 0x47){$script:occlusionRecovery.OnPositionChanged($l)}'+nl,'');
 replace('$source.AddHook($script:messageHook)',[
 'Initialize-WidgetMotionNativeTypes',
 "$nativePosition=[Delegate]::CreateDelegate([Action[IntPtr]],$script:occlusionRecovery,'OnPositionChanged')",
 '$script:petWindowMessageRelay=[PetWindowMessageRelay]::new($script:messageHook,$nativePosition)',
 "$script:messageHook=[Delegate]::CreateDelegate([Windows.Interop.HwndSourceHook],$script:petWindowMessageRelay,'Message')",
 '$source.AddHook($script:messageHook)'].join(nl));
 replace('$script:eventHooks=@('+nl,[
 '$script:petWindowEventRelay=[PetWindowEventRelay]::new($script:widgetHandle,$script:winEventCallback)',
 "$script:winEventCallback=[Delegate]::CreateDelegate([GptWidgetNative+WinEventProc],$script:petWindowEventRelay,'OnEvent')",
 '$script:eventHooks=@('].join(nl)+nl);
 replace('  Sync-WidgetNativeMotion'+nl+'  if($script:updating){return}',[
 '  Sync-WidgetNativeMotion',
 '  # Defer quota/layout/disk maintenance until the gesture settles.',
 '  # Scene expiry remains live, including a bubble already on screen.',
 '  if(!$script:followHost -and (Test-WidgetNativeMotionActive)){',
 '    $motionNow=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()',
 '    Tick-Scene $motionNow',
 "    if([IO.File]::Exists((Join-Path $script:dataDir 'stop.flag'))){$script:window.Close()}",
 '    return',
 '  }',
 '  if($script:updating){return}'].join(nl));
 return require('./patch-catch-feedback.cjs').patch(Buffer.from(text,'utf8'));
}
module.exports={patch};
