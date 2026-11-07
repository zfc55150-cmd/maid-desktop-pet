(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PetPreferenceDraft=api;})(globalThis,()=>{
 'use strict';
 class Draft {
  constructor(){this.base={};this.changed=new Map();}
  get dirty(){return this.changed.size>0;}
  receive(prefs){for(const [key,value]of Object.entries(prefs))if(!this.changed.has(key))this.base[key]=value;}
  reset(prefs){this.base={...prefs};this.changed.clear();}
  change(key,value){if(Object.is(value,this.base[key]))this.changed.delete(key);else this.changed.set(key,value);}
  payload(){const result={kind:'preferences',prefs:{},expected:{}};for(const [key,value]of this.changed){result.expected[key]=this.base[key];if(key==='form'||key==='idleRhythm')result[key]=value;else result.prefs[key]=value;}return result;}
 }
 return {Draft};
});
