// عمليات الطلبات: قراءة الشيتات، الإرسال إلى Ecotrack، تتبع الحالات. تعمل عبر الوسيط في Supabase.
import { store } from './core.js';
import { transport, ecoConfig } from './transport.js';
import { ordersFromCsv, ecotrackPayload, readEcoOrder, ecoGroup, resolveProduct, orderFromEco, readRemarks, groupOfStep, stepOf } from './crm.js';
import { uid } from './util.js';
import { P } from './i18n.js';

export const lastDebug = { eco: null };

const eco = async (method, path, { query, body } = {}) => {
  const r = await transport.invoke({ action: 'eco', method, path, query, body });
  lastDebug.eco = { method, path, status: r.status, data: r.data };
  return r;
};

/** رسالة خطأ مفهومة من رد Ecotrack */
function ecoError(r) {
  const d = r.data;
  if (r.status === 401 || r.status === 403) return P('crm.err.token');
  if (r.status === 429) return P('crm.err.rate');
  if (d && typeof d === 'object') {
    if (d.errors) return Object.values(d.errors).flat().join('؛ ');
    if (d.message) return String(d.message);
    if (d.error) return String(d.error);
  }
  return `HTTP ${r.status}`;
}

export async function testEcotrack() {
  const r = await eco('GET', 'validate/token', { query: { api_token: ecoConfig().token } });
  return r;
}

/** ينشئ منتجاً لكل SKU جديد في الشيت (يطابق بالـ SKU) ويضيف متغيراته. يرجع عدد المنتجات المنشأة. */
function autoProducts(orders) {
  let made = 0;
  for (const o of orders) {
    for (const it of o.items) {
      if (!it.sku && !it.name) continue;
      const products = store.products();
      let p = resolveProduct(it, products);
      if (!p) {
        p = { id: uid(), name: String(it.name || it.sku).slice(0, 80), price: it.price || 0, cost: 0, skus: it.sku, variants: '', auto: true, channel: o.sheetName };
        store.put('product', p.id, p); made++;
      }
      if (it.variant) {
        const vs = String(p.variants || '').split(/[,،;]/).map((x) => x.trim()).filter(Boolean);
        if (!vs.includes(it.variant)) store.put('product', p.id, { ...p, variants: [...vs, it.variant].join('، ') });
      }
    }
  }
  return made;
}

/** يقرأ كل قنوات الشيت: ينشئ المنتجات الجديدة من SKU، ويضيف الطلبات الجديدة (بعد تاريخ البداية). */
export async function pullSheets() {
  const s = store.settings();
  let added = 0, products = 0;
  const errors = [];
  for (const sh of s.sheets || []) {
    try {
      const { csv } = await transport.invoke({ action: 'csv', url: sh.url });
      const all = ordersFromCsv(csv, sh);
      products += autoProducts(all);
      for (const o of all) {
        if (sh.since && o.createdAt.slice(0, 10) < sh.since) continue;
        if (store.get('order', o.id)) continue;
        store.put('order', o.id, o);
        added++;
      }
      store.saveSettings({ sheets: store.settings().sheets.map((x) => (x.id === sh.id ? { ...x, lastPull: new Date().toISOString(), lastCount: all.length } : x)) });
    } catch (e) { errors.push(`${sh.name || sh.url}: ${e.message}`); }
  }
  return { added, products, errors };
}

export function updateOrder(id, patch) {
  const o = store.get('order', id);
  if (!o) return null;
  return store.put('order', id, { ...o, ...patch });
}

/** إنشاء الطلب في Ecotrack. يرجع {ok, tracking|error} */
export async function sendToEcotrack(id) {
  const o = store.get('order', id);
  if (!o) return { ok: false, error: '?' };
  if (o.tracking) return { ok: true, tracking: o.tracking };
  const { payload, problems } = ecotrackPayload(o);
  if (problems.length) return { ok: false, error: P('crm.err.missing', { f: problems.join('، ') }) };
  try {
    const r = await eco('POST', 'create/order', { query: payload });
    const d = r.data || {};
    const tracking = d.tracking || d.data?.tracking;
    if (r.status >= 200 && r.status < 300 && tracking) {
      updateOrder(id, { stage: 'sent', tracking: String(tracking), sentAt: new Date().toISOString(), eco: { group: 'prep', label: 'Prêt à expédier', at: new Date().toISOString() }, ecoError: '' });
      return { ok: true, tracking };
    }
    const error = ecoError(r);
    updateOrder(id, { ecoError: error });
    return { ok: false, error };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** "Expédier": يؤكد الشحن في Ecotrack فلا يعود الطلب قابلاً للتعديل */
export async function shipOrder(id) {
  const o = store.get('order', id);
  if (!o?.tracking) return { ok: false, error: '?' };
  try {
    const r = await eco('POST', 'valid/order', { query: { tracking: o.tracking, ask_collection: store.settings().shipAskCollection ? 1 : 0 } });
    if (r.status >= 200 && r.status < 300) { updateOrder(id, { shippedAt: new Date().toISOString(), ecoError: '' }); return { ok: true }; }
    const error = ecoError(r); updateOrder(id, { ecoError: error }); return { ok: false, error };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** استلمت الراجع فعلياً: نبلغ Ecotrack ثم يرجع للمخزون */
export async function confirmReturn(id) {
  const o = store.get('order', id);
  if (!o?.tracking) return { ok: false, error: '?' };
  try {
    const r = await eco('POST', 'valid/returns', { body: { trackings: [o.tracking] } });
    if (r.status >= 200 && r.status < 300) { updateOrder(id, { eco: { ...(o.eco || {}), group: 'returned', label: 'Retours reçu', at: new Date().toISOString() }, ecoError: '' }); return { ok: true }; }
    const error = ecoError(r); updateOrder(id, { ecoError: error }); return { ok: false, error };
  } catch (e) { return { ok: false, error: e.message }; }
}

const listOf = (d) => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.orders) ? d.orders : Array.isArray(d?.data?.data) ? d.data.data : []);
const lastPageOf = (d) => +(d?.last_page ?? d?.meta?.last_page ?? d?.data?.last_page ?? 0) || 0;
const dayISO = (ms) => new Date(ms).toISOString().slice(0, 10);
const byTracking = () => new Map(store.orders().filter((o) => o.tracking).map((o) => [o.tracking, o]));

/** تأكيد الطلبية: نطلب من Ecotrack شحنها (valid/order) فتنتقل من prêt à expédier إلى vers station */
export async function confirmOrder(id, by = '') {
  const o = store.get('order', id);
  if (!o?.tracking) return { ok: false, error: '?' };
  try {
    const q = { tracking: o.tracking, ask_collection: store.settings().shipAskCollection ? 1 : 0 };
    const r = await eco('POST', 'valid/order', { query: q, body: q });
    if (r.status >= 200 && r.status < 300 && !(r.data && typeof r.data === 'object' && r.data.success === false)) {
      const now = new Date().toISOString();
      updateOrder(id, { stage: 'sent', confirmedBy: by, confirmedAt: now, shippedAt: now, ecoError: '', eco: { ...(o.eco || {}), step: 'to_station', group: 'transit', label: 'Vers station', at: now } });
      return { ok: true };
    }
    const error = ecoError(r); updateOrder(id, { ecoError: error }); return { ok: false, error };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** إلغاء طلبية لم تُشحن بعد: تُحذف من Ecotrack (prêt à expédier) وتُعلَّم ملغاة في التطبيق */
export async function cancelOrder(id, by = '') {
  const o = store.get('order', id);
  if (!o) return { ok: false, error: '?' };
  const done = () => updateOrder(id, { stage: 'cancelled', confirmedBy: by || o.confirmedBy, confirmedAt: new Date().toISOString(), ecoError: '' });
  if (!o.tracking) { done(); return { ok: true }; }
  try {
    const r = await eco('DELETE', 'delete/order', { query: { tracking: o.tracking } });
    if (r.status >= 200 && r.status < 300) { done(); return { ok: true }; }
    if (r.status === 404) { done(); return { ok: true }; } // غير موجودة أصلاً في Ecotrack
    const error = ecoError(r); updateOrder(id, { ecoError: error }); return { ok: false, error };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** ملاحظات الموزّع لطلبية (ما يكتبه في Ecotrack أثناء التوصيل) */
export async function fetchRemarks(id) {
  const o = store.get('order', id);
  if (!o?.tracking) return [];
  const r = await eco('GET', 'get/maj', { query: { tracking: o.tracking } });
  if (r.status >= 300) throw new Error(ecoError(r));
  const remarks = readRemarks(r.data).slice(0, 8);
  const cur = store.get('order', id);
  store.put('order', id, { ...cur, eco: { ...(cur.eco || {}), remarks, remarksAt: new Date().toISOString() } });
  return remarks;
}

/**
 * المزامنة مع Ecotrack: تجلب كل الطلبيات من Ecotrack (get/orders صفحة بصفحة)،
 *  - الطلبية الجديدة تُضاف (prêt à expédier ← خانة التأكيدات)،
 *  - والموجودة تتحدث حالتها.
 * ثم تجلب ملاحظات الموزّع للطلبيات التي في التوصيل أو المعلقة.
 * يرجع {added, updated, changes:[{id, from, to, isNew}]}
 */
export async function syncEcotrack({ days = 30, maxPages = 40, remarksLimit = 10 } = {}) {
  if (!ecoConfig().token) return { added: 0, updated: 0, changes: [], skipped: true };
  const s = store.settings();
  const known = byTracking();
  const live = [...known.values()].filter((o) => !['delivered', 'ret_back', 'cancelled'].includes(stepOf(o)));
  const since = s.ecoSince || dayISO(Date.now() - days * 864e5);
  const oldestLive = live.reduce((a, o) => ((o.createdAt || '').slice(0, 10) < a ? (o.createdAt || '').slice(0, 10) : a), since);
  const floor = dayISO(Date.now() - 85 * 864e5);
  const start = oldestLive < floor ? floor : oldestLive;
  const end = dayISO(Date.now() + 864e5);
  const changes = [];
  let added = 0, updated = 0, prevFirst = '';
  for (let page = 1; page <= maxPages; page++) {
    const r = await eco('GET', 'get/orders', { query: { page, start_date: start, end_date: end } });
    if (r.status >= 300) throw new Error(ecoError(r));
    const items = listOf(r.data);
    const first = readEcoOrder(items[0])?.tracking || '';
    if (page > 1 && first && first === prevFirst) break; // الخادم تجاهل رقم الصفحة
    prevFirst = first;
    for (const x of items) {
      const e = readEcoOrder(x);
      if (!e) continue;
      const cur = known.get(e.tracking) && store.get('order', known.get(e.tracking).id);
      if (!cur) {
        const o = orderFromEco(x);
        if (!o || store.get('order', o.id)) continue;
        if (o.createdAt.slice(0, 10) < since && o.stage === 'new') continue; // طلبيات قديمة جداً لم تُؤكد
        store.put('order', o.id, o); known.set(o.tracking, o); added++;
        changes.push({ id: o.id, from: '', to: o.eco.step, isNew: true });
        continue;
      }
      if (!e.label || cur.eco?.label === e.label) continue;
      const from = stepOf(cur);
      // لا نرجع للخلف إذا أكدناها في التطبيق ولم يتحدث Ecotrack بعد
      if (e.step === 'ready' && cur.stage === 'sent' && cur.shippedAt && Date.now() - Date.parse(cur.shippedAt) < 30 * 60e3) continue;
      const patch = { eco: { ...(cur.eco || {}), step: e.step, group: groupOfStep(e.step), label: e.label, at: new Date().toISOString() } };
      if (e.step === 'cancelled') patch.stage = 'cancelled';
      else if (e.step !== 'ready' && cur.stage === 'new') patch.stage = 'sent'; // أُكدت من Ecotrack مباشرة
      store.put('order', cur.id, { ...cur, ...patch });
      updated++;
      if (from !== e.step) changes.push({ id: cur.id, from, to: e.step, isNew: false });
    }
    const last = lastPageOf(r.data);
    if (!items.length || (last ? page >= last : items.length < 10)) break;
  }
  // ملاحظات الموزّع: للطلبيات في التوصيل أو المعلقة (التي تغيرت أولاً، ثم الأقدم تحديثاً)
  const changed = new Set(changes.map((c) => c.id));
  const need = store.orders()
    .filter((o) => ['delivering', 'suspended'].includes(stepOf(o)))
    .filter((o) => changed.has(o.id) || !o.eco?.remarksAt || Date.now() - Date.parse(o.eco.remarksAt) > 15 * 60e3)
    .sort((a, b) => (changed.has(b.id) - changed.has(a.id)) || String(a.eco?.remarksAt || '').localeCompare(String(b.eco?.remarksAt || '')))
    .slice(0, remarksLimit);
  for (const o of need) {
    const before = o.eco?.remarks?.[0]?.text || '';
    try {
      const rem = await fetchRemarks(o.id);
      if (rem[0]?.text && rem[0].text !== before && !changed.has(o.id)) changes.push({ id: o.id, from: stepOf(o), to: stepOf(o), isNew: false, remark: rem[0].text });
    } catch { /* ملاحظات اختيارية: لا نوقف المزامنة */ }
  }
  return { added, updated, changes };
}

/** للتوافق مع الأزرار القديمة */
export async function refreshStatuses() { const r = await syncEcotrack(); return { updated: r.updated + r.added, checked: 0 }; }

export { ecoGroup };
