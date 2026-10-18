import { store, ui, hooks } from '../core.js';
import { filterPeriod, decharge, sumTotals, splitProfit } from '../calc.js';
import { esc, fmt, ltr, daHtml } from '../util.js';
import { icon, pageHead, COLORS } from '../ui.js';
import { T, P, D } from '../i18n.js';

const PERIODS = ['today', '7d', 'month', '30d', 'all'];

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

export function render() {
  const all = store.decharges();
  if (!all.length) {
    return pageHead('nav.profit') + `<div class="empty">
      <h2>${T('home.empty.title')}</h2>
      <p>${T('home.empty.text')}</p>
      <button class="btn" data-act="goImport">${icon('upload')} ${T('home.empty.cta')}</button>
    </div>`;
  }
  const ctx = store.ctx();
  const list = filterPeriod(all, ui.period);
  const rows = list.map((d) => ({ d, t: decharge(d, ctx) }));
  const tot = sumTotals(rows.map((r) => r.t));
  const people = splitProfit(tot.profit, ctx.settings);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.t.profit)));

  const warn = tot.unassigned
    ? `<div class="banner">${icon('alert')}<div>${T('home.unassigned', { n: tot.unassigned })}</div></div>` : '';

  const cell = (lk, cls, inner) => `<td data-l="${esc(P(lk))}" class="${cls}">${inner}</td>`;
  const body = rows.map(({ d, t }) => `
    <tr data-act="open" data-id="${esc(d.id)}" tabindex="0">
      ${cell('th.sheet', 'full', `<div class="ref">${esc(d.ref || '—')}${t.unassigned ? ` <span class="tag">${icon('alert')} ${T('tag.noProduct', { n: t.unassigned })}</span>` : ''}</div><div class="sub">${ltr(d.date)}${d.sender ? '، ' + esc(d.sender) : ''}</div>`)}
      ${cell('th.parcels', 'n num', `<bdi>${t.count}</bdi>`)}
      ${cell('th.collected', 'n num', `<bdi>${fmt(t.net)}</bdi>`)}
      ${cell('th.products', 'n num', `<bdi>${fmt(t.buy)}</bdi>`)}
      ${cell('th.meta', 'n num', `<bdi>${fmt(t.meta)}</bdi>`)}
      ${cell('th.commit', 'n num', `<bdi>${fmt(t.commit)}</bdi>`)}
      ${cell('th.profit', 'n num ' + (t.profit >= 0 ? 'pos' : 'neg'), `<bdi>${fmt(t.profit)}</bdi><span class="pbar" style="width:${Math.max(4, (Math.abs(t.profit) / maxAbs) * 100).toFixed(0)}%"></span>`)}
    </tr>`).join('');

  const foot = rows.length > 1 ? `<tfoot><tr>
      ${cell('total', 'full', T('total'))}
      ${cell('th.parcels', 'n num', `<bdi>${tot.count}</bdi>`)}
      ${cell('th.collected', 'n num', `<bdi>${fmt(tot.net)}</bdi>`)}
      ${cell('th.products', 'n num', `<bdi>${fmt(tot.buy)}</bdi>`)}
      ${cell('th.meta', 'n num', `<bdi>${fmt(tot.meta)}</bdi>`)}
      ${cell('th.commit', 'n num', `<bdi>${fmt(tot.commit)}</bdi>`)}
      ${cell('th.profit', 'n num', `<bdi>${fmt(tot.profit)}</bdi>`)}</tr></tfoot>` : '';
  const th = (k, n = false) => `<th${n ? ' class="n"' : ''}>${T(k)}</th>`;

  return `${pageHead('nav.profit')}
    <div class="seg" role="group" aria-label="${esc(P('period.aria'))}">${PERIODS.map((k) => `<button data-act="period" data-p="${k}" aria-pressed="${ui.period === k}">${T('period.' + k)}</button>`).join('')}</div>
    ${warn}
    <section class="hero" aria-label="${esc(P('eq.profit'))}">
      <div class="hero-label">${T('home.profitFor', { p: D['period.' + ui.period] })}</div>
      <div class="hero-num num ${tot.profit < 0 ? 'neg' : ''}"><bdi>${fmt(tot.profit)}</bdi><small>DA</small></div>
      ${rows.length ? splitHtml(people, tot.profit) : `<p class="split-empty">${T('home.noneShort')}</p>`}
    </section>
    ${equationHtml(tot)}
    <p class="facts">${T('home.facts', { sales: daHtml(tot.sales), courier: daHtml(tot.courier), n: tot.count })}</p>
    <div class="section-title"><h2>${T('home.ledger')}</h2><button class="btn ghost sm" data-act="goImport">${icon('upload')} ${T('home.importCta')}</button></div>
    ${rows.length ? `<div class="ledger-wrap"><table class="ledger">
      <thead><tr>${th('th.sheet')}${th('th.parcels', 1)}${th('th.collected', 1)}${th('th.products', 1)}${th('th.meta', 1)}${th('th.commit', 1)}${th('th.profit', 1)}</tr></thead>
      <tbody>${body}</tbody>${foot}</table></div>` : `<p class="hint">${T('home.noneInPeriod')}</p>`}`;
}

export const handlers = {
  click: {
    period: (el) => { ui.period = el.dataset.p; hooks.refresh(true); },
    open: (el) => hooks.openSheet(el.dataset.id),
    goImport: () => hooks.go('import'),
  },
};
