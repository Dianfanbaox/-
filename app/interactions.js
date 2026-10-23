/* Monthly settlement continuity. Uses existing meta store; financial rules stay in E/Svc. */
(function(){
 'use strict';
 const q=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const steps=['income','expense','special','assets'],key=m=>'settlement-draft-v1-'+m;
 let revision=0;
 let rendered=null,queue=Promise.resolve(),writeFailed=false,submitting=false,parsing=false,undo=null;
 const clone=o=>JSON.parse(JSON.stringify(o));
 function active(){return !!App.settle&&steps.includes(App.settle.step)&&q('#v-settle.ui-settle-step');}
 function capture(){
  if(!rendered||!App.settle||rendered.month!==App.settle.month)return;
  const field=q('#quickInput,#specialInput');
  if(field){App.settle.inputs=App.settle.inputs||{};App.settle.inputs[rendered.step]=field.value;}
  const edit=q('#asset-edit-input');
  if(edit)App.settle.pendingAsset={id:App.settle.assets[App.assetEditIdx]?.id,value:edit.value};
  App.settle.scrolls=App.settle.scrolls||{};App.settle.scrolls[rendered.step]=q('#app').scrollTop;
 }
 function status(text){const el=q('#qys-draft-status');if(el)el.textContent=text;}
 function save(force=false){
  if(!App.settle||!rendered||rendered.month!==App.settle.month||!steps.includes(App.settle.step)||(submitting&&!force))return queue;
  capture();const payload={version:1,savedAt:Date.now(),...clone(App.settle)};
  const ticket=++revision;status('正在保存草稿…');
  queue=queue.catch(()=>{}).then(()=>DB.setMeta(key(payload.month),payload)).then(()=>{if(ticket!==revision)return;writeFailed=false;if(App.settle?.month===payload.month)status('草稿已保存到本机');}).catch(()=>{if(ticket!==revision)return;writeFailed=true;status('草稿未保存，请勿关闭页面');});
  return queue;
 }
 App.hasSettlementDraft=async m=>{const d=await DB.getMeta(key(m));return !!d&&d.version===1&&d.month===m&&steps.includes(d.step);};
 App.restoreSettlementDraft=async function(){
  const state=this.settle;const d=await DB.getMeta(key(state.month));
  if(this.settle!==state)return;
  if(!d||d.version!==1||d.month!==this.settle.month||!steps.includes(d.step))return;
  for(const kind of ['income','expense','special'])if(Array.isArray(d[kind]))this.settle[kind]=d[kind];
  const saved=new Map((d.assets||[]).map(a=>[a.id,a]));
  this.settle.assets=this.settle.assets.map(a=>saved.has(a.id)?{...a,...saved.get(a.id),id:a.id,name:a.name}:a);
  for(const k of ['inputs','scrolls','pendingAsset','reviewContext'])if(d[k])this.settle[k]=d[k];
  this.settle.step=d.step;
  if(d.pendingAsset){const i=this.settle.assets.findIndex(a=>a.id===d.pendingAsset.id);if(i>=0)App.assetEditIdx=i;}
 };
 // A saved month is reviewed independently of the four-step first settlement.
 function reviewFingerprint(state){
  return JSON.stringify({income:state.income,expense:state.expense,special:state.special,assets:state.assets.map(({reviewed,...asset})=>asset)});
 }
 App.beginSettlementReview=function(step){
  if(!steps.includes(step))return;
  this.settle.reviewContext={month:this.settle.month,baseline:reviewFingerprint(this.settle)};
  this.settle.step=step;
 };
 App.openSettlementReview=function(step){if(!submitting&&!parsing)App.go('settle','m='+encodeURIComponent(this.settle.month)+'&edit=1&review='+step);};
 function reviewing(){return App.settle?.reviewContext?.month===App.settle?.month;}
 function reviewChanged(){return reviewFingerprint(App.settle)!==App.settle.reviewContext.baseline||Object.values(App.settle.inputs||{}).some(v=>String(v).trim())||!!App.settle.pendingAsset;}
 App.returnSettlementResult=async function(){
  if(submitting||parsing||!reviewing())return;
  capture();const month=this.settle.month,changed=reviewChanged();
  if(changed){await save();if(writeFailed){notice('草稿未保存，请留在此页重试');return;}}
  else {await queue;await DB.setMeta(key(month),null);}
  rendered=null;this.settle.step='result';App.go('settle','m='+encodeURIComponent(month)+'&result=1');
  if(changed)notice('修改已留在本机草稿，结算结果尚未改变');
 };
 function reviewControls(root){
  if(!reviewing()||!steps.includes(App.settle.step))return;
  root.classList.add('qys-single-review');
  const intro=root.querySelector('.ui-step-intro');if(intro){intro.classList.add('qys-review-intro');intro.querySelector('h2').textContent={income:'核对本月收入',expense:'核对本月支出',special:'核对特殊事项',assets:'核对资产余额'}[App.settle.step];intro.querySelector('p').textContent='检查后可直接返回，修改后保存即可';}
  root.querySelector('.ui-steps')?.remove();
  const bar=[...root.children].find(el=>el.children.length===4&&[...el.children].every(x=>x.style.height==='4px'));bar?.remove();
  const subtitle=root.querySelector(':scope > p.sub');if(subtitle)subtitle.textContent='本月已结算 · 单项核对';
  const dock=q('.qys-settle-dock');if(!dock)return;
  dock.setAttribute('aria-label','核对记录操作');dock.replaceChildren();
  const back=document.createElement('button');back.type='button';back.className='btn ghost';back.textContent='返回结算结果';back.onclick=()=>App.returnSettlementResult();
  const done=document.createElement('button');done.type='button';done.className='btn';done.textContent='保存修改并返回';done.onclick=()=>App.settleFinish();
  dock.append(back,done);
  // Asset confirmation has an additional legacy previous-step row.
  root.querySelectorAll(':scope > .ui-actions').forEach(row=>{const keep=row.querySelector('[onclick*="settleAssetsKeep"]');if(keep){keep.classList.add('block');root.querySelector('.ui-settle-card')?.append(keep);}row.remove();});
 }
 const decorate=QYSUI.decorate;
 QYSUI.decorate=function(root,view){
  decorate(root,view);
  enhance(root,view);
  if(view==='settle'){addRecordEditors(root);reviewControls(root);}
  if(view!=='settle'||!steps.includes(App.settle?.step)){rendered=null;return;}
  rendered={month:App.settle.month,step:App.settle.step};
  const field=q('#quickInput,#specialInput');if(field)field.value=App.settle.inputs?.[App.settle.step]||'';
  const pending=App.settle.pendingAsset,edit=q('#asset-edit-input');if(edit&&pending&&App.settle.assets[App.assetEditIdx]?.id===pending.id)edit.value=pending.value;
  const note=document.createElement('p');note.id='qys-draft-status';note.className='qys-draft-status';note.setAttribute('role','status');note.textContent=reviewing()?'修改暂存本机，保存后更新结算结果':'草稿保存在本机，确认结算后正式记入';root.querySelector('.ui-step-intro')?.after(note);
  if(App.settle.scrolls?.[App.settle.step])q('#app').scrollTop=App.settle.scrolls[App.settle.step];
  save();
 };
 const renderStep=App.renderSettleStep;
 App.renderSettleStep=function(){capture();return renderStep.apply(this,arguments);};
 const route=App.route;
 App.route=function(){if(submitting)return;capture();if(rendered)save();return route.apply(this,arguments);};
 document.addEventListener('input',e=>{if(active()&&e.target.matches('#quickInput,#specialInput,#asset-edit-input'))save();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active())save();});
 window.addEventListener('pagehide',()=>{if(active())save();});
 const assetSave=App.settleAssetSave;
 App.settleAssetSave=async function(){const pending=this.settle.pendingAsset;this.settle.pendingAsset=null;const ok=await assetSave.apply(this,arguments);if(!ok)this.settle.pendingAsset=pending;else if(this.settle.assets[arguments[0]]){this.settle.assets[arguments[0]].reviewed=true;assetReview(q('#v-settle'));}await save();return ok;};
 // Cancel must discard only the open editor, not the rest of the draft.
 document.addEventListener('click',e=>{if(e.target.closest('[onclick*="assetEditIdx=-1"]')&&App.settle)App.settle.pendingAsset=null;},true);
 function refreshEntries(){
  const kind=App.settle.step,host=q('#settleEntries');if(!host||!['income','expense'].includes(kind))return App.renderSettleStep();
  const positive=kind==='income';host.innerHTML=App.settle[kind].map((r,i)=>'<div class="ui-money-row qys-entry-row"><div style="flex:1;min-width:0"><span class="ui-row-tag">'+(positive?'收入':'支出')+'</span><div class="qys-entry-desc">'+esc(r.desc)+'</div><div class="qys-entry-caption">'+(positive?'计入存钱':'计入支出')+'</div></div><span class="'+(positive?'num-pos':'num-neg')+'" style="font-weight:600">'+(positive?'+':'-')+fmtYuan(r.amount)+'</span><button type="button" class="qys-remove" aria-label="移除'+esc(r.desc)+'" onclick="App.settleRemove(\''+kind+'\','+i+')">×</button></div>').join('')||'<p class="qys-entry-empty">本月还没有'+(positive?'收入':'支出')+'记录</p>';
  const total=E.calcMonth({month:App.settle.month,income:App.settle.income,expense:App.settle.expense});const el=q('.ui-row-total strong');if(el)el.textContent=E.fmtCents(positive?total.incomeTotal:total.expenseTotal);
  addRecordEditors(q('#v-settle'));save();
 }
 function notice(message,action){
  q('#qys-action-notice')?.remove();const el=document.createElement('div');el.id='qys-action-notice';el.className='qys-action-notice';el.setAttribute('role','status');el.append(document.createTextNode(message));
  if(action){const b=document.createElement('button');b.type='button';b.textContent=action.label;b.onclick=()=>{action.run();el.remove();};el.append(b);}
  q('#phone').append(el);placeNotice();setTimeout(()=>el.remove(),8000);
 }
 App.settleRemove=function(kind,i){
  if(submitting||parsing)return;const month=this.settle.month,item=this.settle[kind]?.[i];if(!item)return;
  capture();this.settle[kind].splice(i,1);refreshEntries();undo={month,kind,i,item};
  const operation=undo;notice('已移除这笔记录',{label:'撤销',run:()=>{if(undo!==operation||App.settle?.month!==month||submitting)return;this.settle[kind].splice(Math.min(i,this.settle[kind].length),0,item);undo=null;refreshEntries();}});
 };
 function placeNotice(){const el=q('#qys-action-notice'),dock=q('.qys-settle-dock'),phone=q('#phone');if(el&&dock)el.style.bottom=(phone.getBoundingClientRect().bottom-dock.getBoundingClientRect().top+8)+'px';}
 window.addEventListener('resize',()=>requestAnimationFrame(placeNotice));window.visualViewport?.addEventListener('resize',()=>requestAnimationFrame(placeNotice));
 function fieldError(message){let el=q('#qys-entry-error');if(!el){el=document.createElement('p');el.id='qys-entry-error';el.className='qys-input-error';el.setAttribute('role','alert');q('#quickInput')?.parentElement.after(el);}el.textContent=message;const field=q('#quickInput');if(field){field.setAttribute('aria-describedby',el.id);field.setAttribute('aria-invalid','true');}}
 App.settleQuickAdd=async function(kind){
  if(parsing||submitting)return;const field=q('#quickInput');const raw=field?.value.trim();if(!raw)return;
  const state=this.settle,step=state.step,lines=raw.split(/[\n,，；;]+/).map(x=>x.trim()).filter(Boolean),local=lines.map(line=>this.parseMoneyText(line));
  const button=field.parentElement.querySelector('button');parsing=true;if(button){button.disabled=true;button.textContent='识别中…';}field.readOnly=true;
  q('#qys-entry-error')?.remove();field.removeAttribute('aria-invalid');
  try{
   let items;
   if(local.every(Boolean))items=local.map(x=>({desc:x.desc,amount:x.cents}));
   else {let result=null;try{result=await AI.parseMoney(raw,kind);}catch(_){}if(!result?.items?.length)result=AI.parseMoneyFallback(raw,kind);
    items=(result?.items||[]).map(x=>({desc:String(x.name||x.desc||raw).slice(0,20),amount:Math.round(Number(x.amount)*100)}));}
   if(this.settle!==state||state.step!==step||!field.isConnected)return;
   if(!items?.length||items.some(x=>!Number.isSafeInteger(x.amount)||x.amount<=0)){fieldError('未完整识别出有效金额，原文已保留，请修改后重试');return;}
   if(!local.every(Boolean)&&!(await review('核对识别结果',items.map(x=>({title:x.desc,detail:fmtYuan(x.amount)})))))return;
   if(this.settle!==state||!field.isConnected)return;
   state[kind].push(...items);field.value='';state.inputs=state.inputs||{};state.inputs[step]='';refreshEntries();
   const last=q('#settleEntries')?.lastElementChild;last?.classList.add('qys-row-added');field.focus({preventScroll:true});notice('已添加 '+items.length+' 笔');
  }catch(_){if(field.isConnected)fieldError('识别失败，原文已保留，请重试');}
  finally{parsing=false;if(button?.isConnected){button.disabled=false;button.textContent='添加';}field.readOnly=false;await save();}
 };
 const finish=App.settleFinish;
 App.settleFinish=async function(){
  if(submitting||parsing)return;
  submitting=true;let mask=null,buttons=[];const phone=q('#phone');
  try{
   if(q('#asset-edit-input')&&!(await this.settleAssetSave(this.assetEditIdx)))return;
   capture();await save(true);if(writeFailed){notice('草稿保存失败，请勿关闭页面，检查本机存储后重试');return;}
   const pendingStep=steps.find(step=>(this.settle.inputs?.[step]||'').trim());
   if(pendingStep){notice('还有未添加的输入，请先处理',{label:'查看',run:()=>{this.settle.step=pendingStep;App.renderSettleStep();}});return;}
   const month=this.settle.month;
   if(reviewing()&&!reviewChanged()){submitting=false;await this.returnSettlementResult();return;}
   const snapshots=await DB.all('calcSnapshots'),existing=snapshots.find(r=>r.month===month);
   if(existing&&!(await App.isInitialMonth(month))){
    const later=snapshots.filter(r=>r.month>month).map(r=>r.month).sort();
    if(!(await review('确认修改 '+monthCn(month),[{title:'原已保存结果',detail:'本月存钱 '+fmtYuan(existing.savings)+' · 总资产 '+fmtYuan(existing.total_assets)},{title:'保存后的影响',detail:later.length?'将重新核算 '+later.map(monthCn).join('、')+'，历史分析会随结果更新。':'将更新本月结果和年度汇总。'}],'保存修改')))return;
   }
   phone.setAttribute('aria-busy','true');
   mask=document.createElement('div');mask.className='qys-saving-mask';mask.setAttribute('role','status');mask.innerHTML='<div><span class="spin-dot"></span><p>正在保存本月数据…</p></div>';phone.append(mask);
   buttons=[...phone.querySelectorAll('button')].map(el=>({el,disabled:el.disabled}));buttons.forEach(x=>x.el.disabled=true);
   await finish.apply(this,arguments);await queue;await DB.setMeta(key(month),null);for(const row of snapshots.filter(r=>r.month>month))await DB.setMeta('aiCache-'+row.month,null);undo=null;
   if(this.settle.step==='result'){delete this.settle.reviewContext;history.replaceState(null,'','#/settle?m='+encodeURIComponent(month)+'&result=1');}
  }catch(_){this.settle.step='assets';App.assetEditIdx=-1;App.renderSettleStep();notice('未能完成保存，填写内容已保留，请重试');}
  finally{submitting=false;mask?.remove();phone.removeAttribute('aria-busy');buttons.forEach(x=>{if(x.el.isConnected)x.el.disabled=x.disabled;});if(steps.includes(this.settle.step))await save();}
 };

 function review(title,rows,confirmLabel="确认添加"){
  return new Promise(resolve=>{
   const trigger=document.activeElement,dialog=document.createElement('dialog');dialog.className='qys-review';dialog.setAttribute('aria-labelledby','qys-review-title');
   dialog.innerHTML='<h2 id="qys-review-title">'+esc(title)+'</h2><p>核对无误后再添加；有误请返回修改原文。</p><div class="qys-review-list">'+rows.map(x=>'<section><strong>'+esc(x.title)+'</strong><p>'+esc(x.detail)+'</p></section>').join('')+'</div><div class="qys-review-actions"><button class="btn ghost" data-cancel>返回修改</button><button class="btn" data-confirm>确认添加</button></div>';
   const end=ok=>{dialog.close();dialog.remove();if(trigger?.isConnected&&!trigger.matches('input,textarea'))trigger.focus({preventScroll:true});resolve(ok);};
   dialog.addEventListener('cancel',e=>{e.preventDefault();end(false);});dialog.querySelector('[data-confirm]').textContent=confirmLabel;dialog.querySelector('[data-cancel]').onclick=()=>end(false);dialog.querySelector('[data-confirm]').onclick=()=>end(true);if(confirmLabel==='保存修改')dialog.querySelector('h2 + p').textContent='确认影响范围后保存；返回修改会保留当前填写内容。';q('#phone').append(dialog);dialog.showModal();dialog.querySelector('[data-cancel]').focus();
  });
 }
 App.reviewSpecial=async function(rows,raw){
  if(!rows.length||rows.some(x=>!Number.isFinite(Number(x.amount))||Number(x.amount)<0||!['invest_sell','invest_buy','loan_return','loan_give','other'].includes(x.type))){notice('未识别出有效事项，原文已保留，请修改后重试');return false;}
  const types={invest_sell:'投资卖出',invest_buy:'投资买入',loan_return:'借出款收回',loan_give:'借出款',other:'其他事项'};
  return review('核对特殊事项',rows.map(x=>({title:types[x.type]+' · '+(x.desc||raw),detail:'金额 '+fmtYuan(Math.round(Number(x.amount)*100))+(x.type==='invest_sell'?' · 本金 '+fmtYuan(Math.round(Number(x.principal||0)*100))+' · 识别盈亏 '+fmtYuan(Math.round(Number(x.profit||0)*100)):'')})));
 };
 const parseSpecial=App.settleSpecialParse;
 App.settleSpecialParse=async function(){
  if(parsing||submitting)return;parsing=true;const state=this.settle,field=q('#specialInput');capture();if(field)field.readOnly=true;
  try{await parseSpecial.apply(this,arguments);}catch(_){notice('识别失败，原文已保留，请重试');}
  finally{parsing=false;if(field)field.readOnly=false;if(state===this.settle)await save();const b=q('#specialBtn');if(b){b.disabled=false;b.textContent='解析';}}
 };
 function assetReview(root){
  if(!root||App.settle?.step!=='assets')return;
  root.querySelectorAll('.qys-asset-review,.qys-review-progress').forEach(el=>el.remove());
  const assets=App.settle.assets;
  assets.forEach((a,i)=>{
   const control=root.querySelector('[onclick="App.settleAssetEdit('+i+')"]');if(!control)return;
   const info=control.parentElement.firstElementChild,el=document.createElement('div');el.className='qys-asset-review';
   const value=a.newCents??a.prevCents,delta=value!=null&&a.prevCents!=null?value-a.prevCents:null;
   const label=document.createElement('p');label.textContent=(a.reviewed?'已核对':'待核对')+(delta!=null?' · 较上次 '+(delta>0?'+':'')+fmtYuan(delta):'');el.append(label);
   if(!a.reviewed&&a.newCents==null&&a.prevCents!=null){const b=document.createElement('button');b.type='button';b.className='qys-keep-one';b.textContent='确认未变';b.onclick=()=>{a.reviewed=true;assetReview(root);save();};el.append(b);}
   info.append(el);
  });
  const note=document.createElement('p');note.className='qys-review-progress';note.setAttribute('role','status');note.textContent='已核对 '+assets.filter(a=>a.reviewed).length+'/'+assets.length+' 个账户 · 请填写实际余额';root.querySelector('.ui-settle-card h3')?.after(note);
 }
 const keep=App.settleAssetsKeep;
 App.settleAssetsKeep=function(){this.settle.assets.forEach(a=>a.reviewed=true);const result=keep.apply(this,arguments);save();return result;};
 function enhance(root,view){
  const previous=rendered;
  if(view==='settle'&&steps.includes(App.settle?.step)){
   if(previous?.month===App.settle.month&&previous.step!==App.settle.step)root.classList.add(steps.indexOf(App.settle.step)>steps.indexOf(previous.step)?'qys-step-forward':'qys-step-back');
   else if(previous?.step===App.settle.step)root.classList.add('qys-local-update');
   assetReview(root);
  }
  if(view==='home'){
   DB.all('meta').then(rows=>{
    if(!root.isConnected)return;
    const drafts=rows.filter(r=>r.id.startsWith('settlement-draft-v1-')&&r.value?.version===1&&steps.includes(r.value.step)).map(r=>r.value).sort((a,b)=>b.savedAt-a.savedAt);
    if(!drafts.length)return;const d=drafts[0],el=document.createElement('section');el.className='qys-resume';el.innerHTML='<div><strong>继续 '+esc(monthCn(d.month))+' 结算</strong><p>进行到第 '+(steps.indexOf(d.step)+1)+'/4 步 · 草稿保存在本机</p></div><button class="btn">继续</button>';el.querySelector('button').onclick=()=>App.go('settle','m='+encodeURIComponent(d.month)+'&edit=1');root.querySelector('.ui-home-head')?.after(el);
   }).catch(()=>{});
  }
  if(view==='settle'&&App.settle?.step==='result'){
   const warning=root.querySelector('.ui-result-warning');if(warning){
    const group=document.createElement('div');group.className='qys-recovery';group.setAttribute('role','group');group.setAttribute('aria-label','核对差异');
    const paths={assets:'M4 10h16M6 10v8m4-8v8m4-8v8m4-8v8M3 21h18M12 3l9 5H3Z',income:'M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5',expense:'M12 15V3m-4 4 4-4 4 4M5 16v5h14v-5',special:'M8 3h8v4H8zM8 5H5v16h14V5h-3M8 12h8m-8 4h5'};
    for(const [step,label]of [['assets','核对资产余额'],['income','检查收入'],['expense','检查支出'],['special','检查特殊事项']]){
     const b=document.createElement('button');b.type='button';b.className='qys-check-action';
     b.setAttribute('aria-label',label);
     b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[step]+'"/></svg><span>'+({assets:'核对资产',special:'特殊事项'}[step]||label)+'</span><span class="qys-check-chevron" aria-hidden="true">›</span>';
     b.onclick=()=>App.openSettlementReview(step);group.append(b);
    }
    warning.append(group);
    const ai=warning.querySelector('button[style]');if(ai){ai.classList.add('qys-anomaly-action');ai.style.removeProperty('margin-top');group.after(ai);}
   }
   const edit=root.querySelector('[onclick*="&edit=1"]');if(edit)edit.onclick=()=>App.openSettlementReview('income');
   DB.getMeta(key(App.settle.month)).then(d=>{if(!root.isConnected||!d?.reviewContext)return;const note=document.createElement('div');note.className='qys-review-resume';note.innerHTML='<span>有未保存的核对修改</span><button type="button">继续核对</button>';note.querySelector('button').onclick=()=>App.openSettlementReview(steps.includes(d.step)?d.step:'income');root.querySelector('.ui-result-hero')?.after(note);}).catch(()=>{});
  }
 }

 function addRecordEditors(root){
  if(!root||!['income','expense'].includes(App.settle?.step))return;
  root.querySelectorAll('#settleEntries .ui-money-row').forEach((row,i)=>{
   if(row.querySelector('.qys-edit-record'))return;
   const b=document.createElement('button');b.type='button';b.className='qys-edit-record';b.textContent='修改';b.setAttribute('aria-label','修改第 '+(i+1)+' 笔记录');b.onclick=()=>editRecord(App.settle.step,i);row.firstElementChild.append(b);
  });
 }
 function editRecord(kind,i){
  if(submitting||parsing)return;const state=App.settle,item=state[kind][i],trigger=document.activeElement,d=document.createElement('dialog');d.className='qys-review';d.setAttribute('aria-labelledby','qys-edit-title');
  d.innerHTML='<h2 id="qys-edit-title">修改'+(kind==='income'?'收入':'支出')+'</h2><label class="qys-edit-field">说明<input class="inp" id="qys-edit-desc" maxlength="80"></label><label class="qys-edit-field">金额（元）<input class="inp" id="qys-edit-money" inputmode="decimal"></label><p role="alert" id="qys-edit-error"></p><div class="qys-review-actions"><button class="btn ghost" data-cancel>取消</button><button class="btn" data-save>保存修改</button></div>';
  d.querySelector('#qys-edit-desc').value=item.desc;d.querySelector('#qys-edit-money').value=String(item.amount/100);
  const close=()=>{d.close();d.remove();if(trigger?.isConnected&&!trigger.matches('input,textarea'))trigger.focus({preventScroll:true});};d.addEventListener('cancel',e=>{e.preventDefault();close();});d.querySelector('[data-cancel]').onclick=close;
  d.querySelector('[data-save]').onclick=()=>{const raw=d.querySelector('#qys-edit-money').value.trim(),amount=Math.round(Number(raw)*100),desc=d.querySelector('#qys-edit-desc').value.trim();if(!raw||!desc||!Number.isSafeInteger(amount)||amount<=0){d.querySelector('#qys-edit-error').textContent='请填写说明和有效的正数金额';return;}if(App.settle!==state)return close();item.desc=desc;item.amount=amount;close();refreshEntries();notice('记录已修改，草稿保存在本机');};
  d.querySelector('[data-cancel]').autofocus=true;
  q('#phone').append(d);d.showModal();d.querySelector('[data-cancel]').focus({preventScroll:true});
 }
 function handleBack(){
  const dialog=q('dialog[open]');if(dialog){dialog.dispatchEvent(new Event('cancel',{cancelable:true}));return true;}
  if(submitting)return true;
  if(q('#sheet')?.style.display==='flex'){App.closeSheet();return true;}
  if(q('#askPanel')?.style.display==='flex'){App.closeAskPanel();return true;}
  if(q('#asset-edit-input')){capture();App.assetEditIdx=-1;App.settle.pendingAsset=null;App.renderSettleAssets();return true;}
  if(active()&&reviewing()){App.returnSettlementResult();return true;}
  if(active()){capture();save();const index=steps.indexOf(App.settle.step);if(index>0){App.settle.step=steps[index-1];App.renderSettleStep();}else App.go('home');return true;}
  if(!q('#v-home')&&!q('#v-init')&&!q('#v-login')){App.go('home');return true;}return false;
 }
 const toggleAnalysis=App.toggleAIWhy;
 App.toggleAIWhy=function(){const body=q('.why-tray-body'),from=body?.getBoundingClientRect().height;const result=toggleAnalysis.apply(this,arguments);if(body&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const to=body.getBoundingClientRect().height;body.getAnimations().forEach(a=>a.cancel());body.animate([{height:from+'px',maxHeight:from+'px'},{height:to+'px',maxHeight:to+'px'}],{duration:200,easing:'ease-out'});}return result;};

 // The Android WebView shrinks when IME opens. Keep only an already focused
 // settlement field visible above the fixed dock; never request input focus.
 function keepFocusedInputVisible(){
  const input=document.activeElement,app=q('#app');
  if(!input?.matches('input,textarea')||!input.closest('#v-settle')||!app)return;
  const bounds=app.getBoundingClientRect(),dock=q('.qys-settle-dock'),top=Math.max(bounds.top,visualViewport?.offsetTop||0)+12;
  let bottom=Math.min(bounds.bottom,visualViewport?visualViewport.offsetTop+visualViewport.height:innerHeight)-12;
  if(dock)bottom=Math.min(bottom,dock.getBoundingClientRect().top-12);
  const form=input.closest('.ui-entry-form')||input.parentElement;
  let r=form.getBoundingClientRect();if(r.height>bottom-top)r=input.getBoundingClientRect();
  let delta=0;if(r.bottom>bottom)delta=r.bottom-bottom;else if(r.top<top)delta=r.top-top;
  if(Math.abs(delta)>1)app.scrollTo({top:app.scrollTop+delta,behavior:'instant'});
 }
 let inputVisibilityFrame=0;
 const revealFocusedInput=()=>{cancelAnimationFrame(inputVisibilityFrame);inputVisibilityFrame=requestAnimationFrame(keepFocusedInputVisible);};
 document.addEventListener('focusin',()=>{revealFocusedInput();setTimeout(revealFocusedInput,120);setTimeout(revealFocusedInput,400);});
 window.addEventListener('resize',revealFocusedInput);window.visualViewport?.addEventListener('resize',revealFocusedInput);
 window.QYSInteractions={flush:save,handleBack,get submitting(){return submitting;},get parsing(){return parsing;}};
})();
