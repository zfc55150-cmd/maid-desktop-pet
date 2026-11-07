'use strict';
const rules=document.createElement('style');rules.textContent=PetShared.TOOLTIP_CSS;document.head.append(rules);
const nameBox=document.getElementById('name');let last='';
function measure(){const width=Math.ceil(nameBox.offsetWidth+20),height=Math.ceil(nameBox.offsetHeight+20),key=width+','+height;if(key!==last){last=key;window.product.command({kind:'tooltip-size',width,height});}}
function show(state){nameBox.textContent=state.characterName;measure();}
window.product.onState(show);window.product.snapshot().then(async state=>{show(state);try{const font=await new FontFace('ShangshouSoftCandy','url("'+state.fontUrl+'")').load();document.fonts.add(font);measure();}catch{}});
new ResizeObserver(measure).observe(nameBox);
