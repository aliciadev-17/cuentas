/* Lógica pura de la app de gastos en pareja. Sin DOM: se puede probar en Node. */
(function (root) {
  'use strict';

  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const WALLETS = ['comun', 'pa', 'pb', 'ahc', 'aha', 'ahb', 'efe'];
  const PW = { a: 'pa', b: 'pb' }; // cartera personal de cada uno
  const SW = { a: 'aha', b: 'ahb' }; // ahorro individual de cada uno

  const CATS = [
    { id: 'vivienda', name: 'Vivienda', icon: '🏠', color: '#2F6BFF' },
    { id: 'supermercado', name: 'Supermercado', icon: '🛒', color: '#FF9A3D' },
    { id: 'luz', name: 'Luz', icon: '💡', color: '#FFC53D' },
    { id: 'agua', name: 'Agua', icon: '💧', color: '#38BDF8' },
    { id: 'gas', name: 'Gas', icon: '🔥', color: '#FF6B4A' },
    { id: 'internet', name: 'Internet', icon: '📶', color: '#1E3A8A' },
    { id: 'movil', name: 'Móvil', icon: '📱', color: '#0891B2' },
    { id: 'seguros', name: 'Seguros', icon: '🛡️', color: '#E5383B' },
    { id: 'transporte', name: 'Transporte', icon: '🚗', color: '#8B5E34' },
    { id: 'restaurantes', name: 'Restaurantes', icon: '🍽️', color: '#FF5C8A' },
    { id: 'ocio', name: 'Ocio', icon: '🎬', color: '#FFB4A2' },
    { id: 'tabaco', name: 'Tabaco', icon: '🚬', color: '#64748B' },
    { id: 'compras', name: 'Compras', icon: '🛍️', color: '#BE185D' },
    { id: 'suscripciones', name: 'Suscripciones', icon: '🔁', color: '#7C2D12' },
    { id: 'viajes', name: 'Viajes', icon: '✈️', color: '#60A5FA' },
    { id: 'otros', name: 'Otros', icon: '📦', color: '#A8A29E' },
    { id: 'efectivo', name: 'Efectivo', icon: '💶', color: '#57534E' },
  ];

  /* ---------- fechas ---------- */
  const ymOf = (d) => String(d).slice(0, 7);
  function addMonths(ym, n) {
    let [y, m] = ym.split('-').map(Number);
    m += n;
    y += Math.floor((m - 1) / 12);
    m = (((m - 1) % 12) + 12) % 12 + 1;
    return y + '-' + String(m).padStart(2, '0');
  }
  function monthRange(a, b) {
    const out = [];
    let c = a, guard = 0;
    while (c <= b && guard++ < 600) { out.push(c); c = addMonths(c, 1); }
    return out;
  }
  function daysIn(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); }
  const pad = (n) => String(n).padStart(2, '0');
  function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* ---------- configuración por defecto (sale de tu Excel) ---------- */
  function defaultConfig(startYm) {
    return {
      v: 1,
      startYm: startYm || ymOf(todayStr()),
      names: { a: 'Ali', b: 'Adri' },
      categories: clone(CATS),
      // % que paga Ali. El resto lo paga Adri. Por defecto 70/30; vivienda, seguros y otros 50/50.
      split: { def: 70, byCat: { vivienda: 50, seguros: 50, otros: 50 } },
      fondo: { amt: 400, pctA: 60 },
      efe: { amt: 400, pctA: 50 },
      // Topes (máximos) mensuales: común, personal de Ali (a) y personal de Adri (b)
      budgets: {
        common: { vivienda: 775, luz: 30, gas: 20, internet: 30, seguros: 30, supermercado: 200, otros: 238 },
        a: { transporte: 120, seguros: 440, otros: 111 },
        b: { transporte: 15 },
      },
      opening: { comun: 0, pa: 0, pb: 0, ahc: 0, aha: 0, ahb: 0, efe: 0 },
      rules: { commonMode: 'individual', personalToSavings: true, coverDeficit: true },
      goals: {
        ahc: { name: 'Fondo de emergencia', target: 0 },
        aha: { name: 'Ahorro individual', target: 0 },
        ahb: { name: 'Ahorro individual', target: 0 },
      },
      usualIncome: [],
    };
  }

  /* Rellena huecos de una configuración antigua o parcial */
  function normalizeConfig(c) {
    const d = defaultConfig(c && c.startYm);
    if (!c) return d;
    const out = Object.assign({}, d, c);
    out.names = Object.assign({}, d.names, c.names);
    out.split = { def: (c.split && c.split.def) ?? d.split.def, byCat: Object.assign({}, (c.split && c.split.byCat) || {}) };
    if (!c.split) out.split = d.split;
    out.fondo = Object.assign({}, d.fondo, c.fondo);
    out.efe = Object.assign({}, d.efe, c.efe);
    out.budgets = {
      common: Object.assign({}, (c.budgets && c.budgets.common) || {}),
      a: Object.assign({}, (c.budgets && c.budgets.a) || {}),
      b: Object.assign({}, (c.budgets && c.budgets.b) || {}),
    };
    if (!c.budgets) out.budgets = d.budgets;
    out.opening = Object.assign({}, d.opening, c.opening);
    out.rules = Object.assign({}, d.rules, c.rules);
    out.goals = Object.assign({}, d.goals, c.goals);
    out.categories = c.categories && c.categories.length ? c.categories : d.categories;
    out.usualIncome = c.usualIncome || [];
    return out;
  }

  /* ---------- plan del mes (lo que se congela al cerrar) ---------- */
  function buildPlan(cfg, md) {
    md = md || {};
    const cash = md.cash || {};
    return {
      budgets: clone(md.budgets || cfg.budgets),
      split: clone(cfg.split),
      rules: clone(cfg.rules),
      fondo: { amt: md.fondoAmt ?? cfg.fondo.amt, pctA: cfg.fondo.pctA },
      efe: { amt: md.efeAmt ?? cfg.efe.amt, pctA: cfg.efe.pctA },
      cash: { a: cash.a ?? null, b: cash.b ?? null },
    };
  }
  const pctOf = (plan, cat) => {
    const v = plan.split.byCat[cat];
    return v === undefined || v === null || v === '' ? plan.split.def : Number(v);
  };
  const splitAmt = (total, pctA) => { const a = r2((total * pctA) / 100); return [a, r2(total - a)]; };

  function startYm(state) {
    let s = state.config.startYm;
    for (const id in state.tx || {}) { const m = ymOf(state.tx[id].date); if (m < s) s = m; }
    return s;
  }
  const txOf = (state, ym) => Object.values(state.tx || {}).filter((t) => ymOf(t.date) === ym);
  const zeroFlows = () => ({ comun: 0, pa: 0, pb: 0, ahc: 0, aha: 0, ahb: 0, efe: 0 });
  const incomeOwner = (t) => t.owner || (t.wallet === 'pb' ? 'b' : 'a');

  /* ---------- cálculo de un mes ---------- */
  function computeMonth(state, ym) {
    const cfg = state.config;
    const md = (state.months || {})[ym] || {};
    const closed = md.closed || null;
    const plan = closed ? closed.plan : buildPlan(cfg, md);
    const active = ym >= startYm(state);
    const txs = txOf(state, ym);

    const income = { a: 0, b: 0 };
    const spentByWallet = { comun: 0, pa: 0, pb: 0, efe: 0, ahc: 0, aha: 0, ahb: 0 };
    const spendByCat = {};
    const spendByWalletCat = { comun: {}, pa: {}, pb: {}, efe: {}, ahc: {}, aha: {}, ahb: {} };
    let spendTotal = 0;
    const flows = zeroFlows();

    for (const t of txs) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        income[incomeOwner(t)] += amt; flows[t.wallet] += amt;
      } else if (t.type === 'expense') {
        flows[t.wallet] -= amt; spentByWallet[t.wallet] += amt; spendTotal += amt;
        spendByCat[t.cat] = (spendByCat[t.cat] || 0) + amt;
        const w = spendByWalletCat[t.wallet]; w[t.cat] = (w[t.cat] || 0) + amt;
      } else if (t.type === 'transfer') {
        flows[t.from] -= amt; flows[t.to] += amt;
      }
    }

    // Aportación a la común: por categoría con su %.
    // "prefund" = lo que se transfiere al empezar el mes (según topes).
    // "real"    = lo que corresponde según el gasto real (como en tu Excel).
    const cats = new Set([...Object.keys(plan.budgets.common || {}), ...Object.keys(spendByWalletCat.comun)]);
    const pre = { a: 0, b: 0 }, real = { a: 0, b: 0 };
    const comunByCat = {};
    for (const cat of cats) {
      const b = Number(plan.budgets.common[cat]) || 0;
      const r = spendByWalletCat.comun[cat] || 0;
      const p = pctOf(plan, cat);
      const [bA, bB] = splitAmt(b, p), [rA, rB] = splitAmt(r, p);
      pre.a += bA; pre.b += bB; real.a += rA; real.b += rB;
      comunByCat[cat] = { budget: b, real: r, pct: p, preA: bA, preB: bB, realA: rA, realB: rB };
    }
    pre.a = r2(pre.a); pre.b = r2(pre.b); real.a = r2(real.a); real.b = r2(real.b);
    const refund = { a: r2(pre.a - real.a), b: r2(pre.b - real.b) };
    const mode = plan.rules.commonMode;

    const [fA, fB] = splitAmt(plan.fondo.amt, plan.fondo.pctA);
    const [eAgA, eAgB] = splitAmt(plan.efe.amt, plan.efe.pctA);
    const cashA = plan.cash.a ?? eAgA, cashB = plan.cash.b ?? eAgB;
    const excess = { a: r2(Math.max(0, cashA - eAgA)), b: r2(Math.max(0, cashB - eAgB)) };

    if (active) {
      flows.comun += pre.a + pre.b;
      flows.pa -= pre.a + fA + cashA;
      flows.pb -= pre.b + fB + cashB;
      flows.ahc += fA + fB;
      flows.efe += cashA + cashB;
    }
    for (const w of WALLETS) flows[w] = r2(flows[w]);

    const useReal = mode === 'individual';
    const contrib = {};
    for (const p of ['a', 'b']) {
      const comun = useReal ? real[p] : pre[p];
      const fondo = p === 'a' ? fA : fB;
      const efe = p === 'a' ? cashA : cashB;
      contrib[p] = active
        ? { comun, comunPre: pre[p], fondo, efe, total: r2(comun + fondo + efe) }
        : { comun: 0, comunPre: 0, fondo: 0, efe: 0, total: 0 };
    }

    // Lo que le queda a cada uno (ahorro individual automático, como la fórmula del Excel)
    const remainder = {
      a: r2(flows.pa + (active && useReal ? refund.a : 0)),
      b: r2(flows.pb + (active && useReal ? refund.b : 0)),
    };

    const flowsAfter = Object.assign({}, flows);
    if (closed && closed.sweeps) {
      for (const s of closed.sweeps) { flowsAfter[s.from] = r2(flowsAfter[s.from] - s.amount); flowsAfter[s.to] = r2(flowsAfter[s.to] + s.amount); }
    }

    const budgetTotal =
      sum(plan.budgets.common) + sum(plan.budgets.a) + sum(plan.budgets.b) + (active ? Number(plan.efe.amt) || 0 : 0);

    return {
      ym, plan, active, closed, txs,
      income: { a: r2(income.a), b: r2(income.b), total: r2(income.a + income.b) },
      spend: { total: r2(spendTotal), byCat: spendByCat, byWalletCat: spendByWalletCat, byWallet: spentByWallet },
      comunByCat, pre, real, refund, mode,
      fondo: { a: fA, b: fB, total: r2(fA + fB) },
      cash: { agreedA: eAgA, agreedB: eAgB, a: cashA, b: cashB, excess },
      contrib, remainder, flows, flowsAfter, budgetTotal: r2(budgetTotal),
    };
  }
  function sum(o) { let s = 0; for (const k in o || {}) s += Number(o[k]) || 0; return s; }

  /* ---------- saldos de cartera ---------- */
  function walletBalances(state, upToYm) {
    const bal = Object.assign(zeroFlows(), state.config.opening || {});
    for (const w of WALLETS) bal[w] = Number(bal[w]) || 0;
    const start = startYm(state);
    for (const m of monthRange(start, upToYm)) {
      const f = computeMonth(state, m).flowsAfter;
      for (const w of WALLETS) bal[w] = r2(bal[w] + f[w]);
    }
    return bal;
  }

  /* ---------- cierre de mes ---------- */
  function computeSweeps(state, ym, opts) {
    opts = Object.assign({ refund: true, personal: true, cover: true }, opts || {});
    const res = computeMonth(state, ym);
    const names = state.config.names;
    const f = Object.assign({}, res.flows);
    const prev = walletBalances(state, addMonths(ym, -1));
    const bal = (w) => prev[w] + f[w];
    const sweeps = [];
    const add = (kind, from, to, amount, label) => {
      amount = r2(amount);
      if (amount < 0.005) return;
      sweeps.push({ kind, from, to, amount, label });
      f[from] = r2(f[from] - amount); f[to] = r2(f[to] + amount);
    };
    if (!res.active) return { res, sweeps };

    if (opts.refund) {
      if (res.mode === 'individual') {
        for (const p of ['a', 'b']) {
          const x = res.refund[p];
          if (x > 0) add('refund', 'comun', PW[p], x, `Topes no gastados de la común → ${names[p]}`);
          else if (x < 0) add('refund', PW[p], 'comun', -x, `Gasto común por encima del tope → paga ${names[p]}`);
        }
      } else if (f.comun > 0) {
        add('refund', 'comun', 'ahc', f.comun, 'Sobrante de la común → ahorro común');
      }
    }
    if (opts.cover && f.comun < 0) {
      add('cover', 'ahc', 'comun', Math.min(-f.comun, Math.max(0, bal('ahc'))), 'Déficit de la común cubierto con el ahorro común');
    }
    if (opts.personal && state.config.rules.personalToSavings) {
      for (const p of ['a', 'b']) if (f[PW[p]] > 0) add('personal', PW[p], SW[p], f[PW[p]], `Lo que sobra de ${names[p]} → ahorro de ${names[p]}`);
    }
    if (opts.cover) {
      for (const p of ['a', 'b']) if (f[PW[p]] < 0) add('cover', SW[p], PW[p], Math.min(-f[PW[p]], Math.max(0, bal(SW[p]))), `Déficit de ${names[p]} cubierto con su ahorro`);
    }
    return { res, sweeps, after: f };
  }

  function closeMonth(state, ym, sweeps) {
    const md = (state.months || {})[ym] || {};
    const res = computeMonth(state, ym);
    return Object.assign({}, md, {
      closed: {
        at: new Date().toISOString(),
        plan: buildPlan(state.config, md),
        sweeps: sweeps.map((s) => ({ kind: s.kind, from: s.from, to: s.to, amount: s.amount, label: s.label })),
        summary: { income: res.income.total, spent: res.spend.total, remainderA: res.remainder.a, remainderB: res.remainder.b },
      },
    });
  }

  /* ---------- presupuesto por categoría ---------- */
  function budgetRows(state, ym) {
    const res = computeMonth(state, ym);
    const prev = computeMonth(state, addMonths(ym, -1));
    const b = res.plan.budgets;
    return state.config.categories.map((c) => {
      const bc = Number(b.common[c.id]) || 0, ba = Number(b.a[c.id]) || 0, bb = Number(b.b[c.id]) || 0;
      const total = r2(bc + ba + bb);
      const spent = r2(res.spend.byCat[c.id] || 0);
      return {
        id: c.id, name: c.name, icon: c.icon, color: c.color,
        spent, prev: r2(prev.spend.byCat[c.id] || 0),
        budget: { common: bc, a: ba, b: bb, total },
        by: {
          comun: r2(res.spend.byWalletCat.comun[c.id] || 0),
          pa: r2(res.spend.byWalletCat.pa[c.id] || 0),
          pb: r2(res.spend.byWalletCat.pb[c.id] || 0),
        },
        over: total > 0 && spent > total + 0.004,
      };
    });
  }

  /* Carteras que se han pasado y de dónde se cubre */
  function deficits(state, ym) {
    const res = computeMonth(state, ym);
    const prev = walletBalances(state, addMonths(ym, -1));
    const out = [];
    const check = (w, value, src) => {
      if (value < -0.004) out.push({ wallet: w, amount: r2(-value), source: src, available: r2(Math.max(0, prev[src] + res.flows[src])) });
    };
    // En modo 'individual' el exceso de la común lo pagan ellos (no hay déficit en la común)
    if (res.mode === 'ahc') check('comun', res.flows.comun, 'ahc');
    if (res.income.a > 0) check('pa', res.remainder.a, 'aha');
    if (res.income.b > 0) check('pb', res.remainder.b, 'ahb');
    return out;
  }

  /* ---------- recibos recurrentes ---------- */
  function billDue(bill, ym) {
    const mn = Number(ym.slice(5, 7));
    const f = bill.freq || 'monthly';
    let ok = false;
    if (f === 'monthly') ok = !bill.fromYm || ym >= bill.fromYm;
    else if (f === 'quarterly') ok = (((mn - Number(bill.month || 1)) % 3) + 3) % 3 === 0;
    else if (f === 'yearly') ok = mn === Number(bill.month || 1);
    else if (f === 'once') ok = bill.ym === ym;
    if (!ok) return null;
    return ym + '-' + pad(Math.min(Number(bill.day) || 1, daysIn(ym)));
  }
  function dayDiff(a, b) { // días entre dos 'YYYY-MM-DD' (a - b)
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pa[0], pa[1] - 1, pa[2]) - Date.UTC(pb[0], pb[1] - 1, pb[2])) / 86400000);
  }
  function billsForMonth(state, ym, today) {
    today = today || todayStr();
    const rows = [];
    for (const id in state.bills || {}) {
      const bill = state.bills[id];
      const due = billDue(bill, ym);
      if (!due) continue;
      const paidTx = Object.values(state.tx || {}).find((t) => t.billId === bill.id && ymOf(t.date) === ym);
      let status, days = null;
      if (paidTx) status = 'paid';
      else {
        days = dayDiff(due, today);
        if (days < 0) status = 'overdue';
        else if (ym === ymOf(today) && days <= 7) status = 'soon';
        else status = 'pending';
      }
      rows.push({ bill, due, paidTx, status, days });
    }
    const rank = { overdue: 0, soon: 1, pending: 2, paid: 3 };
    rows.sort((x, y) => rank[x.status] - rank[y.status] || x.due.localeCompare(y.due));
    return rows;
  }

  /* ---------- datos de ejemplo: septiembre de tu Excel ---------- */
  function sampleSeptember(which) {
    const ym = '2026-09';
    const real = which !== 'plan';
    const tx = [];
    let n = 0;
    const add = (t) => { tx.push(Object.assign({ id: 'ej' + ++n }, t)); };
    const d = (day) => ym + '-' + pad(day);
    add({ type: 'income', wallet: 'pa', owner: 'a', cat: 'nomina', concept: 'Nómina', amount: 2100, date: d(1) });
    add({ type: 'income', wallet: 'pb', owner: 'b', cat: 'paro', concept: 'Paro', amount: real ? 1110 : 1078, date: d(1) });
    add({ type: 'expense', wallet: 'comun', cat: 'vivienda', amount: 775, date: d(1), note: 'Vivienda', billId: 'b_viv' });
    add({ type: 'expense', wallet: 'comun', cat: 'seguros', amount: real ? 28 : 30, date: d(5), note: 'Mensual', billId: 'b_seg' });
    add({ type: 'expense', wallet: 'comun', cat: 'supermercado', amount: real ? 39 : 200, date: d(10) });
    add({ type: 'expense', wallet: 'comun', cat: 'otros', amount: 238, date: d(1), note: 'Préstamo', billId: 'b_pre' });
    if (!real) {
      add({ type: 'expense', wallet: 'comun', cat: 'luz', amount: 30, date: d(12) });
      add({ type: 'expense', wallet: 'comun', cat: 'gas', amount: 20, date: d(12) });
      add({ type: 'expense', wallet: 'comun', cat: 'internet', amount: 30, date: d(5), note: 'Mensual', billId: 'b_net' });
      add({ type: 'expense', wallet: 'pa', cat: 'transporte', amount: 200, date: d(15), note: 'Gasolina' });
      add({ type: 'expense', wallet: 'pb', cat: 'transporte', amount: 10, date: d(15), note: 'Villavesa' });
      add({ type: 'expense', wallet: 'pa', cat: 'otros', amount: 60, date: d(1), note: 'Préstamo', billId: 'b_preA' });
    }
    add({ type: 'expense', wallet: 'pa', cat: 'seguros', amount: 440, date: d(3), note: 'Coche', billId: 'b_coche' });
    add({ type: 'expense', wallet: 'pa', cat: 'otros', amount: 51, date: d(8), note: 'Deporte', billId: 'b_dep' });
    if (real) {
      add({ type: 'expense', wallet: 'pa', cat: 'otros', amount: 50, date: d(20), note: 'ITV' });
      add({ type: 'expense', wallet: 'efe', cat: 'restaurantes', amount: 5, date: d(18) });
    }
    const bills = {
      b_viv: { id: 'b_viv', name: 'Vivienda', amount: 775, day: 1, cat: 'vivienda', wallet: 'comun', freq: 'monthly' },
      b_pre: { id: 'b_pre', name: 'Préstamo (común)', amount: 238, day: 1, cat: 'otros', wallet: 'comun', freq: 'monthly' },
      b_net: { id: 'b_net', name: 'Internet', amount: 30, day: 5, cat: 'internet', wallet: 'comun', freq: 'monthly' },
      b_seg: { id: 'b_seg', name: 'Seguros', amount: 30, day: 5, cat: 'seguros', wallet: 'comun', freq: 'monthly' },
      b_coche: { id: 'b_coche', name: 'Seguro del coche', amount: 440, day: 3, cat: 'seguros', wallet: 'pa', freq: 'monthly' },
      b_preA: { id: 'b_preA', name: 'Préstamo (Ali)', amount: 60, day: 1, cat: 'otros', wallet: 'pa', freq: 'monthly' },
      b_dep: { id: 'b_dep', name: 'Deporte', amount: 51, day: 8, cat: 'otros', wallet: 'pa', freq: 'monthly' },
    };
    const months = {};
    if (real) {
      // En la hoja Septiembre_real el presupuesto personal de Ali incluye 50 € más (ITV)
      const cfg = defaultConfig(ym);
      const b = clone(cfg.budgets); b.a.otros = 161;
      months[ym] = { budgets: b };
    }
    return {
      tx, bills, months,
      configPatch: {
        startYm: ym,
        usualIncome: [
          { owner: 'a', concept: 'Nómina', amount: 2100 },
          { owner: 'b', concept: 'Paro', amount: real ? 1110 : 1078 },
        ],
      },
    };
  }

  const L = {
    r2, clone, WALLETS, PW, SW, CATS, ymOf, addMonths, monthRange, daysIn, todayStr, dayDiff,
    defaultConfig, normalizeConfig, buildPlan, pctOf, splitAmt, startYm, txOf,
    computeMonth, walletBalances, computeSweeps, closeMonth, budgetRows, deficits,
    billDue, billsForMonth, sampleSeptember,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  root.L = L;
})(typeof window !== 'undefined' ? window : globalThis);
