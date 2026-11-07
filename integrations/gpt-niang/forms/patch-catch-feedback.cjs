'use strict';
function patch(bytes){
 let text=bytes.toString('utf8');if(text.includes('$caught=$script:petCatchPressFired;'))return require('./patch-compact-quota.cjs').patch(bytes);
 function replace(a,b){if(text.split(a).length!==2)throw Error('Catch feedback anchor changed: '+a);text=text.replace(a,b);}
 replace('$moved=$script:drag.moved;$script:drag=$null;$sender.ReleaseMouseCapture()',
 '$moved=$script:drag.moved;$caught=$script:petCatchPressFired;$script:petCatchPressFired=$false;$script:drag=$null;$sender.ReleaseMouseCapture()');
 replace('if(!$moved){Click-Character;', 'if(!$moved -and !$caught){Click-Character;');
 return require('./patch-compact-quota.cjs').patch(Buffer.from(text,'utf8'));
}
module.exports={patch};
