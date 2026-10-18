import { store, hooks } from '../core.js';
import { stockReport } from '../crm.js';
import { pullSheets } from '../ops.js';
import { productMeta } from '../calc.js';
import { esc, num, uid, daHtml, fmt, isSet } from '../util.js';
import { icon, pageHead, toast } from '../ui.js';
import { T, P } from '../i18n.js';

export const noRerender = true; // الحقول تُحفظ عند الخروج منها
let q = '';
const L = (k) => esc(P(k));

function card(p, r) {
  const s = store.settings();
  const f = (label, key, v, extra = '') => `<label class="field"><span>${label}</span><input data-chg="pf" data-id="${esc(p.id)}" data-f="${key}" value="${esc(v ?? '')}" ${extra}></label>`;
  return `<article class="ocard">
    <div class="oc-head"><div><div class="ref">${esc(p.name)}</div>${p.skus ? `<div class="sub" dir="ltr">${esc(p.skus)}</div>` : ''}${p.auto ? `<span class="tag">${T('prod.auto')}${p.channel ? ' · ' + esc(p.channel) : ''}</span>` : ''}</div>
      <div class="stock-big num"><bdi>${Math.round(r?.onHand || 0)}</bdi><small>${T('stock.onHand')}</small></div></div>
    <div class="row c2">${f(T('p.name'), 'name', p.name)}${f(T('stock.skus'), 'skus', p.skus, 'dir="ltr"')}
      ${f(T('p.price'), 'price', p.price, 'inputmode="decimal" class="n"')}${f(T('p.cost'), 'cost', p.cost, 'inputmode="decimal" class="n"')}
      ${f(T('stock.variants'), 'variants', p.variants)}${f(T('stock.min'), 'minStock', p.minStock || '', 'inputmode="numeric" class="n"')}</div>
    <details class="more"><summary>${T('p.metaSpecific')}</summary><div class="row c3">
      ${f(T('p.metaInitial'), 'metaCost', isSet(p.metaCost) ? p.metaCost : '', `inputmode="decimal" class="n" placeholder="${fmt(num(s.metaCost))}"`)}
      ${f(T('p.confirmShort'), 'confirmRate', isSet(p.confirmRate) ? p.confirmRate : '', `inputmode="decimal" class="n" placeholder="${fmt(num(s.confirmRate))}"`)}
      ${f(T('p.deliveryShort'), 'deliveryRate', isSet(p.deliveryRate) ? p.deliveryRate : '', `inputmode="decimal" class="n" placeholder="${fmt(num(s.deliveryRate))}"`)}
    </div><p class="hint" style="margin-top:8px">${T('p.metaHint', { v: daHtml(productMeta(p, s)) })}</p></details>
    <div class="oc-actions"><a class="btn ghost sm" href="#stock">${icon('plus')} ${T('stock.add')}</a>
      <button class="btn danger sm" data-act="pdel" data-id="${esc(p.id)}">${icon('trash')} ${T('p.delete')}</button></div>
  </article>`;
}

export function render() {
  const products = store.products();
  const { rep } = stockReport(products, store.moves(), store.orders());
  const shown = q.trim() ? products.filter((p) => `${p.name} ${p.skus}`.toLowerCase().includes(q.trim().toLowerCase())) : products;
  return `${pageHead('nav.products')}
    <div class="tools"><button class="btn sm" data-act="padd">${icon('plus')} ${T('products.add')}</button>
      <button class="btn ghost sm" data-act="psync">${icon('refresh')} ${T('prod.sync')}</button>
      <label class="field grow"><span>${T('prod.search')}</span><input type="search" data-inp="q" value="${esc(q)}"></label></div>
    <p class="hint" style="margin-bottom:14px">${T('prod.hint')}</p>
    ${shown.length ? `<div class="ocards" id="pgrid">${shown.map((p) => card(p, rep.get(p.id))).join('')}</div>` : `<div class="empty"><h2>${T('prod.emptyTitle')}</h2><p>${T('prod.emptyText')}</p></div>`}`;
}

export const handlers = {
  click: {
    padd: () => { const id = uid(); store.put('product', id, { id, name: P('products.newName'), price: 0, cost: 0, skus: '', variants: '' }); hooks.refresh(true); },
    psync: async () => { try { const r = await pullSheets(); toast(r.errors[0] || P('orders.newProducts', { n: r.products })); } catch (e) { toast(e.message); } hooks.refresh(true); },
    pdel: (el) => { if (confirm(P('p.deleteConfirm'))) { store.del('product', el.dataset.id); hooks.refresh(true); } },
  },
  change: {
    pf: (el) => {
      const p = store.get('product', el.dataset.id); if (!p) return;
      const f = el.dataset.f; const v = el.value.trim();
      const next = { ...p };
      if (f === 'name') next.name = v || p.name;
      else if (['price', 'cost', 'minStock'].includes(f)) next[f] = num(v);
      else if (['metaCost', 'confirmRate', 'deliveryRate'].includes(f)) { if (v === '') delete next[f]; else next[f] = num(v); }
      else next[f] = v;
      next.auto = false;
      store.put('product', p.id, next);
    },
  },
  input: { q: (el) => { q = el.value; hooks.refresh(true); const i = document.querySelector('[data-inp="q"]'); i?.focus(); i?.setSelectionRange(q.length, q.length); } },
};
void L;
