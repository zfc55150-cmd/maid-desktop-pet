'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
// Startup verification must not allocate one Buffer the size of Electron or an
// atlas. Streaming bytes preserves the exact SHA while bounding scratch memory.
function sha(file){
 const fd=fs.openSync(file,'r'),hash=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(64*1024);
 try{let bytes;while((bytes=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,bytes));return hash.digest('hex');}finally{fs.closeSync(fd);}
}
module.exports={sha};
