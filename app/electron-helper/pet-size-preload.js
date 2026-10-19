const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petSize',{
 state:()=>ipcRenderer.invoke('pet-size:state'),
 save:value=>ipcRenderer.invoke('pet-size:save',value),
 retry:()=>ipcRenderer.invoke('pet-size:retry'),
 onApplyError:callback=>{const listener=(_event,message)=>callback(message);ipcRenderer.on('pet-size:apply-error',listener);return ()=>ipcRenderer.removeListener('pet-size:apply-error',listener);}
});
