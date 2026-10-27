/* Interfaz de la app. Toda la lógica de dinero vive en logic.js; aquí solo se pinta y se recogen datos. */
(function () {
  'use strict';
  const S = Store.state;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
  const eur = (n) => { n = Number(n) || 0; if (Math.abs(n) < 0.005) n = 0; return nf.format(n); };
  const eurS = (n) => (n > 0.004 ? '+' : '') + eur(n);
  const plain = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' });
  const pad = (n) => String(n).padStart(2, '0');
  const lsGet = (k) => { try { return localStorage.getItem('pp_' + k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem('pp_' + k, v); } catch (e) { /* sin almacenamiento */ } };
  const today = () => L.todayStr();
  const nm = (p) => S.config.names[p];
  const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const parseAmt = (s) => { const n = Number(String(s ?? '').trim().replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; };
  const catOf = (id) => S.config.categories.find((c) => c.id === id) || L.CATS.find((c) => c.id === id) || { id, name: id || 'Sin categoría', icon: '📦', color: '#A8A29E' };
  const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); const n = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' }); return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + y; };
  const monthShort = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''); };
  const dayLabel = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const dayShort = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a ?? 0.16})`; };

  const WMETA = {
    comun: { icon: '🏦', color: '#2F6BFF' }, pa: { icon: '👤', color: '#FF6B4A' }, pb: { icon: '👤', color: '#FF9A3D' },
    ahc: { icon: '🛟', color: '#38BDF8' }, aha: { icon: '🐷', color: '#2F6BFF' }, ahb: { icon: '🐷', color: '#FFC53D' }, efe: { icon: '💶', color: '#FF8A65' },
  };
  const wName = (w) => ({ comun: 'Cuenta común', pa: `Personal de ${nm('a')}`, pb: `Personal de ${nm('b')}`, ahc: 'Ahorro común', aha: `Ahorro de ${nm('a')}`, ahb: `Ahorro de ${nm('b')}`, efe: 'Efectivo común' }[w]);
  const wShort = (w) => ({ comun: 'Común', pa: nm('a'), pb: nm('b'), ahc: 'Ahorro común', aha: 'Ahorro ' + nm('a'), ahb: 'Ahorro ' + nm('b'), efe: 'Efectivo' }[w]);

  const ui = { ym: L.ymOf(today()), tab: 'home', page: null, filter: 'all', who: lsGet('who') };
  let booted = false;

  /* ---------- utilidades de interfaz ---------- */
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function openSheet(html, bind, opts) {
    const ov = document.createElement('div');
    ov.className = 'ov';
    ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sb">${html}</div></div>`;
    $('#sheet-root').appendChild(ov);
    const api = {
      el: ov, body: $('.sb', ov),
      close() { ov.remove(); },
      set(h) { $('.sb', ov).innerHTML = h; },
    };
    if (!(opts && opts.locked)) ov.addEventListener('mousedown', (e) => { if (e.target === ov) api.close(); });
    ov.addEventListener('click', (e) => {
      const el = e.target.closest('[data-close]'); if (el) api.close();
    });
    if (bind) bind(api);
    return api;
  }
  function confirmBox(title, msg, okLabel, onOk, danger) {
    openSheet(`<h2>${esc(title)}</h2><p class="muted" style="margin:0 0 16px">${msg}</p>
      <div class="grid2"><button class="btn sec" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(okLabel)}</button></div>`,
      (s) => { $('[data-ok]', s.el).onclick = () => { s.close(); onOk(); }; });
  }
  const isClosed = (ym) => !!((S.months[ym] || {}).closed);
  function guardClosed(ym) {
    if (isClosed(ym)) { toast('Ese mes está cerrado. Puedes reabrirlo desde «Cerrar mes».'); return true; }
    return false;
  }
  function setPath(obj, path, val) {
    const ks = path.split('.'); let o = obj;
    for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] === undefined || o[ks[i]] === null) o[ks[i]] = {}; o = o[ks[i]]; }
    if (val === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = val;
  }
  function saveCfg(mut) { const c = L.clone(S.config); mut(c); return Store.setConfig(c); }
  function defDate() {
    const t = today(), cur = L.ymOf(t);
    if (ui.ym === cur) return t;
    return ui.ym < cur ? ui.ym + '-' + pad(L.daysIn(ui.ym)) : ui.ym + '-01';
  }
  const vm = () => ({ res: L.computeMonth(S, ui.ym), bal: L.walletBalances(S, ui.ym) });

  /* ---------- piezas de pintado ---------- */
  function monthNav(closed) {
    return `<div class="month"><button data-act="mprev" aria-label="Mes anterior">‹</button><span>${esc(monthLabel(ui.ym))}${closed ? '<i class="lock" title="Mes cerrado">🔒</i>' : ''}</span><button data-act="mnext" aria-label="Mes siguiente">›</button></div>`;
  }
  const iconBox = (icon, color) => `<div class="ico" style="background:${tint(color, 0.18)}">${icon}</div>`;
  function bar(pct, color) { return `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${color}"></i></div>`; }

  function donut(byCat, total) {
    const R = 70, C = 2 * Math.PI * R;
    const items = Object.keys(byCat).map((id) => ({ id, v: byCat[id], c: catOf(id) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    let off = 0;
    const segs = total > 0 ? items.map((it) => {
      const len = (C * it.v) / total;
      const s = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${it.c.color}" stroke-width="26" stroke-dasharray="${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)"/>`;
      off += len; return s;
    }).join('') : '';
    return `<div class="donut-wrap"><svg viewBox="0 0 200 200" role="img" aria-label="Gasto por categoría"><circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--soft)" stroke-width="26"/>${segs}</svg>
      <div class="donut-c"><small>Gastos del mes</small><b>${eur(total)}</b></div></div>`;
  }

  function txRow(t, opts) {
    opts = opts || {};
    let icon = '📦', color = '#A8A29E', title = '', sub = '', amt = '', cls = '';
    if (t.type === 'expense') {
      const c = catOf(t.cat); icon = c.icon; color = c.color; title = c.name + (t.note && t.note.trim().toLowerCase() !== c.name.toLowerCase() ? ' · ' + t.note : '');
      sub = wShort(t.wallet) + ' · ' + dayShort(t.date); amt = '−' + eur(t.amount);
    } else if (t.type === 'income') {
      icon = '💼'; color = '#2F6BFF'; title = t.concept || 'Ingreso'; sub = nm(t.owner || 'a') + ' · ' + dayShort(t.date); amt = '+' + eur(t.amount); cls = 'inc';
    } else {
      const sav = ['aha', 'ahb', 'ahc'].includes(t.to) && !['aha', 'ahb', 'ahc'].includes(t.from);
      icon = sav ? '🐷' : '⇄'; color = sav ? '#38BDF8' : '#64748B';
      title = (sav ? 'Ahorro' : 'Transferencia') + (t.note ? ' · ' + t.note : '');
      sub = `${wShort(t.from)} → ${wShort(t.to)} · ${dayShort(t.date)}`; amt = eur(t.amount);
    }
    return `<button class="item" data-act="edittx" data-id="${esc(t.id)}">${iconBox(icon, color)}<div class="grow"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div><div class="a ${cls}">${amt}</div></button>`;
  }

  /* ---------- INICIO ---------- */
  function viewHome() {
    const { res, bal } = vm();
    const closed = !!res.closed;
    const defs = L.deficits(S, ui.ym);
    const hasData = Object.keys(S.tx).length > 0;
    const spend = res.spend, c = res.contrib;
    const bills = L.billsForMonth(S, ui.ym, today());
    const pend = bills.filter((b) => b.status !== 'paid');
    const pendSum = pend.reduce((s, b) => s + Number(b.bill.amount || 0), 0);
    const total = L.WALLETS.reduce((s, w) => s + bal[w], 0);
    const maxBal = Math.max(1, ...L.WALLETS.map((w) => Math.max(0, bal[w])));
    const goals = S.config.goals;
    const prefundTotal = res.pre.a + res.pre.b;

    const card = (w) => {
      const d = defs.find((x) => x.wallet === w);
      let sub = '';
      if (w === 'comun') sub = `Gastado ${eur(spend.byWallet.comun)} de ${eur(prefundTotal)}`;
      else if (w === 'pa' || w === 'pb') {
        const p = w === 'pa' ? 'a' : 'b';
        sub = !closed && res.income[p] === 0 && res.active ? 'Falta apuntar el ingreso' : !closed && res.mode === 'individual' && res.refund[p] > 0.004 ? `Al cerrar: ${eur(res.remainder[p])}` : `Gastado ${eur(spend.byWallet[w])}`;
      } else if (w === 'efe') sub = `Retirado ${eur(res.cash.a + res.cash.b)}`;
      else {
        const g = goals[w];
        sub = g && g.target > 0 ? `${Math.round((bal[w] / g.target) * 100)} % de ${eur(g.target)}` : (w === 'ahc' ? `+${eur(res.fondo.total)} este mes` : 'Sin objetivo');
      }
      if (d) sub = `Se cubre con: ${wShort(d.source)}`;
      return `<button class="wcard ${d ? 'red' : ''}" data-act="wallet" data-w="${w}">
        <div class="chip" style="background:${tint(WMETA[w].color, 0.18)}">${WMETA[w].icon}</div>
        <div class="lbl">${esc(wShort(w))}</div><div class="amt ${d ? 'neg' : ''}">${eur(bal[w])}</div>
        <div class="sub">${d ? `<span class="tag red">Déficit ${eur(d.amount)}</span> ` : ''}${esc(sub)}</div></button>`;
    };

    const banners = [];
    if (closed) banners.push(`<div class="banner info">🔒<div><b>Mes cerrado</b>Los datos de este mes están bloqueados.</div></div>`);
    if (!closed && res.active && res.income.total === 0 && S.config.usualIncome.length)
      banners.push(`<div class="banner amber">💼<div class="grow"><b>Faltan los ingresos de este mes</b>${S.config.usualIncome.map((i) => `${esc(i.concept)} ${eur(i.amount)}`).join(' · ')}<div style="margin-top:8px"><button class="btn sm dark" data-act="usual">Añadir ingresos habituales</button></div></div></div>`);
    else if (!closed && res.active && res.income.total === 0)
      banners.push(`<div class="banner amber">💼<div><b>Empieza por los ingresos</b>Pulsa + y elige «Ingreso» para apuntar la nómina o el paro. Hasta entonces las carteras personales saldrán en negativo porque ya llevan restadas las aportaciones del mes.</div></div>`);
    if (!closed) for (const d of defs) banners.push(`<div class="banner red">⚠️<div><b>${esc(wName(d.wallet))} en rojo (${eur(d.amount)})</b>Se cubre con ${esc(wName(d.source))}${d.available > 0 ? ` (disponible ${eur(d.available)})` : ' (ahora mismo no hay saldo para cubrirlo)'} al cerrar el mes.</div></div>`);
    for (const p of ['a', 'b']) if (res.cash.excess[p] > 0.004) banners.push(`<div class="banner amber">💶<div><b>${esc(nm(p))} ha sacado ${eur(res.cash.excess[p])} más de lo acordado en efectivo</b>Se resta de lo que le queda a ${esc(nm(p))}.</div></div>`);

    const welcome = !hasData ? `<div class="card"><div class="empty"><div class="em">👋</div><b>Todo listo para empezar</b>Apuntad primero los ingresos del mes con el botón +. Si queréis ver cómo funciona, cargad septiembre de ejemplo.<div style="margin-top:14px"><button class="btn sec sm" data-act="sample">Cargar septiembre de ejemplo</button></div></div></div>` : '';

    const topTx = res.txs.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
    const catItems = Object.keys(spend.byCat).map((id) => ({ id, v: spend.byCat[id], c: catOf(id) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);

    return `
    <div class="hero">
      <div class="top"><div><div class="hello">${ui.who ? 'Hola, ' + esc(nm(ui.who)) : 'Hola'} 👋</div><h1>Cuentas de los dos</h1></div>${monthNav(closed)}</div>
      <div class="carousel" id="carousel">${L.WALLETS.map(card).join('')}</div>
    </div>
    <div class="pad pull stack" style="margin-top:-34px">
      ${banners.join('')}${welcome}
      <div class="card">
        <div class="head"><h2>Balance</h2><span class="muted small">Total en carteras</span></div>
        <div class="big">${eur(total)}</div>
        <div class="bars" style="margin-top:6px">${L.WALLETS.map((w) => `<div class="r"><span>${esc(wShort(w))}</span>${bar((Math.max(0, bal[w]) / maxBal) * 100, WMETA[w].color)}<b>${eur(bal[w])}</b></div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="head"><h2>Dónde va el dinero</h2><button class="link" data-act="goto" data-tab="budget">Presupuesto ›</button></div>
        ${donut(spend.byCat, spend.total)}
        ${catItems.length ? `<div class="legend">${catItems.slice(0, 8).map((x) => `<div><i style="background:${x.c.color}"></i><span>${esc(x.c.name)}</span><b>${eur(x.v)}</b></div>`).join('')}</div>` : `<p class="muted small" style="text-align:center;margin:12px 0 0">Todavía no hay gastos este mes.</p>`}
      </div>
      <div class="tiles">
        <button class="tile t-blue" data-act="goto" data-tab="list"><span class="t">Ingresos</span><span class="v">${eur(res.income.total)}</span><span class="s">${esc(nm('a'))} ${eur(res.income.a)} · ${esc(nm('b'))} ${eur(res.income.b)}</span></button>
        <button class="tile t-coral" data-act="goto" data-tab="list"><span class="t">Gastos</span><span class="v">${eur(spend.total)}</span><span class="s">Topes del mes: ${eur(res.budgetTotal)}</span></button>
        <div class="tile t-navy"><span class="t">Lo que queda ${closed ? '' : '(estimado)'}</span><span class="v">${eur(res.remainder.a + res.remainder.b)}</span><span class="s">${esc(nm('a'))} ${eur(res.remainder.a)} · ${esc(nm('b'))} ${eur(res.remainder.b)}</span></div>
        <div class="tile t-sky"><span class="t">Fondo de emergencia</span><span class="v">${eur(bal.ahc)}</span><span class="s">Este mes +${eur(res.fondo.total)}</span></div>
        <button class="tile t-amber" data-act="gopage" data-page="bills"><span class="t">Recibos pendientes</span><span class="v">${pend.length}</span><span class="s">${pend.length ? eur(pendSum) + ' por pagar' : 'Todo al día'}</span></button>
        <button class="tile t-peach" data-act="monthadj"><span class="t">Efectivo</span><span class="v">${eur(bal.efe)}</span><span class="s">Retirado ${eur(res.cash.a + res.cash.b)} (acordado ${eur(res.plan.efe.amt)})</span></button>
      </div>
      <div class="card">
        <div class="head"><h2>Aportación a la cuenta común</h2>${closed ? '' : '<button class="link" data-act="monthadj">Ajustar mes</button>'}</div>
        ${['a', 'b'].map((p) => `<div class="kv" style="font-size:15px"><span>${esc(nm(p))}</span><b>${eur(c[p].total)}</b></div>
          <div class="muted small" style="margin:-2px 0 8px">Gastos comunes ${eur(c[p].comun)} · Fondo ${eur(c[p].fondo)} · Efectivo ${eur(c[p].efe)}</div>`).join('')}
        <hr class="s"><div class="muted small">${res.mode === 'individual'
          ? `El reparto sale del gasto real de cada categoría con su %. Para ir con margen, al empezar el mes se transfiere según los topes (${esc(nm('a'))} ${eur(res.pre.a)} · ${esc(nm('b'))} ${eur(res.pre.b)}) y al cerrar se devuelve lo no gastado.`
          : `Se aporta según los topes y lo que sobra pasa al ahorro común al cerrar el mes.`}</div>
      </div>
      <div class="card">
        <div class="head"><h2>Mayores gastos</h2><button class="link" data-act="goto" data-tab="list">Ver todos ›</button></div>
        ${topTx.length ? `<div class="list">${topTx.map((t) => txRow(t)).join('')}</div>` : `<p class="muted small" style="margin:0">Aquí aparecerán los gastos más grandes del mes.</p>`}
      </div>
      <button class="btn ${closed ? 'sec' : 'dark'}" data-act="closemonth">${closed ? '🔒 Mes cerrado · ver o reabrir' : 'Cerrar mes'}</button>
    </div>`;
  }

  /* ---------- GASTOS ---------- */
  function viewList() {
    const { res } = vm();
    const f = ui.filter;
    const chips = [['all', 'Todos'], ['comun', 'Común'], ['pa', nm('a')], ['pb', nm('b')], ['sav', 'Ahorros'], ['efe', 'Efectivo']];
    const match = (t) => {
      if (f === 'all') return true;
      const ws = [t.wallet, t.from, t.to].filter(Boolean);
      if (f === 'sav') return ws.some((w) => ['aha', 'ahb', 'ahc'].includes(w));
      return ws.includes(f);
    };
    const txs = res.txs.filter(match).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const groups = {};
    txs.forEach((t) => { (groups[t.date] = groups[t.date] || []).push(t); });
    const shownSpend = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const shownIn = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    return `
    <div class="plain-head"><h1>Movimientos</h1>${monthNav(!!res.closed)}</div>
    <div class="chips">${chips.map(([k, l]) => `<button class="chipb ${f === k ? 'on' : ''}" data-act="filter" data-f="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="pad stack">
      <div class="grid2"><div class="card"><div class="muted small">Gastos</div><div class="b" style="font-size:20px">${eur(shownSpend)}</div></div>
      <div class="card"><div class="muted small">Ingresos</div><div class="b" style="font-size:20px;color:var(--blue)">${eur(shownIn)}</div></div></div>
      ${txs.length ? Object.keys(groups).sort().reverse().map((d) => `<div><div class="dayhead">${esc(dayLabel(d))}</div><div class="card" style="padding:4px 16px"><div class="list">${groups[d].map((t) => txRow(t)).join('')}</div></div></div>`).join('')
        : `<div class="card"><div class="empty"><div class="em">🧾</div><b>Sin movimientos</b>Pulsa el botón + para apuntar el primero.</div></div>`}
    </div>`;
  }

  /* ---------- PRESUPUESTO ---------- */
  function viewBudget() {
    const { res } = vm();
    const rows = L.budgetRows(S, ui.ym).filter((r) => r.id !== 'efectivo');
    const act = rows.filter((r) => r.budget.total > 0 || r.spent > 0).sort((a, b) => b.spent - a.spent || b.budget.total - a.budget.total);
    const rest = rows.filter((r) => !(r.budget.total > 0 || r.spent > 0));
    const totBud = act.reduce((s, r) => s + r.budget.total, 0);
    const totSp = act.reduce((s, r) => s + r.spent, 0);
    const over = act.filter((r) => r.over);
    const rowHtml = (r) => {
      const pct = r.budget.total > 0 ? (r.spent / r.budget.total) * 100 : 0;
      const diff = r.spent - r.prev;
      return `<button class="item" data-act="editbudget" data-id="${r.id}" style="flex-wrap:wrap">${iconBox(r.icon, r.color)}
        <div class="grow"><div class="t">${esc(r.name)} ${r.over ? '<span class="tag red">Te has pasado</span>' : ''}</div>
        <div class="s">${r.budget.total > 0 ? `${eur(r.spent)} de ${eur(r.budget.total)}` : `${eur(r.spent)} · sin tope`}${r.prev > 0 ? ` · ${diff > 0.004 ? '▲' : diff < -0.004 ? '▼' : '='} ${eur(Math.abs(diff))} vs mes anterior` : ''}</div></div>
        <div class="a">${r.budget.total > 0 ? Math.round(pct) + ' %' : '✎'}</div>
        ${r.budget.total > 0 ? `<div style="flex:0 0 100%">${bar(pct, r.over ? 'var(--red)' : 'var(--coral)')}</div>` : ''}</button>`;
    };
    // histórico de 6 meses
    const start = L.startYm(S);
    const months = L.monthRange(L.addMonths(ui.ym, -5), ui.ym).filter((m) => m >= start);
    const hist = months.map((m) => { const r = L.computeMonth(S, m); return { m, inc: r.income.total, sp: r.spend.total }; });
    const maxH = Math.max(1, ...hist.map((h) => Math.max(h.inc, h.sp)));
    const slot = (i) => (6 - hist.length + i) * 56;
    const chart = hist.length ? `<svg viewBox="0 0 336 124" style="width:100%;max-height:170px" role="img" aria-label="Ingresos y gastos por mes">
      ${hist.map((h, i) => `<rect x="${slot(i) + 6}" y="${100 - (h.inc / maxH) * 90}" width="18" height="${(h.inc / maxH) * 90}" rx="5" fill="var(--blue)"/>
      <rect x="${slot(i) + 28}" y="${100 - (h.sp / maxH) * 90}" width="18" height="${(h.sp / maxH) * 90}" rx="5" fill="var(--coral)"/>
      <text x="${slot(i) + 26}" y="118" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(monthShort(h.m))}</text>`).join('')}</svg>
      <div class="row small muted" style="justify-content:center;gap:16px"><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--blue)"></i> Ingresos</span><span><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--coral)"></i> Gastos</span></div>` : '';
    return `
    <div class="plain-head"><h1>Presupuesto</h1>${monthNav(!!res.closed)}</div>
    <div class="pad stack">
      <div class="card"><div class="row between"><div><div class="muted small">Gastado en categorías con tope</div><div class="big">${eur(totSp)}</div></div><div class="muted small" style="text-align:right">de ${eur(totBud)}</div></div>
        <div style="margin-top:10px">${bar(totBud > 0 ? (totSp / totBud) * 100 : 0, totSp > totBud ? 'var(--red)' : 'var(--coral)')}</div>
        ${over.length ? `<div class="banner red" style="margin-top:12px">⚠️<div><b>${over.length} ${over.length === 1 ? 'categoría pasada' : 'categorías pasadas'} de su tope</b>${over.map((r) => esc(r.name)).join(', ')}. Si es de la común, el exceso lo reparten según su %.</div></div>` : ''}
      </div>
      <div class="card" style="padding:4px 16px"><div class="list">${act.length ? act.map(rowHtml).join('') : '<div class="empty">Sin topes ni gastos este mes.</div>'}</div></div>
      ${rest.length ? `<details class="card d"><summary>Otras categorías sin tope (${rest.length})</summary><div class="list">${rest.map(rowHtml).join('')}</div></details>` : ''}
      <div class="card"><div class="head"><h2>Últimos meses</h2></div>${chart || '<p class="muted small">Cuando haya más de un mes verás aquí la comparación.</p>'}</div>
    </div>`;
  }

  /* ---------- MÁS ---------- */
  function viewMore() {
    if (ui.page === 'bills') return viewBills();
    if (ui.page === 'savings') return viewSavings();
    if (ui.page === 'settings') return viewSettings();
    const item = (page, icon, color, t, s) => `<button class="item" data-act="gopage" data-page="${page}">${iconBox(icon, color)}<div class="grow"><div class="t">${t}</div><div class="s">${s}</div></div><span class="muted">›</span></button>`;
    return `<div class="plain-head"><h1>Más</h1></div><div class="pad stack"><div class="card" style="padding:4px 16px"><div class="list">
      ${item('bills', '🧾', '#FFC53D', 'Recibos', 'Vencimientos y botón de pagar')}
      ${item('savings', '🛟', '#38BDF8', 'Ahorro y metas', 'Fondo de emergencia y ahorros individuales')}
      ${item('settings', '⚙️', '#64748B', 'Ajustes', 'Nombres, porcentajes, saldos iniciales y reglas')}
    </div></div>
    <div class="muted small" style="text-align:center">${Store.mode === 'firebase' ? 'Datos compartidos en tiempo real' : 'Modo local: los datos solo están en este móvil'}</div></div>`;
  }
  const backBtn = (title) => `<div class="plain-head"><div class="row"><button class="btn sec sm" data-act="gopage" data-page="" aria-label="Volver">‹</button><h1>${title}</h1></div></div>`;

  /* ---------- RECIBOS ---------- */
  function viewBills() {
    const closed = isClosed(ui.ym);
    const rows = L.billsForMonth(S, ui.ym, today());
    const pend = rows.filter((r) => r.status !== 'paid');
    const sum = pend.reduce((s, r) => s + Number(r.bill.amount || 0), 0);
    const label = (r) => {
      if (r.status === 'paid') return `Pagado el ${dayShort(r.paidTx.date)}`;
      if (r.status === 'overdue') { const n = -r.days; return `Vencido hace ${n} ${n === 1 ? 'día' : 'días'}`; }
      if (r.days === 0) return 'Vence hoy';
      if (r.status === 'soon') return `Vence en ${r.days} ${r.days === 1 ? 'día' : 'días'}`;
      return `Vence el ${dayShort(r.due)}`;
    };
    const tag = (r) => (r.status === 'overdue' ? 'red' : r.status === 'soon' ? 'amber' : '');
    return `${backBtn('Recibos')}
    <div class="pad stack">
      <div class="row between"><div class="muted small">${esc(monthLabel(ui.ym))}</div>${monthNav(closed)}</div>
      <div class="card"><div class="muted small">Pendiente de pagar</div><div class="big">${eur(sum)}</div><div class="muted small">${pend.length} ${pend.length === 1 ? 'recibo' : 'recibos'}</div></div>
      ${rows.length ? `<div class="card" style="padding:4px 16px"><div class="list">${rows.map((r) => {
        const c = catOf(r.bill.cat);
        return `<div class="item">${iconBox(c.icon, c.color)}<button class="grow" style="text-align:left" data-act="editbill" data-id="${esc(r.bill.id)}"><div class="t">${esc(r.bill.name)}</div>
          <div class="s"><span class="tag ${tag(r)}">${esc(label(r))}</span> ${esc(wShort(r.bill.wallet))}${r.bill.freq !== 'monthly' ? ' · ' + ({ quarterly: 'trimestral', yearly: 'anual', once: 'puntual' }[r.bill.freq] || '') : ''}</div></button>
          <div style="text-align:right"><div class="b">${eur(r.bill.amount)}</div>${r.status === 'paid' ? '<span class="muted small">✓</span>' : `<button class="btn sm" data-act="paybill" data-id="${esc(r.bill.id)}" style="margin-top:4px">Pagar</button>`}</div></div>`;
      }).join('')}</div></div>` : `<div class="card"><div class="empty"><div class="em">🧾</div><b>No hay recibos este mes</b>Añadid los fijos (alquiler, internet, seguros…) y aparecerán cada mes.</div></div>`}
      <button class="btn" data-act="newbill">＋ Añadir recibo</button>
      <p class="muted small" style="text-align:center;margin:0">Para uno trimestral o suelto elige «Trimestral» o «Solo este mes» al crearlo.</p>
    </div>`;
  }

  /* ---------- AHORRO Y METAS ---------- */
  function viewSavings() {
    const { res, bal } = vm();
    const goals = S.config.goals;
    const sav = Object.values(S.tx).filter((t) => t.type === 'transfer' && (['aha', 'ahb', 'ahc'].includes(t.to) || ['aha', 'ahb', 'ahc'].includes(t.from))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
    const card = (w) => {
      const g = goals[w] || { name: wName(w), target: 0 };
      const pct = g.target > 0 ? (bal[w] / g.target) * 100 : 0;
      return `<div class="card"><div class="row">${iconBox(WMETA[w].icon, WMETA[w].color)}<div class="grow"><div class="b">${esc(g.name || wName(w))}</div><div class="muted small">${esc(wName(w))}</div></div><button class="link" data-act="editgoal" data-w="${w}">Editar</button></div>
        <div class="big" style="margin-top:10px">${eur(bal[w])}</div>
        ${g.target > 0 ? `<div style="margin:8px 0 4px">${bar(pct, WMETA[w].color)}</div><div class="muted small">${Math.round(pct)} % de ${eur(g.target)} · faltan ${eur(Math.max(0, g.target - bal[w]))}</div>` : `<div class="muted small" style="margin-top:4px">Sin objetivo todavía. Pulsa «Editar» para ponerle una cifra.</div>`}
        <button class="btn sec sm" style="margin-top:12px" data-act="savein" data-w="${w}">Aportar</button></div>`;
    };
    return `${backBtn('Ahorro y metas')}<div class="pad stack">
      ${card('ahc')}${card('aha')}${card('ahb')}
      <div class="card"><div class="head"><h2>Aportación mensual al fondo</h2></div>
        <div class="kv"><span>Total</span><b>${eur(res.fondo.total)}</b></div><div class="kv"><span>${esc(nm('a'))}</span><b>${eur(res.fondo.a)}</b></div><div class="kv"><span>${esc(nm('b'))}</span><b>${eur(res.fondo.b)}</b></div>
        <div class="muted small">Se cambia en Ajustes (importe y %) o solo este mes desde «Ajustar mes».</div></div>
      <div class="card"><div class="head"><h2>Movimientos de ahorro</h2></div>${sav.length ? `<div class="list">${sav.map((t) => txRow(t)).join('')}</div>` : '<p class="muted small" style="margin:0">Aquí aparecerán las aportaciones y retiradas manuales. Al cerrar un mes, lo que sobra se añade solo.</p>'}</div>
    </div>`;
  }

  /* ---------- AJUSTES ---------- */
  function viewSettings() {
    const c = S.config;
    const inc = L.computeMonth(S, ui.ym).income;
    const sugA = inc.total > 0 ? Math.round((inc.a / inc.total) * 100) : null;
    const num = (path, val, extra) => `<input class="in" inputmode="decimal" data-cfg="${path}" data-t="num" value="${val === undefined || val === null ? '' : esc(String(val).replace('.', ','))}" ${extra || ''}>`;
    const f = (l, inner) => `<label class="f">${l}</label>${inner}`;
    const catRows = c.categories.filter((x) => x.id !== 'efectivo').map((x) => `<div class="row" style="margin:6px 0"><span style="width:26px">${x.icon}</span><span class="grow">${esc(x.name)}</span><div style="width:92px">${num('split.byCat.' + x.id, c.split.byCat[x.id], `placeholder="${c.split.def}" aria-label="% de ${esc(nm('a'))} en ${esc(x.name)}"`)}</div><span class="muted small">%</span></div>`).join('');
    const who = ui.who || 'a';
    return `${backBtn('Ajustes')}<div class="pad stack">
      <div class="card"><h2>Personas</h2>
        <div class="grid2"><div>${f('Nombre 1', `<input class="in" data-cfg="names.a" data-t="txt" value="${esc(c.names.a)}">`)}</div><div>${f('Nombre 2', `<input class="in" data-cfg="names.b" data-t="txt" value="${esc(c.names.b)}">`)}</div></div>
        ${f('Este móvil es de', `<div class="seg"><button data-act="who" data-p="a" class="${who === 'a' ? 'on' : ''}">${esc(nm('a'))}</button><button data-act="who" data-p="b" class="${who === 'b' ? 'on' : ''}">${esc(nm('b'))}</button></div>`)}</div>
      <div class="card"><h2>Reparto de los gastos comunes</h2>
        <p class="muted small" style="margin:6px 0 0">Porcentaje que paga ${esc(nm('a'))}; el resto lo paga ${esc(nm('b'))}. En tu Excel: 70 % general y 50 % en vivienda, seguros y otros.</p>
        ${f(`% general que paga ${esc(nm('a'))}`, num('split.def', c.split.def))}
        ${sugA !== null ? `<div class="banner info" style="margin-top:10px">📊<div class="grow">Con los ingresos de este mes saldría ${esc(nm('a'))} ${sugA} % / ${esc(nm('b'))} ${100 - sugA} %.<div style="margin-top:8px"><button class="btn sm sec" data-act="usesug" data-v="${sugA}">Usar como % general</button></div></div></div>` : ''}
        <details class="d" style="margin-top:8px"><summary>% distinto por categoría</summary><p class="muted small" style="margin:0 0 6px">Vacío = usa el general.</p>${catRows}</details></div>
      <div class="card"><h2>Fondo de emergencia y efectivo</h2>
        <div class="grid2"><div>${f('Fondo al mes (€)', num('fondo.amt', c.fondo.amt))}</div><div>${f(`% de ${esc(nm('a'))}`, num('fondo.pctA', c.fondo.pctA))}</div>
        <div>${f('Efectivo al mes (€)', num('efe.amt', c.efe.amt))}</div><div>${f(`% de ${esc(nm('a'))}`, num('efe.pctA', c.efe.pctA))}</div></div></div>
      <div class="card"><h2>Al cerrar el mes</h2>
        <label class="switch" style="align-items:flex-start"><span><b>Lo no gastado de la común</b><br><span class="muted small">Elige adónde va el sobrante de los topes comunes.</span></span></label>
        <div class="stack"><button class="pick ${c.rules.commonMode === 'individual' ? 'on' : ''}" style="display:block;width:100%;text-align:left" data-act="mode" data-m="individual">Volver a cada uno según su %<br><span class="muted small b" style="font-weight:500">Como tu Excel: lo que no se gasta se queda en el ahorro de cada uno.</span></button>
        <button class="pick ${c.rules.commonMode === 'ahc' ? 'on' : ''}" style="display:block;width:100%;text-align:left" data-act="mode" data-m="ahc">Al ahorro común<br><span class="muted small b" style="font-weight:500">Se aporta siempre según los topes y el sobrante va al fondo común.</span></button></div>
        <div class="switch"><span>Lo que sobra de cada uno pasa a su ahorro individual</span><input type="checkbox" data-cfg="rules.personalToSavings" data-t="bool" ${c.rules.personalToSavings ? 'checked' : ''}></div>
        <div class="switch"><span>Si una cartera se pasa, cubrir el déficit con el ahorro</span><input type="checkbox" data-cfg="rules.coverDeficit" data-t="bool" ${c.rules.coverDeficit ? 'checked' : ''}></div>
        <p class="muted small" style="margin:0">Antes de mover nada se te enseña un resumen y puedes desmarcar cada paso.</p></div>
      <details class="card d"><summary>Saldos iniciales de las carteras</summary><p class="muted small" style="margin:0">Lo que había en cada cartera antes de empezar a usar la app.</p>
        ${L.WALLETS.map((w) => f(esc(wName(w)), num('opening.' + w, c.opening[w] || 0))).join('')}
        ${f('Primer mes que cuenta', `<input class="in" type="month" data-cfg="startYm" data-t="txt" value="${esc(c.startYm)}">`)}</details>
      <div class="card"><h2>Ingresos habituales</h2><p class="muted small" style="margin:6px 0 10px">Se añaden con un toque cada mes desde Inicio.</p>
        ${c.usualIncome.length ? c.usualIncome.map((i, k) => `<div class="kv"><span>${esc(nm(i.owner))} · ${esc(i.concept)}</span><span><b>${eur(i.amount)}</b> <button class="link" data-act="delusual" data-k="${k}">Quitar</button></span></div>`).join('') : '<p class="muted small">Ninguno.</p>'}
        <button class="btn sec sm" style="margin-top:8px" data-act="addusual">＋ Añadir</button></div>
      <div class="card"><h2>Datos</h2><div class="muted small" style="margin:4px 0 10px">${Store.mode === 'firebase' ? 'Compartidos en tiempo real entre los dos móviles.' : 'Modo local: solo en este móvil. Para compartirlos mira la guía de Firebase.'}</div>
        <div class="stack"><button class="btn sec" data-act="sample">Cargar septiembre de ejemplo</button>
        <button class="btn sec" data-act="export">Descargar copia de seguridad</button>
        <button class="btn sec" data-act="import">Restaurar copia de seguridad</button>
        <button class="btn danger" data-act="wipe">Borrar todos los movimientos</button>
        ${Store.mode === 'firebase' ? '<button class="btn sec" data-act="logout">Cerrar sesión</button>' : ''}</div>
        <input type="file" id="importfile" accept="application/json,.json" hidden></div>
      <p class="muted small" style="text-align:center">Cuentas de los dos · v1.0</p>
    </div>`;
  }

  /* ---------- render principal ---------- */
  const NAV = [
    ['home', 'Inicio', '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
    ['list', 'Gastos', '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />'],
    ['add', '', ''],
    ['budget', 'Presupuesto', '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'],
    ['more', 'Más', '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.2"/>'],
  ];
  function renderNav() {
    $('#navin').innerHTML = NAV.map(([k, l, svg]) => k === 'add'
      ? `<button class="plus" data-act="add" aria-label="Añadir movimiento"><span>+</span></button>`
      : `<button class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>${l}</button>`).join('');
  }
  let rafId = 0;
  function render() {
    if (!booted) return;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(doRender);
  }
  function doRender() {
    if (!Store.ready && Store.mode === 'firebase') { $('#view').innerHTML = '<div class="spin" aria-label="Cargando"></div>'; return; }
    const y = window.scrollY;
    const car = $('#carousel'); const cl = car ? car.scrollLeft : 0;
    const views = { home: viewHome, list: viewList, budget: viewBudget, more: viewMore };
    $('#view').innerHTML = views[ui.tab]();
    const car2 = $('#carousel'); if (car2) car2.scrollLeft = cl;
    window.scrollTo(0, y);
    $('#nav').hidden = false;
    renderNav();
  }

  /* ---------- hojas: añadir / editar movimiento ---------- */
  function openTxSheet(edit, preset) {
    if (edit && guardClosed(L.ymOf(edit.date))) return;
    const isSavingTx = (t) => t.type === 'transfer' && ['aha', 'ahb', 'ahc'].includes(t.to) && !['aha', 'ahb', 'ahc'].includes(t.from);
    const f = edit ? {
      ui: edit.type === 'transfer' ? (isSavingTx(edit) ? 'saving' : 'transfer') : edit.type,
      amount: String(edit.amount).replace('.', ','), wallet: edit.wallet || 'comun', cat: edit.cat || null, owner: edit.owner || 'a',
      concept: edit.concept || 'Nómina', from: edit.from || 'pa', to: edit.to || 'aha', date: edit.date, note: edit.note || '',
    } : Object.assign({
      ui: 'expense', amount: '', wallet: lsGet('lw') || 'comun', cat: null, owner: ui.who || 'a', concept: 'Nómina',
      from: 'pa', to: 'aha', date: defDate(), note: '',
    }, preset || {});
    if (!edit && !['comun', 'pa', 'pb', 'efe'].includes(f.wallet)) f.wallet = 'comun';
    openSheet('', (s) => {
      const draw = () => {
        const seg = [['expense', 'Gasto'], ['income', 'Ingreso'], ['saving', 'Ahorro'], ['transfer', 'Transferir']];
        const pk = (key, val, label) => `<button class="pick ${f[key] === val ? 'on' : ''}" data-set="${key}:${val}">${label}</button>`;
        let mid = '';
        if (f.ui === 'expense') {
          mid = `<label class="f">Cartera</label><div class="chgrid">${['comun', 'pa', 'pb', 'efe'].map((w) => pk('wallet', w, esc(wShort(w)))).join('')}</div>
            <label class="f">Categoría</label><div class="catgrid">${S.config.categories.filter((c) => c.id !== 'efectivo').map((c) => `<button class="catb ${f.cat === c.id ? 'on' : ''}" data-set="cat:${c.id}">${iconBox(c.icon, c.color)}<span>${esc(c.name)}</span></button>`).join('')}</div>`;
        } else if (f.ui === 'income') {
          mid = `<label class="f">Para</label><div class="chgrid">${pk('owner', 'a', esc(nm('a')))}${pk('owner', 'b', esc(nm('b')))}</div>
            <label class="f">Concepto</label><div class="chgrid">${['Nómina', 'Paro', 'Extra', 'Otro'].map((x) => pk('concept', x, x)).join('')}</div>`;
        } else if (f.ui === 'saving') {
          mid = `<label class="f">Sale de</label><div class="chgrid">${['pa', 'pb', 'comun'].map((w) => pk('from', w, esc(wName(w)))).join('')}</div>
            <label class="f">Va a</label><div class="chgrid">${['aha', 'ahb', 'ahc'].map((w) => pk('to', w, esc(wName(w)))).join('')}</div>`;
        } else {
          mid = `<div class="grid2"><div><label class="f">Desde</label><select class="in" data-sel="from">${L.WALLETS.map((w) => `<option value="${w}" ${f.from === w ? 'selected' : ''}>${esc(wName(w))}</option>`).join('')}</select></div>
            <div><label class="f">Hacia</label><select class="in" data-sel="to">${L.WALLETS.map((w) => `<option value="${w}" ${f.to === w ? 'selected' : ''}>${esc(wName(w))}</option>`).join('')}</select></div></div>`;
        }
        s.set(`<div class="seg" role="tablist">${seg.map(([k, l]) => `<button class="${f.ui === k ? 'on' : ''}" data-set="ui:${k}">${l}</button>`).join('')}</div>
          <input class="amount" id="f-amount" inputmode="decimal" placeholder="0,00" aria-label="Importe en euros" value="${esc(f.amount)}">
          ${mid}
          <div class="grid2"><div><label class="f">Fecha</label><input class="in" type="date" id="f-date" value="${esc(f.date)}"></div>
          <div><label class="f">Nota (opcional)</label><input class="in" id="f-note" maxlength="60" value="${esc(f.note)}"></div></div>
          <div style="margin-top:18px" class="${edit ? 'grid2' : ''}">${edit ? '<button class="btn danger" data-del>Eliminar</button>' : ''}<button class="btn" data-save>${edit ? 'Guardar cambios' : 'Guardar'}</button></div>`);
        const am = $('#f-amount', s.el);
        am.oninput = () => { f.amount = am.value; };
        $('#f-date', s.el).onchange = (e) => { f.date = e.target.value; };
        $('#f-note', s.el).oninput = (e) => { f.note = e.target.value; };
        $$('[data-sel]', s.el).forEach((el) => { el.onchange = () => { f[el.dataset.sel] = el.value; }; });
        $$('[data-set]', s.el).forEach((el) => {
          el.onclick = () => { const [k, v] = el.dataset.set.split(':'); f[k] = v; if (k === 'ui') { if (v === 'saving') { f.from = ['pa', 'pb', 'comun'].includes(f.from) ? f.from : 'pa'; f.to = ['aha', 'ahb', 'ahc'].includes(f.to) ? f.to : 'aha'; } } draw(); };
        });
        $('[data-save]', s.el).onclick = save;
        const del = $('[data-del]', s.el); if (del) del.onclick = () => confirmBox('¿Eliminar este movimiento?', 'Se quitará de las cuentas.', 'Eliminar', () => { Store.del('tx', edit.id); s.close(); toast('Eliminado'); }, true);
      };
      const save = () => {
        const amount = parseAmt(f.amount);
        if (!(amount > 0)) { toast('Escribe un importe mayor que 0'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) { toast('Elige una fecha'); return; }
        if (guardClosed(L.ymOf(f.date))) return;
        const id = edit ? edit.id : uid();
        let t;
        if (f.ui === 'expense') {
          if (!f.cat) { toast('Elige una categoría'); return; }
          t = { id, type: 'expense', wallet: f.wallet, cat: f.cat, amount, date: f.date, note: f.note.trim() };
          if (edit && edit.billId) t.billId = edit.billId;
          lsSet('lw', f.wallet);
        } else if (f.ui === 'income') {
          t = { id, type: 'income', wallet: L.PW[f.owner], owner: f.owner, cat: 'ingreso', concept: f.concept, amount, date: f.date, note: f.note.trim() };
        } else {
          if (f.from === f.to) { toast('Elige carteras distintas'); return; }
          t = { id, type: 'transfer', from: f.from, to: f.to, amount, date: f.date, note: f.note.trim() };
        }
        Store.put('tx', id, t);
        s.close(); toast(edit ? 'Cambios guardados' : 'Guardado ✓');
      };
      draw();
      if (!edit) setTimeout(() => { const a = $('#f-amount', s.el); a && a.focus(); }, 60);
    });
  }

  /* ---------- hojas: recibos ---------- */
  function openBillSheet(bill) {
    const b = bill ? Object.assign({}, bill) : { id: uid(), name: '', amount: '', day: 1, wallet: 'comun', cat: 'vivienda', freq: 'monthly', month: Number(ui.ym.slice(5)), ym: ui.ym };
    b.amount = String(b.amount ?? '').replace('.', ',');
    openSheet('', (s) => {
      const draw = () => {
        const mths = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${Number(b.month) === i + 1 ? 'selected' : ''}>${new Date(2026, i, 1).toLocaleDateString('es-ES', { month: 'long' })}</option>`).join('');
        s.set(`<h2>${bill ? 'Editar recibo' : 'Nuevo recibo'}</h2>
          <label class="f">Nombre</label><input class="in" id="b-name" maxlength="40" value="${esc(b.name)}" placeholder="Internet, seguro, comunidad…">
          <div class="grid2"><div><label class="f">Importe (€)</label><input class="in" id="b-amt" inputmode="decimal" value="${esc(b.amount)}"></div>
          <div><label class="f">Día de vencimiento</label><input class="in" id="b-day" inputmode="numeric" value="${esc(b.day)}"></div></div>
          <label class="f">Se paga desde</label><div class="chgrid">${['comun', 'pa', 'pb', 'efe'].map((w) => `<button class="pick ${b.wallet === w ? 'on' : ''}" data-set="wallet:${w}">${esc(wShort(w))}</button>`).join('')}</div>
          <label class="f">Categoría</label><select class="in" id="b-cat">${S.config.categories.filter((c) => c.id !== 'efectivo').map((c) => `<option value="${c.id}" ${b.cat === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select>
          <label class="f">Cada cuánto</label><select class="in" id="b-freq">${[['monthly', 'Todos los meses'], ['quarterly', 'Trimestral'], ['yearly', 'Anual'], ['once', 'Solo este mes (manual)']].map(([v, l]) => `<option value="${v}" ${b.freq === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${b.freq === 'quarterly' || b.freq === 'yearly' ? `<label class="f">${b.freq === 'quarterly' ? 'Un mes en el que toca (se repite cada 3 meses)' : 'Mes en el que toca'}</label><select class="in" id="b-month">${mths}</select>` : ''}
          <div style="margin-top:18px" class="${bill ? 'grid2' : ''}">${bill ? '<button class="btn danger" data-del>Eliminar</button>' : ''}<button class="btn" data-save>Guardar</button></div>`);
        $$('[data-set]', s.el).forEach((el) => { el.onclick = () => { sync(); const [k, v] = el.dataset.set.split(':'); b[k] = v; draw(); }; });
        $('#b-freq', s.el).onchange = () => { sync(); draw(); };
        $('[data-save]', s.el).onclick = save;
        const d = $('[data-del]', s.el); if (d) d.onclick = () => confirmBox('¿Eliminar el recibo?', 'Los pagos ya hechos se quedan en los movimientos.', 'Eliminar', () => { Store.del('bills', b.id); s.close(); }, true);
      };
      const sync = () => {
        b.name = $('#b-name', s.el).value; b.amount = $('#b-amt', s.el).value; b.day = $('#b-day', s.el).value;
        b.cat = $('#b-cat', s.el).value; b.freq = $('#b-freq', s.el).value; const m = $('#b-month', s.el); if (m) b.month = Number(m.value);
      };
      const save = () => {
        sync();
        const amt = parseAmt(b.amount), day = parseInt(b.day, 10);
        if (!b.name.trim()) { toast('Ponle un nombre'); return; }
        if (!(amt > 0)) { toast('Escribe el importe'); return; }
        if (!(day >= 1 && day <= 31)) { toast('El día debe ser del 1 al 31'); return; }
        const out = { id: b.id, name: b.name.trim(), amount: amt, day, wallet: b.wallet, cat: b.cat, freq: b.freq };
        if (b.freq === 'quarterly' || b.freq === 'yearly') out.month = Number(b.month) || 1;
        if (b.freq === 'once') out.ym = bill && bill.ym ? bill.ym : ui.ym;
        Store.put('bills', b.id, out); s.close(); toast('Recibo guardado ✓');
      };
      draw();
    });
  }
  function openPaySheet(bill) {
    if (guardClosed(ui.ym)) return;
    const due = L.billDue(bill, ui.ym);
    const date = ui.ym === L.ymOf(today()) ? today() : due;
    openSheet(`<h2>Pagar «${esc(bill.name)}»</h2><p class="muted small" style="margin:0 0 4px">Se apuntará como gasto de ${esc(wName(bill.wallet))} · ${esc(catOf(bill.cat).name)}.</p>
      <input class="amount" id="p-amt" inputmode="decimal" value="${esc(String(bill.amount).replace('.', ','))}" aria-label="Importe a pagar">
      <button class="btn" data-ok>Confirmar pago</button>`, (s) => {
      $('[data-ok]', s.el).onclick = () => {
        const amt = parseAmt($('#p-amt', s.el).value);
        if (!(amt > 0)) { toast('Escribe un importe'); return; }
        const id = uid();
        Store.put('tx', id, { id, type: 'expense', wallet: bill.wallet, cat: bill.cat, amount: amt, date, note: bill.name, billId: bill.id });
        s.close(); toast('Pagado ✓');
      };
    });
  }

  /* ---------- hojas: presupuesto, mes, metas ---------- */
  function openBudgetSheet(catId) {
    if (guardClosed(ui.ym)) return;
    const c = catOf(catId);
    const md = S.months[ui.ym] || {};
    const b = md.budgets || S.config.budgets;
    const v = (x) => (x ? String(x).replace('.', ',') : '');
    openSheet(`<h2>${c.icon} ${esc(c.name)}</h2><p class="muted small" style="margin:0">Tope mensual: lo máximo que queréis gastar. Si no llegáis, lo que sobra se mueve a ahorro al cerrar el mes.</p>
      <label class="f">Tope de la cuenta común (€)</label><input class="in" id="bd-c" inputmode="decimal" value="${v(b.common[catId])}" placeholder="0">
      <div class="grid2"><div><label class="f">Tope de ${esc(nm('a'))} (€)</label><input class="in" id="bd-a" inputmode="decimal" value="${v(b.a[catId])}" placeholder="0"></div>
      <div><label class="f">Tope de ${esc(nm('b'))} (€)</label><input class="in" id="bd-b" inputmode="decimal" value="${v(b.b[catId])}" placeholder="0"></div></div>
      <label class="f">% de ${esc(nm('a'))} en esta categoría (común)</label><input class="in" id="bd-p" inputmode="decimal" value="${S.config.split.byCat[catId] ?? ''}" placeholder="General: ${S.config.split.def}">
      <button class="btn" style="margin-top:18px" data-ok>Guardar</button>`, (s) => {
      $('[data-ok]', s.el).onclick = () => {
        const g = (id) => { const t = $(id, s.el).value.trim(); if (t === '') return 0; const n = parseAmt(t); return isFinite(n) && n >= 0 ? n : NaN; };
        const vals = { common: g('#bd-c'), a: g('#bd-a'), b: g('#bd-b') };
        if ([vals.common, vals.a, vals.b].some((x) => isNaN(x))) { toast('Revisa los importes'); return; }
        const ptxt = $('#bd-p', s.el).value.trim(); const p = ptxt === '' ? null : parseAmt(ptxt);
        if (p !== null && !(p >= 0 && p <= 100)) { toast('El porcentaje va de 0 a 100'); return; }
        const apply = (bud) => { for (const k of ['common', 'a', 'b']) { if (vals[k] > 0) bud[k][catId] = vals[k]; else delete bud[k][catId]; } return bud; };
        if (md.budgets) Store.put('months', ui.ym, Object.assign({}, md, { budgets: apply(L.clone(md.budgets)) }));
        else saveCfg((cfg) => { apply(cfg.budgets); });
        saveCfg((cfg) => { if (p === null) delete cfg.split.byCat[catId]; else cfg.split.byCat[catId] = p; });
        s.close(); toast('Guardado ✓');
      };
    });
  }
  function openMonthAdjust() {
    if (guardClosed(ui.ym)) return;
    const { res, bal } = vm();
    const md = S.months[ui.ym] || {};
    const cash = md.cash || {};
    const v = (x) => (x === undefined || x === null ? '' : String(x).replace('.', ','));
    openSheet(`<h2>Ajustar ${esc(monthLabel(ui.ym))}</h2>
      <div class="muted small">Déjalo vacío para usar lo acordado en Ajustes.</div>
      <div class="grid2"><div><label class="f">Fondo de emergencia (€)</label><input class="in" id="m-f" inputmode="decimal" placeholder="${S.config.fondo.amt}" value="${v(md.fondoAmt)}"></div>
      <div><label class="f">Efectivo acordado (€)</label><input class="in" id="m-e" inputmode="decimal" placeholder="${S.config.efe.amt}" value="${v(md.efeAmt)}"></div></div>
      <label class="f">Efectivo que ha sacado cada uno este mes</label>
      <div class="grid2"><div><div class="muted xs">${esc(nm('a'))} (acordado ${eur(res.cash.agreedA)})</div><input class="in" id="m-ca" inputmode="decimal" placeholder="${res.cash.agreedA}" value="${v(cash.a)}"></div>
      <div><div class="muted xs">${esc(nm('b'))} (acordado ${eur(res.cash.agreedB)})</div><input class="in" id="m-cb" inputmode="decimal" placeholder="${res.cash.agreedB}" value="${v(cash.b)}"></div></div>
      <label class="f">Efectivo que queda ahora (opcional)</label><input class="in" id="m-now" inputmode="decimal" placeholder="${plain.format(bal.efe)}">
      <div class="muted xs" style="margin-top:4px">No hace falta apuntar cada gasto en efectivo: si dices cuánto queda, la diferencia se apunta como gasto en efectivo.</div>
      <button class="btn" style="margin-top:18px" data-ok>Guardar</button>`, (s) => {
      $('[data-ok]', s.el).onclick = () => {
        const g = (id) => { const t = $(id, s.el).value.trim(); if (t === '') return null; const n = parseAmt(t); return isFinite(n) && n >= 0 ? n : NaN; };
        const f = g('#m-f'), e = g('#m-e'), ca = g('#m-ca'), cb = g('#m-cb'), now = g('#m-now');
        if ([f, e, ca, cb, now].some((x) => Number.isNaN(x))) { toast('Revisa los importes'); return; }
        const m = Object.assign({}, md);
        if (f === null) delete m.fondoAmt; else m.fondoAmt = f;
        if (e === null) delete m.efeAmt; else m.efeAmt = e;
        if (ca === null && cb === null) delete m.cash; else m.cash = { a: ca, b: cb };
        Store.put('months', ui.ym, m);
        if (now !== null) {
          const cur = L.walletBalances(S, ui.ym).efe;
          const diff = L.r2(cur - now);
          if (diff > 0.004) {
            const id = uid(); Store.put('tx', id, { id, type: 'expense', wallet: 'efe', cat: 'efectivo', amount: diff, date: defDate(), note: 'Ajuste de efectivo' });
          } else if (diff < -0.004) toast('Hay más efectivo del previsto: apunta lo retirado arriba.');
        }
        s.close(); toast('Mes ajustado ✓');
      };
    });
  }
  function openGoalSheet(w) {
    const g = S.config.goals[w] || { name: wName(w), target: 0 };
    openSheet(`<h2>${WMETA[w].icon} ${esc(wName(w))}</h2>
      <label class="f">Nombre de la meta</label><input class="in" id="g-n" maxlength="40" value="${esc(g.name)}">
      <label class="f">Objetivo (€) — 0 si no tiene</label><input class="in" id="g-t" inputmode="decimal" value="${g.target ? String(g.target).replace('.', ',') : ''}" placeholder="Ej.: 5000">
      <button class="btn" style="margin-top:18px" data-ok>Guardar</button>`, (s) => {
      $('[data-ok]', s.el).onclick = () => {
        const t = $('#g-t', s.el).value.trim() === '' ? 0 : parseAmt($('#g-t', s.el).value);
        if (!(t >= 0)) { toast('Revisa el objetivo'); return; }
        saveCfg((c) => { c.goals[w] = { name: $('#g-n', s.el).value.trim() || wName(w), target: t }; }); s.close();
      };
    });
  }

  /* ---------- cierre de mes ---------- */
  function openCloseSheet() {
    const ym = ui.ym;
    const md = S.months[ym] || {};
    if (md.closed) {
      const cl = md.closed;
      openSheet(`<h2>🔒 ${esc(monthLabel(ym))} cerrado</h2>
        <p class="muted small" style="margin:0 0 8px">Cerrado el ${new Date(cl.at).toLocaleDateString('es-ES')}. No se puede añadir ni cambiar nada.</p>
        <div class="card" style="box-shadow:none;background:var(--soft)">${cl.sweeps.length ? cl.sweeps.map((x) => `<div class="kv"><span>${esc(x.label)}</span><b>${eur(x.amount)}</b></div>`).join('') : '<div class="muted small">No se movió dinero al cerrar.</div>'}</div>
        <button class="btn danger" style="margin-top:14px" data-reopen>Reabrir mes</button>`, (s) => {
        $('[data-reopen]', s.el).onclick = () => confirmBox('¿Reabrir el mes?', 'Se deshacen los movimientos del cierre y podrás editar de nuevo. Acuérdate de cerrarlo otra vez.', 'Reabrir', () => {
          const m = Object.assign({}, md); delete m.closed; Store.put('months', ym, m); s.close(); toast('Mes reabierto');
        }, true);
      });
      return;
    }
    const opts = { refund: true, personal: true, cover: true };
    openSheet('', (s) => {
      const draw = () => {
        const { res, sweeps } = L.computeSweeps(S, ym, opts);
        const bills = L.billsForMonth(S, ym, today()).filter((b) => b.status !== 'paid');
        const warn = [];
        if (res.income.total === 0) warn.push('No hay ingresos apuntados este mes.');
        if (bills.length) warn.push(`Quedan ${bills.length} recibos sin pagar (${eur(bills.reduce((a, b) => a + Number(b.bill.amount), 0))}).`);
        if (ym > L.ymOf(today())) warn.push('Este mes todavía no ha empezado.'); else if (ym === L.ymOf(today())) warn.push('El mes aún no ha terminado. Cierra cuando hayáis apuntado todo.');
        const kinds = [['refund', res.mode === 'individual' ? 'Devolver lo no gastado de la común a cada uno' : 'Pasar el sobrante de la común al ahorro común'], ['personal', 'Pasar lo que sobra de cada uno a su ahorro individual'], ['cover', 'Cubrir déficits con el ahorro']];
        s.set(`<h2>Cerrar ${esc(monthLabel(ym))}</h2>
          <div class="card" style="box-shadow:none;background:var(--soft)">
            <div class="kv"><span>Ingresos</span><b>${eur(res.income.total)}</b></div><div class="kv"><span>Gastos</span><b>${eur(res.spend.total)}</b></div>
            <div class="kv"><span>Fondo de emergencia</span><b>${eur(res.fondo.total)}</b></div><div class="kv"><span>Efectivo retirado</span><b>${eur(res.cash.a + res.cash.b)}</b></div>
            <div class="kv"><span>Lo que queda a ${esc(nm('a'))}</span><b>${eur(res.remainder.a)}</b></div><div class="kv"><span>Lo que queda a ${esc(nm('b'))}</span><b>${eur(res.remainder.b)}</b></div></div>
          ${warn.map((w) => `<div class="banner amber" style="margin-top:10px">⚠️<div>${esc(w)}</div></div>`).join('')}
          <h2 style="margin-top:16px;font-size:16px">Esto se va a mover</h2>
          ${kinds.map(([k, l]) => `<label class="switch"><span>${esc(l)}</span><input type="checkbox" data-k="${k}" ${opts[k] ? 'checked' : ''}></label>`).join('')}
          ${sweeps.length ? `<div class="card" style="box-shadow:none;background:var(--soft);margin-top:6px">${sweeps.map((x) => `<div class="kv"><span>${esc(x.label)}</span><b>${eur(x.amount)}</b></div>`).join('')}</div>` : '<p class="muted small">Con estos ajustes no se mueve dinero.</p>'}
          <p class="muted small">Después el mes queda bloqueado. Puedes reabrirlo si te equivocas.</p>
          <button class="btn" data-ok>Cerrar y bloquear el mes</button>`);
        $$('[data-k]', s.el).forEach((el) => { el.onchange = () => { opts[el.dataset.k] = el.checked; draw(); }; });
        $('[data-ok]', s.el).onclick = () => { Store.put('months', ym, L.closeMonth(S, ym, sweeps)); s.close(); toast('Mes cerrado 🔒'); };
      };
      draw();
    });
  }

  /* ---------- sesión / quién eres / login ---------- */
  function askWho() {
    openSheet(`<h2>¿Quién eres?</h2><p class="muted" style="margin:0 0 14px">Así la app te saluda y propone tu cartera. Los dos veis y editáis todo.</p>
      <div class="grid2"><button class="btn" data-w="a">${esc(nm('a'))}</button><button class="btn dark" data-w="b">${esc(nm('b'))}</button></div>`, (s) => {
      $$('[data-w]', s.el).forEach((el) => { el.onclick = () => { ui.who = el.dataset.w; lsSet('who', ui.who); s.close(); render(); }; });
    }, { locked: true });
  }
  function showLogin(msg) {
    booted = false; $('#nav').hidden = true;
    $('#view').innerHTML = `<form class="login" id="loginf"><div class="logo">💸</div><h1 style="font-size:28px;font-weight:800">Cuentas de los dos</h1>
      <p class="muted">Entra con el correo y la contraseña que creasteis en Firebase.</p>
      <label class="f">Correo</label><input class="in" type="email" id="lg-e" autocomplete="username" required>
      <label class="f">Contraseña</label><input class="in" type="password" id="lg-p" autocomplete="current-password" required>
      <div id="lg-err" class="banner red" style="margin-top:12px;${msg ? '' : 'display:none'}">${esc(msg || '')}</div>
      <button class="btn" style="margin-top:18px" type="submit">Entrar</button></form>`;
    $('#loginf').onsubmit = async (e) => {
      e.preventDefault();
      try { await Store.login($('#lg-e').value.trim(), $('#lg-p').value); }
      catch (err) {
        const m = { 'auth/invalid-credential': 'Correo o contraseña incorrectos.', 'auth/wrong-password': 'Contraseña incorrecta.', 'auth/user-not-found': 'Ese correo no está dado de alta en Firebase.', 'auth/too-many-requests': 'Demasiados intentos. Espera un poco.', 'auth/network-request-failed': 'No hay conexión.' }[err.code] || 'No se pudo entrar (' + (err.code || err.message) + ').';
        const box = $('#lg-err'); box.style.display = ''; box.textContent = m;
      }
    };
  }

  /* ---------- acciones ---------- */
  const ACT = {
    tab(el) { ui.tab = el.dataset.tab; ui.page = null; render(); window.scrollTo(0, 0); },
    goto(el) { ACT.tab(el); },
    gopage(el) { ui.tab = 'more'; ui.page = el.dataset.page || null; render(); window.scrollTo(0, 0); },
    mprev() { ui.ym = L.addMonths(ui.ym, -1); render(); },
    mnext() { ui.ym = L.addMonths(ui.ym, 1); render(); },
    filter(el) { ui.filter = el.dataset.f; render(); },
    add() { openTxSheet(null); },
    edittx(el) { const t = S.tx[el.dataset.id]; if (t) openTxSheet(t); },
    wallet(el) { const w = el.dataset.w; if (['aha', 'ahb', 'ahc'].includes(w)) { ui.tab = 'more'; ui.page = 'savings'; render(); } else { ui.tab = 'list'; ui.filter = w === 'pa' || w === 'pb' || w === 'comun' || w === 'efe' ? w : 'all'; render(); window.scrollTo(0, 0); } },
    usual() {
      if (guardClosed(ui.ym)) return;
      const d = defDate();
      S.config.usualIncome.forEach((i) => { const id = uid(); Store.put('tx', id, { id, type: 'income', wallet: L.PW[i.owner], owner: i.owner, cat: 'ingreso', concept: i.concept, amount: i.amount, date: d }); });
      toast('Ingresos añadidos ✓');
    },
    monthadj() { openMonthAdjust(); },
    closemonth() { openCloseSheet(); },
    editbudget(el) { openBudgetSheet(el.dataset.id); },
    newbill() { if (guardClosed(ui.ym)) return; openBillSheet(null); },
    editbill(el) { openBillSheet(S.bills[el.dataset.id]); },
    paybill(el) { openPaySheet(S.bills[el.dataset.id]); },
    editgoal(el) { openGoalSheet(el.dataset.w); },
    savein(el) { if (guardClosed(ui.ym)) return; openTxSheet(null, { ui: 'saving', from: 'pa', to: el.dataset.w }); },
    who(el) { ui.who = el.dataset.p; lsSet('who', ui.who); render(); },
    mode(el) { saveCfg((c) => { c.rules.commonMode = el.dataset.m; }); },
    usesug(el) { saveCfg((c) => { c.split.def = Number(el.dataset.v); }); toast('Porcentaje actualizado'); },
    addusual() {
      openSheet(`<h2>Ingreso habitual</h2><label class="f">Para</label><div class="grid2"><button class="pick on" data-o="a">${esc(nm('a'))}</button><button class="pick" data-o="b">${esc(nm('b'))}</button></div>
        <label class="f">Concepto</label><input class="in" id="u-c" value="Nómina"><label class="f">Importe (€)</label><input class="in" id="u-a" inputmode="decimal">
        <button class="btn" style="margin-top:18px" data-ok>Añadir</button>`, (s) => {
        let o = 'a';
        $$('[data-o]', s.el).forEach((el) => { el.onclick = () => { o = el.dataset.o; $$('[data-o]', s.el).forEach((x) => x.classList.toggle('on', x === el)); }; });
        $('[data-ok]', s.el).onclick = () => {
          const a = parseAmt($('#u-a', s.el).value); if (!(a > 0)) { toast('Escribe el importe'); return; }
          saveCfg((c) => { c.usualIncome.push({ owner: o, concept: $('#u-c', s.el).value.trim() || 'Ingreso', amount: a }); }); s.close();
        };
      });
    },
    delusual(el) { saveCfg((c) => { c.usualIncome.splice(Number(el.dataset.k), 1); }); },
    sample() {
      confirmBox('Cargar septiembre de ejemplo', 'Se borrarán los movimientos, recibos y cierres actuales y se cargarán los datos de la hoja «Septiembre_real» de tu Excel. Tus ajustes se conservan.', 'Cargar', async () => {
        const sm = L.sampleSeptember('real'); const tx = {}; sm.tx.forEach((t) => { tx[t.id] = t; });
        const cfg = Object.assign(L.clone(S.config), sm.configPatch);
        await Store.replaceAll({ config: cfg, tx, bills: sm.bills, months: sm.months });
        ui.ym = '2026-09'; ui.tab = 'home'; ui.page = null; render(); toast('Septiembre cargado ✓');
      });
    },
    wipe() {
      confirmBox('Borrar todos los movimientos', 'Se borran movimientos, recibos y cierres de mes. Los ajustes se conservan. No se puede deshacer.', 'Borrar todo', async () => {
        const cfg = L.clone(S.config); cfg.startYm = L.ymOf(today()); cfg.usualIncome = cfg.usualIncome || [];
        await Store.replaceAll({ config: cfg, tx: {}, bills: {}, months: {} });
        ui.ym = L.ymOf(today()); render(); toast('Datos borrados');
      }, true);
    },
    export() {
      const blob = new Blob([JSON.stringify(Store.exportData(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cuentas-copia-' + today() + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    import() { const f = $('#importfile'); if (f) f.click(); },
    logout() { Store.logout(); },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('.sheet')) return;
    const fn = ACT[el.dataset.act]; if (fn) fn(el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'importfile' && el.files && el.files[0]) {
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const d = JSON.parse(rd.result);
          if (!d || typeof d !== 'object' || !d.config) throw new Error('formato');
          confirmBox('Restaurar copia', 'Se reemplazarán todos los datos actuales por los de la copia.', 'Restaurar', async () => {
            await Store.replaceAll({ config: d.config, tx: d.tx || {}, bills: d.bills || {}, months: d.months || {} }); toast('Copia restaurada ✓');
          }, true);
        } catch (err) { toast('Ese archivo no es una copia válida'); }
      };
      rd.readAsText(el.files[0]); el.value = '';
      return;
    }
    const path = el.dataset && el.dataset.cfg;
    if (!path) return;
    const t = el.dataset.t; let val;
    if (t === 'bool') val = el.checked;
    else if (t === 'txt') { val = el.value.trim(); if (path.startsWith('names.') && !val) { toast('El nombre no puede estar vacío'); render(); return; } }
    else {
      const raw = el.value.trim();
      if (raw === '') val = path.startsWith('split.byCat.') ? undefined : 0;
      else { val = parseAmt(raw); if (!isFinite(val) || (val < 0 && !path.startsWith('opening.'))) { toast('Número no válido'); render(); return; } }
      if ((path.endsWith('pctA') || path.startsWith('split.')) && val !== undefined && val > 100) { toast('El porcentaje va de 0 a 100'); render(); return; }
    }
    saveCfg((c) => setPath(c, path, val));
  });

  /* ---------- arranque ---------- */
  function start() {
    if (booted) { render(); return; }
    booted = true;
    Store.onChange(render);
    if (!ui.who) askWho();
    render();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  async function boot() {
    try {
      const r = await Store.init();
      Store.onAuth((u) => { if (u) start(); else showLogin(); });
      if (r.needsLogin) showLogin(); else start();
    } catch (err) {
      console.error(err);
      $('#view').innerHTML = `<div class="pad" style="padding-top:60px"><div class="banner red">⚠️<div><b>No se pudo arrancar</b>${esc(err.message || err)}. Si usas Firebase, revisa el archivo firebase-config.js.</div></div></div>`;
    }
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const ovs = $$('#sheet-root .ov'); const top = ovs[ovs.length - 1];
    if (top && !top.querySelector('[data-w]')) top.remove();
  });
  window.addEventListener('error', (e) => console.error('Error', e.message));
  boot();
  window.__app = { ui, S, render, ACT };
})();
