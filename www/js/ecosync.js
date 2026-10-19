// مزامنة تلقائية مع Ecotrack: كل 3 دقائق والتطبيق مفتوح، وعند الرجوع إليه.
// كل تغيير في الحالة (أو طلبية جديدة للتأكيد، أو ملاحظة جديدة من الموزّع) يصلك كإشعار.
import { store } from './core.js';
import { ecoConfig } from './transport.js';
import { syncEcotrack, autoComputeBatches } from './ops.js';
import { decharge } from './calc.js';
import { P } from './i18n.js';
import { orderNet } from './crm.js';
import { fmt } from './util.js';
import { toast } from './ui.js';

const EVERY = 3 * 60e3;
const INIT_KEY = 'arbahi.ecoInit';
export const ecoSync = { running: false, lastAt: 0, error: '', last: null };
const listeners = new Set();
const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
ecoSync.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const LN = () => globalThis.Capacitor?.Plugins?.LocalNotifications;
let permAsked = false;
async function askPermission() {
  if (permAsked || !LN()) return;
  permAsked = true;
  try { const p = await LN().checkPermissions(); if (p.display !== 'granted') await LN().requestPermissions(); } catch { /* تجاهل */ }
  try { await LN().createChannel({ id: 'money', name: P('notif.channelMoney'), description: P('notif.channelMoney'), importance: 5, visibility: 1, sound: 'money.wav', vibration: true }); } catch { /* تجاهل */ }
}

let nid = Math.floor(Date.now() / 1000) % 100000;
function payMessages(changes, made = []) {
  const by = { collected: [], ready: [], paid: [] };
  for (const c of changes) { if (c.pay && by[c.payTo]) { const o = store.get('order', c.id); if (o) by[c.payTo].push(o); } }
  const sum = (l) => l.reduce((a, o) => a + orderNet(o), 0);
  const out = [];
  if (by.collected.length) out.push({ title: P('notif.collected'), body: P('notif.collectedBody', { n: by.collected.length, a: fmt(sum(by.collected)) }), id: '', money: true });
  if (by.ready.length) out.push({ title: P('notif.payReady'), body: P('notif.payReadyBody', { n: by.ready.length, a: fmt(sum(by.ready)) }), id: '', money: true });
  if (by.paid.length) {
    const ctx = store.ctx();
    const profit = made.reduce((a, m) => { const d = store.get('decharge', m.id); return a + (d ? decharge(d, ctx).profit : 0); }, 0);
    out.push({ title: P('notif.paid'), body: made.length ? P('notif.paidProfit', { a: fmt(sum(by.paid)), p: fmt(profit) }) : P('notif.paidBody', { a: fmt(sum(by.paid)) }), id: '', money: true });
  }
  return out;
}

function messages(changes, made) {
  const out = payMessages(changes, made);
  for (const c of changes) {
    if (c.pay) continue;
    const o = store.get('order', c.id);
    if (!o) continue;
    const who = o.name || o.tracking;
    if (c.isNew && c.to === 'ready') out.push({ title: P('notif.newOrder'), body: `${who} · ${o.wilaya || ''}`, id: o.id });
    else if (c.remark) out.push({ title: `${who}: ${P('st.' + c.to)}`, body: c.remark, id: o.id });
    else if (!c.isNew) out.push({ title: `${who}: ${P('st.' + c.to)}`, body: [o.eco?.remarks?.[0]?.text, o.tracking].filter(Boolean).join(' · '), id: o.id });
  }
  return out;
}

async function notify(changes, made = []) {
  const list = messages(changes, made);
  if (!list.length) return;
  toast(list.length === 1 ? `${list[0].title} — ${list[0].body}` : P('notif.many', { n: list.length }));
  const ln = LN();
  if (!ln) return;
  const shown = list.slice(0, 6).map((m) => ({ id: ++nid, title: m.title, body: m.body, extra: { order: m.id }, ...(m.money ? { channelId: 'money' } : {}) }));
  if (list.length > 6) shown.push({ id: ++nid, title: P('notif.many', { n: list.length }), body: P('notif.openApp') });
  try { await ln.schedule({ notifications: shown }); } catch { /* تجاهل */ }
}

/** تشغيل مزامنة الآن. silent: بدون رسالة عند النجاح (للمزامنة التلقائية) */
export async function runEcoSync({ silent = true } = {}) {
  if (ecoSync.running || !ecoConfig().token) return null;
  ecoSync.running = true; ecoSync.error = ''; emit();
  try {
    const r = await syncEcotrack();
    const made = autoComputeBatches();
    r.made = made;
    ecoSync.last = r; ecoSync.lastAt = Date.now();
    let first = false;
    try { first = !localStorage.getItem(INIT_KEY); localStorage.setItem(INIT_KEY, '1'); } catch { /* تجاهل */ }
    if (first) { if (!silent || r.added) toast(P('notif.firstSync', { n: r.added })); }
    else { await notify(r.changes, made); if (!silent && !r.changes.length) toast(P('notif.nothing')); }
    return r;
  } catch (e) {
    ecoSync.error = e.message || String(e);
    if (!silent) toast(ecoSync.error);
    return null;
  } finally { ecoSync.running = false; emit(); }
}

let timer = 0;
const BG = () => globalThis.Capacitor?.Plugins?.ArbahiBg;
/** يسلّم عنوان Ecotrack والمفتاح للعامل الأصلي ليفحص كل 15 دقيقة والتطبيق مغلق */
export function configureBackground() {
  try {
    const c = ecoConfig();
    const url = String(c.url || '').trim().replace(/\/+$/, '').replace(/\/api\/v1.*$/, '');
    BG()?.configure?.({ url: c.token ? url : '', token: c.token || '' });
  } catch { /* تجاهل */ }
}
export function startEcoSync() {
  if (timer) return;
  askPermission();
  configureBackground();
  runEcoSync();
  timer = setInterval(() => { if (document.visibilityState === 'visible') runEcoSync(); }, EVERY);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - ecoSync.lastAt > 60e3) runEcoSync();
    if (document.visibilityState === 'visible') configureBackground();
  });
  // على الهاتف: عند الرجوع للتطبيق من الخلفية
  try { globalThis.Capacitor?.Plugins?.App?.addListener?.('resume', () => { if (Date.now() - ecoSync.lastAt > 60e3) runEcoSync(); }); } catch { /* تجاهل */ }
}
