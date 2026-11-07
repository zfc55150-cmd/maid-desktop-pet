const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 config:()=>ipcRenderer.invoke('desktop-config'),
 input:data=>ipcRenderer.send('desktop-input',data),
 step:data=>ipcRenderer.invoke('desktop-physics-step',data),
 frame:data=>ipcRenderer.send('desktop-frame',data),
 media:data=>ipcRenderer.send('desktop-media',data),
 ready:()=>ipcRenderer.send('desktop-ready'),
 status:data=>ipcRenderer.send('desktop-status',data),
 onAction:fn=>ipcRenderer.on('desktop-action',(_event,action)=>fn(action)),
 onTransport:fn=>ipcRenderer.on('desktop-transport',(_event,data)=>fn(data))
});
