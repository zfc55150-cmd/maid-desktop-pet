const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 config:()=>ipcRenderer.invoke('desktop-config'),
 state:()=>ipcRenderer.invoke('product-snapshot'),
 product:data=>ipcRenderer.invoke('product-command',data),
 onState:fn=>ipcRenderer.on('product-state',(_event,data)=>fn(data)),
 hitGeometry:data=>ipcRenderer.send('desktop-hit-geometry',data),
 input:data=>ipcRenderer.send('desktop-input',data),
 step:data=>ipcRenderer.invoke('desktop-physics-step',data),
 frame:data=>ipcRenderer.send('desktop-frame',data),
 media:data=>ipcRenderer.send('desktop-media',data),
 ready:()=>ipcRenderer.send('desktop-ready'),
 status:data=>ipcRenderer.send('desktop-status',data),
 onInputAck:fn=>ipcRenderer.on('desktop-input-ack',(_event,data)=>fn(data)),
 onAction:fn=>ipcRenderer.on('desktop-action',(_event,action)=>fn(action)),
 onTransport:fn=>ipcRenderer.on('desktop-transport',(_event,data)=>fn(data))
});
