import { store, ui, hooks } from '../core.js';
import { searchAll } from '../search.js';
import { orderTab } from '../crm.js';
import { D, T, P } from '../i18n.js';
import { esc, fmt, ltr } from '../util.js';
import { icon, pageHead } from '../ui.js';

export const noRerender = true;
if (!ui.srch) ui.srch = { q: '' };

const PAGES = [['home', 'nav.dash'], ['orders/new', 'nav.orders'], ['products', 'nav.products'], ['stock', 'nav.stock'], ['channels', 'nav.channels'], ['carrier', 'nav.carrier'], ['team', 'nav.team'],
  ['profit', 'nav.profit'], ['received', 'nav.received'], ['customers', 'nav.customers'], ['settings', 'nav.settings']];

function results() {
  const q = ui.srch.q.trim();
  if (!q) return '';
  const pages = PAGES.map(([h, k]) => ({ h, k, text: (D[k] || [k]).join(' ') }));
  const r = searchAll(q, { orders: store.orders(), products: store.products(), pages });
  const none = !r.orders.length && !r.products.length && !r.pages.length;
  if (none) return `<div class="empty"><h2>${T('search.none')}</h2></div>`;
  const orders = r.orders.map((o) => `<a class="ocard" href="#orders/${orderTab(o)}" style="text-decoration:none;color:inherit">
      <div class="oc-head"><div><div class="ref">${esc(o.name || '—')}</div><div class="sub num">${o.phone ? ltr(o.phone) : ''} ${o.tracking ? '· ' + ltr(o.tracking) : ''}</div></div>
      <div class="stock-big num"><bdi>${fmt(o.total)}</bdi><small>DA</small></div></div>
      <div class="hint">${esc(o.wilaya || '')}${o.commune ? '، ' + esc(o.commune) : ''} · ${esc((o.items || []).map((i) => i.name || i.sku).join(' + '))} · <b>${T('ot.' + orderTab(o))}</b></div></a>`).join('');
  const prods = r.products.map((p) => `<a class="ocard" href="#products" style="text-decoration:none;color:inherit"><div class="ref">${esc(p.name)}</div>${p.skus ? `<div class="sub" dir="ltr">${esc(p.skus)}</div>` : ''}</a>`).join('');
  const pages2 = r.pages.map((p) => `<a class="chip-soon on" href="#${p.h}" style="text-decoration:none">${T(p.k)}</a>`).join(' ');
  return `${r.pages.length ? `<div class="soon">${pages2}</div>` : ''}
    ${r.orders.length ? `<div class="section-title"><h2>${T('search.orders')} (${r.orders.length})</h2></div><div class="ocards">${orders}</div>` : ''}
    ${r.products.length ? `<div class="section-title"><h2>${T('nav.products')} (${r.products.length})</h2></div><div class="ocards">${prods}</div>` : ''}`;
}

export function render() {
  return `${pageHead('nav.search')}
    <label class="field"><span>${T('search.label')}</span><input type="search" id="srchIn" data-inp="sq" value="${esc(ui.srch.q)}" placeholder="${esc(P('search.ph'))}" autocomplete="off"></label>
    <div id="srchOut">${results()}</div>`;
}
export function afterRender() { const i = document.getElementById('srchIn'); if (i && !i.value) i.focus(); }
export const handlers = {
  input: { sq: (el) => { ui.srch.q = el.value; document.getElementById('srchOut').innerHTML = results(); } },
};
void hooks; void icon;
