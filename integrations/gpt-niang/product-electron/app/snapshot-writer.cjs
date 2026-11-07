'use strict';
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
function snapshotWriter(file,{io=fs,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let pending=null,running=null;
 const temporary=file+'.'+process.pid+'.'+randomUUID()+'.tmp',delays=[15,30,60,120,200,200,200];
 const retry=async operation=>{for(let attempt=0;;attempt++){try{return await operation();}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt>=delays.length)throw e;await pause(delays[attempt]);}}};
 const drain=async()=>{try{while(pending!==null){const text=pending;pending=null;await retry(()=>io.writeFile(temporary,text));await retry(()=>io.rename(temporary,file));}}finally{await io.unlink(temporary).catch(()=>{});}};
 const start=()=>{if(!running&&pending!==null)running=drain().finally(()=>{running=null;if(pending!==null)return start();});return running||Promise.resolve();};
 return {write(value){pending=JSON.stringify(value,null,2);return start();},flush(){return start();}};
}
module.exports={snapshotWriter};
