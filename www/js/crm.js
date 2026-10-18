// منطق الطلبات والمخزون والمؤكدين: دوال نقية قابلة للاختبار بدون واجهة.
import { num, uid } from './util.js';

/* ---------------- الولايات ---------------- */
export const WILAYAS = [
  'Adrar', 'Chlef', 'Laghouat', 'Oum El Bouaghi', 'Batna', 'Béjaïa', 'Biskra', 'Béchar', 'Blida', 'Bouira',
  'Tamanrasset', 'Tébessa', 'Tlemcen', 'Tiaret', 'Tizi Ouzou', 'Alger', 'Djelfa', 'Jijel', 'Sétif', 'Saïda',
  'Skikda', 'Sidi Bel Abbès', 'Annaba', 'Guelma', 'Constantine', 'Médéa', 'Mostaganem', "M'Sila", 'Mascara', 'Ouargla',
  'Oran', 'El Bayadh', 'Illizi', 'Bordj Bou Arréridj', 'Boumerdès', 'El Tarf', 'Tindouf', 'Tissemsilt', 'El Oued', 'Khenchela',
  'Souk Ahras', 'Tipaza', 'Mila', 'Aïn Defla', 'Naâma', 'Aïn Témouchent', 'Ghardaïa', 'Relizane', "El M'Ghair", 'El Menia',
  'Ouled Djellal', 'Bordj Badji Mokhtar', 'Béni Abbès', 'Timimoun', 'Touggourt', 'Djanet', 'In Salah', 'In Guezzam',
];
const ALIASES = { meniaa: 50, elmeniaa: 50, algiers: 16, elmghair: 49, msila: 28, bba: 34, boumerdes: 35 };

export const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

/** اسم ولاية (فرنسي غالباً، أو رقم) -> رقمها 1..58، أو 0 إن لم نتعرف عليها */
export function wilayaCode(name) {
  const raw = String(name ?? '').trim();
  if (/^\d{1,2}$/.test(raw) && +raw >= 1 && +raw <= 58) return +raw;
  const n = norm(raw);
  if (!n) return 0;
  const hit = WILAYAS.findIndex((w) => norm(w) === n);
  if (hit >= 0) return hit + 1;
  if (ALIASES[n]) return ALIASES[n];
  const near = WILAYAS.map((w, i) => [i + 1, lev(norm(w), n)]).filter(([, d]) => d <= 1);
  return near.length === 1 ? near[0][0] : 0;
}

/* ---------------- الهاتف ---------------- */
/** رقم جزائري بصيغة محلية 0XXXXXXXXX (المطلوبة في Ecotrack)، أو '' */
export function phoneLocal(p) {
  let d = String(p ?? '').replace(/\D/g, '');
  if (d.startsWith('00213')) d = d.slice(5);
  else if (d.startsWith('213')) d = d.slice(3);
  if (d.length === 9 && /^[567]/.test(d)) return '0' + d;
  if (d.length === 10 && d.startsWith('0') && /^0[567]/.test(d)) return d;
  return '';
}

/* ---------------- رابط الشيت ---------------- */
/** رابط شيت Google (أي شكل) -> رابط تحميل CSV. يرجع '' إن لم يكن رابط شيت. */
export function sheetCsvUrl(input) {
  const s = String(input ?? '').trim();
  if (/^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\//.test(s)) return s; // رابط "نشر على الويب" جاهز
  const m = s.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (!m) return '';
  const gid = s.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

/* ---------------- CSV ---------------- */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };

const COLS = {
  username: ['username', 'name', 'customer', 'nom'], phone: ['phone', 'telephone', 'tel'], city: ['city', 'wilaya'], state: ['state', 'commune'],
  sku: ['sku'], variant: ['variant'], qty: ['quantity', 'qty', 'quantite'], price: ['price', 'prix'], shipping: ['shippingprice', 'shipping'],
  total: ['total'], shipTo: ['shippingto'], product: ['productname', 'product'], date: ['date'],
};

function variantText(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '{}') return '';
  try {
    const o = JSON.parse(s);
    if (o && typeof o === 'object') return Object.entries(o).map(([k, x]) => `${k}: ${x}`).join('، ');
  } catch { /* نص عادي */ }
  return s;
}

/** صف التاريخ كما يكتبه الشيت "2026-07-28 05:37:30" -> ISO (توقيت الجزائر +01:00) */
export function sheetDate(s) {
  const m = String(s ?? '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return '';
  const p = (x) => String(x ?? '0').padStart(2, '0');
  return `${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4])}:${p(m[5])}:${p(m[6])}+01:00`;
}

export const STAGES = ['new', 'confirmed', 'sent', 'cancelled'];

/** يحوّل نص CSV لشيت إلى طلبات جديدة. معرّف الطلب ثابت (من الشيت+الوقت+الهاتف+SKU) ليُعرف عند كل مزامنة. */
export function ordersFromCsv(csv, sheet) {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const head = rows[0].map(norm);
  const idx = {};
  for (const [k, names] of Object.entries(COLS)) idx[k] = head.findIndex((h) => names.includes(h));
  if (idx.phone < 0 && idx.username < 0) return [];
  const get = (r, k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  const seen = new Map();
  const out = [];
  for (const r of rows.slice(1)) {
    const phoneRaw = get(r, 'phone');
    const name = get(r, 'username');
    if (!phoneRaw && !name) continue;
    const key = [sheet.id, get(r, 'date'), phoneLocal(phoneRaw) || phoneRaw, get(r, 'sku')].join('|');
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    const qty = Math.max(1, Math.round(num(get(r, 'qty'))) || 1);
    const ship = get(r, 'shipTo').toLowerCase();
    const city = get(r, 'city');
    out.push({
      id: 'o' + hash(key) + (n > 1 ? '-' + n : ''),
      sheetId: sheet.id, sheetName: sheet.name || '',
      createdAt: sheetDate(get(r, 'date')) || new Date().toISOString(),
      name, phone: phoneLocal(phoneRaw), phoneRaw,
      wilaya: city, wilayaCode: wilayaCode(city), commune: get(r, 'state'), address: '',
      items: [{ sku: get(r, 'sku'), name: get(r, 'product'), variant: variantText(get(r, 'variant')), qty, price: num(get(r, 'price')) }],
      shipping: num(get(r, 'shipping')), total: num(get(r, 'total')) || num(get(r, 'price')) * qty,
      delivery: /desk|stop/.test(ship) ? 'desk' : 'home',
      stage: 'new', calls: [], note: '', confirmedBy: '', confirmedAt: '', tracking: '', eco: null,
    });
  }
  return out;
}

/* ---------------- نتائج الاتصال ---------------- */
export const DEFAULT_CALL_RESULTS = ['لم يرفع السماعة', 'أغلق الخط', 'ألغى الطلب', 'مؤجل', 'رقم خاطئ'];

/* ---------------- Ecotrack ---------------- */
/** حمولة إنشاء طلب. تُرجع {payload, problems} حيث problems تمنع الإرسال. */
export function ecotrackPayload(o) {
  const problems = [];
  if (!o.phone) problems.push('phone');
  if (!o.wilayaCode) problems.push('wilaya');
  if (!String(o.commune || '').trim()) problems.push('commune');
  if (!String(o.name || '').trim()) problems.push('name');
  const produit = o.items.map((i) => `${i.name || i.sku}${i.variant ? ` (${i.variant})` : ''} x${i.qty}`).join(' + ').slice(0, 255);
  const payload = {
    reference: o.id.slice(0, 60),
    nom_client: String(o.name || '').slice(0, 255),
    telephone: o.phone,
    adresse: String(o.address || `${o.commune}, ${o.wilaya}`).slice(0, 255),
    commune: String(o.commune || '').slice(0, 255),
    code_wilaya: o.wilayaCode,
    montant: Math.round(num(o.total)),
    produit,
    remarque: String(o.note || '').slice(0, 255),
    boutique: String(o.sheetName || '').slice(0, 255),
    type: 1,
    stop_desk: o.delivery === 'desk' ? 1 : 0,
    stock: 0,
  };
  return { payload, problems };
}

/** مجموعات حالات Ecotrack التي نفهمها. المفتاح: اسم المجموعة. */
export const ECO_GROUPS = ['prep', 'transit', 'delivering', 'suspended', 'delivered', 'returning', 'returned', 'unknown'];
const ECO_MAP = [
  ['returned', ['retours recu', 'retours en stock', 'retours archive', 'return_received', 'returns received']],
  ['returning', ['retours chez livreur', 'retours en traitement', 'retours prets', 'retours a dispatcher', 'retours en transit', 'return_asked', 'return_in_transit']],
  ['delivered', ['livre non encaisse', 'livre encaisse', 'paiement pret', 'paiement archive', 'livred', 'livre', 'encaissed', 'payed']],
  ['suspended', ['suspendu']],
  ['delivering', ['en livraison', 'dispatched_to_driver', 'attempt_delivery']],
  ['transit', ['vers hub', 'en hub', 'vers wilaya', 'accepted_by_carrier']],
  ['prep', ['pret a expedier', 'pret a preparer', 'en ramassage', 'stock en preparation', 'en preparation', 'order_information_received_by_carrier', 'picked']],
];
export function ecoGroup(label) {
  const n = String(label ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n) return 'unknown';
  for (const [g, keys] of ECO_MAP) if (keys.some((k) => n === k || n.includes(k))) return g;
  return 'unknown';
}

/** يستخرج tracking والحالة من عنصر في رد get/orders مهما كانت أسماء الحقول (الرد غير موثق بالكامل) */
export function readEcoOrder(x) {
  if (!x || typeof x !== 'object') return null;
  const tracking = String(x.tracking ?? x.tracking_number ?? x.code ?? '').trim();
  const label = String(x.status ?? x.statut ?? x.etat ?? x.state ?? x.status_label ?? x.situation ?? '').trim();
  if (!tracking) return null;
  return { tracking, label, group: ecoGroup(label), raw: x };
}

/* ---------------- المخزون ---------------- */
export const lineKey = (productId, variant = '') => `${productId}|${variant}`;

/** يطابق سطر طلب بمنتج: SKU (قائمة مفصولة بفواصل) ثم الاسم */
export function resolveProduct(item, products) {
  const sku = norm(item.sku);
  if (sku) {
    const p = products.find((p) => String(p.skus || '').split(/[,،;]/).some((s) => norm(s) === sku));
    if (p) return p;
  }
  const nm = norm(item.name);
  return (nm && products.find((p) => norm(p.name) === nm)) || null;
}

/** هل يُحسب الطلب خارجاً من المخزون؟ (أُنشئ في Ecotrack ولم يُلغَ ولم يرجع للمخزون) */
export const isOut = (o) => !!o.tracking && o.stage !== 'cancelled' && o.eco?.group !== 'returned';

/**
 * رصيد كل منتج: مجموع الحركات اليدوية (إدخال/تعديل) ناقص ما خرج مع الشحن.
 * يرجع Map(productId -> {onHand, in, out, returned, pending, variants:{name:onHand}})
 */
export function stockReport(products, moves, orders) {
  const rep = new Map(products.map((p) => [p.id, { onHand: 0, added: 0, out: 0, returned: 0, sold: 0, pending: 0, variants: {} }]));
  const add = (id, v, d) => { const r = rep.get(id); if (!r) return; r.onHand += d; if (v) r.variants[v] = (r.variants[v] || 0) + d; };
  for (const m of moves) { add(m.productId, m.variant || '', num(m.qty)); const r = rep.get(m.productId); if (r && num(m.qty) > 0) r.added += num(m.qty); }
  const unmapped = new Set();
  for (const o of orders) {
    for (const it of o.items) {
      const p = resolveProduct(it, products);
      if (!p) { if (o.tracking) unmapped.add(it.sku || it.name); continue; }
      const r = rep.get(p.id);
      const q = Math.max(1, Math.round(num(it.qty)) || 1);
      if (isOut(o)) { add(p.id, it.variant || '', -q); r.out += q; }
      if (o.tracking && o.eco?.group === 'returned') r.returned += q;
      if (o.tracking && o.eco?.group === 'delivered') r.sold += q;
      if (o.stage === 'confirmed' && !o.tracking) r.pending += q;
    }
  }
  return { rep, unmapped: [...unmapped] };
}

/* ---------------- المؤكدون ---------------- */
/** إحصاءات كل مؤكّد: نسبة التأكيد = المؤكد ÷ (المؤكد + الملغى)، ونسبة التوصيل = المسلَّم ÷ (المسلَّم + الراجع) */
export function confirmerStats(orders, names) {
  const all = new Set(names);
  for (const o of orders) if (o.confirmedBy) all.add(o.confirmedBy);
  return [...all].map((name) => {
    const mine = orders.filter((o) => o.confirmedBy === name);
    const confirmed = mine.filter((o) => o.stage !== 'cancelled' && o.stage !== 'new').length;
    const cancelled = mine.filter((o) => o.stage === 'cancelled').length;
    const delivered = mine.filter((o) => o.eco?.group === 'delivered').length;
    const returned = mine.filter((o) => o.eco?.group === 'returning' || o.eco?.group === 'returned').length;
    const pct = (a, b) => (b > 0 ? (a / b) * 100 : null);
    return { name, handled: confirmed + cancelled, confirmed, cancelled, delivered, returned, confirmRate: pct(confirmed, confirmed + cancelled), deliveryRate: pct(delivered, delivered + returned) };
  });
}

/* ---------------- العملة ---------------- */
/** كوست ميتا بعملة أجنبية -> دينار */
export const toDA = (amount, rate) => Math.round(num(amount) * num(rate) * 100) / 100;

export const newMove = (productId, qty, variant = '', note = '') => ({ id: uid(), productId, variant, qty: num(qty), note, at: new Date().toISOString() });

/* ---------------- لوحة التحكم ---------------- */
export const DASH_PERIODS = ['all', 'today', 'yesterday', 'week', 'month'];
export function inPeriod(iso, key, now = new Date()) {
  if (key === 'all') return true;
  const d = String(iso || '').slice(0, 10);
  const day = (n) => new Date(now.getTime() - n * 864e5).toISOString().slice(0, 10);
  if (key === 'today') return d === day(0);
  if (key === 'yesterday') return d === day(1);
  if (key === 'week') return d >= day(6);
  if (key === 'month') return d >= day(29);
  return true;
}

const top = (map, n = 6) => [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count).slice(0, n);
export function dashStats(orders, key, now = new Date()) {
  const list = orders.filter((o) => inPeriod(o.createdAt, key, now));
  const st = { total: list.length, confirmed: 0, sent: 0, delivered: 0, returned: 0, cancelled: 0, sales: 0 };
  const prods = new Map(), wil = new Map(), chan = new Map(), conf = new Map();
  const bump = (m, k, add = {}) => { const v = m.get(k) || { count: 0, sales: 0 }; v.count += add.count ?? 1; v.sales += add.sales ?? 0; m.set(k, v); };
  for (const o of list) {
    const g = o.eco?.group;
    const isConf = o.stage === 'confirmed' || o.stage === 'sent';
    if (isConf) st.confirmed++;
    if (o.stage === 'sent') st.sent++;
    if (o.stage === 'cancelled') st.cancelled++;
    const del = o.stage === 'sent' && g === 'delivered';
    if (del) { st.delivered++; st.sales += num(o.total); }
    if (o.stage === 'sent' && (g === 'returning' || g === 'returned')) st.returned++;
    for (const it of o.items) bump(prods, it.name || it.sku || '?', { count: Math.max(1, Math.round(num(it.qty)) || 1), sales: del ? num(o.total) : 0 });
    if (o.wilaya) bump(wil, o.wilaya);
    bump(chan, o.sheetName || '—');
    if (o.confirmedBy && isConf) bump(conf, o.confirmedBy);
  }
  return { ...st, products: top(prods), wilayas: top(wil, 8), channels: top(chan), confirmers: top(conf) };
}
