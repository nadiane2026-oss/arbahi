import { store, ui, hooks } from '../core.js';
import { decharge, splitProfit, calcPayout } from '../calc.js';
import { parsePdf } from '../pdf-parse.js';
import { dashStats } from '../crm.js';
import { esc, fmt, ltr, num, uid } from '../util.js';
import { icon, pageHead, toast, COLORS } from '../ui.js';
import { T, P } from '../i18n.js';

export const noRerender = true;

export function splitHtml(people, profit) {
  if (!(profit > 0) || people.some((p) => p.amount < 0)) {
    return `<p class="split-empty">${T(profit < 0 ? 'split.loss' : 'split.none')}</p>`;
  }
  const bar = people.map((p, i) => `<i style="width:${((p.amount / profit) * 100).toFixed(2)}%;background:${COLORS(i)}" title="${esc(p.name)}"></i>`).join('');
  const list = people.map((p, i) => `
    <li style="--c:${COLORS(i)}">
      <div class="who">${esc(p.name)}</div>
      <div class="amt num"><bdi>${fmt(p.amount)}</bdi><small>DA</small></div>
      <div class="how">${T(i === 0 ? 'split.ofNet' : 'split.ofRest', { p: p.pct })}</div>
    </li>`).join('');
  return `<div class="split-bar" role="img" aria-label="${esc(P('split.aria'))}">${bar}</div><ul class="split-list">${list}</ul>`;
}

export function equationHtml(t) {
  const item = (k, v, op, cls = '', extra = '') =>
    `<div class="eq ${extra}"><div class="k">${T(k)}</div><div class="v num ${cls}">${op ? `<span class="op">${op}</span>` : ''}<bdi>${fmt(v)}</bdi></div></div>`;
  return `<div class="equation">
    ${item('eq.collected', t.net, '')}
    ${item('eq.products', t.buy, '−')}
    ${item('eq.meta', t.meta, '−')}
    ${item('eq.commit', t.commit, '−')}
    ${item('eq.profit', t.profit, '=', t.profit >= 0 ? 'pos' : 'neg', 'res')}
  </div>`;
}


let pending = null; // {parsed, refId, fileName}
let busy = false;
let error = '';
let result = null;

async function loadPdfJs() {
  const lib = await import('../../vendor/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return lib;
}

export async function handleFile(file) {
  if (!file) return;
  error = ''; pending = null; result = null; busy = true; hooks.refresh(true);
  try {
    if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error(P('import.notPdf'));
    const parsed = await parsePdf(await file.arrayBuffer(), await loadPdfJs());
    if (!parsed.rows.length) throw new Error(parsed.warnings[0] || P('err.nothing'));
    const base = 'd-' + (String(parsed.ref).replace(/\D/g, '') || uid());
    const ex = store.get('decharge', base);
    const refId = ex && ex.sender && parsed.sender && ex.sender !== parsed.sender ? base + '-' + uid().slice(0, 4) : base;
    pending = { parsed, refId, fileName: file.name };
  } catch (e) { error = e.message || String(e); } finally { busy = false; hooks.refresh(true); }
}

/** نسبتا التأكيد والتوصيل من طلباتك الحقيقية (يحسبها التطبيق) */
export function autoRates(orders) {
  const st = dashStats(orders, 'all');
  const ok = st.total >= 5;
  return {
    confirm: ok && st.confirmed ? Math.round((st.confirmed / st.total) * 1000) / 10 : 0,
    delivery: ok && st.sent ? Math.round((st.delivered / st.sent) * 1000) / 10 : 0,
    st,
  };
}

const MODES = ['parcel', 'total'];
function field(id, labelKey, val, modeKey, modes, hint = '') {
  const m = modeKey ? `<select class="pc-mode" data-chg="pcm" data-k="${modeKey}" aria-label="${esc(P('pc.mode'))}">${MODES.map((x) => `<option value="${x}" ${modes[modeKey] === x ? 'selected' : ''}>${esc(P('pc.m.' + x))}</option>`).join('')}</select>` : '';
  return `<div class="pc-row"><label class="field"><span>${T(labelKey)}</span><input id="${id}" class="n" inputmode="decimal" dir="ltr" data-chg="pcv" data-k="${id}" value="${esc(val ?? '')}" placeholder="0"></label>${m}</div>${hint ? `<p class="hint pc-hint">${hint}</p>` : ''}`;
}

function pdfCard() {
  if (busy) return `<div class="drop"><h2>${T('import.reading')}</h2></div>`;
  if (!pending) return `<div class="drop" id="drop">${icon('upload', 'big')}<h2>${T('pc.drop')}</h2><p class="hint">${T('pc.dropText')}</p><button class="btn" data-act="pick">${T('import.pick')}</button></div>`;
  const { parsed } = pending;
  return `<section class="pc-card"><div class="pc-sum">
      <div><div class="k">${T('import.sumRef')}</div><div class="v">${esc(parsed.ref || '—')}</div></div>
      <div><div class="k">${T('import.sumDate')}</div><div class="v num">${ltr(parsed.date)}</div></div>
      <div><div class="k">${T('import.sumParcels')}</div><div class="v num">${parsed.rows.length}</div></div>
      <div class="big"><div class="k">${T('pc.received')}</div><div class="v num"><bdi>${fmt(parsed.sumNet)}</bdi> <small>DA</small></div></div>
    </div><button class="btn ghost sm" data-act="pick">${icon('upload')} ${T('pc.change')}</button></section>`;
}

function formCard() {
  const s = store.settings();
  const modes = { meta: 'parcel', stockDel: 'total', stock: 'parcel', conf: 'parcel', ...(s.pcModes || {}) };
  const a = autoRates(store.orders());
  const cv = s.pcConfirm !== '' && s.pcConfirm != null ? s.pcConfirm : a.confirm || '';
  const dv = s.pcDelivery !== '' && s.pcDelivery != null ? s.pcDelivery : a.delivery || '';
  const hintC = a.st.total >= 5 ? T('pc.autoC', { a: a.st.confirmed, b: a.st.total }) : T('pc.autoNone');
  const hintD = a.st.total >= 5 ? T('pc.autoD', { a: a.st.delivered, b: a.st.sent }) : '';
  return `<section class="pc-card">
    <h2 class="pc-h">${T('pc.vars')}</h2>
    ${field('pcEur', 'pc.eur', s.pcEur, 'meta', modes)}
    ${field('pcRate', 'pc.rate', s.pcRate, '', modes)}
    ${field('pcConfirm', 'pc.confirmRate', cv, '', modes, `${hintC} ${(s.pcConfirm !== '' && s.pcConfirm != null) ? '' : ''}`)}
    ${field('pcDelivery', 'pc.deliveryRate', dv, '', modes, hintD)}
    <div class="oc-actions"><button class="btn ghost sm" data-act="pcauto">${icon('refresh')} ${T('pc.useAuto')}</button></div>
    ${field('pcStockDel', 'pc.stockDel', s.pcStockDel, 'stockDel', modes)}
    ${field('pcStock', 'pc.stock', s.pcStock, 'stock', modes)}
    ${field('pcConf', 'pc.confPrice', s.pcConf, 'conf', modes)}
    <button class="btn pc-go" data-act="pcalc">${icon('check')} ${T('pc.calc')}</button>
  </section>`;
}

function resultCard() {
  if (!result) return '';
  const r = result.r;
  const item = (k, v, op, cls = '', extra = '') => `<div class="eq ${extra}"><div class="k">${T(k)}</div><div class="v num ${cls}">${op ? `<span class="op">${op}</span>` : ''}<bdi>${fmt(v)}</bdi></div></div>`;
  return `<section class="hero" id="pcres">
      <div class="hero-label">${T('pc.profitOf', { ref: esc(result.ref || '') })}</div>
      <div class="hero-num num ${r.profit < 0 ? 'neg' : ''}"><bdi>${fmt(r.profit)}</bdi><small>DA</small></div>
      ${splitHtml(splitProfit(r.profit, store.settings()), r.profit)}
    </section>
    <div class="equation">
      ${item('pc.received', r.received, '')}
      ${item('pc.metaFinal', r.meta, '−')}
      ${item('pc.stockDel', r.stockDel, '−')}
      ${item('pc.stock', r.stock, '−')}
      ${item('pc.confPrice', r.conf, '−')}
      ${item('eq.profit', r.profit, '=', r.profit >= 0 ? 'pos' : 'neg', 'res')}
    </div>
    <p class="facts">${T('pc.unit', { u: fmt(Math.round(r.finalUnit)), n: r.count })}</p>`;
}

function historyCard() {
  const list = store.decharges().slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0));
  if (!list.length) return '';
  const ctx = store.ctx();
  const cards = list.map((d) => {
    const profit = d.calc ? d.calc.result.profit : decharge(d, ctx).profit;
    return `<article class="ocard" ${d.calc ? '' : `data-act="pcopen" data-id="${esc(d.id)}" style="cursor:pointer"`}>
      <div class="oc-head"><div><div class="ref">${esc(d.ref || '—')}</div><div class="sub">${ltr(d.date || '')} · ${T('pc.parcelsN', { n: d.count || d.parcels?.length || 0 })}</div></div>
      <div class="stock-big num ${profit < 0 ? 'neg' : ''}"><bdi>${fmt(profit)}</bdi><small>${T('th.profit')}</small></div></div>
      <div class="oc-actions"><button class="btn ghost sm" data-act="pcdel" data-id="${esc(d.id)}">${icon('x')} ${T('pc.delete')}</button></div></article>`;
  }).join('');
  return `<div class="section-title"><h2>${T('pc.history')}</h2></div><div class="ocards">${cards}</div>`;
}

export function render() {
  return `${pageHead('nav.profit')}${error ? `<div class="banner err">${icon('alert')}<div>${esc(error)}</div></div>` : ''}
    ${pdfCard()}${pending ? formCard() : ''}${resultCard()}${historyCard()}
    <input type="file" id="pdfInput" accept="application/pdf,.pdf" hidden data-chg="file">`;
}

const val = (id) => document.getElementById(id)?.value.trim() ?? '';
function calculate() {
  if (!pending) return toast(P('pc.needPdf'));
  const s = store.settings();
  const modes = { meta: 'parcel', stockDel: 'total', stock: 'parcel', conf: 'parcel', ...(s.pcModes || {}) };
  const inp = {
    received: pending.parsed.sumNet, count: pending.parsed.rows.length,
    eur: num(val('pcEur')), rate: num(val('pcRate')), confirmPct: num(val('pcConfirm')), deliveryPct: num(val('pcDelivery')),
    stockDel: num(val('pcStockDel')), stock: num(val('pcStock')), conf: num(val('pcConf')), modes,
  };
  if (!(inp.rate > 0) && inp.eur > 0) return toast(P('pc.needRate'));
  if (!(inp.confirmPct > 0) || !(inp.deliveryPct > 0)) return toast(P('pc.needRates'));
  const r = calcPayout(inp);
  const { parsed, refId } = pending;
  const parcels = parsed.rows.map(({ ok, ...x }) => ({ ...x, items: [], noProduct: true }));
  store.put('decharge', refId, { id: refId, ref: parsed.ref, date: parsed.date, sender: parsed.sender, count: parcels.length, total: parsed.total, parcels, createdAt: Date.now(), calc: { inputs: inp, result: r } });
  // طلبات التطبيق المطابقة لأرقام التتبع في الورقة تنتقل إلى «Historique paiements»
  const byTrk = new Map(store.orders().filter((o) => o.tracking).map((o) => [o.tracking, o]));
  for (const p of parcels) { const o = byTrk.get(p.tracking); if (o && o.payManual !== 'paid') store.put('order', o.id, { ...o, payManual: 'paid', payRef: refId }); }
  result = { r, ref: parsed.ref };
  toast(P('pc.saved'));
  hooks.refresh(true);
  setTimeout(() => document.getElementById('pcres')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

export const handlers = {
  click: {
    pick: () => document.getElementById('pdfInput').click(),
    pcalc: calculate,
    pcauto: () => { store.saveSettings({ pcConfirm: '', pcDelivery: '' }); hooks.refresh(true); },
    pcopen: (el) => hooks.openSheet(el.dataset.id),
    pcdel: (el) => { if (confirm(P('pc.confirmDel'))) { store.del('decharge', el.dataset.id); hooks.refresh(true); } },
  },
  change: {
    file: (el) => { const f = el.files[0]; el.value = ''; handleFile(f); },
    pcv: (el) => store.saveSettings({ [el.dataset.k]: el.value.trim() }),
    pcm: (el) => store.saveSettings({ pcModes: { ...(store.settings().pcModes || {}), [el.dataset.k]: el.value } }),
  },
};

export function afterRender(root) {
  const drop = root.querySelector('#drop');
  if (!drop) return;
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handleFile(e.dataTransfer.files[0]); });
}
