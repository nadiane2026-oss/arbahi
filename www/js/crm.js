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

/* ---------------- حالات Ecotrack ----------------
 * كل حالة في Ecotrack تقابلها "خطوة" في التطبيق، بنفس ترتيب المسار:
 * prêt à expédier ← (تأكيد) vers station ← en station ← vers wilaya ← en préparation ← en livraison
 * ← suspendu / livré / retour chez livreur ← retour en transit ← retour en traitement (وصلك).
 * Ecotrack يرسل الحالة أحياناً كرمز (vers_hub) وأحياناً كنص (Vers station)، فنفهم الاثنين. */
export const ECO_STEPS = ['ready', 'to_station', 'at_station', 'to_wilaya', 'preparing', 'delivering', 'suspended', 'delivered', 'ret_driver', 'ret_transit', 'ret_back', 'cancelled', 'unknown'];
const STEP_MAP = [
  ['ret_back', ['retour en traitement', 'retours en traitement', 'retour recu', 'retours recu', 'retour archive', 'retours archive', 'retours en stock', 'retours prets', 'return received']],
  ['ret_transit', ['retour transit entrepot', 'retours transit entrepot', 'retour en transit', 'retours en transit', 'return in transit', 'retours a dispatcher', 'retour a dispatcher']],
  ['ret_driver', ['retour chez livreur', 'retours chez livreur', 'return asked']],
  ['cancelled', ['annule', 'annulee', 'annules']],
  ['suspended', ['suspendu', 'suspendue', 'suspendus']],
  ['delivering', ['en livraison', 'sortie en livraison', 'dispatched to driver', 'attempt delivery']],
  ['to_station', ['vers station', 'vers hub', 'en ramassage', 'picked', 'en preparation stock', 'stock en preparation']],
  ['preparing', ['en preparation']],
  ['to_wilaya', ['vers wilaya']],
  ['at_station', ['en station', 'en hub', 'accepted by carrier']],
  ['ready', ['prete a expedier', 'pret a expedier', 'prets a expedier', 'pret a preparer', 'order information received by carrier', 'notification on order']],
  ['delivered', ['livre non encaisse', 'livre encaisse', 'encaisse non paye', 'paiements prets', 'paiement pret', 'paye et archive', 'paiement archive', 'livred', 'encaissed', 'payed', 'livre', 'livree', 'livres']],
  ['ret_driver', ['retour', 'retours']],
];
const STEP_GROUP = {
  ready: 'prep', to_station: 'transit', at_station: 'transit', to_wilaya: 'transit', preparing: 'transit',
  delivering: 'delivering', suspended: 'suspended', delivered: 'delivered',
  ret_driver: 'returning', ret_transit: 'returning', ret_back: 'returned', cancelled: 'cancelled', unknown: 'unknown',
};
/** الخطوات التي تكون فيها السلعة عند شركة التوصيل (خرجت من يدك ولم تُبع ولم ترجع لك بعد) */
export const CARRIER_STEPS = ['to_station', 'at_station', 'to_wilaya', 'preparing', 'delivering', 'suspended', 'ret_driver', 'ret_transit'];

const words = (s) => ` ${String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
export function ecoStep(label) {
  const n = words(label);
  if (!n.trim()) return 'unknown';
  for (const [step, keys] of STEP_MAP) if (keys.some((k) => n.includes(` ${k} `))) return step;
  return 'unknown';
}
export const ECO_GROUPS = ['prep', 'transit', 'delivering', 'suspended', 'delivered', 'returning', 'returned', 'cancelled', 'unknown'];
export const ecoGroup = (label) => STEP_GROUP[ecoStep(label)];
export const groupOfStep = (step) => STEP_GROUP[step] || 'unknown';

/** الخطوة الحالية لطلب (تدعم الطلبات القديمة التي حُفظت قبل وجود "الخطوة") */
export function stepOf(o) {
  if (o.eco?.step && ECO_STEPS.includes(o.eco.step)) return o.eco.step;
  const s = ecoStep(o.eco?.label);
  if (s !== 'unknown') return s;
  return { prep: 'ready', transit: 'to_station', delivering: 'delivering', suspended: 'suspended', delivered: 'delivered', returning: 'ret_driver', returned: 'ret_back' }[o.eco?.group] || (o.tracking ? 'unknown' : '');
}

const pick = (x, keys) => { for (const k of keys) { const v = x?.[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return v; } return ''; };

/** يستخرج tracking والحالة من عنصر في رد get/orders مهما كانت أسماء الحقول */
export function readEcoOrder(x) {
  if (!x || typeof x !== 'object') return null;
  const tracking = String(pick(x, ['tracking', 'tracking_number', 'code'])).trim();
  let label = pick(x, ['status', 'statut', 'etat', 'state', 'status_label', 'situation', 'last_status']);
  if (label && typeof label === 'object') label = pick(label, ['name', 'label', 'status', 'code']);
  label = String(label || '').trim();
  if (!tracking) return null;
  const step = ecoStep(label);
  return { tracking, label, step, group: groupOfStep(step), raw: x, pay: payFromRaw(x) };
}

/** "Sandal Armani (42) x2 + Sac" -> [{name, qty}] */
function itemsFromText(text, qtyHint) {
  const parts = String(text || '').split(/\s\+\s|\n|\s\|\s/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return [];
  const out = parts.map((p) => {
    const m = p.match(/^(.*?)(?:\s*[x×*]\s*(\d{1,3}))$/i);
    return m && m[1].trim() ? { name: m[1].trim(), qty: +m[2] } : { name: p, qty: 0 };
  });
  if (out.length === 1 && !out[0].qty) out[0].qty = Math.max(1, Math.round(num(qtyHint)) || 1);
  return out.map((i) => ({ sku: '', name: i.name, variant: '', qty: i.qty || 1, price: 0 }));
}

/** يحوّل طلباً من Ecotrack (get/orders) إلى طلب في التطبيق */
export function orderFromEco(x) {
  const e = readEcoOrder(x);
  if (!e) return null;
  const r = e.raw;
  const list = Array.isArray(r.products) ? r.products : Array.isArray(r.produits) ? r.produits : null;
  const items = list
    ? list.map((p) => ({ sku: String(pick(p, ['reference', 'sku', 'code']) || ''), name: String(pick(p, ['name', 'produit', 'nom', 'designation']) || ''), variant: '', qty: Math.max(1, Math.round(num(pick(p, ['quantity', 'quantite', 'qty']))) || 1), price: num(pick(p, ['price', 'prix'])) }))
    : itemsFromText(pick(r, ['produit', 'product', 'products_text']), pick(r, ['quantite', 'quantity']));
  const wcode = +pick(r, ['wilaya_id', 'code_wilaya', 'wilaya_code']) || wilayaCode(pick(r, ['wilaya', 'wilaya_name']));
  const created = String(pick(r, ['created_at', 'date_creation', 'date']));
  const phoneRaw = String(pick(r, ['phone', 'telephone', 'tel']));
  const desk = String(pick(r, ['stop_desk', 'stopdesk', 'type_livraison'])).toLowerCase();
  return {
    id: 'e' + e.tracking.replace(/[^\w-]/g, ''),
    source: 'ecotrack',
    sheetId: '', sheetName: String(pick(r, ['boutique', 'shop', 'store']) || ''),
    createdAt: sheetDate(created) || (created && !isNaN(Date.parse(created)) ? new Date(created).toISOString() : new Date().toISOString()),
    name: String(pick(r, ['client', 'nom_client', 'name', 'customer']) || ''),
    phone: phoneLocal(phoneRaw), phoneRaw, phone2: String(pick(r, ['phone_2', 'telephone_2']) || ''),
    wilaya: wcode ? WILAYAS[wcode - 1] : String(pick(r, ['wilaya', 'wilaya_name']) || ''), wilayaCode: wcode || 0,
    commune: String(pick(r, ['commune', 'commune_name']) || ''), address: String(pick(r, ['adresse', 'address']) || ''),
    items: items.length ? items : [{ sku: '', name: '?', variant: '', qty: 1, price: 0 }],
    shipping: num(pick(r, ['tarif_prestation', 'frais_livraison'])), total: num(pick(r, ['montant', 'amount', 'total'])),
    delivery: desk === '1' || desk === 'true' || /desk|bureau/.test(desk) ? 'desk' : 'home',
    reference: String(pick(r, ['reference', 'ref']) || ''),
    stage: e.step === 'ready' ? 'new' : e.step === 'cancelled' ? 'cancelled' : 'sent',
    calls: [], note: String(pick(r, ['remarque', 'note']) || ''), confirmedBy: '', confirmedAt: '',
    tracking: e.tracking, eco: { step: e.step, group: e.group, label: e.label, at: new Date().toISOString(), payHint: e.pay.stage, payFields: e.pay.fields },
  };
}

/** يقرأ ملاحظات الموزّع (get/maj) -> [{text, by, at}] من الأحدث للأقدم */
export function readRemarks(d) {
  const list = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.maj) ? d.maj : d && typeof d === 'object' ? Object.values(d).filter((v) => v && typeof v === 'object') : [];
  return list.map((m) => ({
    text: String(pick(m, ['remarque', 'content', 'message', 'text', 'reason', 'maj']) || '').trim(),
    by: String(pick(m, ['livreur', 'station', 'user', 'by']) || '').trim(),
    at: String(pick(m, ['created_at', 'date', 'at']) || ''),
  })).filter((m) => m.text).sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------------- المخزون ---------------- */
export const lineKey = (productId, variant = '') => `${productId}|${variant}`;

/** يطابق سطر طلب بمنتج: SKU، ثم الاسم، ثم أطول اسم/رمز يظهر داخل نص المنتج في Ecotrack */
export function resolveProduct(item, products) {
  const sku = norm(item.sku);
  const aliases = (p) => String(p.skus || '').split(/[,،;]/).map(norm).filter(Boolean);
  if (sku) {
    const p = products.find((p) => aliases(p).includes(sku));
    if (p) return p;
  }
  const nm = norm(item.name);
  if (!nm) return null;
  const exact = products.find((p) => norm(p.name) === nm || aliases(p).includes(nm));
  if (exact) return exact;
  let best = null, len = 0;
  for (const p of products) for (const k of [norm(p.name), ...aliases(p)]) if (k.length >= 3 && nm.includes(k) && k.length > len) { best = p; len = k.length; }
  return best;
}

/** هل السلعة عند شركة التوصيل الآن؟ (أكدتها وخرجت، ولم تُسلَّم ولم ترجع لك بعد) */
export function withCarrier(o) {
  if (o.stage === 'cancelled' || !o.tracking) return false;
  const s = stepOf(o);
  return CARRIER_STEPS.includes(s) || (o.stage === 'sent' && (s === 'ready' || s === 'unknown'));
}
export const isOut = withCarrier;

/**
 * المخزون بقواعدك:
 *  - المخزون الكلي ينقص فقط عند التسليم (livré).
 *  - منه "في يدك" و"عند التوصيل": كي تأكد الطلبية تنتقل لعند التوصيل، وكي تولي
 *    retour en traitement ترجع ليدك (retour chez livreur يبقى عند التوصيل).
 * يرجع Map(productId -> {onHand, inHand, carrier, added, sold, returned, pending, variants})
 */
export function stockReport(products, moves, orders) {
  const rep = new Map(products.map((p) => [p.id, { onHand: 0, inHand: 0, carrier: 0, added: 0, sold: 0, returned: 0, pending: 0, out: 0, variants: {} }]));
  for (const m of moves) {
    const r = rep.get(m.productId); if (!r) continue;
    const q = num(m.qty);
    r.onHand += q; if (m.variant) r.variants[m.variant] = (r.variants[m.variant] || 0) + q;
    if (q > 0) r.added += q;
  }
  const unmapped = new Set();
  for (const o of orders) {
    if (o.stage === 'cancelled') continue;
    const s = stepOf(o);
    for (const it of o.items || []) {
      const p = resolveProduct(it, products);
      if (!p) { if (o.tracking) unmapped.add(it.sku || it.name); continue; }
      const r = rep.get(p.id);
      const q = Math.max(1, Math.round(num(it.qty)) || 1);
      if (s === 'delivered') { r.onHand -= q; r.sold += q; if (it.variant) r.variants[it.variant] = (r.variants[it.variant] || 0) - q; }
      else if (withCarrier(o)) r.carrier += q;
      else if (s === 'ret_back') r.returned += q;
      else if (o.stage === 'new' || o.stage === 'confirmed') r.pending += q;
    }
  }
  for (const r of rep.values()) { r.inHand = r.onHand - r.carrier; r.out = r.carrier; }
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

/* ---------------- خانات الطلبات ---------------- */
/** الخانات بنفس ترتيب المسار في Ecotrack */
export const ORDER_TABS = ['new', 'to_station', 'at_station', 'to_wilaya', 'preparing', 'delivering', 'suspended', 'dl_unc', 'dl_col', 'dl_rdy', 'dl_paid', 'returns', 'cancelled', 'other'];
/** في أي خانة تظهر الطلبية */
export function orderTab(o) {
  if (o.stage === 'cancelled') return 'cancelled';
  if (o.stage === 'new' || o.stage === 'confirmed') return 'new';
  const s = stepOf(o);
  if (s === 'ready') return 'to_station'; // أكدناها ولم يتحدث Ecotrack بعد
  if (s.startsWith('ret_')) return 'returns';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'delivered') return { uncollected: 'dl_unc', collected: 'dl_col', ready: 'dl_rdy', paid: 'dl_paid' }[payOf(o)] || 'dl_unc';
  return ORDER_TABS.includes(s) ? s : 'other';
}

/** قائمة العملاء الذين استلموا طلباتهم (حسب فترة وبحث) */
export function receivedList(orders, period = 'all', q = '', now = new Date()) {
  const needle = String(q || '').trim().toLowerCase();
  return orders
    .filter((o) => o.stage !== 'cancelled' && stepOf(o) === 'delivered')
    .map((o) => ({
      id: o.id, name: o.name || '', phone: o.phone || '', wilaya: o.wilaya || '', commune: o.commune || '',
      product: (o.items || []).map((i) => `${i.name || i.sku || '?'}${i.variant ? ' (' + i.variant + ')' : ''}${(i.qty || 1) > 1 ? ' ×' + i.qty : ''}`).join(' + '),
      total: num(o.total), tracking: o.tracking || '', date: (o.eco?.at || o.createdAt || '').slice(0, 10),
    }))
    .filter((r) => inPeriod(r.date, period, now))
    .filter((r) => !needle || `${r.name} ${r.phone} ${r.wilaya} ${r.commune} ${r.product} ${r.tracking}`.toLowerCase().includes(needle))
    .sort((a, b) => b.date.localeCompare(a.date));
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV يفتحه Excel وGoogle Sheets مباشرة (مع BOM للعربية) */
export function receivedCsv(list) {
  const head = ['الاسم', 'الهاتف', 'الولاية', 'البلدية', 'المنتج', 'المبلغ', 'رقم التتبع', 'تاريخ الاستلام'];
  return '﻿' + [head, ...list.map((r) => [r.name, r.phone, r.wilaya, r.commune, r.product, r.total, r.tracking, r.date])].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/* ---------------- المالية: مراحل الدفع في Ecotrack ----------------
 * Livré non encaissé ← Encaissé non payé ← Paiement prêt ← Payé (سجل الدفعات المستلمة) */
export const PAY_STAGES = ['uncollected', 'collected', 'ready', 'paid'];
export function payStage(label) {
  const n = words(label);
  if (!n.trim()) return '';
  const has = (...ks) => ks.some((k) => n.includes(` ${k} `));
  if (has('paye et archive', 'paiement archive', 'paiements archives', 'paiement recu', 'paiements recus', 'payed archived')) return 'paid';
  if (has('paiements prets', 'paiement pret', 'payment ready')) return 'ready';
  if (has('non encaisse', 'non encaissee')) return 'uncollected';
  if (has('encaisse non paye', 'livre encaisse', 'encaisse', 'encaissed')) return 'collected';
  if (has('livre', 'livree', 'livres', 'livred')) return 'uncollected';
  return '';
}
/** يبحث في حقول رد Ecotrack عن أي إشارة للدفع/التحصيل (أسماء الحقول غير معروفة بالضبط) */
export function payFromRaw(raw) {
  const out = { stage: '', fields: {} };
  if (!raw || typeof raw !== 'object') return out;
  const rank = (s) => PAY_STAGES.indexOf(s);
  const up = (s) => { if (s && rank(s) > rank(out.stage)) out.stage = s; };
  const falsy = /^(0|false|null|non|no|none|undefined|0000-00-00.*)$/i;
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === 'object') continue;
    if (!/pay|paid|paye|paie|encaiss|cash|collect|settle|regl|recouv|decharge|facture|invoice/i.test(k)) continue;
    out.fields[k] = v;
    if (typeof v === 'string') up(payStage(v));
    const truthy = v === true || (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.trim() !== '' && !falsy.test(v.trim()));
    if (!truthy) continue;
    if (/(paye|paid|paiement|pay).*(date|at)$|^(date|at)_.*(paye|paid|paiement|pay)|is_?paid|^paye$|^paid$/i.test(k)) up('paid');
    else if (/encaiss|collect|cash/i.test(k)) up('collected');
  }
  return out;
}
export const maxPay = (list) => list.filter(Boolean).sort((a, b) => PAY_STAGES.indexOf(b) - PAY_STAGES.indexOf(a))[0] || '';
/** مرحلة الدفع من بيانات eco (الحالة النصية + إشارات الحقول) */
export const payOfEco = (eco, manual = '') => maxPay([payStage(eco?.label), eco?.payHint, manual]);
/** مرحلة الدفع لطلب مسلَّم (وإلا '') */
export function payOf(o) {
  if (!o || o.stage === 'cancelled' || stepOf(o) !== 'delivered') return '';
  return payOfEco(o.eco, o.payManual) || 'uncollected';
}
/** المبلغ الذي سيصلك من هذا الطلب (بدون أجرة شركة التوصيل إن كانت معروفة) */
export const orderNet = (o) => Math.max(0, num(o.total) - num(o.shipping));

export function financeGroups(orders) {
  const g = { uncollected: [], collected: [], ready: [], paid: [] };
  for (const o of orders) { const p = payOf(o); if (p) g[p].push(o); }
  const sum = (l) => l.reduce((a, o) => a + orderNet(o), 0);
  return { ...g, sums: Object.fromEntries(PAY_STAGES.map((k) => [k, sum(g[k])])) };
}
/** طلبات مدفوعة لم يُحسب ربحها بعد، مجمّعة حسب يوم الاستلام */
export function pendingBatches(orders) {
  const by = new Map();
  for (const o of orders) {
    if (payOf(o) !== 'paid' || o.payRef) continue;
    const day = String(o.eco?.payAt || o.eco?.at || o.createdAt || '').slice(0, 10) || 'unknown';
    if (!by.has(day)) by.set(day, []);
    by.get(day).push(o);
  }
  return [...by.entries()].map(([day, list]) => ({ day, orders: list, total: list.reduce((a, o) => a + orderNet(o), 0) })).sort((a, b) => b.day.localeCompare(a.day));
}
/** يحوّل دفعة مستلمة إلى "ورقة استلام" يفهمها محرك الأرباح */
export function decharge_fromOrders(day, list, products) {
  const parcels = list.map((o) => {
    const items = [];
    for (const it of o.items || []) {
      const p = resolveProduct(it, products);
      if (p) items.push({ productId: p.id, qty: Math.max(1, Math.round(num(it.qty)) || 1) });
    }
    return { tracking: o.tracking || o.id, montant: num(o.total), net: orderNet(o), name: o.name || '', phone: o.phone || '', wilaya: o.wilaya || '', commune: o.commune || '', items, noProduct: false };
  });
  return { id: `pay-${day}`, ref: `PAY-${day}`, date: day, sender: 'Ecotrack', count: parcels.length, total: parcels.reduce((a, p) => a + p.net, 0), parcels, createdAt: Date.now(), auto: true };
}
