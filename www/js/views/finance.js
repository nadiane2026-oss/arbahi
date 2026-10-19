// المالية: نفس مراحل Livrés في Ecotrack، ثم حساب الأرباح عند استلام الدفعة
import { store, ui, hooks } from '../core.js';
import { computeBatch, autoComputeBatches, markPaid } from '../ops.js';
import { runEcoSync } from '../ecosync.js';
import { PAY_STAGES, payOf, financeGroups, pendingBatches, decharge_fromOrders, orderNet } from '../crm.js';
import { decharge, splitProfit, finalCost } from '../calc.js';
import { splitHtml } from './profit.js';
import { esc, fmt, ltr, daHtml, num } from '../util.js';
import { icon, pageHead, toast } from '../ui.js';
import { T, P } from '../i18n.js';

if (!ui.fin) ui.fin = { open: '', result: '', recv: false };
const TABS = ['uncollected', 'collected', 'ready', 'history'];
const tabOf = () => (TABS.includes(ui.sub) ? ui.sub : 'uncollected');
export const noRerender = true;

function orderCard(o) {
  return `<article class="ocard"><div class="oc-head"><div><div class="ref">${esc(o.name || '—')}</div><div class="sub num">${o.phone ? ltr(o.phone) : ''} ${o.tracking ? '· ' + ltr(o.tracking) : ''}</div></div>
    <div class="stock-big num"><bdi>${fmt(orderNet(o))}</bdi><small>DA</small></div></div>
    <div class="hint">${esc(o.wilaya || '')}${o.commune ? '، ' + esc(o.commune) : ''} · ${esc((o.items || []).map((i) => i.name || i.sku).join(' + '))}</div>
    <div class="hint">${esc(o.eco?.label || '')} · ${ltr(String(o.eco?.at || '').slice(0, 10))}</div></article>`;
}

function batchCard(b) {
  const s = store.settings();
  const open = ui.fin.open === b.day;
  const form = open ? `<div class="block" style="margin-top:10px"><h2>${T('fin.calcTitle')}</h2><p class="hint">${T('fin.calcHint')}</p>
      <div class="row c3">
        <label class="field"><span>${T('fin.meta')}</span><input id="fMeta" class="n" inputmode="decimal" value="${esc(s.metaCost || '')}"></label>
        <label class="field"><span>${T('p.confirmShort')}</span><input id="fConf" class="n" inputmode="decimal" value="${esc(s.confirmRate)}"></label>
        <label class="field"><span>${T('p.deliveryShort')}</span><input id="fDel" class="n" inputmode="decimal" value="${esc(s.deliveryRate)}"></label>
      </div>
      <div class="oc-actions"><button class="btn" data-act="fcalc" data-day="${esc(b.day)}">${icon('check')} ${T('fin.calc')}</button></div></div>` : '';
  return `<article class="ocard"><div class="oc-head"><div><div class="ref">${T('fin.batch')} ${ltr(b.day)}</div><div class="sub">${T('rec.count')}: <b class="num">${b.orders.length}</b></div></div>
    <div class="stock-big num"><bdi>${fmt(b.total)}</bdi><small>DA</small></div></div>
    ${open ? form : `<div class="oc-actions"><button class="btn" data-act="fopen" data-day="${esc(b.day)}">${icon('wallet')} ${T('fin.calcBtn')}</button></div>`}</article>`;
}

function resultCard() {
  const d = ui.fin.result && store.get('decharge', ui.fin.result);
  if (!d) return '';
  const ctx = store.ctx(); const t = decharge(d, ctx); const people = splitProfit(t.profit, ctx.settings);
  const un = t.unassigned ? `<div class="banner">${icon('alert')}<div>${T('home.unassigned', { n: t.unassigned })}</div></div>` : '';
  return `<section class="hero"><div class="hero-label">${T('fin.received', { a: daHtml(t.net) })}</div>
    <div class="hero-num num ${t.profit < 0 ? 'neg' : ''}"><bdi>${fmt(t.profit)}</bdi><small>DA</small></div>
    ${splitHtml(people, t.profit)}</section>${un}`;
}

function varsBox() {
  const s = store.settings();
  return `<section class="block"><h2>${T('fin.varsTitle')}</h2><p class="hint">${T('fin.varsHint')}</p>
    <div class="row c3">
      <label class="field"><span>${T('fin.meta')}</span><input class="n" inputmode="decimal" data-chg="fvar" data-f="metaCost" value="${esc(s.metaCost || '')}"></label>
      <label class="field"><span>${T('p.confirmShort')}</span><input class="n" inputmode="decimal" data-chg="fvar" data-f="confirmRate" value="${esc(s.confirmRate)}"></label>
      <label class="field"><span>${T('p.deliveryShort')}</span><input class="n" inputmode="decimal" data-chg="fvar" data-f="deliveryRate" value="${esc(s.deliveryRate)}"></label>
    </div>
    <label class="check"><input type="checkbox" data-chg="fauto" ${s.autoProfit === 0 ? '' : 'checked'}> <span>${T('fin.auto')}</span></label></section>`;
}

function receiveBox(g) {
  const pool = [...g.ready, ...g.collected, ...g.uncollected];
  if (!ui.fin.recv) return `<div class="tools"><button class="btn" data-act="frecv">${icon('wallet')} ${T('fin.recvBtn')}</button></div><p class="hint">${T('fin.recvHint')}</p>`;
  const rows = pool.map((o) => `<label class="check"><input type="checkbox" class="rcv" value="${esc(o.id)}" ${payOf(o) !== 'uncollected' ? 'checked' : ''}> <span>${esc(o.name || o.tracking)} · ${fmt(orderNet(o))} DA · <small>${esc(o.eco?.label || '')}</small></span></label>`).join('');
  return `<section class="block"><h2>${T('fin.recvTitle')}</h2>${pool.length ? rows : `<p class="hint">${T('fin.emptyTitle')}</p>`}
    <div class="oc-actions"><button class="btn" data-act="frecvok" ${pool.length ? '' : 'disabled'}>${icon('check')} ${T('fin.recvOk')}</button><button class="btn ghost" data-act="frecvno">${T('import.discard')}</button></div></section>`;
}

function diagBox(orders) {
  const o = orders.filter((x) => payOf(x)).sort((a, b) => String(b.eco?.at || '').localeCompare(String(a.eco?.at || '')))[0];
  if (!o) return '';
  const info = { tracking: o.tracking, label: o.eco?.label, payHint: o.eco?.payHint || '', payFields: o.eco?.payFields || {}, stage: payOf(o) };
  return `<details class="more"><summary>${T('fin.diag')}</summary><p class="hint">${T('fin.diagHint')}</p>
    <pre class="debug" dir="ltr">${esc(JSON.stringify(info, null, 2))}</pre>
    <div class="oc-actions"><button class="btn ghost sm" data-act="fsync">${icon('refresh')} ${T('orders.refreshStatus')}</button></div></details>`;
}

export function render() {
  const tab = tabOf();
  const g = financeGroups(store.orders());
  const seg = `<div class="seg wrap" role="tablist">${TABS.map((k) => `<button data-act="ftab" data-t="${k}" aria-pressed="${tab === k}">${T('fin.' + k)} ${k !== 'history' ? `<b class="cnt">${g[k].length}</b>` : ''}</button>`).join('')}</div>`;
  let body;
  if (tab === 'history') {
    const batches = pendingBatches(store.orders());
    const done = store.decharges();
    const ctx = store.ctx();
    body = `${resultCard()}${varsBox()}${receiveBox(g)}
      ${batches.length ? `<div class="section-title"><h2>${T('fin.pending')}</h2></div><div class="ocards">${batches.map(batchCard).join('')}</div>` : ''}
      <div class="section-title"><h2>${T('fin.done')}</h2><a class="btn ghost sm" href="#profit">${T('nav.profit')}</a></div>
      ${done.length ? `<div class="ocards">${done.map((d) => { const t = decharge(d, ctx); return `<article class="ocard" data-act="fsheet" data-id="${esc(d.id)}" style="cursor:pointer"><div class="oc-head"><div><div class="ref">${esc(d.ref || '—')}</div><div class="sub">${ltr(d.date || '')}</div></div>
        <div class="stock-big num ${t.profit < 0 ? 'neg' : ''}"><bdi>${fmt(t.profit)}</bdi><small>${T('th.profit')}</small></div></div>
        <div class="hint">${daHtml(t.net)} · <bdi class="num">${t.count}</bdi> ${T('th.parcels')}</div></article>`; }).join('')}</div>` : `<p class="hint">${T('fin.noneDone')}</p>`}`;
  } else {
    const list = [...g[tab]].sort((a, b) => String(b.eco?.at || '').localeCompare(String(a.eco?.at || '')));
    body = `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="kpi k-b"><span class="k-ic">${icon('clipboard')}</span><div><div class="k-l">${T('rec.count')}</div><div class="k-v num"><bdi>${list.length}</bdi></div></div></div>
      <div class="kpi k-y"><span class="k-ic">${icon('wallet')}</span><div><div class="k-l">${T('fin.amount')}</div><div class="k-v num">${daHtml(g.sums[tab])}</div></div></div></div>
      <p class="hint" style="margin-bottom:12px">${T('fin.hint.' + tab)}</p>
      ${list.length ? `<div class="ocards">${list.slice(0, 200).map(orderCard).join('')}</div>` : `<div class="empty"><h2>${T('fin.emptyTitle')}</h2></div>`}`;
  }
  return `${pageHead('nav.finance')}${seg}${body}${diagBox(store.orders())}`;
}

const v = (id) => num(document.getElementById(id)?.value);
export const handlers = {
  change: {
    fvar: (el) => store.saveSettings({ [el.dataset.f]: num(el.value), ...(el.dataset.f === 'metaCost' ? { metaForeign: 0 } : {}) }),
    fauto: (el) => store.saveSettings({ autoProfit: el.checked ? 1 : 0 }),
  },
  click: {
    ftab: (el) => hooks.go('finance/' + el.dataset.t),
    fopen: (el) => { ui.fin.open = el.dataset.day; ui.fin.result = ''; hooks.refresh(true); },
    fsheet: (el) => hooks.openSheet(el.dataset.id),
    fcalc: (el) => {
      const r = computeBatch(el.dataset.day);
      if (!r) return;
      ui.fin = { open: '', result: r.id, recv: false };
      toast(P('fin.saved')); hooks.refresh(true);
    },
    frecv: () => { ui.fin.recv = true; hooks.refresh(true); },
    frecvno: () => { ui.fin.recv = false; hooks.refresh(true); },
    frecvok: () => {
      const ids = [...document.querySelectorAll('.rcv:checked')].map((x) => x.value);
      if (!ids.length) return;
      markPaid(ids);
      const made = autoComputeBatches();
      ui.fin = { open: '', result: made[0]?.id || '', recv: false };
      toast(P('fin.saved')); hooks.refresh(true);
    },
    fsync: async () => { await runEcoSync({ silent: false }); hooks.refresh(true); },
  },
};
void finalCost;
