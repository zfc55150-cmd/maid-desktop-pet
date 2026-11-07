'use strict';
function patch(bytes){
 let text=bytes.toString('utf8');if(text.includes('    if(!$script:drag -and !(Test-WidgetNativeMotionActive)){'))return require('./patch-motion-dispatch.cjs').patch(bytes);
 const nl=text.includes('\r\n')?'\r\n':'\n';
 function replace(a,b){if(text.split(a).length!==2)throw Error('Native motion anchor changed: '+a);text=text.replace(a,b);}
 replace('function Tick-Widget {'+nl,'function Tick-Widget {'+nl+'  Sync-WidgetNativeMotion'+nl);
 replace('    if(!$script:drag){'+nl+'      $frame=$placementFrame;', '    if(!$script:drag -and !(Test-WidgetNativeMotionActive)){'+nl+'      $frame=$placementFrame;');
 replace(';recovery=@{checks=', ';motion=(Get-WidgetMotionStatus);recovery=@{checks=');
 return require('./patch-motion-dispatch.cjs').patch(Buffer.from(text,'utf8'));
}
module.exports={patch};
