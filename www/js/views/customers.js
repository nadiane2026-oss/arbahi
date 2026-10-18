import { store } from '../core.js';
import { buildCustomers, metaCsv } from '../calc.js';
import { esc, fmt, ltr, daHtml, today } from '../util.js';
import { icon, pageHead, saveFile, toast } from '../ui.js';
import { T, P } from '../i18n.js';

let q = '';

function all() {
  const ctx = store.ctx();
  return buildCustomers(store.decharges(), ctx.productsById);
}

function rowsHtml(list) {
  if (!list.length) return `<tr><td colspan="6" class="hint">${T('customers.none')}</td></tr>`;
  return list.slice(0, 300).map((c) => `<tr>
      <td data-l="${esc(P('th.customer'))}" class="full"><div class="ref">${esc(c.name)}</div><div class="sub num">${c.phone || c.rawPhone ? ltr(c.phone || c.rawPhone) : T('customers.noPhone')}</div></td>
      <td data-l="${esc(P('th.address'))}">${esc(c.wilaya)}${c.commune && c.commune !== c.wilaya ? '، ' + esc(c.commune) : ''}</td>
      <td data-l="${esc(P('th.orders'))}" class="n num"><bdi>${c.orders}</bdi></td>
      <td data-l="${esc(P('th.spent'))}" class="n num"><bdi>${fmt(c.spent)}</bdi></td>
      <td data-l="${esc(P('th.last'))}" class="n num">${ltr(c.last)}</td>
    </tr>`).join('');
}

export function render() {
  const list = all();
  if (!list.length) {
    return pageHead('customers.title') + `<div class="empty"><h2>${T('customers.emptyTitle')}</h2><p>${T('customers.emptyText')}</p></div>`;
  }
  const withPhone = list.filter((c) => c.phone).length;
  const repeat = list.filter((c) => c.orders > 1).length;
  const total = list.reduce((a, c) => a + c.spent, 0);
  return `${pageHead('customers.title')}
    <div class="stats">
      <div><div class="k">${T('customers.total')}</div><div class="v num">${list.length}</div></div>
      <div><div class="k">${T('customers.repeat')}</div><div class="v num">${repeat}</div></div>
      <div><div class="k">${T('customers.avg')}</div><div class="v num">${daHtml(total / list.length)}</div></div>
    </div>
    <div class="item" style="margin-bottom:18px">
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
        <div><b>${T('customers.metaTitle')}</b><div class="hint">${T('customers.metaSub', { n: withPhone })}</div></div>
        <button class="btn" data-act="export">${icon('download')} ${T('customers.export')}</button>
      </div>
      <details class="more"><summary>${T('customers.how')}</summary>
        <ol class="hint" style="margin:0;padding-inline-start:20px;display:grid;gap:4px">
          <li>${T('customers.s1')}</li>
          <li>${T('customers.s2')}</li>
          <li>${T('customers.s3')}</li>
          <li>${T('customers.s4')}</li>
        </ol>
      </details>
    </div>
    <label class="field" style="margin-bottom:12px"><span>${T('customers.search')}</span><input data-inp="q" value="${esc(q)}" type="search"></label>
    <div class="ledger-wrap"><table class="ledger">
      <thead><tr><th>${T('th.customer')}</th><th>${T('th.address')}</th><th class="n">${T('th.orders')}</th><th class="n">${T('th.spent')}</th><th class="n">${T('th.last')}</th></tr></thead>
      <tbody id="custBody">${rowsHtml(filtered(list))}</tbody></table></div>`;
}

function filtered(list) {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter((c) => `${c.name} ${c.phone} ${c.rawPhone} ${c.wilaya} ${c.commune}`.toLowerCase().includes(s));
}

export const handlers = {
  click: {
    export: async () => {
      const list = all().filter((c) => c.phone);
      if (!list.length) return toast(P('customers.noValid'));
      try { await saveFile(`meta-customers-${today()}.csv`, metaCsv(list), 'text/csv'); toast(P('customers.prepared', { n: list.length })); }
      catch (e) { toast(P('customers.saveFail', { e: e.message })); }
    },
  },
  input: {
    q: (el) => { q = el.value; document.getElementById('custBody').innerHTML = rowsHtml(filtered(all())); },
  },
};
