/* 钱有数 V3 展示适配：只改 DOM、样式与状态反馈，不替换财务服务。 */
(function () {
  'use strict';
  const q = (s, root = document) => root.querySelector(s);
  const qa = (s, root = document) => Array.from(root.querySelectorAll(s));
  const svg = path => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  const backIcon = svg('<path d="m14 6-6 6 6 6"/>');
  const trashIcon = svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>');
  const checkIcon = svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>');
  const poses = { home:'welcome', history:'steady', settings:'safe', assets:'safe', goal:'goal', init:'notebook', prefs:'goal', backup:'safe', account:'safe', fx:'calculator', login:'welcome' };
  const mascot = (pose, extra = '') => '<span class="ui-mascot ' + extra + '" data-pose="' + pose + '" role="img" aria-label="小仓鼠数数"></span>';
  const directCards = root => Array.from(root.children).filter(el => el.classList.contains('card'));
  const progressHTML = progress => '<div class="ui-progress" role="progressbar" aria-label="年度存钱目标完成率" aria-valuenow="' + Number(progress || 0) + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + Math.max(0, Math.min(100, Number(progress || 0))) + '%"></span></div>';

  function setPose(pose, root = q('#app')) {
    const character = root && q('.ui-mascot', root);
    if (character) character.dataset.pose = pose;
  }
  function pageHeader(root, pose, title, subtitle) {
    const heading = q('h1.page', root);
    const head = document.createElement('header');
    head.className = 'ui-page-head' + (title === '钱有数' ? ' ui-home-head' : '');
    const copy = document.createElement('div');
    copy.className = 'ui-head-copy';
    if (heading) {
      heading.before(head);
      const sub = heading.nextElementSibling;
      copy.append(heading);
      if (sub && sub.classList.contains('sub')) copy.append(sub);
    } else {
      root.prepend(head);
      copy.innerHTML = '<h1 class="page">' + esc(title) + '</h1>';
    }
    if (title) q('h1', copy).textContent = title;
    if (subtitle) {
      let sub = q('.sub', copy);
      if (!sub) { sub = document.createElement('p'); sub.className = 'sub'; copy.append(sub); }
      sub.textContent = subtitle;
    }
    head.append(copy);
    head.insertAdjacentHTML('beforeend', mascot(pose));
    return head;
  }
  function addBack(root, target) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ui-back'; b.setAttribute('aria-label', '返回');
    b.innerHTML = backIcon;
    b.addEventListener('click', () => App.go(target));
    root.prepend(b);
  }
  function aiCard(card) {
    if (!card) return;
    card.classList.add('ui-ai');
    const copy = Array.from(card.children).find(el => el.style.padding);
    if (copy) {
      copy.classList.add('ui-ai-copy');
      const heading = q('h3', copy);
      if (heading && heading.nextElementSibling) heading.nextElementSibling.classList.add('ui-ai-title');
    }
  }
  function home(root) {
    const cards = directCards(root);
    const savings = cards.find(c => q('h3', c)?.textContent === '本月存钱');
    const annual = cards.find(c => q('h3', c)?.textContent === '年度目标');
    const ai = cards.find(c => q('#aiBody', c));
    const ask = cards.find(c => c.getAttribute('onclick')?.includes('openAskPanel'));
    const settledLabel = savings && q('.tag', savings)?.textContent;
    pageHeader(root, 'welcome', '钱有数', q('.qys-initial-state', root) ? '初始资产已记录 · 待首次结算' : settledLabel && settledLabel !== '暂无结算' ? settledLabel + ' · 已结算' : '你的年度存钱搭档');
    const pending = Array.from(root.children).find(el => el.classList.contains('notice'));
    if (pending) pending.classList.add('ui-pending');
    if (savings) {
      savings.classList.add('ui-savings');
      (pending || q('.ui-page-head', root)).after(savings);
    }
    if (ai) {
      aiCard(ai);
      if (ask) {
        ask.className = 'ui-ask-entry';
        const label = q('span', ask);
        if (label) label.textContent = '问钱有数';
        ai.append(ask);
      }
    }
    if (annual) {
      const ringContainer = Array.from(annual.children).find(el => el.style.display === 'flex' && q('svg', el));
      if (ringContainer) {
        const rate = parseFloat(q('.tag', annual)?.textContent) || 0;
        if(rate >= 100) setPose('goal',root);
        const textBlock = ringContainer.lastElementChild;
        const amount = q('b.big', textBlock)?.textContent || '—';
        const detail = Array.from(textBlock.children).find(el => el.textContent.includes('目标') && !el.matches('button'));
        const button = q('button', textBlock);
        const summary = document.createElement('div');
        summary.innerHTML = '<div class="ui-goal-main"><strong class="big">' + esc(amount) + '</strong><span>' + esc(detail?.textContent || '') + '</span></div>' + progressHTML(rate);
        summary.insertAdjacentHTML('beforeend','<div class="ui-goal-footer"><span>已完成 '+rate+'%</span></div>');
        ringContainer.replaceWith(summary);
        if (button) { button.className = 'ui-text-link'; q('.row', annual).append(button); }
        const tag = q('.tag', annual); if (tag) tag.remove();
      }
    }
  }
  function settle(root) {
    const step = App.settle?.step;
    if (step === 'result') { result(root); return; }
    const card = directCards(root)[0];
    if (!card) return;
    root.classList.add('ui-settle-step');
    card.classList.add('ui-settle-card');
    const info = {
      income:['这个月有哪些收入？','支持一句话录入多笔','notebook'],
      expense:['这个月花在哪些地方？','记录实际支出，保留你在意的生活','notebook'],
      special:['还有哪些特别的事？','投资、借出和还款，确认后再记入','calculator'],
      assets:['确认本月资产','继承上月余额，只修改变化项','calculator']
    }[step] || ['月度结算','只记录事实，计算交给钱有数','notebook'];
    const intro = document.createElement('div'); intro.className = 'ui-step-intro';
    intro.innerHTML = '<div><h2>' + info[0] + '</h2><p>' + info[1] + '</p></div>' + mascot(info[2]);
    card.before(intro);
    const form = q('#quickInput, #specialInput', card)?.parentElement;
    if (form) form.classList.add('ui-entry-form');
    const description = Array.from(card.children).find(el => el.classList.contains('sub'));
    if (description && step === 'assets') description.remove();
    if (step !== 'assets') {
      qa('span[onclick*="settleRemove"]', card).forEach(remove => {
        const row = remove.parentElement;
        row.classList.add('ui-money-row');
        const tag = q('span[style*="10.5px"]', row);
        if (tag) tag.classList.add('ui-row-tag');
      });
    } else {
      const rows = Array.from(card.children).find(el => el.tagName === 'DIV' && qa('[onclick*="settleAssetEdit"]', el).length);
      if (rows) rows.classList.add('ui-asset-list');
    }
    if (step === 'income' || step === 'expense') {
      // 录入合计仍调用原确定性引擎，不在展示层另写财务公式。
      const draft = E.calcMonth({month:App.settle.month, income:App.settle.income || [], expense:App.settle.expense || []});
      const sum = step === 'income' ? draft.incomeTotal : draft.expenseTotal;
      card.insertAdjacentHTML('beforeend', '<div class="ui-row-total"><span>' + (step === 'income' ? '收入' : '支出') + '合计</span><strong class="big">' + E.fmtCents(sum) + '</strong></div>');
    }
  }
  function result(root) {
    root.classList.add('ui-result');
    const title = q('h1', root);
    if (title) title.classList.add('ui-result-head');
    const cards = directCards(root), hero = cards[0];
    if (!hero) return;
    hero.classList.add('ui-result-hero');
    const check = hero.firstElementChild;
    const diff = App.settle?.month;
    const warning = cards.find(c => q('h3', c)?.textContent.includes('资产校验'));
    if (check) check.outerHTML = mascot(warning ? 'puzzled' : 'saved');
    const metrics = Array.from(hero.children).find(el => el.style.display === 'grid');
    if (metrics) metrics.classList.add('ui-result-metrics');
    const status = document.createElement('div'); status.className = 'ui-result-check';
    status.innerHTML = checkIcon + (warning ? '结算已保存，有一处差异需要核对' : '资产校验通过');
    if (warning) status.style.color = 'var(--amber-text)';
    if (metrics) metrics.before(status);
    if (warning) {
      warning.classList.add('ui-result-warning');
      if (App.state.ai?.apiKey && !q('#anomalyAiOut', warning)) {
        const button = document.createElement('button'); button.className = 'btn ghost';
        button.style.marginTop = '18px'; button.textContent = 'AI 帮我找找差在哪';
        button.addEventListener('click', () => App.analyzeAnomaly(button));
        warning.append(button);
        const out = document.createElement('div'); out.id = 'anomalyAiOut'; warning.append(out);
      }
    }
    aiCard(cards.find(c => q('#aiResultBody', c)));
    // 历史结果与规则回退不是模型正在生成；仅真正调用时展示等待态。
    const spinner = q('#aiResultSpin', root); if (spinner) spinner.style.display = 'none';
    root.dataset.month = diff || '';
  }
  function historyPage(root) {
    if (!q('h1', root)) {
      root.innerHTML = '<section class="ui-empty-page">' + mascot('notebook') + '<h2>还没有结算记录</h2><p>完成第一个月结算后，这里会显示历史。</p><button class="btn" onclick="App.go(\'settle\')">去结算</button></section>';
      return;
    }
    pageHeader(root, 'steady');
    const cards = directCards(root);
    cards.slice(1).forEach(card => {
      card.classList.add('ui-history-record');
      const first = q('.row', card); if (first) first.insertAdjacentHTML('beforeend', '<span aria-hidden="true" style="color:var(--text3)">›</span>');
    });
    if(cards[1]){
      const cumulative=cards[1].textContent.match(/年度累计\s*([¥￥][\d,.]+)/);
      if(cumulative){
        const total=document.createElement('section');total.className='ui-history-total';
        total.innerHTML='<p>年度累计存钱</p><div class="big">'+esc(cumulative[1].replace(/\.00$/,''))+'</div>';
        cards[0].before(total);
      }
      cards[1].insertAdjacentHTML('beforebegin','<h2 class="ui-section-label">月度记录</h2>');
    }
  }
  function assets(root) {
    if (!q('h1', root)) {
      root.innerHTML = '<section class="ui-empty-page">' + mascot('safe') + '<h2>小金库，等你来记录</h2><p>完成结算后，这里会展示资产构成与变化。</p><button class="btn" onclick="App.go(\'settle\')">去结算</button></section>';
      addBack(root, 'home'); return;
    }
    pageHeader(root, 'safe'); addBack(root, 'home');
    const cards = directCards(root);
    cards[0]?.classList.add('ui-asset-overview');
    cards[cards.length - 1]?.classList.add('ui-asset-reasons');
    // 将原首页已有构成图复用于资产页，不增加或改写任何财务计算。
    const month = App.latestSettledMonth();
    month.then(async m => {
      const snapshot = (await DB.all('calcSnapshots')).find(s => s.month === m);
      if (!root.isConnected || !snapshot) return;
      const html = await App.assetDonut(snapshot);
      if (!root.isConnected || !html) return;
      const composition = document.createElement('section'); composition.className = 'card ui-composition';
      composition.innerHTML = '<h3>资产构成</h3>' + html;
      cards[0].after(composition);
      if(cards[2]){composition.after(cards[2]);cards[2].after(cards[1]);}
      recolorCharts(composition);
    });
  }
  function goal(root) {
    pageHeader(root, 'goal'); addBack(root, 'home');
    const cards = directCards(root), summary = cards[0];
    if (!summary) return;
    const ring = q('svg', summary);
    const progress = parseFloat(q('text', ring || summary)?.textContent) || 0;
    if(progress >= 100) {
      const notice=document.createElement('p');notice.className='notice ui-pending';notice.setAttribute('role','status');notice.textContent='年度目标达成，每一笔积累都有数。';summary.before(notice);
    }
    const values = qa('b.big', summary);
    if (values.length >= 2) {
      const bottom = summary.lastElementChild?.textContent || '';
      summary.innerHTML = '<p class="sub" style="margin-bottom:8px">年度已存</p><div class="ui-goal-main"><strong class="big">' + esc(values[0].textContent) + '</strong><span>/ ' + esc(values[1].textContent) + '</span></div>' + progressHTML(progress) + '<div class="ui-goal-footer"><span>已完成 ' + progress + '%</span></div><p class="ui-state-copy">' + esc(bottom) + '</p>';
      summary.classList.add('ui-goal-summary');
    }
  }
  // 历史默认展示最近有结算的年份，用户显式选择的年份保持有效。
  const originalHistoryRender=App.renderHistory;
  App.renderHistory=async function(params){
    const selected=new URLSearchParams(params||'');
    if(!selected.has('year')){
      const snapshots=await DB.all('calcSnapshots');
      const latest=snapshots.map(s=>s.month).sort().at(-1);
      if(latest)selected.set('year',latest.slice(0,4));
    }
    return originalHistoryRender.call(this,selected);
  };
  const originalGoalRender=App.renderGoal;
  App.renderGoal=async function(){
    await originalGoalRender.call(this);
    const root=q('#v-goal');if(!root)return;
    const yearly=await DB.getMeta('yearly-'+curYear());
    if(!root.isConnected||!yearly)return;
    const status=App.forecastStatus(yearly,await App.hasSettledRecords());
    const chart=await App.forecastChart(yearly);if(!root.isConnected)return;
    const card=document.createElement('section');card.className='card';
    card.innerHTML='<h3>全年预测</h3><div class="big" style="font-size:30px;margin:12px 0">'+(status.available?esc(E.fmtCents(yearly.yearEndForecast)):'—')+'</div><p class="sub" style="margin-bottom:12px">按目前趋势，预测会随结算更新</p>'+chart;
    q('.ui-goal-summary',root)?.after(card);recolorCharts(card);window.QYSCharts.mount(root);
  };
  const iconPaths = {
    account:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3z"/>',
    backup:'<path d="M7 18H5a4 4 0 1 1 1-8 6 6 0 0 1 12-1 4.5 4.5 0 0 1 1 9h-2M12 20V11m-3 3 3-3 3 3"/>',
    prefs:'<path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    fx:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18z"/>',
    ai:'<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    test:'<path d="m9 3 6 0M10 3v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M8 15h8"/>',
    reset:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>'
  };
  function settings(root) {
    const isMain = q('.seg3', root) && !q('#aiProvider', root);
    pageHeader(root, isMain ? 'safe' : 'calculator');
    if (!isMain) { addBack(root, 'settings'); return; }
    const cards = directCards(root);
    const appearance = cards.find(c => q('.seg3', c));
    const list = cards.find(c => q('[onclick*="p=account"]', c));
    if (list && appearance) {
      const account = q('[onclick*="p=account"]', list);
      if (account) {
        const shell = document.createElement('section'); shell.className = 'card ui-settings-list';
        shell.append(account); appearance.before(shell);
      }
      appearance.insertAdjacentHTML('beforebegin', '<h2 class="ui-section-label">外观</h2>');
      const h3 = q('h3', appearance); if (h3) h3.remove();
      appearance.style.padding = '0'; appearance.style.background = 'transparent'; appearance.style.boxShadow = 'none';
      list.insertAdjacentHTML('beforebegin', '<h2 class="ui-section-label">数据与偏好</h2>');
    }
    directCards(root).forEach(card => {
      if (q('.item', card)) card.classList.add('ui-settings-list');
    });
    const tail = directCards(root).find(c => q('[onclick*="confirmReset"]', c));
    if (tail) tail.insertAdjacentHTML('beforebegin', '<h2 class="ui-section-label">关于</h2>');
    qa('.item', root).forEach(row => {
      const click = row.getAttribute('onclick') || '';
      let name = ['account','backup','prefs','fx','ai'].find(key => click.includes('p=' + key));
      if (!name) name = click.includes('runSelfTest') ? 'test' : click.includes('confirmReset') ? 'reset' : 'info';
      const container = document.createElement('span');
      container.innerHTML = svg(iconPaths[name]);
      const icon = container.firstElementChild; icon.classList.add('ui-settings-icon');
      row.prepend(icon);
      if (name === 'reset') row.classList.add('ui-destructive');
    });
  }
  function launch(root) {
    const logo = q('.launch-logo', root);
    if (logo) logo.outerHTML = mascot('welcome');
    root.classList.add('ui-launch');
  }
  const colorMap = {'#00c26b':'var(--green)','#009a55':'var(--green-d)','#00d67b':'var(--green-l)','#34c759':'#A1AE7C','#ffd60a':'var(--gold)','#0a84ff':'#83A3BA','#af52de':'#A28CB2','#ff9f0a':'var(--amber)','#c7c7cc':'#B3B7AA'};
  function recolorCharts(root) {
    qa('svg [fill],svg [stroke],svg stop', root).forEach(el => {
      ['fill','stroke','stop-color'].forEach(attr => {
        const old = el.getAttribute(attr)?.toLowerCase();
        if (old && colorMap[old]) el.setAttribute(attr,colorMap[old]);
      });
    });
  }
  function accessibility(root) {
    qa('[onclick]:not(button):not(a):not(input):not(textarea):not(select)', root).forEach(el => {
      if (el.closest('button') || el.querySelector('button,input,textarea,select,[onclick]')) return;
      el.setAttribute('role','button'); el.tabIndex = 0;
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    });
    qa('span[onclick*="settleRemove"],span[onclick*="settleAssetDelete"]', root).forEach(span => {
      const button = document.createElement('button');button.type='button';button.className='ui-delete';
      button.setAttribute('onclick',span.getAttribute('onclick'));button.setAttribute('aria-label','删除这条记录');button.innerHTML=trashIcon;
      span.replaceWith(button);
    });
    qa('input,textarea,select', root).forEach(el => {
      if (!el.id || el.getAttribute('aria-label') || el.labels?.length) return;
      const previous = el.previousElementSibling;
      const label = previous?.matches('label') ? previous : null;
      if (label) label.htmlFor = el.id;
      else el.setAttribute('aria-label', el.placeholder || ({goalEdit:'年度存钱目标',aiProvider:'AI 供应商',aiBase:'AI 接口地址',aiModel:'模型名称',aiKey:'API Key'}[el.id]) || el.id);
    });
  }
  function decorate(view) {
    const root = q('#v-' + view); if (!root || root.dataset.redesigned) return;
    root.dataset.redesigned = 'true';
    if (view === 'home') home(root);
    else if (view === 'settle') settle(root);
    else if (view === 'history') historyPage(root);
    else if (view === 'assets') assets(root);
    else if (view === 'goal') goal(root);
    else if (view === 'settings') settings(root);
    else if (view === 'launch') launch(root);
    else if (view === 'login' && !q('h1.page', root)) {
      const logo = q('img', root); if (logo) logo.outerHTML = mascot('welcome');
    } else { pageHeader(root, poses[view] || 'notebook'); if (view !== 'init') addBack(root, 'settings'); }
    Array.from(root.children).filter(el => el.style.display === 'flex' && qa(':scope > .btn', el).length > 1).forEach(el => el.classList.add('ui-actions'));
    qa('.big,.amt,.num-pos,.num-neg,#aiBody,#aiResultBody,#aiResultTitle,.ui-ai-title,.ui-goal-main span',root).forEach(el=>{
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      let node;while((node=walker.nextNode()))node.textContent=node.textContent.replace(/([¥￥][\d,]+)\.00\b/g,'$1');
    });
    accessibility(root); recolorCharts(root);
    const active = ['assets','goal'].includes(view) ? 'home' : ['account','backup','prefs','fx'].includes(view) ? 'settings' : view;
    qa('#tabbar .tab').forEach(tab => { tab.classList.toggle('active', tab.dataset.view === active);tab.setAttribute('aria-current',tab.dataset.view === active ? 'page' : 'false'); });
    const tag = q('meta[name="theme-color"]'); if (tag) tag.content = cssVar('--bg');
  }
  // 坐标系随真实可用宽度变化，避免限高后的 SVG 按等比例缩在中央。
  let trendObserver;
  function fitSavingsTrend(root) {
    trendObserver?.disconnect();
    const chart=q('svg[aria-label="最近已结算月份的存钱趋势"]',root);
    if(!chart)return;
    const points=qa('circle',chart).map(el=>({y:Number(el.getAttribute('cy')),label:el.querySelector('title')?.textContent||''}));
    const labels=qa('text',chart).map(el=>el.textContent);
    chart.classList.add('ui-trend-chart');
    let previousWidth=0;
    const draw=()=>{
      if(!chart.isConnected)return;
      const width=chart.getBoundingClientRect().width;if(width<=0)return;
      if(Math.abs(width-previousWidth)<0.1)return;previousWidth=width;
      const padding=16;
      chart.setAttribute('viewBox','0 0 '+width+' 104');
      const scaled=points.map((p,i)=>({...p,x:points.length===1?width/2:padding+i*(width-padding*2)/(points.length-1)}));
      chart.innerHTML='<path d="'+scaled.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y).join(' ')+'" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round"/>'+scaled.map((p,i)=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="3" fill="var(--card)" stroke="var(--green)" stroke-width="1.5"><title>'+esc(p.label)+'</title></circle><text x="'+p.x+'" y="94" text-anchor="middle" font-size="12" fill="var(--axis)">'+esc(labels[i])+'</text>').join('');
    };
    draw();trendObserver=new ResizeObserver(()=>requestAnimationFrame(draw));trendObserver.observe(chart);
  }
  // 同时修正首页和资产明细复用的饼图，文字按实际显示尺寸设计。
  const originalDonut=App.assetDonut;
  App.assetDonut=async function(snapshot){
    const html=await originalDonut.call(this,snapshot);
    const template=document.createElement('template');template.innerHTML=html;
    const chart=q('svg',template.content);if(!chart)return html;
    chart.parentElement.classList.add('ui-asset-donut');
    chart.parentElement.lastElementChild.classList.add('ui-donut-legend');
    chart.setAttribute('role','img');chart.setAttribute('aria-label','总资产分类构成');
    const text=qa('text',chart);
    if(text[0]){text[0].setAttribute('font-size','24');text[0].setAttribute('y','96');}
    if(text[1]){text[1].setAttribute('font-size','18');text[1].setAttribute('y','122');}
    return template.innerHTML;
  };
  const originalSetView = App.setView;
  App.setView = function (view, html) {
    trendObserver?.disconnect();
    window.QYSUI.reset();
    originalSetView.call(this,view,html);decorate(view);
    window.QYSUI.decorate(q('#v-'+view),view);
    if(view==='home')fitSavingsTrend(q('#v-home'));
    window.QYSCharts.mount(q('#v-'+view));
  };
  // 追加鼠标拖拽与键盘操作，保留原触摸排序和偏好数据格式。
  const originalDrag=App._bindTouchDrag;
  App._bindTouchDrag=function(listSel,orderKey,tagSel){
    originalDrag.call(this,listSel,orderKey,tagSel);
    const list=q(listSel);if(!list)return;
    let dragged;
    const sync=()=>{
      this[orderKey]=qa('.item',list).map(el=>el.dataset.k);
      qa('.item',list).forEach((el,i)=>{const tag=q(tagSel||'.tag',el);if(tag)tag.textContent=String(i+1);});
    };
    qa('.item',list).forEach(row=>{
      row.draggable=true;
      row.addEventListener('dragstart',e=>{dragged=row;e.dataTransfer.effectAllowed='move';});
      row.addEventListener('dragover',e=>{e.preventDefault();if(dragged&&dragged!==row){const r=row.getBoundingClientRect();list.insertBefore(dragged,e.clientY<r.top+r.height/2?row:row.nextElementSibling);}});
      row.addEventListener('dragend',()=>{dragged=null;sync();});
      const grip=q('.grip',row);if(!grip)return;
      grip.tabIndex=0;grip.setAttribute('role','button');grip.setAttribute('aria-label','调整'+(q('b',row)?.textContent||'偏好')+'，使用上下方向键');
      grip.addEventListener('keydown',e=>{if(e.key==='ArrowUp'&&row.previousElementSibling){e.preventDefault();list.insertBefore(row,row.previousElementSibling);sync();}else if(e.key==='ArrowDown'&&row.nextElementSibling){e.preventDefault();list.insertBefore(row.nextElementSibling,row);sync();}grip.focus();});
    });
  };
  const toastObserver=new MutationObserver(()=>{
    const message=q('#toast').textContent||'';
    if(!q('#toast').classList.contains('show'))return;
    if(/连接失败|接口不可用|导入失败|未识别|错误/.test(message)){
      const root=q('#app > .view');if(!root)return;
      setPose('puzzled',root);
      let notice=q('.ui-inline-status',root);
      if(!notice){notice=document.createElement('p');notice.className='ui-inline-status';notice.setAttribute('role','alert');const head=q('.ui-page-head,.ui-step-intro',root);if(head)head.after(notice);else root.prepend(notice);}
      if(notice.textContent!==message)notice.textContent=message;
    }
  });
  toastObserver.observe(q('#toast'),{attributes:true,childList:true,subtree:true});
  // 四步向导换为带名称的步骤条，流程顺序和操作保持原样。
  App.settleStepBar = function (step) {
    const order=['income','expense','special','assets'], labels=['收入','支出','特殊事项','资产确认'], index=order.indexOf(step);
    return '<ol class="ui-steps" aria-label="月度结算进度">'+order.map((key,i)=>'<li class="'+(i<index?'is-done':i===index?'is-current':'')+'"'+(i===index?' aria-current="step"':'')+'>'+labels[i]+'</li>').join('')+'</ol>';
  };
  App.settleHeader = function () { return '<header class="ui-settle-header"><h1 class="page">月度结算</h1><button class="ui-month-picker" onclick="App.openMonthPicker()" aria-label="切换结算月份">'+esc(monthCn(this.settle.month))+'⌄</button></header>'; };
  const originalAILoad = App.settleAILoad;
  App.settleAILoad = async function (...args) {
    const month=args[0], root=q('#v-settle');
    const hasModel=!!App.state.ai?.apiKey;
    const spinner=root && q('#aiResultSpin',root);
    let note;
    if (hasModel && root) {
      setPose('thinking',root);
      if (spinner) spinner.style.display='inline-block';
      note=document.createElement('p');note.className='ui-state-copy';note.setAttribute('role','status');
      note.innerHTML='<span class="ui-state-dots"><i></i><i></i><i></i></span>数数正在分析，结算结果已保存在本机。';
      q('.ui-result-hero',root)?.append(note);
    }
    try { return await originalAILoad.apply(this,args); }
    finally {
      if(root?.isConnected && root.dataset.month===month) {
        setPose(q('.ui-result-warning',root)?'puzzled':'saved',root);
        note?.remove(); if(spinner)spinner.style.display='none';
      }
    }
  };
  // 通用网络/解析操作：只替换该页角色姿态，不重复添加 IP。
  ['settleQuickAdd','settleSpecialParse','fetchFxNow','testAi','analyzeAnomaly'].forEach(name=>{
    const original=App[name]; if(typeof original!=='function')return;
    App[name]=async function(...args){
      const root=q('#app > .view'), character=root&&q('.ui-mascot',root), before=character?.dataset.pose;
      if(character)setPose('thinking',root);
      try{return await original.apply(this,args);}
      finally{if(root?.isConnected&&character){const message=q('#toast').textContent||'';character.dataset.pose=(/连接失败|接口不可用|导入失败|未识别|错误/.test(message)||q('#qys-entry-error',root))?'puzzled':before;}}
    };
  });
  // 初始化各子步异步填入的表单仍使用原实现，补充标签与键盘操作。
  const observer=new MutationObserver(()=>{
    const root=q('#app > .view');if(!root)return;
    qa('input,textarea,select',root).forEach(el=>{
      if(!el.getAttribute('aria-label')&&!el.labels?.length)el.setAttribute('aria-label',el.placeholder||el.id||'输入');
    });
  });
  observer.observe(q('#app'),{childList:true,subtree:true});
  q('#tabbar').setAttribute('aria-label','主导航');
  q('#toast').setAttribute('role','status');q('#toast').setAttribute('aria-live','polite');
  // 修正两个同为时钟的旧导航图标，只改变图形。
  q('[data-view="settle"] svg').innerHTML='<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 3h6v4H9zM8 12h8m-8 4h5"/>';
  q('[data-view="history"] svg').innerHTML='<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2"/>';
  // 稀疏趋势图只改变图形载体，仍读取原始计算快照中的存钱结果。
  // 首页趋势由 charts.js 提供点选读值和真实时间间隔。
  window.QYSStartup.start();
})();
