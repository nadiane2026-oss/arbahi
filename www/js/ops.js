// عمليات الطلبات: قراءة الشيتات، الإرسال إلى Ecotrack، تتبع الحالات. تعمل عبر الوسيط في Supabase.
import { store } from './core.js';
import { transport, ecoConfig } from './transport.js';
import { ordersFromCsv, ecotrackPayload, readEcoOrder, ecoGroup, resolveProduct } from './crm.js';
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

/** يحدّث حالات الطلبات المرسلة من Ecotrack. يرجع {updated, checked} */
export async function refreshStatuses() {
  const live = store.orders().filter((o) => o.tracking && o.stage !== 'cancelled' && !['returned'].includes(o.eco?.group));
  if (!live.length) return { updated: 0, checked: 0 };
  const byTrack = new Map(live.map((o) => [o.tracking, o]));
  const oldest = live.reduce((a, o) => ((o.sentAt || o.createdAt) < a ? (o.sentAt || o.createdAt) : a), new Date().toISOString()).slice(0, 10);
  const start = oldest < new Date(Date.now() - 85 * 864e5).toISOString().slice(0, 10) ? new Date(Date.now() - 85 * 864e5).toISOString().slice(0, 10) : oldest;
  const end = new Date().toISOString().slice(0, 10);
  let updated = 0, checked = 0;
  for (let page = 1; page <= 15 && byTrack.size; page++) {
    const r = await eco('GET', 'get/orders', { query: { page, start_date: start, end_date: end } });
    if (r.status >= 300) throw new Error(ecoError(r));
    const items = listOf(r.data);
    if (!items.length) break;
    for (const x of items) {
      const e = readEcoOrder(x);
      const o = e && byTrack.get(e.tracking);
      if (!o) continue;
      checked++;
      const cur = store.get('order', o.id);
      if (e.label && (cur.eco?.label !== e.label)) {
        // لا نتراجع عن "تم استلام الراجع" الذي أكدناه يدوياً
        store.put('order', o.id, { ...cur, eco: { group: e.group, label: e.label, at: new Date().toISOString() } });
        updated++;
      }
    }
    if (items.length < 40) break;
  }
  return { updated, checked };
}

export { ecoGroup };
