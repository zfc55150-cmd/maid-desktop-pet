'use strict';
// The independent 3089 host can load the same runtime via junctions. Never stop it implicitly.
const net=require('node:net');
function assertIndependentStopped({connect=net.createConnection,port=3089,timeoutMs=1200}={}){return new Promise((resolve,reject)=>{const socket=connect({host:'127.0.0.1',port});let settled=false;const finish=(error)=>{if(settled)return;settled=true;socket.destroy();error?reject(error):resolve({independentPort:port,listening:false,busyState:'not-running'});};socket.once('connect',()=>finish(Error('Independent pet on 3089 is running; confirm its busy state and stop it safely before shared-runtime maintenance')));socket.once('error',error=>finish(error.code==='ECONNREFUSED'?null:Error('Independent host state could not be confirmed ('+String(error.code||'unknown')+')')));socket.setTimeout(timeoutMs,()=>finish(Error('Independent host probe timed out')));});}
if(require.main===module)assertIndependentStopped().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={assertIndependentStopped};
