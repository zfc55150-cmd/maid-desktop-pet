(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LabFlightClock=api;})(globalThis,()=>{
 'use strict';
 class Driver {
  constructor(step,onError=()=>{},env={}){this.step=step;this.onError=onError;this.env={raf:fn=>requestAnimationFrame(fn),cancel:id=>cancelAnimationFrame(id),...env};this.generation=0;this.raf=null;}
  stop(){++this.generation;if(this.raf!==null)this.env.cancel(this.raf);this.raf=null;}
  start(serial){this.stop();const generation=this.generation;
   const tick=async at=>{this.raf=null;if(generation!==this.generation)return;try{const result=await this.step({serial,at});if(generation===this.generation&&result?.active)this.raf=this.env.raf(tick);}catch{if(generation===this.generation){this.stop();this.onError();}}};
   this.raf=this.env.raf(tick);
  }
 }
 return {Driver};
});
