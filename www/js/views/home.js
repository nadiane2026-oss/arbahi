import { store, ui, hooks } from '../core.js';
import { ORDER_TABS, orderTab } from '../crm.js';
import { runEcoSync, ecoSync } from '../ecosync.js';
import { ecoConfig } from '../transport.js';
import { icon, pageHead } from '../ui.js';
import { esc } from '../util.js';
import { T, P } from '../i18n.js';

function steps(s) {
  const done = [!!ecoConfig().token, store.products().length > 0, store.moves().length > 0];
  if (done.every(Boolean)) return '';
  const items = [['carrier', 'step.carrier', 'step.carrierSub', 'truck'], ['products', 'step.product', 'step.productSub', 'box'], ['stock', 'step.stock', 'step.stockSub', 'stack']];
  return `<section class="welcome"><div class="w-title">${T('step.title')}<div class="w-sub">${T('step.sub')}</div></div>
    <div class="w-steps">${items.map(([r, a, b, i], n) => `<a class="w-step ${done[n] ? 'done' : ''}" href="#${r}"><span class="w-ic">${done[n] ? icon('check') : icon(i)}</span><span><b>${T(a)}</b><small>${T(b)}</small></span></a>`).join('')}</div></section>`;
}

const STAGE_ICON = { new: 'clipboard', to_station: 'truck', at_station: 'box', to_wilaya: 'truck', preparing: 'stack', delivering: 'truck', suspended: 'alert', delivered: 'check', returns: 'box', cancelled: 'x', other: 'link' };
const STAGE_CLS = { new: 'k-o', delivered: 'k-g', returns: 'k-r', cancelled: 'k-r', suspended: 'k-y' };

export function render() {
  const counts = {};
  for (const o of store.orders()) { const k = orderTab(o); counts[k] = (counts[k] || 0) + 1; }
  const tabs = ORDER_TABS.filter((k) => k !== 'other' || counts.other);
  const total = store.orders().length;
  const cards = tabs.map((k) => `<a class="stage ${STAGE_CLS[k] || ''} ${counts[k] ? '' : 'zero'}" href="#orders/${k}">
      <span class="k-ic">${icon(STAGE_ICON[k] || 'box')}</span><b class="num">${counts[k] || 0}</b><span class="st-l">${T('ot.' + k)}</span></a>`).join('');
  const last = ecoSync.lastAt ? new Date(ecoSync.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return `${pageHead('nav.dash')}
    ${steps(store.settings())}
    <div class="section-title"><h2>${T('dash.stages')} <small class="num">(${total})</small></h2>
      <button class="btn ghost sm" data-act="dsync" ${ecoSync.running ? 'disabled' : ''}>${icon('refresh')} ${T('orders.syncNow')}</button></div>
    ${last ? `<p class="hint">${T('dash.lastSync', { t: last })}${ecoSync.error ? ' · ' + esc(ecoSync.error) : ''}</p>` : ''}
    <div class="stages">${cards}</div>`;
}

export const handlers = {
  click: {
    dsync: async () => { await runEcoSync({ silent: false }); hooks.refresh(true); },
  },
};
void P;
