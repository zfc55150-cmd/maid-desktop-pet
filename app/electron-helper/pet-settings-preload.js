const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petSettings',{
 state:()=>ipcRenderer.invoke('simple-chat:state'),
 save:value=>ipcRenderer.invoke('simple-chat:save',value),
 voiceSettings:value=>ipcRenderer.invoke('simple-chat:voiceSettings',value),
 previewVoice:()=>ipcRenderer.invoke('simple-chat:previewVoice'),
 copyHistory:()=>ipcRenderer.invoke('simple-chat:copyHistory'),
 clear:value=>ipcRenderer.invoke('simple-chat:clear',value)
});
