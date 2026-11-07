'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('product',{
 snapshot:()=>ipcRenderer.invoke('product-snapshot'),
 command:data=>ipcRenderer.invoke('product-command',data),
 onState:fn=>ipcRenderer.on('product-state',(_event,state)=>fn(state)),
 onNotice:fn=>ipcRenderer.on('product-notice',(_event,notice)=>fn(notice))
});
