'use strict';
class ClickSequence {
 constructor({now=Date.now,resetMs=60000}={}){Object.assign(this,{now,resetMs});this.lastAt=null;}
 next(){const at=this.now(),fresh=this.lastAt===null||at<this.lastAt||at-this.lastAt>=this.resetMs;this.lastAt=at;return fresh?'quota':'quote';}
 quote(){this.lastAt=this.now();return 'quote';}
}
module.exports={ClickSequence};
