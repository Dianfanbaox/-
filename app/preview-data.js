/* 独立的示例预览。只有显式 ?preview=1 才写示例库；正式入口不加载示例数据。 */
window.seedQYSPreview = async function () {
  if (new URLSearchParams(location.search).get('preview') !== '1') return;
  document.documentElement.dataset.preview = 'true';
  if (await DB.getMeta('uiPreviewSeedVersion') === 2) return;
  const year = new Date().getFullYear();
  const prefs = {saving:1,lifestyle:2,security:3,growth:4,investment:5,ai_tone:'direct'};
  const assets = [
    {id:'demo-bank',type:'bank',typeName:'银行存款',name:'工资卡',currency:'CNY',amount:9000000,color:'#73834F',order:0},
    {id:'demo-investment',type:'investment',typeName:'投资本金',name:'基金本金',currency:'CNY',amount:4000000,color:'#83A3BA',order:1},
    {id:'demo-cash',type:'cash',typeName:'现金',name:'现金钱包',currency:'CNY',amount:2000000,color:'#D6B65F',order:2}
  ];
  for(const asset of assets) await Svc.saveAsset(asset);
  await DB.setMeta('goal',12000000); await DB.setMeta('prefs',prefs);
  await Svc.setYearly(year,12000000,'示例目标');
  let previous = Object.fromEntries(assets.map(a=>[a.id,a.amount]));
  const baseline = (year-1)+'-12';
  await Svc.saveSnapshots(baseline,assets.map(a=>({assetId:a.id,originalCents:a.amount,currency:'CNY',cnyCents:a.amount,source:'demo'})));
  const baseResult=E.calcMonth({month:baseline,prevSnapshots:previous,snapshots:Object.fromEntries(Object.entries(previous).map(([id,value])=>[id,{cnyCents:value}]))});
  await DB.put('calcSnapshots',{id:baseline,month:baseline,income_total:0,expense_total:0,savings:baseResult.savings,total_assets:baseResult.totalAssets,asset_change:0,anomaly_diff:0,asset_values:baseResult.assetValues,reasons:baseResult.assetChangeReasons,causes:[],calculation_version:DB.CALC_VERSION});
  const savings = [800000,900000,900000,1000000,1100000,1300000,1200000,800000,1000000];
  // 示例为当年已发生月份，避免时钟变化产生未来结算记录。
  const count = Math.min(9,new Date().getMonth()+1);
  for(let i=0;i<count;i++) {
    const month=year+'-'+String(i+1).padStart(2,'0');
    const income=[{id:'demo-salary-'+month,month,desc:'工资',amount:2000000},{id:'demo-parttime-'+month,month,desc:'兼职',amount:200000}];
    const expense=[{id:'demo-rent-'+month,month,desc:'房租',amount:400000},{id:'demo-living-'+month,month,desc:'日常生活',amount:2200000-savings[i]-400000}];
    for(const item of income)await Svc.saveIncome(item);
    for(const item of expense)await Svc.saveExpense(item);
    const current={...previous,'demo-bank':previous['demo-bank']+savings[i]};
    const entries=Object.entries(current).map(([assetId,value])=>({assetId,originalCents:value,currency:'CNY',cnyCents:value,source:'demo'}));
    await Svc.saveSnapshots(month,entries);
    const result=E.calcMonth({month,income,expense,prevSnapshots:previous,snapshots:Object.fromEntries(Object.entries(current).map(([id,value])=>[id,{cnyCents:value}]))});
    await DB.put('calcSnapshots',{id:month,month,user_id:'local',income_total:result.incomeTotal,expense_total:result.expenseTotal,savings:result.savings,total_assets:result.totalAssets,asset_change:result.assetChange,theoretical_assets:result.theoreticalAssets,anomaly_diff:result.anomalyDiff,asset_values:result.assetValues,reasons:result.assetChangeReasons,causes:result.anomalyCauses,calculation_version:DB.CALC_VERSION,updated_at:new Date().toISOString()});
    previous=current;
  }
  await Svc.saveYearlySummary(year,12000000);
  await DB.setMeta('initialized',{at:new Date().toISOString(),version:1});
  await DB.setMeta('uiPreviewSeedVersion',2);
};
