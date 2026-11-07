'use strict';
function patch(bytes){
 const text=bytes.toString('utf8'),nl=text.includes('\r\n')?'\r\n':'\n';
 const guard="  if($script:characterId-eq 'gpt-dragon' -and $script:widgetPetForm-eq 'full'){return} # Full clicks only animate the character.";
 if(text.includes(guard))return require('./patch-click-rendering.cjs').patch(bytes);
 const anchor='function Click-Character {'+nl;
 if(text.split(anchor).length!==2)throw Error('Full click bubble anchor changed');
 return require('./patch-click-rendering.cjs').patch(Buffer.from(text.replace(anchor,anchor+guard+nl),'utf8'));
}
module.exports={patch};
