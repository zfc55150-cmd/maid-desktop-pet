'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petMenu',{read:()=>ipcRenderer.invoke('pet-menu-read'),ready:()=>ipcRenderer.send('pet-menu-ready'),branch:(id,top,focus=false)=>ipcRenderer.send('pet-menu-branch',{id,top,focus}),onFocus:fn=>ipcRenderer.on('pet-menu-focus',fn),choose:id=>ipcRenderer.send('pet-menu-choose',id),dismiss:()=>ipcRenderer.send('pet-menu-dismiss'),back:()=>ipcRenderer.send('pet-menu-back')});
