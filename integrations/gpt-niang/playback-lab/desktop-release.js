(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabRelease=api;})(globalThis,()=>{
 'use strict';
 function lock(player){player.freeze();return 'frozen-release';}
 function canTakeoff(held,currentGesture,ownerGesture){return held===true&&Number.isSafeInteger(currentGesture)&&currentGesture===ownerGesture;}
 return {lock,canTakeoff};
});
