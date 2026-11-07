'use strict';
const fs=require('node:fs/promises');
function snapshotWriter(file){
 let pending=null,running=null;
 const drain=async()=>{while(pending!==null){const text=pending;pending=null;await fs.writeFile(file+'.tmp',text);await fs.rename(file+'.tmp',file);}};
 return {write(value){pending=JSON.stringify(value,null,2);if(!running)running=drain().finally(()=>{running=null;});return running;}};
}
module.exports={snapshotWriter};
