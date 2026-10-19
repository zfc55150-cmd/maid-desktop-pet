const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('simpleChat',Object.fromEntries(['state','save','send','clear','cancel'].map(name=>[name,arg=>ipcRenderer.invoke('simple-chat:'+name,arg)])));
