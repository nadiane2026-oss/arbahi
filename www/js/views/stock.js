import { store, hooks } from '../core.js';
import { stockReport, newMove, norm } from '../crm.js';
import { esc, uid, num } from '../util.js';
import { icon, pageHead, toast } from '../ui.js';
import { T, P } from '../i18n.js';

export const noRerender = true; // الحقول هنا تُحفظ عند الخروج منها فقط
const splitList = (s) => String(s || '').split(/[,،;]/).map((x) => x.trim()).filter(Boolean);
const num0 = (n) => `<b class="num">${Math.round(n)}</b>`;
const L = (k) => esc(P(k));

let selP = '';
const sel = (products) => (products.find((p) => p.id === selP) || products[0] || {}).id;

function card(p, r) {
  const variants = splitList(p.variants);
  const low = p.minStock > 0 && r.onHand <= p.minStock;
  const vBreak = variants.length ? `<div class="hint">${variants.map((v) => `${esc(v)}: <b class="num">${Math.round(r.variants[v] || 0)}</b>`).join(' · ')}</div>` : '';
  return `<article class="ocard stockcard">
    <div class="oc-head"><div><div class="ref">${esc(p.name)}</div>${p.skus ? `<div class="sub" dir="ltr">${esc(p.skus)}</div>` : ''}${low ? `<span class="tag">${icon('alert')} ${T('stock.low')}</span>` : ''}</div>
      <div class="stock-big num ${low ? 'neg' : ''}"><bdi>${Math.round(r.onHand)}</bdi></div></div>
    ${vBreak}
    <div class="statrow">
      <div><span>${T('stock.inHand')}</span>${num0(r.inHand)}</div><div><span>${T('stock.carrier')}</span>${num0(r.carrier)}</div>
      <div><span>${T('stock.sold')}</span>${num0(r.sold)}</div><div><span>${T('stock.returned')}</span>${num0(r.returned)}</div>
      <div><span>${T('stock.pending')}</span>${num0(r.pending)}</div><div><span>${T('stock.added')}</span>${num0(r.added)}</div>
    </div>
  </article>`;
}

function entryForm(products) {
  if (!products.length) return `<section class="block stockin"><h2>${icon('stack')} ${T('stock.entryTitle')}</h2><p class="hint">${T('stock.empty')}</p><a class="btn sm" href="#products">${icon('plus')} ${T('products.add')}</a></section>`;
  const id = sel(products);
  const p = products.find((x) => x.id === id);
  const variants = splitList(p.variants);
  return `<section class="block stockin"><h2>${icon('stack')} ${T('stock.entryTitle')}</h2>
    <div class="row c2">
      <label class="field"><span>${T('stock.product')}</span><select id="sp" data-chg="spick">${products.map((x) => `<option value="${esc(x.id)}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      ${variants.length ? `<label class="field"><span>${T('stock.variant')}</span><select id="sv">${variants.map((v) => `<option>${esc(v)}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span>${T('stock.qty')}</span><input class="n" inputmode="numeric" id="sq" placeholder="0"></label>
      <label class="field"><span>${T('stock.note')}</span><input id="sn"></label>
    </div>
    <div class="oc-actions"><button class="btn" data-act="addq">${icon('plus')} ${T('stock.add')}</button>
      <button class="btn ghost" data-act="fixq">${T('stock.count')}</button></div>
    <p class="hint">${T('stock.entryHint')}</p></section>`;
}

export function render() {
  const products = store.products();
  const orders = store.orders();
  const moves = store.moves();
  const { rep, unmapped } = stockReport(products, moves, orders);
  const un = unmapped.length ? `<div class="banner">${icon('alert')}<div>${T('stock.unmapped', { l: unmapped.join('، ') })}
    <div class="oc-actions">${unmapped.map((u) => `<button class="btn ghost sm" data-act="mk" data-sku="${esc(u)}">${T('stock.createFrom')}: ${esc(u)}</button>`).join('')}</div></div></div>` : '';
  const hist = [...moves].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  return `${pageHead('stock.title')}<p class="hint" style="margin-bottom:12px">${T('stock.rules')}</p>${un}${entryForm(products)}
    ${products.length ? `<div class="ocards">${products.map((p) => card(p, rep.get(p.id))).join('')}</div>` : ''}
    ${hist.length ? `<div class="section-title"><h2>${T('stock.history')}</h2></div><div class="ledger-wrap"><table class="ledger"><tbody>
      ${hist.map((m) => `<tr><td>${esc(byId[m.productId]?.name || '?')}${m.variant ? ` (${esc(m.variant)})` : ''}</td><td class="n num ${m.qty < 0 ? 'neg' : 'pos'}" dir="ltr">${m.qty > 0 ? '+' : ''}${m.qty}</td><td class="hint">${esc(m.note || '')}</td><td class="n hint" dir="ltr">${esc(m.at.slice(0, 16).replace('T', ' '))}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}

const val = (id) => document.getElementById(id)?.value ?? '';

export const handlers = {
  click: {
    mk: (el) => { const id = uid(); const sku = el.dataset.sku; store.put('product', id, { id, name: sku, price: 0, cost: 0, skus: sku, variants: '' }); hooks.refresh(true); },
    addq: () => {
      const id = val('sp'); const q = num(val('sq'));
      if (!id || !q) return;
      selP = id;
      store.put('move', uid(), newMove(id, q, val('sv'), val('sn') || P('stock.in')));
      toast(P('stock.saved')); hooks.refresh(true);
    },
    fixq: () => {
      const id = val('sp'); const raw = val('sq');
      if (!id || raw.trim() === '') return;
      selP = id;
      const v = val('sv');
      const { rep } = stockReport(store.products(), store.moves(), store.orders());
      const r = rep.get(id); const cur = v ? (r.variants[v] || 0) : r.inHand; // الجرد يُحسب على ما في يدك
      const diff = num(raw) - cur;
      if (!diff) return;
      store.put('move', uid(), newMove(id, diff, v, val('sn') || P('stock.fix')));
      toast(P('stock.saved')); hooks.refresh(true);
    },
  },
  change: { spick: (el) => { selP = el.value; hooks.refresh(true); } },
};
void norm; void L;
