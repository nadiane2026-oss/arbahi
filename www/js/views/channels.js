import { store, hooks } from '../core.js';
import { pullSheets } from '../ops.js';
import { sheetCsvUrl } from '../crm.js';
import { isNative } from '../transport.js';
import { esc, uid, today, ltr } from '../util.js';
import { icon, pageHead, toast } from '../ui.js';
import { T, P } from '../i18n.js';

export const noRerender = true;
let adding = false;
let busy = false;

const SOON = [['Shopify', 'S'], ['WooCommerce', 'W'], ['YouCan', 'Y'], ['Google Sheets', 'G']];

function item(sh, i) {
  const ok = !!sheetCsvUrl(sh.url);
  return `<article class="ocard">
    <div class="oc-head"><div><div class="ref">${esc(sh.name)}</div><span class="tag ${ok ? 'eco-delivered' : ''}">Google Sheet</span></div>
      <button class="icon-btn" data-act="shdel" data-i="${i}" aria-label="${esc(P('sheets.remove'))}">${icon('trash')}</button></div>
    <div class="row c2">
      <label class="field"><span>${T('sheets.name')}</span><input data-chg="sh" data-i="${i}" data-f="name" value="${esc(sh.name)}"></label>
      <label class="field"><span>${T('sheets.since')}</span><input type="date" data-chg="sh" data-i="${i}" data-f="since" value="${esc(sh.since || '')}"></label>
    </div>
    <label class="field"><span>${T('sheets.url')}</span><input data-chg="sh" data-i="${i}" data-f="url" dir="ltr" value="${esc(sh.url)}" placeholder="https://docs.google.com/spreadsheets/d/..."></label>
    ${!ok ? `<p class="hint warn-t">${T('crm.err.sheetUrl')}</p>` : ''}
    <div class="hint">${sh.lastPull ? `${T('ch.last')}: ${ltr(sh.lastPull.slice(0, 16).replace('T', ' '))} · ${T('ch.rows', { n: sh.lastCount ?? 0 })}` : T('ch.never')}</div>
  </article>`;
}

export function render() {
  const s = store.settings();
  const list = s.sheets || [];
  const app = !isNative() ? `<div class="banner">${icon('alert')}<div>${T('ch.webWarn')}</div></div>` : '';
  const addForm = adding ? `<section class="block"><h2>${T('ch.addTitle')}</h2>
      <p class="hint">${T('sheets.text')}</p>
      <label class="field"><span>${T('sheets.name')}</span><input id="chName" placeholder="${esc(P('ch.namePh'))}"></label>
      <label class="field"><span>${T('sheets.url')}</span><input id="chUrl" dir="ltr" placeholder="https://docs.google.com/spreadsheets/d/..."></label>
      <label class="field"><span>${T('sheets.since')}</span><input id="chSince" type="date" value="${today()}"></label>
      <div class="oc-actions"><button class="btn" data-act="chsave">${icon('check')} ${T('ch.save')}</button><button class="btn ghost" data-act="chcancel">${T('import.discard')}</button></div></section>` : '';
  return `${pageHead('nav.channels')}${app}
    <div class="tools"><button class="btn sm" data-act="chadd">${icon('plus')} ${T('ch.add')}</button>
      ${list.length ? `<button class="btn ghost sm" data-act="chpull" ${busy ? 'disabled' : ''}>${icon('refresh')} ${T('orders.refreshSheets')}</button>` : ''}</div>
    ${addForm}
    <div class="soon">${SOON.map(([n]) => `<span class="chip-soon ${n === 'Google Sheets' ? 'on' : ''}">${n}${n === 'Google Sheets' ? '' : ` <small>${T('ch.soon')}</small>`}</span>`).join('')}</div>
    ${list.length ? `<div class="ocards">${list.map(item).join('')}</div>` : `<div class="empty"><h2>${T('ch.emptyTitle')}</h2><p>${T('ch.emptyText')}</p></div>`}`;
}

export const handlers = {
  click: {
    chadd: () => { adding = true; hooks.refresh(true); },
    chcancel: () => { adding = false; hooks.refresh(true); },
    chsave: () => {
      const g = (id) => document.getElementById(id).value.trim();
      if (!sheetCsvUrl(g('chUrl'))) return toast(P('crm.err.sheetUrl'));
      const s = store.settings();
      store.saveSettings({ sheets: [...(s.sheets || []), { id: uid(), name: g('chName') || P('sheets.newName'), url: g('chUrl'), since: g('chSince') || today() }] });
      adding = false; hooks.refresh(true);
    },
    shdel: (el) => { if (!confirm(P('ch.delConfirm'))) return; const s = store.settings(); store.saveSettings({ sheets: s.sheets.filter((_, i) => i !== +el.dataset.i) }); hooks.refresh(true); },
    chpull: async () => {
      busy = true; hooks.refresh(true);
      try { const r = await pullSheets(); toast(r.errors[0] || `${P('orders.pulled', { n: r.added })} · ${P('orders.newProducts', { n: r.products })}`); } catch (e) { toast(e.message); }
      busy = false; hooks.refresh(true);
    },
  },
  change: {
    sh: (el) => {
      const s = store.settings(); const list = s.sheets.map((x) => ({ ...x })); const sh = list[+el.dataset.i]; if (!sh) return;
      sh[el.dataset.f] = el.value.trim(); store.saveSettings({ sheets: list }); hooks.refresh(true);
    },
  },
};
