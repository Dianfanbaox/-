/* P1 图表展示：复用已有快照/全年预测，不写入数据，不改变财务规则。 */
(function () {
  'use strict';
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const observers = new Map();
  const HEIGHT = 184, FONT = 12;
  const amount = value => E.fmtCents(value);
  const compact = cents => {
    const yuan = cents / 100;
    if (Math.abs(yuan) >= 100000000) return (yuan / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    return Math.abs(yuan) >= 10000 ? (yuan / 10000).toFixed(1).replace(/\.0$/, '') + '万' : yuan.toLocaleString('zh-CN', {maximumFractionDigits:2});
  };
  const text = (x, y, value, extra = '') => '<text x="'+x+'" y="'+y+'" font-size="'+FONT+'" fill="var(--axis)" text-anchor="middle" '+extra+'>'+escapeHTML(value)+'</text>';
  const xAt = (i, count, width, pad = 22) => count === 1 ? width / 2 : pad + i * (width - pad * 2) / (count - 1);
  function labelIndices(count, width) {
    const step = Math.max(1, Math.ceil(36 / (width / count)));
    const indices = [];
    for (let i=0;i<count;i+=step) if (i===0 || count-1-i>=step) indices.push(i);
    if (!indices.includes(count-1)) indices.push(count-1);
    return indices;
  }
  function frame(kind, data, label) {
    return (kind==='bars'?'<p class="qys-chart-note">未记录留空 · ○ 为零值 · 负值在零线下方</p>':'')+'<div class="qys-chart" data-chart-kind="'+kind+'" data-chart-model="'+escapeHTML(JSON.stringify(data))+'"><svg role="'+(kind==='trend'?'group':'img')+'" aria-label="'+escapeHTML(label)+'" viewBox="0 0 320 '+HEIGHT+'" height="'+HEIGHT+'"></svg>'+ (kind==='trend'?'<p class="qys-trend-readout" role="status" aria-live="polite"></p>':'')+tableSummary(kind,data)+'</div>';
  }
  function linePath(points, width, y, breakMissing) {
    let previous = null;
    return points.map(p => {
      const command = previous && (!breakMissing || p.index===previous.index+1) ? 'L' : 'M';
      previous = p;
      return command + xAt(p.index,12,width).toFixed(2)+' '+y(p.value).toFixed(2);
    }).join(' ');
  }
  function drawBars(svg, data, width) {
    const items=data.items,n=items.length,valid=items.map((it,index)=>({...it,index})).filter(it=>Number.isFinite(it.value));
    const low=Math.min(0,...valid.map(i=>i.value)),high=Math.max(0,...valid.map(i=>i.value)),range=high-low||1;
    const min=low<0?low-range*.15:0,max=high>0?high+range*.2:1;
    const y=value=>24+(max-value)/(max-min)*(HEIGHT-62),zero=y(0),cell=(width-12)/n,bw=Math.min(28,cell*.67),x=i=>6+(i+.5)*cell;
    const last=valid.at(-1),best=valid.slice().sort((a,b)=>Math.abs(b.value)-Math.abs(a.value))[0],chosen=[];
    for(const item of cell>=52?valid:[last,best].filter(Boolean)){const label=compact(item.value),half=Math.max(18,label.length*3.8);if(chosen.every(c=>Math.abs(x(c.index)-x(item.index))>half+c.half+8))chosen.push({...item,half});}
    let html='<line data-zero-line="true" x1="6" x2="'+(width-6)+'" y1="'+zero+'" y2="'+zero+'" stroke="var(--axis)" stroke-width="1"/>';
    html+=items.map((it,i)=>{
      const title='<title>'+escapeHTML(it.label+' '+(it.value===null?'未记录':amount(it.value)))+'</title>';
      if(!Number.isFinite(it.value))return '<g data-state="missing" data-month-index="'+i+'">'+title+'</g>';
      if(it.value===0)return '<g data-state="zero" data-month-index="'+i+'">'+title+'<circle cx="'+x(i)+'" cy="'+zero+'" r="3" fill="var(--card)" stroke="var(--axis)" stroke-width="1.5"/>'+text(x(i),zero-9,'0')+'</g>';
      const valueY=y(it.value);return '<rect data-state="'+(it.value<0?'negative':'positive')+'" data-value-cents="'+it.value+'" x="'+(x(i)-bw/2)+'" y="'+Math.min(valueY,zero)+'" width="'+bw+'" height="'+Math.abs(valueY-zero)+'" rx="'+Math.min(5,bw*.25)+'" fill="'+(it.mark?'var(--gold-bar)':it.value>0?'var(--green)':'var(--red)')+'">'+title+'</rect>';
    }).join('');
    html+=labelIndices(n,width).map(i=>text(x(i),HEIGHT-7,items[i].label)).join('');
    html+=chosen.filter(it=>it.value!==0).map(it=>text(x(it.index),y(it.value)+(it.value<0?16:-7),compact(it.value))).join('');svg.innerHTML=html;
  }
  function drawForecast(svg, data, width) {
    const all=[0,data.goal,...data.actual.map(p=>p.value),...data.future.map(p=>p.value)];
    const low=Math.min(...all), high=Math.max(1,...all), range=high-low||1;
    const min=low<0?low-range*.1:0, max=high+range*.1;
    const y=v=>24+(max-v)/(max-min)*(HEIGHT-54);
    const actualPath=linePath(data.actual,width,y,true), futurePath=linePath(data.future,width,y,false);
    let html=data.goal>0?'<line x1="22" x2="'+(width-22)+'" y1="'+y(data.goal)+'" y2="'+y(data.goal)+'" stroke="var(--axis)" stroke-width="1.5" stroke-dasharray="5 4"/>':'';
    html+=[0,5,11].map(i=>text(xAt(i,12,width),HEIGHT-7,(i+1)+'月')).join('');
    if(actualPath)html+='<path data-series="actual" d="'+actualPath+'" fill="none" stroke="var(--green)" stroke-width="2.5"/>';
    if(futurePath)html+='<path data-series="forecast" d="'+futurePath+'" fill="none" stroke="var(--amber)" stroke-width="2.5" stroke-dasharray="6 4"/>';
    html+=data.actual.map(p=>'<circle data-actual-month="'+p.month+'" data-value-cents="'+p.value+'" cx="'+xAt(p.index,12,width)+'" cy="'+y(p.value)+'" r="4" fill="var(--card)" stroke="var(--green)" stroke-width="2"><title>'+escapeHTML(p.month+' 累计 '+amount(p.value))+'</title></circle>').join('');
    svg.innerHTML=html;
  }
  function drawAssets(svg, data, width) {
    const present=data.cells.filter(Boolean), values=present.map(p=>p.value);
    let low=Math.min(...values),high=Math.max(...values);if(high===low)high=low+100000;
    const range=high-low;low=Math.min(low,Math.max(0,low-range*.15));high+=range*.15;
    const y=v=>28+(1-(v-low)/(high-low))*(HEIGHT-61);
    const points=data.cells.map((p,index)=>p?{...p,index}:null).filter(Boolean);
    let html='<path d="'+linePath(points,width,y,true)+'" fill="none" stroke="var(--green)" stroke-width="2"/>';
    html+=points.map(p=>'<circle cx="'+xAt(p.index,12,width)+'" cy="'+y(p.value)+'" r="3" fill="var(--green)"><title>'+escapeHTML(p.month+' '+amount(p.value))+'</title></circle>').join('');
    html+=labelIndices(12,width).map(i=>text(xAt(i,12,width),HEIGHT-7,data.labels[i])).join('');
    // 首尾数值以正常字号放在图外，避免相邻月份或相同金额时标签互相遮挡。
    svg.innerHTML=html;
  }
  function drawTrend(svg,data,width,node) {
    const rows=data.rows,selected=Math.min(rows.length-1,Math.max(0,Number(node.dataset.selectedIndex??rows.length-1)));
    const values=rows.map(r=>r.value),low=Math.min(0,...values),high=Math.max(1,...values),range=high-low||1;
    const first=rows[0].index,last=rows.at(-1).index,count=last-first+1;
    const x=r=>count===1?width/2:24+(r.index-first)*(width-48)/(count-1),y=v=>20+(high-v)/range*62;
    let previous=null;const path=rows.map(r=>{const cmd=previous&&r.index===previous.index+1?'L':'M';previous=r;return cmd+x(r)+' '+y(r.value);}).join(' ');
    let html='<path d="'+path+'" fill="none" stroke="var(--green)" stroke-width="2"/>';
    const labelRows=[];for(const r of [...rows].reverse())if(labelRows.every(p=>Math.abs(x(p)-x(r))>=34))labelRows.push(r);
    html+=labelRows.map(r=>text(x(r),125,Number(r.month.slice(5))+'月')).join('');
    html+=rows.map((r,i)=>'<g data-trend-index="'+i+'" role="button" tabindex="0" aria-label="'+escapeHTML(monthCn(r.month)+'，存钱 '+amount(r.value))+'" aria-pressed="'+(i===selected)+'"><circle cx="'+x(r)+'" cy="'+y(r.value)+'" r="22" fill="transparent"/><circle cx="'+x(r)+'" cy="'+y(r.value)+'" r="'+(i===selected?4:3)+'" fill="var(--card)" stroke="var(--green)" stroke-width="'+(i===selected?2:1.5)+'"/></g>').join('');
    svg.innerHTML=html;node.querySelector('.qys-trend-readout').textContent=monthCn(rows[selected].month)+' · 存钱 '+amount(rows[selected].value);
  }
  function tableSummary(kind,data) {
    const rows=kind==='bars'?data.items.map(r=>[r.label,r.value===null?'未记录':amount(r.value)]):kind==='forecast'?[...data.actual.map(r=>[r.month+' 已发生累计',amount(r.value)]),...data.future.slice(1).map(r=>[(r.index+1)+'月预测累计',amount(r.value)])]:kind==='trend'?data.rows.map(r=>[r.month,amount(r.value)]):data.cells.filter(Boolean).map(r=>[r.month,amount(r.value)]);
    return '<details class="qys-chart-details"><summary>查看月份金额</summary><table><caption class="qys-sr-only">图表文字数据</caption><thead><tr><th scope="col">月份/状态</th><th scope="col">金额</th></tr></thead><tbody>'+rows.map(r=>'<tr><th scope="row">'+escapeHTML(r[0])+'</th><td>'+escapeHTML(r[1])+'</td></tr>').join('')+'</tbody></table></details>';
  }
  function mount(root) {
    for(const [node,observer] of observers)if(!node.isConnected){observer.disconnect();observers.delete(node);}
    for(const node of root.querySelectorAll('.qys-chart')) {
      if(observers.has(node))continue;
      const svg=node.querySelector('svg'),data=JSON.parse(node.dataset.chartModel);
      let oldWidth=0;
      const draw=()=>{if(!node.isConnected)return;const width=svg.getBoundingClientRect().width;if(width<=0||Math.abs(width-oldWidth)<.1)return;oldWidth=width;svg.setAttribute('viewBox','0 0 '+width+' '+(node.dataset.chartKind==='trend'?132:HEIGHT));({bars:drawBars,forecast:drawForecast,assets:drawAssets,trend:drawTrend})[node.dataset.chartKind](svg,data,width,node);};
      if(node.dataset.chartKind==='trend'){
        const select=index=>{node.dataset.selectedIndex=String(index);drawTrend(svg,data,svg.getBoundingClientRect().width,node);};
        svg.addEventListener('click',event=>{const target=event.target.closest('[data-trend-index]');if(target)select(Number(target.dataset.trendIndex));});
        svg.addEventListener('keydown',event=>{const target=event.target.closest('[data-trend-index]');if(!target)return;let index=Number(target.dataset.trendIndex);if(event.key==='ArrowLeft')index=Math.max(0,index-1);else if(event.key==='ArrowRight')index=Math.min(data.rows.length-1,index+1);else if(!['Enter',' '].includes(event.key))return;event.preventDefault();select(index);svg.querySelector('[data-trend-index="'+index+'"]').focus();});
      }
      draw();const observer=new ResizeObserver(()=>requestAnimationFrame(draw));observer.observe(node);observers.set(node,observer);
    }
  }
  window.QYSCharts={mount};
  App.forecastStatus=function(yearly,hasRecords) {
    if(!hasRecords||!yearly||!Number.isFinite(yearly.yearEndForecast))return {label:'暂无预测',tone:'neutral',available:false};
    const goal=yearly.goal||App.state.goal||0,difference=E.roundCents(yearly.yearEndForecast-goal);
    if(goal<=0)return {label:'未设置目标',tone:'neutral',available:true};
    return {label:difference<0?'还差 '+amount(-difference):difference>0?'预计超出 '+amount(difference):'预计达成',tone:difference<0?'amber':'green',available:true};
  };
  App.barChart=function(items,opts={}) {
    return '<div class="chart-title">'+(opts.title||'')+(opts.sub||'')+'</div>'+frame('bars',{items},'年度各月存钱，完整金额见下方月度记录');
  };
  App.forecastChart=async function(yearly) {
    const initial=await QYSUI.initialMonths();
    const rows=(await DB.all('calcSnapshots')).filter(r=>r.month.startsWith(curYear()+'-')&&r.month<=nowMonth()&&!initial.has(r.month)&&Number.isFinite(r.savings)).sort((a,b)=>a.month.localeCompare(b.month));
    if(!rows.length||!yearly||!Number.isFinite(yearly.yearEndForecast))return '<p class="qys-chart-note">完成首个月结算后再生成预测</p>';
    let cumulative=0;
    const actual=rows.map(r=>{cumulative=E.roundCents(cumulative+r.savings);return {month:r.month,index:Number(r.month.slice(5))-1,value:cumulative};});
    const last=actual.at(-1),remaining=11-last.index,future=[];
    if(remaining>0){future.push(last);for(let i=last.index+1;i<12;i++)future.push({index:i,value:E.roundCents(last.value+(yearly.yearEndForecast-last.value)*(i-last.index)/remaining)});}
    const goal=yearly.goal||0;
    return '<p class="qys-chart-note">'+escapeHTML(last.month.slice(0,4)+'年'+Number(last.month.slice(5))+'月')+' · 已发生累计 '+escapeHTML(amount(cumulative))+(actual.length===1?' · 目前仅 1 个月实际记录':'')+'</p>'+frame('forecast',{actual,future,goal},'年度累计存钱：实线为已发生，虚线从最后记录月延伸至已有全年预测')+'<div class="qys-chart-legend"><span><i></i>已发生</span><span><i class="forecast"></i>预测</span>'+(goal>0?'<span><i class="goal"></i>目标 '+escapeHTML(amount(goal))+'</span>':'')+'</div>';
  };
  App.trendChart=async function(){
    const initial=await QYSUI.initialMonths(),rows=(await DB.all('calcSnapshots')).filter(r=>!initial.has(r.month)).sort((a,b)=>a.month.localeCompare(b.month)).slice(-6).map(r=>({month:r.month,value:r.savings,index:Number(r.month.slice(0,4))*12+Number(r.month.slice(5))-1}));
    if(!rows.length)return '<p class="qys-chart-note">完成首次结算后显示存钱趋势</p>';
    const gap=rows.some((r,i)=>i>0&&r.index!==rows[i-1].index+1);
    return frame('trend',{rows},'存钱趋势，可点选或用方向键查看各月金额')+(rows.length===1||gap?'<p class="qys-chart-note">':'<p class="qys-sr-only">')+(rows.length===1?'目前仅 1 个月记录，完成下个月结算后形成趋势':gap?'缺失月份不连线':'点选圆点可查看金额')+'</p>';
  };
  App.assetTrendChart=async function() {
    const all=await DB.all('calcSnapshots'),latest=await this.latestSettledMonth();
    if(!latest)return '<div class="empty">完成结算后显示走势</div>';
    const [year,month]=latest.split('-').map(Number),months=[];
    for(let i=11;i>=0;i--){const d=new Date(year,month-1-i,1);months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));}
    const cells=months.map(month=>{const row=all.find(r=>r.month===month);return row?{month,value:row.total_assets}:null;}),present=cells.filter(Boolean);
    if(present.length<2)return '<div class="empty" style="padding:20px 8px;">至少结算 2 个月后，这里会显示总资产走势</div>';
    const labels=months.map(m=>Number(m.slice(5))===1?m.slice(2,4)+'/1月':Number(m.slice(5))+'月');
    return '<div class="chart-title">近 12 个月总资产走势</div><div class="qys-chart-summary"><span>'+escapeHTML(present[0].month+' '+amount(present[0].value))+'</span><span>'+escapeHTML(present.at(-1).month+' '+amount(present.at(-1).value))+'</span></div>'+frame('assets',{cells,labels},'近12个月总资产走势，首尾月份与金额见图上方');
  };
})();
