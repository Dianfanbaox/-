/* ============================================================
 * Personal Wealth OS 1.0 — Calculation Engine
 * 唯一财务计算来源。UI 不得散落财务公式。
 * 金额一律以「分」(整数) 存储与计算，避免浮点误差。
 * 规则依据：03_财务计算引擎.md（最高优先级）
 * ============================================================ */
(function (global) {
  'use strict';

  // ---------- 工具 ----------
  const M = 100; // 1 元 = 100 分
  function roundCents(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function fmtCents(c) {
    const sign = c < 0 ? '-' : '';
    const a = Math.abs(Math.round(c));
    const y = Math.floor(a / 100), f = a % 100;
    return sign + '¥' + y.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + String(f).padStart(2, '0') : '');
  }
  function fmtNum(n, dec) { return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  function sum(arr) { return arr.reduce((a, b) => a + (b || 0), 0); }

  // ---------- 月份工具 ----------
  function addMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function monthList(startYm, endYm) {
    const out = []; let cur = startYm;
    while (cur <= endYm) { out.push(cur); cur = addMonth(cur, 1); }
    return out;
  }

  // ---------- 月度计算 ----------
  /**
   * facts: {
   *   month,
   *   income:      [{ amount, toSavings }]
   *   expense:     [{ amount }]
   *   investments: [{ type:'buy'|'sell'|'userIncome', tx, principal, realized, source }]
   *   loans:       [{ type:'lend'|'repay'|'writeoff', cashDelta, loanDelta, writeoffToSavings }]
   *   prevSnapshots: { assetId: cnyCents }     // 上月月末值（人民币）
   *   snapshots:    { assetId: { originalCents, fxRate, cnyCents, isNew, isArchived } }  // 本月确认值
   *   fxChanges:    { assetId: cnyDelta }      // 汇率因素导致的 cny 变化（外币）
   * }
   * 返回本月快照与校验信息。
   */
  function calcMonth(facts) {
    const income = facts.income || [];
    const expense = facts.expense || [];
    const inv = facts.investments || [];
    const loans = facts.loans || [];
    const prev = facts.prevSnapshots || {};
    const snaps = facts.snapshots || {};
    const fx = facts.fxChanges || {};

    // 1) 本月存钱
    const incomeToSavings = sum(income.filter(i => i.toSavings !== false).map(i => i.amount));
    const expenseTotal = sum(expense.map(e => e.amount));
    const realizedPnl = sum(inv.filter(i => i.type === 'sell').map(i => i.realized))
      + sum(inv.filter(i => i.type === 'userIncome').map(i => i.realized !== undefined ? i.realized : i.tx));
    const writeoffPnl = sum(loans.filter(l => l.type === 'writeoff' && l.writeoffToSavings).map(l => -l.loanDelta));
    const savings = roundCents(incomeToSavings - expenseTotal + realizedPnl + writeoffPnl);

    // 2) 本月总资产
    let totalAssets = 0;
    const assetValues = {};
    Object.keys(snaps).forEach(id => {
      const s = snaps[id];
      const v = s.cnyCents !== undefined ? s.cnyCents : Math.round(s.originalCents * (s.fxRate || 1));
      assetValues[id] = v;
      totalAssets += v;
    });
    totalAssets = roundCents(totalAssets);

    // 3) 总资产变化与原因分解
    const prevTotal = sum(Object.keys(prev).map(k => prev[k]));
    const assetChange = roundCents(totalAssets - prevTotal);
    const reasons = [];
    reasons.push({ key: 'savings', label: '存钱净流入（收入/支出/盈亏）', amount: roundCents(savings) });
    const fxTotal = sum(Object.keys(fx).map(k => fx[k]));
    if (Math.abs(fxTotal) > 0.5) reasons.push({ key: 'fx', label: '外币汇率变化', amount: roundCents(fxTotal) });
    // 非存钱资产变动（如 toSavings=false 的收入、买入卖出本金结构调整的净 0 之外的部分）
    const incomeNotToSavings = sum(income.filter(i => i.toSavings === false).map(i => i.amount));
    if (Math.abs(incomeNotToSavings) > 0.5) reasons.push({ key: 'incomeNonSavings', label: '不计入存钱的收入', amount: roundCents(incomeNotToSavings) });
    const other = roundCents(assetChange - savings - fxTotal - incomeNotToSavings);
    if (Math.abs(other) > 0.5) reasons.push({ key: 'other', label: '资产调整/新增归档（待核实）', amount: other });

    // 4) 资产校验
    // 理论月末资产 = 上月总资产 + 存钱 + 汇率变化 + 不计存钱收入 + 新增资产 - 归档资产
    let added = 0, archived = 0;
    Object.keys(snaps).forEach(id => {
      if (snaps[id].isNew) added += assetValues[id];
      if (snaps[id].isArchived) archived += prev[id] || 0;
    });
    const theoreticalAssets = roundCents(prevTotal + savings + fxTotal + incomeNotToSavings + added - archived);
    const anomalyDiff = roundCents(totalAssets - theoreticalAssets);
    const anomalyCauses = buildCauses(anomalyDiff, facts);

    return {
      month: facts.month,
      incomeTotal: roundCents(sum(income.map(i => i.amount))),
      expenseTotal,
      savings,
      totalAssets,
      assetChange,
      assetChangeReasons: reasons,
      assetValues,
      theoreticalAssets,
      anomalyDiff,
      anomalyCauses,
    };
  }

  function buildCauses(diff, facts) {
    if (Math.abs(diff) < 0.5) return [];
    const causes = [];
    causes.push({ label: '可能有漏记的收入或支出', evidence: '校验差额 ' + fmtCents(diff) });
    causes.push({ label: '新增资产未记录 / 资产减少未记录', evidence: '核对本月资产快照与上月差异' });
    causes.push({ label: '投资卖出对应本金填写可能有误', evidence: '已实现盈亏只按本金计算' });
    causes.push({ label: '借出款 / 外币金额或汇率可能有误', evidence: '外币按冻结汇率折算' });
    causes.push({ label: '其他自定义事项', evidence: '可添加说明，AI 只提示可能性' });
    return causes;
  }

  // ---------- 年度重算 ----------
  /**
   * factsByMonth: { 'YYYY-MM': facts }
   * opts: { year, yearlyGoalCents, forecastOverrides }
   * 从最早月份顺序重算；返回 { results, yearly }
   */
  function recalcAll(factsByMonth, opts) {
    const months = Object.keys(factsByMonth).sort();
    const results = {};
    let prevSnap = {};
    months.forEach(m => {
      const f = factsByMonth[m];
      f.prevSnapshots = prevSnap;
      const r = calcMonth(f);
      results[m] = r;
      prevSnap = r.assetValues;
    });
    // 年度累计 / 目标 / 预测
    const year = opts.year;
    const ymPrefix = year + '-';
    const yearMonths = months.filter(m => m.startsWith(ymPrefix));
    const yearlyCumulative = roundCents(sum(yearMonths.map(m => results[m].savings)));
    const yearlyGoal = opts.yearlyGoalCents || 0;
    const progress = yearlyGoal > 0 ? Math.round(yearlyCumulative / yearlyGoal * 10000) / 100 : 0;
    const remaining = roundCents(yearlyGoal - yearlyCumulative);

    // 预测：已发生实际 + 未来月份（收入按历史平均预测，支出默认 0）
    const pastSavings = sum(yearMonths.map(m => results[m].savings));
    const futureMonths = opts.futureMonths || [];
    let forecastSavings = pastSavings;
    const histIncomes = yearMonths.map(m => results[m].incomeTotal).filter(v => v > 0);
    const avgIncome = histIncomes.length ? sum(histIncomes) / histIncomes.length : 0;
    futureMonths.forEach(m => {
      const ov = opts.forecastOverrides && opts.forecastOverrides[m];
      const estIncome = ov !== undefined ? ov : avgIncome;
      forecastSavings += estIncome; // 未来支出不预测，默认 0
    });
    forecastSavings = roundCents(forecastSavings);
    const forecastGap = roundCents(yearlyGoal - forecastSavings);

    // 月度目标：历史锁定由调用方传入 lockedTargets
    return {
      results,
      yearly: {
        year, yearlyCumulative, yearlyGoal, progress, remaining,
        yearEndForecast: forecastSavings, forecastGap,
        avgMonthlyIncome: avgIncome,
      },
      prevSnap,
    };
  }

  // ---------- 导出 ----------
  global.PWEngine = {
    M, roundCents, fmtCents, fmtNum, sum, addMonth, monthList,
    calcMonth, recalcAll,
  };
})(typeof window !== 'undefined' ? window : globalThis);
