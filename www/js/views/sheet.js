// نافذة تفاصيل ورقة الاستلام: الطرود، محتوى كل طرد، وتوزيع ربح هذه الورقة
import { store, wire } from '../core.js';
import { decharge, parcelCalc, splitProfit, parcelItems } from '../calc.js';
import { esc, fmt, ltr, daHtml } from '../util.js';
import { icon, toast, COLORS } from '../ui.js';
import { equationHtml } from './profit.js';
import { T, P } from '../i18n.js';
import { optionsFor, currentSig } from './shared.js';

let currentId = null;
const dlg = () => document.getElementById('sheet');

function html(d) {
  const ctx = store.ctx();
  const t = decharge(d, ctx);
  const people = splitProfit(t.profit, ctx.settings);
  const products = store.products();
  const combos = store.combos();

  const rows = d.parcels.map((p, i) => {
    const r = parcelCalc(p, ctx);
    const items = parcelItems(p);
    const opts = optionsFor(p.montant, products, combos, items);
    const cur = currentSig(p);
    const sel = `<select data-chg="prod" data-i="${i}" class="${r.assigned ? '' : 'unset'}" aria-label="${esc(P('th.product'))}">
      ${cur === '' ? '<option value="" selected disabled>—</option>' : ''}
      <option value="none" ${cur === 'none' ? 'selected' : ''}>${esc(P('sheet.noProduct'))}</option>
      ${opts.map((o) => `<option value="${esc(o.sig)}" ${o.sig === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    const L = (k) => esc(P(k));
    return `<tr>
      <td data-l="${L('th.customer')}" class="full"><div class="ref">${esc(p.name)}</div><div class="sub">${ltr(p.phone)}</div></td>
      <td data-l="${L('th.address')}">${esc(p.wilaya)}${p.commune && p.commune !== p.wilaya ? '، ' + esc(p.commune) : ''}</td>
      <td data-l="${L('th.amount')}" class="n num"><bdi>${fmt(p.montant)}</bdi></td>
      <td data-l="${L('th.courierFee')}" class="n num"><bdi>${fmt(p.montant - p.net)}</bdi></td>
      <td data-l="${L('th.product')}">${sel}</td>
      <td data-l="${L('th.profit')}" class="n num ${r.profit >= 0 ? 'pos' : 'neg'}"><bdi>${fmt(r.profit)}</bdi></td>
    </tr>`;
  }).join('');

  const mini = t.profit > 0
    ? `<div class="mini-split">${people.map((p, i) => `<div style="--c:${COLORS(i)}"><div class="k">${esc(p.name)}</div><div class="v num">${daHtml(p.amount)}</div></div>`).join('')}</div>` : '';

  return `<div class="sheet-in">
    <div class="sheet-top">
      <h2>${T('sheet.title', { ref: d.ref || '' })} <span class="hint">${ltr(d.date)}${d.sender ? '، ' + esc(d.sender) : ''}</span></h2>
      <button class="icon-btn" data-act="close" aria-label="${esc(P('sheet.close'))}">${icon('x')}</button>
    </div>
    ${equationHtml(t)}
    ${mini}
    <p class="facts">${T('sheet.note')}</p>
    <div class="ledger-wrap"><table class="ledger">
      <thead><tr><th>${T('th.customer')}</th><th>${T('th.address')}</th><th class="n">${T('th.amount')}</th><th class="n">${T('th.courierFee')}</th><th>${T('th.product')}</th><th class="n">${T('th.profit')}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="sheet-foot">
      <button class="btn danger" data-act="del">${icon('trash')} ${T('sheet.delete')}</button>
    </div>
  </div>`;
}

export function openSheet(id) {
  const d = store.get('decharge', id);
  if (!d) return;
  currentId = id;
  const el = dlg();
  el.setAttribute('aria-label', P('sheet.aria'));
  el.innerHTML = html(d);
  if (!el.open) el.showModal();
}

export function refreshIfOpen() {
  const el = dlg();
  if (!el.open || !currentId) return;
  const d = store.get('decharge', currentId);
  if (!d) { el.close(); return; }
  const top = el.scrollTop;
  el.innerHTML = html(d);
  el.scrollTop = top;
}

const handlers = {
  click: {
    close: () => dlg().close(),
    del: () => {
      if (!confirm(P('sheet.deleteConfirm'))) return;
      store.del('decharge', currentId);
      dlg().close();
      toast(P('sheet.deleted'));
    },
  },
  change: {
    prod: (el) => {
      const d = structuredClone(store.get('decharge', currentId));
      const p = d.parcels[+el.dataset.i];
      delete p.productId;
      if (el.value === 'none') { p.items = []; p.noProduct = true; }
      else {
        const o = optionsFor(p.montant, store.products(), store.combos(), p.items || []).find((x) => x.sig === el.value);
        if (o) { p.items = structuredClone(o.items); p.noProduct = false; }
      }
      store.put('decharge', currentId, d);
    },
  },
};

export function initSheet() {
  wire(dlg(), () => handlers);
  dlg().addEventListener('click', (e) => { if (e.target === dlg()) dlg().close(); });
  dlg().addEventListener('close', () => { currentId = null; });
}
