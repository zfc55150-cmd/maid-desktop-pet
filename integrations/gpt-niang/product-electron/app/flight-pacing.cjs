'use strict';

// A renderer pulse aligns movement with paint. The main process still owns
// the elapsed time and can step independently when the renderer stalls.
class FlightPacing {
 constructor(step){this.step=step;}
 start(now){this.lastStep=now;this.lastPulse=now;}
 pulse(now){this.lastPulse=now;return this.advance(now);}
 fallback(now){return now-this.lastPulse>=40&&this.advance(now);}
 advance(now){
  const elapsed=now-this.lastStep;
  if(elapsed<4)return false;
  this.lastStep=now;
  this.step(elapsed/1000);
  return true;
 }
}

module.exports={FlightPacing};
