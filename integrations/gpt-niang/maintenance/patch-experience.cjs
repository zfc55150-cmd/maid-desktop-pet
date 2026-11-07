'use strict';
function patch(bytes){
 let text=bytes.toString('utf8');
 const needle='$dx*$dx+$dy*$dy-lt 9';
 const count=text.split(needle).length-1;
 if(count!==1)throw Error('Expected one legacy physical drag boundary');
 text=text.replace(needle,'$dx*$dx+$dy*$dy-lt (9*[Math]::Pow((Get-WidgetPlacementDpi),2))');
 // Keep click audio on the bust, independently of the full-body rebound.
 for(const name of ['Play-WidgetPressSound','Play-WidgetReleaseSound']){
  if(text.split(name).length-1!==2)throw Error('Expected two widget audio event calls: '+name);
  text=text.replaceAll(name,"if($script:characterId-ne 'gpt-dragon' -or $script:widgetPetForm-eq 'bust'){"+name+'}');
 }
 return Buffer.from(text,'utf8');
}
module.exports={patch};
