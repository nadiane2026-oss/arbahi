import { store, sync, ui, hooks, wire } from './core.js';
import { icon, updateSyncChips, wirePrefs, syncChip, prefButtons } from './ui.js';
import { T, P } from './i18n.js';
import { applyPrefs, onPrefs } from './prefs.js';
import { transport } from './transport.js';
import { ORDER_TABS, orderTab } from './crm.js';
import { ecoSync, startEcoSync } from './ecosync.js';
import { showWelcome } from './welcome.js';
import * as home from './views/home.js';
import * as profit from './views/profit.js';
import * as orders from './views/orders.js';
import * as team from './views/team.js';
import * as products from './views/products.js';
import * as stock from './views/stock.js';
import * as channels from './views/channels.js';
import * as carrier from './views/carrier.js';
import * as imp from './views/import.js';
import * as customers from './views/customers.js';
import * as received from './views/received.js';
import * as settings from './views/settings.js';
import { initSheet, openSheet, refreshIfOpen } from './views/sheet.js';

const views = { home, profit, orders, team, products, stock, channels, carrier, import: imp, customers, received, settings };
const TITLES = { home: 'nav.dash', profit: 'nav.profit', orders: 'nav.orders', team: 'nav.team', products: 'nav.products', stock: 'nav.stock', channels: 'nav.channels', carrier: 'nav.carrier', import: 'nav.import', customers: 'nav.customers', received: 'nav.received', settings: 'nav.settings' };
const ORDER_SUBS = [...ORDER_TABS, 'all'];
const NAV = [
  { id: 'home', k: 'nav.dash', i: 'home' },
  { id: 'orders', k: 'nav.orders', i: 'clipboard', subs: ORDER_SUBS.map((s) => [`orders/${s}`, `ot.${s}`]) },
  { id: 'products', k: 'nav.products', i: 'box' },
  { id: 'stock', k: 'nav.stock', i: 'stack' },
  { id: 'carrier', k: 'nav.carrier', i: 'truck' },
  { id: 'team', k: 'nav.team', i: 'user' },
  { id: 'finance', k: 'nav.finance', i: 'wallet', subs: [['profit', 'nav.profit'], ['import', 'nav.import']], owns: ['profit', 'import'] },
  { id: 'received', k: 'nav.received', i: 'check' },
  { id: 'customers', k: 'nav.customers', i: 'users' },
  { id: 'settings', k: 'nav.settings', i: 'settings' },
];
const main = document.getElementById('view');
const nav = document.getElementById('nav');
const top = document.getElementById('top');
const scrim = document.getElementById('scrim');
const open = new Set(['orders']);

function parseHash() {
  const [base, sub] = location.hash.replace('#', '').split('/');
  return views[base] ? { base, sub: sub || '' } : { base: 'home', sub: '' };
}
const isActive = (item) => (item.owns ? item.owns.includes(ui.tab) : item.id === ui.tab);

function renderNav() {
  nav.setAttribute('aria-label', P('nav.menu'));
  const counts = {};
  for (const o of store.orders()) { const key = orderTab(o); counts[key] = (counts[key] || 0) + 1; }
  const html = NAV.map((it) => {
    const act = isActive(it);
    if (!it.subs) return `<a class="item ${act ? 'active' : ''}" href="#${it.id}">${icon(it.i)}<span class="lbl">${T(it.k)}</span></a>`;
    const exp = open.has(it.id) || act;
    const subs = it.subs.filter(([h]) => h !== 'orders/other' || counts.other).map(([h, k]) => {
      const cur = location.hash.replace('#', '') === h || (h === `orders/${ui.sub || 'new'}` && ui.tab === 'orders' && !location.hash.includes('/'));
      const c = it.id === 'orders' ? counts[h.split('/')[1]] : 0;
      return `<a class="sub ${cur ? 'active' : ''}" href="#${h}"><span>${T(k)}</span>${c ? `<span class="cnt ${h === 'orders/new' ? 'hot' : ''}">${c}</span>` : ''}</a>`;
    }).join('');
    return `<button class="item ${act ? 'active' : ''}" data-grp="${it.id}" aria-expanded="${exp}">${icon(it.i)}<span class="lbl">${T(it.k)}</span>${icon('chev', 'chev')}</button><div class="subs ${exp ? 'open' : ''}">${subs}</div>`;
  }).join('');
  nav.innerHTML = `<div class="brand"><span class="logo-bar"><i></i><i></i><i></i><i></i></span><span>${T('brand')}</span></div><div class="grp-label">${P('nav.section')}</div>${html}`;
}

function renderTop() {
  const atHome = ui.tab === 'home';
  top.innerHTML = `<button class="burger" data-burger aria-label="${P('nav.menu')}">${icon('menu')}</button>
    ${atHome && trail.length < 2 ? '' : `<button class="burger" data-back aria-label="${P('nav.back')}">${icon('back', 'flip')}</button>`}
    ${atHome ? '' : `<button class="burger" data-home aria-label="${P('nav.dash')}">${icon('home')}</button>`}
    <div class="grow">${T(TITLES[ui.tab] || 'nav.dash')}</div>${syncChip()}${prefButtons()}`;
}

const trail = [location.hash];
let goingBack = false;
function goBack() {
  if (trail.length > 1) { goingBack = true; trail.pop(); history.back(); } else location.hash = '#';
}
function closeDrawer() { document.body.classList.remove('nav-open'); }
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-burger]')) {
    if (window.innerWidth >= 960) document.body.classList.toggle('nav-collapsed'); else document.body.classList.toggle('nav-open');
    return;
  }
  if (e.target.closest('[data-back]')) { goBack(); return; }
  if (e.target.closest('[data-home]')) { trail.length = 0; trail.push('#'); location.hash = '#'; closeDrawer(); return; }
  const g = e.target.closest('[data-grp]');
  if (g) { const id = g.dataset.grp; if (open.has(id)) open.delete(id); else open.add(id); renderNav(); return; }
  if (e.target.closest('.side a')) closeDrawer();
});
scrim.addEventListener('click', closeDrawer);

function render(force = false) {
  const v = views[ui.tab];
  if (!force && v.noRerender) return;
  const y = window.scrollY;
  main.innerHTML = v.render();
  v.afterRender?.(main);
  window.scrollTo(0, y);
}
function renderAll(force = true) { renderNav(); renderTop(); render(force); }

hooks.refresh = (force) => render(force);
hooks.go = (tab) => { if (location.hash === '#' + tab) { applyRoute(); window.scrollTo(0, 0); } else location.hash = '#' + tab; };
hooks.openSheet = openSheet;

function applyRoute() { const r = parseHash(); ui.tab = r.base; ui.sub = r.sub; renderAll(true); }
window.addEventListener('hashchange', () => {
  if (goingBack) goingBack = false; else if (trail[trail.length - 1] !== location.hash) trail.push(location.hash);
  if (trail.length > 50) trail.shift();
  applyRoute(); window.scrollTo(0, 0); });

wire(main, () => views[ui.tab].handlers);
initSheet();

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f && ui.tab === 'import' && !document.getElementById('drop')?.contains(e.target)) imp.handleFile(f);
});

let queued = false;
store.on(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; renderNav(); render(false); refreshIfOpen(); });
});
sync.on(updateSyncChips);
ecoSync.on(() => { if (ui.tab === 'orders') render(true); });
onPrefs(() => { document.title = P('brand'); renderAll(true); refreshIfOpen(); });
applyPrefs();
wirePrefs();

(async () => {
  await store.init();
  sync.startAuto();
  startEcoSync();
  window.__arbahi = { store, sync, ui, transport };
  applyRoute();
  showWelcome();
  const native = window.Capacitor?.isNativePlatform?.();
  if (!native && 'serviceWorker' in navigator && location.protocol.startsWith('http') && location.hostname !== 'localhost') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
