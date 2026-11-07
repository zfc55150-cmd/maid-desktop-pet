const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('probe',{finish:data=>ipcRenderer.send('probe-result',data),config:()=>ipcRenderer.invoke('probe-config')});
