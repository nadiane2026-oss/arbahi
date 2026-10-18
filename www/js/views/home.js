import { store, ui, hooks } from '../core.js';
import { DASH_PERIODS, dashStats, inPeriod } from '../crm.js';
import { decharge } from '../calc.js';
import { ecoConfig } from '../transport.js';
import { esc, fmt, daHtml } from '../util.js';
import { icon, pageHead } from '../ui.js';
import { T, P } from '../i18n.js';

if (!ui.dash) ui.dash = { period: 'all', mode: 'num' };

function steps(s) {
  const done = [(s.sheets || []).length > 0, !!ecoConfig().token, store.products().length > 0, store.moves().length > 0];
  if (done.every(Boolean)) return '';
  const items = [['channels', 'step.channel', 'step.channelSub', 'link'], ['carrier', 'step.carrier', 'step.carrierSub', 'truck'], ['products', 'step.product', 'step.productSub', 'box'], ['stock', 'step.stock', 'step.stockSub', 'stack']];
  return `<section class="welcome"><div class="w-title">${T('step.title')}<div class="w-sub">${T('step.sub')}</div></div>
    <div class="w-steps">${items.map(([r, a, b, i], n) => `<a class="w-step ${done[n] ? 'done' : ''}" href="#${r}"><span class="w-ic">${done[n] ? icon('check') : icon(i)}</span><span><b>${T(a)}</b><small>${T(b)}</small></span></a>`).join('')}</div></section>`;
}

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
function bars(list, fmtVal = (x) => x.count) {
  if (!list.length) return `<p class="empty-note">${T('dash.noData')}</p>`;
  const max = Math.max(1, ...list.map((x) => x.count));
  return `<ul class="bars">${list.map((x) => `<li><div class="b-top"><span class="b-name">${esc(x.name)}</span><b class="num">${fmtVal(x)}</b></div><div class="b-track"><i style="width:${Math.max(3, (x.count / max) * 100).toFixed(0)}%"></i></div></li>`).join('')}</ul>`;
}

export function render() {
  const s = store.settings();
  const { period, mode } = ui.dash;
  const orders = store.orders();
  const st = dashStats(orders, period);
  const ctx = store.ctx();
  const profit = store.decharges().filter((d) => inPeriod(d.date, period)).reduce((a, d) => a + decharge(d, ctx).profit, 0);
  const pm = mode === 'pct';
  const kpi = (ic, cls, k, v, sub = '') => `<div class="kpi ${cls}"><span class="k-ic">${icon(ic)}</span><div><div class="k-l">${T(k)}</div><div class="k-v num">${v}</div>${sub ? `<div class="k-s">${sub}</div>` : ''}</div></div>`;
  return `${pageHead('nav.dash')}
    ${steps(s)}
    <div class="filters">
      <div class="seg">${DASH_PERIODS.map((k) => `<button data-act="dper" data-p="${k}" aria-pressed="${period === k}">${T('dp.' + k)}</button>`).join('')}</div>
      <div class="seg">${['pct', 'num'].map((m) => `<button data-act="dmode" data-m="${m}" aria-pressed="${mode === m}">${T('dm.' + m)}</button>`).join('')}</div>
    </div>
    <div class="kpis">
      ${kpi('clipboard', 'k-o', 'k.total', `<bdi>${st.total}</bdi>`)}
      ${kpi('check', 'k-g', 'k.confirmed', pm ? pct(st.confirmed, st.total) : `<bdi>${st.confirmed}</bdi>`)}
      ${kpi('truck', 'k-b', 'k.delivered', pm ? pct(st.delivered, st.sent) : `<bdi>${st.delivered}</bdi>`, pm ? T('k.ofSent') : '')}
      ${kpi('box', 'k-r', 'k.returned', pm ? pct(st.returned, st.sent) : `<bdi>${st.returned}</bdi>`, pm ? T('k.ofSent') : '')}
      ${kpi('wallet', 'k-y', 'k.sales', daHtml(st.sales))}
      ${kpi('stack', 'k-p', 'k.profit', `<a href="#profit" class="plink">${daHtml(profit)}</a>`)}
    </div>
    <div class="panels">
      <section class="panel"><header>${icon('box')}<h2>${T('dash.topProducts')}</h2></header>${bars(st.products)}</section>
      <section class="panel"><header>${icon('link')}<h2>${T('dash.topWilayas')}</h2></header>${bars(st.wilayas)}</section>
      <section class="panel"><header>${icon('user')}<h2>${T('dash.topConfirmers')}</h2></header>${bars(st.confirmers)}</section>
      <section class="panel"><header>${icon('clipboard')}<h2>${T('dash.topChannels')}</h2></header>${bars(st.channels)}</section>
    </div>`;
}

export const handlers = {
  click: {
    dper: (el) => { ui.dash.period = el.dataset.p; hooks.refresh(true); },
    dmode: (el) => { ui.dash.mode = el.dataset.m; hooks.refresh(true); },
  },
};
void P; void fmt;
