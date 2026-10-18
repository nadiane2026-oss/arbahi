import { store, hooks, ui } from '../core.js';
import { WILAYAS, confirmerStats } from '../crm.js';
import { pullSheets, refreshStatuses, sendToEcotrack, shipOrder, confirmReturn, updateOrder } from '../ops.js';
import { esc, fmt, ltr, daHtml, num } from '../util.js';
import { icon, pageHead, toast } from '../ui.js';
import { T, P } from '../i18n.js';
import { phoneLocal } from '../crm.js';

const TABS = ['new', 'confirmed', 'sent', 'delivered', 'returns', 'cancelled', 'all'];
const curTab = () => (TABS.includes(ui.sub) ? ui.sub : 'new');
let busy = '';
const openIds = new Set();
const ME_KEY = 'arbahi.me';
const getMe = () => { try { return localStorage.getItem(ME_KEY) || ''; } catch { return ''; } };
const setMe = (v) => { try { localStorage.setItem(ME_KEY, v); } catch { /* تجاهل */ } };

export const noRerender = false;

const inTab = (o, t) => {
  const g = o.eco?.group;
  switch (t) {
    case 'new': return o.stage === 'new';
    case 'confirmed': return o.stage === 'confirmed';
    case 'sent': return o.stage === 'sent' && !['delivered', 'returning', 'returned'].includes(g);
    case 'delivered': return o.stage === 'sent' && g === 'delivered';
    case 'returns': return o.stage === 'sent' && ['returning', 'returned'].includes(g);
    case 'cancelled': return o.stage === 'cancelled';
    case 'all': return true;
    default: return false;
  }
};

const when = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) : '');
const itemsText = (o) => o.items.map((i) => `${i.name || i.sku}${i.variant ? ` (${i.variant})` : ''}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(' + ');
const fieldIn = (id, f, label, v, extra = '') =>
  `<label class="field"><span>${label}</span><input data-chg="of" data-id="${esc(id)}" data-f="${f}" value="${esc(v)}" ${extra}></label>`;

function cardHtml(o, s) {
  const bad = !o.wilayaCode || !String(o.commune || '').trim() || !o.phone;
  const calls = o.calls || [];
  const g = o.eco?.group;
  const wa = o.phone ? `https://wa.me/213${o.phone.slice(1)}` : '';
  const callBtns = (s.callResults || []).map((c, i) => `<button class="chip3d sm" data-act="call" data-id="${esc(o.id)}" data-i="${i}">${esc(c)}</button>`).join('');
  const last = calls[calls.length - 1];
  let actions = '';
  if (o.stage === 'new') {
    actions = `<button class="btn" data-act="confirm" data-id="${esc(o.id)}">${icon('check')} ${T('orders.confirm')}</button>
      <button class="btn danger" data-act="cancel" data-id="${esc(o.id)}">${T('orders.cancel')}</button>`;
  } else if (o.stage === 'confirmed') {
    actions = `<button class="btn" data-act="send" data-id="${esc(o.id)}">${icon('upload')} ${T('orders.send')}</button>
      <button class="btn ghost" data-act="reopen" data-id="${esc(o.id)}">${T('orders.reopen')}</button>`;
  } else if (o.stage === 'sent') {
    if (!o.shippedAt && !['delivered', 'returning', 'returned'].includes(g)) actions += `<button class="btn" data-act="ship" data-id="${esc(o.id)}">${T('orders.ship')}</button>`;
    if (g === 'returning') actions += `<button class="btn" data-act="retok" data-id="${esc(o.id)}">${icon('box')} ${T('orders.returnReceived')}</button>`;
  } else if (o.stage === 'cancelled') {
    actions = `<button class="btn ghost" data-act="reopen" data-id="${esc(o.id)}">${T('orders.reopen')}</button>`;
  }
  const edit = o.stage === 'sent' ? '' : `<details class="more" data-did="${esc(o.id)}" ${openIds.has(o.id) ? 'open' : ''}><summary>${T('orders.edit')}</summary>
      <div class="row c2">
        ${fieldIn(o.id, 'name', T('f.name'), o.name)}
        ${fieldIn(o.id, 'phone', T('f.phone'), o.phone || o.phoneRaw, 'inputmode="tel" dir="ltr"')}
        <label class="field"><span>${T('f.wilaya')}</span><select data-chg="of" data-id="${esc(o.id)}" data-f="wilaya">
          <option value="0" ${o.wilayaCode ? '' : 'selected'}>${esc(o.wilaya || '—')}</option>
          ${WILAYAS.map((w, i) => `<option value="${i + 1}" ${o.wilayaCode === i + 1 ? 'selected' : ''}>${i + 1} - ${esc(w)}</option>`).join('')}</select></label>
        ${fieldIn(o.id, 'commune', T('f.commune'), o.commune)}
        ${fieldIn(o.id, 'address', T('f.address'), o.address)}
        <label class="field"><span>${T('f.delivery')}</span><select data-chg="of" data-id="${esc(o.id)}" data-f="delivery">
          <option value="home" ${o.delivery === 'home' ? 'selected' : ''}>${esc(P('delivery.home'))}</option><option value="desk" ${o.delivery === 'desk' ? 'selected' : ''}>${esc(P('delivery.desk'))}</option></select></label>
        ${fieldIn(o.id, 'total', T('f.total'), o.total, 'inputmode="decimal" class="n"')}
        ${fieldIn(o.id, 'note', T('f.note'), o.note)}
      </div></details>`;
  return `<article class="ocard ${o.stage}">
    <div class="oc-head">
      <div><div class="ref">${esc(o.name || '—')}</div><div class="sub">${ltr(when(o.createdAt))}${o.sheetName ? ' · ' + esc(o.sheetName) : ''}</div></div>
      <div class="oc-total num">${daHtml(o.total)}</div>
    </div>
    <div class="oc-line">${icon('phone')}<a href="tel:${esc(o.phone || o.phoneRaw)}" dir="ltr">${esc(o.phone || o.phoneRaw || '—')}</a>${wa ? `<a class="wa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>
    <div class="oc-line ${bad ? 'warn-t' : ''}">${esc(o.wilaya || '—')}${o.wilayaCode ? ` (${o.wilayaCode})` : ''} · ${esc(o.commune || '—')} · ${esc(P('delivery.' + o.delivery))}</div>
    <div class="oc-items">${esc(itemsText(o))}</div>
    ${bad && ['new', 'confirmed'].includes(o.stage) ? `<p class="hint warn-t">${T('orders.fixData')}</p>` : ''}
    ${o.tracking ? `<div class="oc-track"><span class="tag eco-${esc(g || 'unknown')}">${T('eco.' + (g || 'unknown'))}</span> <span class="hint">${esc(o.eco?.label || '')}</span> <span class="num" dir="ltr">${esc(o.tracking)}</span></div>` : ''}
    ${o.ecoError ? `<div class="banner err">${icon('alert')}<div>${esc(o.ecoError)}</div></div>` : ''}
    ${['new', 'confirmed'].includes(o.stage) ? `<div class="oc-calls">${callBtns}</div>` : ''}
    ${calls.length ? `<div class="hint">${T('orders.attempts', { n: calls.length })}: ${esc(last.label)} ${last.by ? '· ' + esc(last.by) : ''} · ${ltr(when(last.at))}</div>` : ''}
    ${o.confirmedBy ? `<div class="hint">${T('orders.by', { n: o.confirmedBy })}</div>` : ''}
    <div class="oc-actions">${actions}</div>
    ${edit}
  </article>`;
}

function pct(v) { return v === null ? '—' : `${v.toFixed(0)}%`; }

export function teamHtml(orders, s) {
  const st = confirmerStats(orders, s.confirmers || []);
  if (!st.length) return `<div class="empty"><p>${T('team.none')}</p></div>`;
  return `<p class="hint" style="margin-bottom:10px">${T('team.text')}</p>
    <div class="ledger-wrap"><table class="ledger"><thead><tr><th>${T('team.name')}</th><th class="n">${T('team.handled')}</th><th class="n">${T('team.confirmed')}</th><th class="n">${T('team.cancelled')}</th><th class="n">${T('team.confRate')}</th><th class="n">${T('team.delivered')}</th><th class="n">${T('team.returned')}</th><th class="n">${T('team.delRate')}</th></tr></thead><tbody>
    ${st.map((x) => `<tr>
      <td data-l="${esc(P('team.name'))}" class="full"><div class="ref">${esc(x.name)}</div></td>
      <td data-l="${esc(P('team.handled'))}" class="n num">${x.handled}</td><td data-l="${esc(P('team.confirmed'))}" class="n num">${x.confirmed}</td><td data-l="${esc(P('team.cancelled'))}" class="n num">${x.cancelled}</td>
      <td data-l="${esc(P('team.confRate'))}" class="n num pos">${pct(x.confirmRate)}</td>
      <td data-l="${esc(P('team.delivered'))}" class="n num">${x.delivered}</td><td data-l="${esc(P('team.returned'))}" class="n num">${x.returned}</td>
      <td data-l="${esc(P('team.delRate'))}" class="n num pos">${pct(x.deliveryRate)}</td></tr>`).join('')}</tbody></table></div>`;
}

export function render() {
  const tab = curTab();
  const s = store.settings();
  const orders = store.orders();
  const counts = Object.fromEntries(TABS.map((t) => [t, orders.filter((o) => inTab(o, t)).length]));
  const me = getMe();
  const meSel = (s.confirmers || []).length
    ? `<label class="field me"><span>${T('orders.me')}</span><select data-chg="me"><option value="" ${me ? '' : 'selected'}>${esc(P('orders.noMe'))}</option>${s.confirmers.map((n) => `<option ${n === me ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : '';
  const seg = `<div class="seg wrap" role="tablist">${TABS.map((t) => `<button data-act="tab" data-t="${t}" aria-pressed="${tab === t}">${T('ot.' + t)} <b class="cnt">${counts[t]}</b></button>`).join('')}</div>`;
  const list = orders.filter((o) => inTab(o, tab));
  const tools = `<div class="tools">
    <button class="btn sm" data-act="pull" ${busy ? 'disabled' : ''}>${icon('refresh')} ${T('orders.refreshSheets')}</button>
    <button class="btn ghost sm" data-act="status" ${busy ? 'disabled' : ''}>${icon('refresh')} ${T('orders.refreshStatus')}</button>
    ${tab === 'confirmed' && list.length ? `<button class="btn sm" data-act="sendAll" ${busy ? 'disabled' : ''}>${icon('upload')} ${T('orders.sendAll')} (${list.length})</button>` : ''}
    ${meSel}
  </div>`;
  const noSheets = !(s.sheets || []).length && !orders.length ? `<div class="banner">${icon('alert')}<div>${T('orders.noSheets')} <a href="#channels">${T('nav.channels')}</a></div></div>` : '';
  const body = list.length ? `<div class="ocards">${list.map((o) => cardHtml(o, s)).join('')}</div>` : `<p class="hint" style="padding:18px 4px">${T('orders.empty')}</p>`;
  return `${pageHead('orders.title')}${noSheets}${seg}${tools}${body}`;
}

const act = async (name, fn) => {
  busy = name; hooks.refresh(true);
  try { return await fn(); } catch (e) { toast(e.message || String(e)); } finally { busy = ''; hooks.refresh(true); }
};

export const handlers = {
  click: {
    tab: (el) => hooks.go('orders/' + el.dataset.t),
    pull: () => act('pull', async () => { const r = await pullSheets(); toast(r.errors.length ? r.errors[0] : r.added || r.products ? P('orders.pulled', { n: r.added }) + (r.products ? ` · ${P('orders.newProducts', { n: r.products })}` : '') : P('orders.pulledNone')); }),
    status: () => act('status', async () => { const r = await refreshStatuses(); toast(P('orders.statusDone', { n: r.updated })); }),
    call: (el) => {
      const o = store.get('order', el.dataset.id); const s = store.settings();
      updateOrder(o.id, { calls: [...(o.calls || []), { label: s.callResults[+el.dataset.i], at: new Date().toISOString(), by: getMe() }] });
    },
    confirm: (el) => {
      const o = store.get('order', el.dataset.id); const s = store.settings();
      if (!o.wilayaCode || !String(o.commune || '').trim() || !o.phone) return toast(P('orders.fixData'));
      if ((s.confirmers || []).length && !getMe()) return toast(P('orders.noMe'));
      updateOrder(o.id, { stage: 'confirmed', confirmedBy: getMe(), confirmedAt: new Date().toISOString() });
    },
    cancel: (el) => {
      if (!confirm(P('orders.cancelConfirm'))) return;
      updateOrder(el.dataset.id, { stage: 'cancelled', confirmedBy: getMe() || store.get('order', el.dataset.id).confirmedBy, confirmedAt: new Date().toISOString() });
    },
    reopen: (el) => updateOrder(el.dataset.id, { stage: 'new' }),
    send: (el) => act('send', async () => { const r = await sendToEcotrack(el.dataset.id); toast(r.ok ? P('orders.sendOk', { t: r.tracking }) : P('orders.sendFail', { e: r.error })); }),
    sendAll: () => act('sendAll', async () => {
      let ok = 0, bad = 0;
      for (const o of store.orders().filter((x) => x.stage === 'confirmed')) { const r = await sendToEcotrack(o.id); if (r.ok) ok++; else bad++; }
      toast(P('orders.sendBatch', { ok, bad }));
    }),
    ship: (el) => act('ship', async () => { const r = await shipOrder(el.dataset.id); toast(r.ok ? P('orders.shipped') : P('orders.sendFail', { e: r.error })); }),
    retok: (el) => act('retok', async () => { const r = await confirmReturn(el.dataset.id); toast(r.ok ? P('orders.returnDone') : P('orders.sendFail', { e: r.error })); }),
  },
  change: {
    me: (el) => { setMe(el.value); hooks.refresh(true); },
    of: (el) => {
      const o = store.get('order', el.dataset.id); if (!o) return;
      const f = el.dataset.f; const v = el.value;
      if (f === 'wilaya') { const c = +v; updateOrder(o.id, { wilayaCode: c, wilaya: c ? WILAYAS[c - 1] : o.wilaya }); }
      else if (f === 'phone') updateOrder(o.id, { phone: phoneLocal(v) || '', phoneRaw: v });
      else if (f === 'total') updateOrder(o.id, { total: num(v) });
      else updateOrder(o.id, { [f]: v.trim() });
    },
  },
};

export function afterRender(root) {
  if (root.__tg) return;
  root.__tg = true; // التفاصيل المفتوحة تبقى مفتوحة بعد كل تحديث
  root.addEventListener('toggle', (e) => {
    const id = e.target?.dataset?.did;
    if (!id) return;
    if (e.target.open) openIds.add(id); else openIds.delete(id);
  }, true);
}
