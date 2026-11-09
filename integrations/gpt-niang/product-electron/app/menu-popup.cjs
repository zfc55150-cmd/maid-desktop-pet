'use strict';
const path=require('node:path');
function menuSize(nodes,area,zoom){const longest=Math.max(...nodes.map(n=>(n.label||'').length*14+52));return {width:Math.min(area.width-16,Math.round(Math.max(168,Math.min(260,longest))*zoom)),height:Math.min(area.height-16,Math.round(Math.min(500,12+nodes.reduce((n,r)=>n+(r.type==='separator'?9:30),0))*zoom))};}
class MenuPopup {
 constructor({BrowserWindow,ipcMain,root,smoke,protect=()=>{},onClose}){Object.assign(this,{BrowserWindow,root,smoke,protect,onClose});this.columns=[];this.serial=0;const column=e=>this.columns.find(c=>!c.win.isDestroyed()&&c.win.webContents===e.sender);
 ipcMain.handle('pet-menu-read',e=>{const c=column(e);if(!c)throw Error('CALLER');return c.rows.map(({node,id})=>({id,label:node.label,type:node.type,checked:node.checked,enabled:node.enabled,branch:Array.isArray(node.submenu)}));});
 ipcMain.on('pet-menu-ready',e=>{const c=column(e);if(c){c.ready=true;if(!this.smoke){if(c.depth===0||c.focusOnReady)c.win.show();else c.win.showInactive();}if(c.focusOnReady)c.win.webContents.send('pet-menu-focus');}});
 ipcMain.on('pet-menu-branch',(e,data)=>{const c=column(e);if(c)this.branch(c,data);});
 ipcMain.on('pet-menu-choose',(e,id)=>{const c=column(e),row=c?.rows.find(r=>r.id===id);if(!row||row.node.enabled===false||row.node.type==='separator'||row.node.submenu)return;const node=row.node;this.close();Promise.resolve().then(()=>node.click?.({checked:node.type==='radio'||!node.checked})).catch(()=>{});});
 ipcMain.on('pet-menu-dismiss',e=>{if(column(e))this.close();});ipcMain.on('pet-menu-back',e=>{const c=column(e);if(!c)return;if(c.depth===0)this.close();else{const parent=this.columns[c.depth-1];this.trim(c.depth);if(!this.smoke)parent.win.focus();}});
 }
 open(nodes,point,area,zoom,owner=null){this.close();this.area=area;this.zoom=zoom;this.owner=owner;this.create(nodes,0,point.x,point.y);}
 create(nodes,depth,x,y,focusOnReady=false){const zoom=this.zoom,area=this.area,rows=nodes.map(node=>({node,id:String(++this.serial)})),{width,height}=menuSize(nodes,area,zoom);x=Math.round(Math.max(area.x+8,Math.min(area.x+area.width-width-8,x)));y=Math.round(Math.max(area.y+8,Math.min(area.y+area.height-height-8,y)));
 const parent=depth>0?this.columns[depth-1].win:this.owner;
 const win=new this.BrowserWindow({parent:parent||undefined,title:'功能菜单',x,y,width,height,useContentSize:true,show:false,frame:false,transparent:true,hasShadow:true,resizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,webPreferences:{offscreen:this.smoke,sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.join(this.root,'menu-preload.cjs')}}),c={win,rows,depth,branchId:null,focusOnReady,ready:false};
 this.columns.push(c);this.protect(win);const session=this.columns[0];
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.on('page-title-updated',e=>e.preventDefault());
 win.webContents.once('dom-ready',()=>win.webContents.setZoomFactor(zoom));
 win.on('blur',()=>setTimeout(()=>{if(this.columns[0]===session&&!this.columns.some(v=>!v.win.isDestroyed()&&v.win.isFocused()))this.close();},140));
 const failed=()=>{if(this.columns.includes(c))this.close();};
 win.on('closed',failed);
 win.webContents.on('render-process-gone',failed);
 win.loadFile(path.join(this.root,'menu.html')).catch(failed);
 return c;
 }
 branch(c,data){if(!data||!Number.isFinite(data.top)||data.top<-10000||data.top>10000)return;const row=c.rows.find(r=>r.id===data.id);if(c.branchId===data.id&&this.columns[c.depth+1]){if(data.focus===true){const child=this.columns[c.depth+1];child.focusOnReady=true;if(child.ready){if(!this.smoke)child.win.focus();child.win.webContents.send('pet-menu-focus');}}return;}this.trim(c.depth+1);c.branchId=data.id;if(!row?.node.submenu||row.node.enabled===false)return;const b=c.win.getBounds(),{width:wantWidth}=menuSize(row.node.submenu,this.area,this.zoom),right=b.x+b.width-2*this.zoom,left=b.x-wantWidth+2*this.zoom,rightSpace=this.area.x+this.area.width-8-right,leftSpace=b.x+2*this.zoom-this.area.x-8,x=wantWidth<=rightSpace||leftSpace<rightSpace?right:left;this.create(row.node.submenu,c.depth+1,x,b.y+Math.max(0,data.top)*this.zoom-4*this.zoom,data.focus===true);}
 trim(depth){const old=this.columns.splice(depth);for(const c of old.reverse())if(!c.win.isDestroyed())c.win.destroy();}
 close(){const had=this.columns.length;this.trim(0);if(had)this.onClose?.();}
}
module.exports={MenuPopup,menuSize};
