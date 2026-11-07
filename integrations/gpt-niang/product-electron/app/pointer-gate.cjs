'use strict';
// Briefly retain an already acquired body hit; never make an empty canvas a
// permanent input surface. A physical press keeps its lease until button-up.
class PointerGate {
 constructor({graceMs=240}={}){this.graceMs=graceMs;this.lastBody=-Infinity;this.wasDown=false;this.buttonLease=false;this.interactive=false;}
 decide({inside,within,leftDown,dragging=false,menu=false,now=Date.now()}){if(inside)this.lastBody=now;if(leftDown&&!this.wasDown)this.buttonLease=inside||this.interactive&&within;if(!leftDown)this.buttonLease=false;this.wasDown=leftDown;this.interactive=dragging||menu||inside||this.buttonLease||within&&now-this.lastBody<=this.graceMs;return !this.interactive;}
}
module.exports={PointerGate};
