/* P2 展示与操作：不更改财务计算/数据结构。 */
(function(){
 'use strict';
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
 let dockObserver=null,dialog=null,dock=null;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function assetColors(){return {bank:cssVar('--green'),cash:'#A1AE7C',investment:cssVar('--gold'),wealth:'#83A3BA',loan:'#A28CB2',fx:cssVar('--amber'),other:'#B3B7AA'};}
 async function initialMonths(){
  const snapshots=await DB.all('snapshots'),groups=new Map();
  for(const row of snapshots){if(!groups.has(row.month))groups.set(row.month,[]);groups.get(row.month).push(row);}
  const initial=new Set([...groups].filter(([,rows])=>rows.length&&rows.every(r=>r.source==='init')).map(([month])=>month));
  if(initial.size){const facts=await Promise.all(['income','expense','investments','loans','specialEvents'].map(store=>DB.all(store)));for(const rows of facts)for(const row of rows)if(!row.deleted)initial.delete(row.month);}
  return initial;
 }
 App.isInitialMonth=async month=>!!month&&(await initialMonths()).has(month);
 App.hasSettledRecords=async function(year=curYear()){const initial=await initialMonths();return (await DB.all('calcSnapshots')).some(r=>r.month.startsWith(year+'-')&&r.month<=nowMonth()&&!initial.has(r.month));};
 function typography(root){
  for(const el of qa('[style]',root)){
   if(el.closest('svg'))continue;
   const size=parseFloat(el.style.fontSize);if(Number.isFinite(size)&&size<12)el.style.fontSize='12px';
  }
 }
 function controls(root){
  typography(root);
  qa('button,input,textarea,select,[role="button"]',root).forEach(el=>{
   const click=el.getAttribute('onclick')||'';
   if(/settleAssetSave/.test(click))el.setAttribute('aria-label','保存资产金额');
   if(/assetEditIdx=-1/.test(click))el.setAttribute('aria-label','取消编辑金额');
   if(/closeAskPanel/.test(click))el.setAttribute('aria-label','关闭财务问答');
   if(el.matches('select')&&!el.getAttribute('aria-label')&&!el.labels?.length)el.setAttribute('aria-label',el.id==='pickYear'?'结算年份':el.id==='pickMonth'?'结算月份':'选择历史年份');
  });
  qa('.seg3 button',root).forEach(el=>el.setAttribute('aria-pressed',String(el.classList.contains('on'))));
  const tray=q('#aiWhyTray',root);
  if(tray){const on=tray.classList.contains('open'),button=q('button',tray),body=q('.why-tray-body',tray),label=q('#aiWhyLabel',tray);body.id='aiWhyContent';button.setAttribute('aria-controls',body.id);button.setAttribute('aria-expanded',String(on));body.setAttribute('aria-hidden',String(!on));if(label&&label.textContent!==(on?'收起分析':'展开分析'))label.textContent=on?'收起分析':'展开分析';}
  qa('.ui-text-link',root).forEach(el=>{if(!q('.qys-link-arrow',el)){el.insertAdjacentHTML('beforeend','<span class="qys-link-arrow" aria-hidden="true">›</span>');}});
 }
 const originalToggle=App.toggleAIWhy;
 App.toggleAIWhy=function(){const result=originalToggle.apply(this,arguments);controls(q('#v-home')||q('#app'));return result;};
 const originalTheme=Theme.set;
 Theme.set=function(){const result=originalTheme.apply(this,arguments);qa('.seg3 button').forEach(el=>el.setAttribute('aria-pressed',String(el.classList.contains('on'))));return result;};
 function clearDock(){if(dockObserver){dockObserver.disconnect();dockObserver=null;}if(dock){dock.remove();dock=null;}q('#app').classList.remove('qys-with-dock');q('#phone').style.removeProperty('--qys-dock-height');}
 function syncDock(){
  if(!dock)return;
  const viewport=window.visualViewport;
  const inset=viewport?Math.max(0,innerHeight-viewport.height-viewport.offsetTop):0;
  dock.style.setProperty('--qys-keyboard-offset',inset+'px');
  q('#phone').style.setProperty('--qys-dock-height',dock.getBoundingClientRect().height+'px');
 }
 function settlementDock(root){
  if(!root.classList.contains('ui-settle-step'))return;
  const actionRows=qa(':scope > .ui-actions',root),actions=actionRows.flatMap(row=>qa(':scope > button',row));
  const main=App.settle.step==='assets'?q(':scope > button[onclick*="settleFinish"]',root):actions.find(b=>b.textContent.includes('下一步'));
  const previous=actions.find(b=>/上一步|回首页/.test(b.textContent));
  if(!main)return;
  dock=document.createElement('div');dock.className='qys-settle-dock';dock.setAttribute('role','group');dock.setAttribute('aria-label','结算步骤操作');
  if(previous)dock.append(previous);dock.append(main);q('#phone').insertBefore(dock,q('#tabbar'));
  actionRows.forEach(row=>{if(!row.children.length)row.remove();});
  q('#app').classList.add('qys-with-dock');dockObserver=new ResizeObserver(syncDock);dockObserver.observe(dock);syncDock();
 }
 window.addEventListener('resize',syncDock);window.visualViewport?.addEventListener('resize',syncDock);window.visualViewport?.addEventListener('scroll',syncDock);
 function closeDialog(restore=true){
  if(!dialog)return;const state=dialog;dialog=null;document.removeEventListener('keydown',state.key,true);document.removeEventListener('focusin',state.focus,true);
  for(const item of state.background){item.node.inert=item.inert;if(item.hidden===null)item.node.removeAttribute('aria-hidden');else item.node.setAttribute('aria-hidden',item.hidden);}
  if(restore){const target=state.trigger?.isConnected?state.trigger:q('#tabbar .active');target?.focus({preventScroll:true});}
 }
 function openDialog(panel,close){
  closeDialog(false);
  const trigger=document.activeElement,background=[q('#app'),q('#tabbar'),dock].filter(Boolean).map(node=>({node,inert:node.inert,hidden:node.getAttribute('aria-hidden')}));
  const heading=q('h3,b',panel);if(heading){heading.id=panel.id==='askPanel'?'qys-ask-title':'qys-dialog-title';panel.setAttribute('aria-labelledby',heading.id);}
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.tabIndex=-1;
  if(!q('[data-dialog-close]',panel)&&!q('[onclick*="closeAskPanel"]',panel)){const button=document.createElement('button');button.type='button';button.className='qys-dialog-close';button.dataset.dialogClose='true';button.setAttribute('aria-label','关闭月份选择');button.textContent='×';button.addEventListener('click',close);panel.prepend(button);}
  qa('[onclick*="App.pickMonth("]',panel).forEach(row=>{
   if(row.tagName==='BUTTON')return;const button=document.createElement('button');for(const attr of row.attributes)button.setAttribute(attr.name,attr.value);button.type='button';button.classList.add('qys-month-row');button.innerHTML=row.innerHTML;button.style.color='var(--text)';if(button.textContent.includes('当前')){button.setAttribute('aria-current','date');button.style.color='var(--green-text)';}row.replaceWith(button);
  });
  controls(panel);
  const visible=()=>qa('button,a[href],input,textarea,select,[tabindex="0"]',panel).filter(el=>!el.disabled&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  const focus=event=>{if(dialog&& !panel.contains(event.target)) (visible()[0]||panel).focus();};
  const key=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}else if(event.key==='Tab'){const items=visible(),first=items[0],last=items.at(-1);if(!first){event.preventDefault();panel.focus();}else if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){event.preventDefault();first.focus();}}};
  dialog={trigger,background,key,focus,panel};document.addEventListener('keydown',key,true);document.addEventListener('focusin',focus,true);
  panel.focus({preventScroll:true});for(const item of background){item.node.inert=true;item.node.setAttribute('aria-hidden','true');}
 }
 const monthOpen=App.openMonthPicker,monthClose=App.closeSheet;
 App.openMonthPicker=async function(){await monthOpen.apply(this,arguments);const panel=q('#sheet .body');if(panel)openDialog(panel,()=>App.closeSheet());};
 App.closeSheet=function(){const result=monthClose.apply(this,arguments);closeDialog();return result;};
 const askOpen=App.openAskPanel,askClose=App.closeAskPanel;
 App.openAskPanel=async function(){await askOpen.apply(this,arguments);const panel=q('#askPanel');if(panel&&getComputedStyle(panel).display!=='none')openDialog(panel,()=>App.closeAskPanel());};
 App.closeAskPanel=function(){const result=askClose.apply(this,arguments);closeDialog();return result;};
 function decorate(root,view){
  controls(root);settlementDock(root);
  const bar=q('[role="progressbar"]',root);if(bar){const value=Number(bar.getAttribute('aria-valuenow'));bar.setAttribute('aria-valuenow',String(Math.max(0,Math.min(100,value))));bar.setAttribute('aria-valuetext','已完成 '+value+'%');}
 }
 function reset(){clearDock();if(dialog){q('#sheet').style.display='none';q('#askPanel').style.display='none';q('#askMask').style.display='none';closeDialog(false);}}
 let pending=false;const observer=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;const root=q('#app > .view');if(root)controls(root);});});observer.observe(q('#app'),{childList:true,subtree:true});
 window.QYSUI={assetColors,initialMonths,decorate,reset};
})();
