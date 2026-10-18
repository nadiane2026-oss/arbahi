// محرك الحساب: دوال نقية بدون أي اعتماد على الواجهة أو التخزين.
import { isSet, num, normPhone, csvCell } from './util.js';

export const DEFAULT_SETTINGS = {
  metaCost: 0, // كوست ميتا الأولي لكل نتيجة (طلب) بالدينار
  confirmRate: 70, // نسبة التأكيد %
  deliveryRate: 70, // نسبة التوصيل %
  salimName: 'سليم',
  salimPct: 10, // من صافي الربح
  restSplit: [
    { name: 'الشركة', pct: 40 },
    { name: 'العامل الأول', pct: 30 },
    { name: 'العامل الثاني', pct: 30 },
  ], // تتقسم على الباقي بعد حصة سليم
  // ---- CRM ----
  sheets: [], // [{id, name, url, since}] شيتات الطلبات
  confirmers: [], // أسماء من يؤكدون الطلبات
  callResults: ['لم يرفع السماعة', 'أغلق الخط', 'ألغى الطلب', 'مؤجل', 'رقم خاطئ'],
  metaForeign: 0, // كوست ميتا بالعملة الأجنبية
  metaCurrency: 'USD',
  metaRate: 0, // سعر صرف العملة بالدينار
  shipAskCollection: 0, // طلب جمع الطرود من المخزن عند الشحن
};

/** الكوست النهائي لكل طلب مُسلَّم = الكوست الأولي ÷ (التأكيد × التوصيل) */
export function finalCost(initial, confirmPct, deliveryPct) {
  const i = num(initial);
  const c = num(confirmPct) / 100;
  const d = num(deliveryPct) / 100;
  if (i <= 0) return 0;
  if (c <= 0 || d <= 0) return i; // قيم غير صالحة: لا نقسم على صفر
  return i / (c * d);
}

/** الكوست النهائي لمنتج: قيم المنتج الخاصة تتغلب على الإعدادات العامة */
export function productMeta(product, settings) {
  const s = settings || DEFAULT_SETTINGS;
  const initial = product && isSet(product.metaCost) ? product.metaCost : s.metaCost;
  const conf = product && isSet(product.confirmRate) ? product.confirmRate : s.confirmRate;
  const del = product && isSet(product.deliveryRate) ? product.deliveryRate : s.deliveryRate;
  return finalCost(initial, conf, del);
}

/** أنواع الالتزامات: per_order | per_batch | percent (أسماؤها في i18n) */
export const COMMIT_MODE_KEYS = ['per_order', 'per_batch', 'percent'];

/** مكوّنات الطرد: [{productId, qty}]. يدعم الشكل القديم (productId واحد). */
export function parcelItems(p) {
  if (Array.isArray(p.items)) return p.items;
  return p.productId ? [{ productId: p.productId, qty: 1 }] : [];
}

/** توقيع تركيبة (لمقارنتها وتذكّرها) */
export const sigOf = (items) => items.map((i) => `${i.productId}x${Math.max(1, Math.round(num(i.qty)) || 1)}`).sort().join('+');

/**
 * ربح طرد واحد.
 * parcel.net هو الصافي الذي دفعته شركة التوصيل (بعد خصم التوصيل والعمولة).
 * تكلفة الشراء = مجموع (كمية × سعر شراء الوحدة) لكل مكوّن.
 * كوست ميتا يُحسب مرة واحدة للطلب (حسب أول منتج)، لأن الإعلان يجلب طلباً واحداً مهما كان عدد القطع.
 */
export function parcelCalc(parcel, ctx) {
  const items = parcelItems(parcel);
  let buy = 0;
  let primary = null;
  let missing = false;
  for (const it of items) {
    const pr = ctx.productsById[it.productId];
    if (!pr) { missing = true; continue; }
    buy += num(pr.cost) * Math.max(1, Math.round(num(it.qty)) || 1);
    primary = primary || pr;
  }
  const meta = productMeta(primary, ctx.settings);
  let commit = 0;
  for (const c of ctx.commitments) {
    if (c.mode === 'per_order') commit += num(c.amount);
    else if (c.mode === 'percent') commit += (num(c.amount) / 100) * num(parcel.montant);
  }
  const net = num(parcel.net);
  const assigned = !!parcel.noProduct || (items.length > 0 && !missing);
  return { net, buy, meta, commit, profit: net - buy - meta - commit, assigned };
}

/**
 * التركيبات الممكنة لمبلغ طرد. كل عنصر: {sig, items, source}
 * source: saved (أكدها المستخدم سابقاً) | exact (منتج بسعره) | multiple (مضاعف سعر منتج) | pair (منتجان)
 * لا نخمّن بصمت: الواجهة تسأل عند وجود أكثر من احتمال.
 */
export function candidatesFor(montant, products, combos) {
  const m = Math.round(num(montant));
  const out = [];
  const seen = new Set();
  const push = (items, source, comboId) => {
    const sig = sigOf(items);
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ sig, items, source, comboId });
  };
  const known = new Set(products.map((p) => p.id));
  for (const c of combos) {
    if (Math.round(num(c.price)) === m && c.items.length && c.items.every((i) => known.has(i.productId))) push(c.items, 'saved', c.id);
  }
  const ps = products.filter((p) => Math.round(num(p.price)) > 0);
  for (const p of ps) {
    const unit = Math.round(num(p.price));
    if (m % unit === 0 && m / unit >= 1 && m / unit <= 20) push([{ productId: p.id, qty: m / unit }], m === unit ? 'exact' : 'multiple');
  }
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (Math.round(num(ps[i].price)) + Math.round(num(ps[j].price)) === m) push([{ productId: ps[i].id, qty: 1 }, { productId: ps[j].id, qty: 1 }], 'pair');
    }
  }
  const rank = { saved: 0, exact: 1, multiple: 2, pair: 3 };
  return out.sort((a, b) => rank[a.source] - rank[b.source]);
}

/** الاختيار الافتراضي لمبلغ: {sig, guess} أو null إذا وجب سؤال المستخدم */
export function defaultChoice(cands) {
  const saved = cands.filter((c) => c.source === 'saved');
  if (saved.length === 1) return { sig: saved[0].sig, guess: false };
  if (saved.length > 1) return null;
  if (cands.length === 1) return { sig: cands[0].sig, guess: cands[0].source !== 'exact' };
  return null;
}

/** ربح ورقة استلام كاملة (الطرود + الالتزامات الثابتة لكل ورقة) */
export function decharge(d, ctx) {
  const t = { count: 0, sales: 0, net: 0, courier: 0, buy: 0, meta: 0, commit: 0, profit: 0, unassigned: 0 };
  for (const p of d.parcels) {
    const r = parcelCalc(p, ctx);
    t.count += 1;
    t.sales += num(p.montant);
    t.net += r.net;
    t.courier += num(p.montant) - r.net;
    t.buy += r.buy;
    t.meta += r.meta;
    t.commit += r.commit;
    t.profit += r.profit;
    if (!r.assigned) t.unassigned += 1;
  }
  const perBatch = ctx.commitments.filter((c) => c.mode === 'per_batch').reduce((a, c) => a + num(c.amount), 0);
  t.commit += perBatch;
  t.profit -= perBatch;
  return t;
}

export function sumTotals(list) {
  const t = { count: 0, sales: 0, net: 0, courier: 0, buy: 0, meta: 0, commit: 0, profit: 0, unassigned: 0 };
  for (const x of list) for (const k of Object.keys(t)) t[k] += x[k];
  return t;
}

/**
 * توزيع صافي الربح. سليم يأخذ نسبته أولاً من الصافي،
 * والباقي يتقسم حسب restSplit. الباقي من التقريب يذهب لأول طرف.
 */
export function splitProfit(profit, settings) {
  const s = settings || DEFAULT_SETTINGS;
  const salim = Math.round((profit * num(s.salimPct)) / 100);
  const rest = Math.round(profit) - salim;
  const parts = s.restSplit.map((r) => ({ name: r.name, pct: num(r.pct), amount: Math.round((rest * num(r.pct)) / 100) }));
  if (parts.length) {
    const drift = rest - parts.reduce((a, p) => a + p.amount, 0);
    // نصحّح فارق التقريب فقط إذا كانت النسب مجموعها 100
    if (Math.abs(parts.reduce((a, p) => a + p.pct, 0) - 100) < 0.001) parts[0].amount += drift;
  }
  const people = [{ name: s.salimName, pct: num(s.salimPct), amount: salim, note: 'من الصافي' }];
  const restTotal = parts.reduce((a, p) => a + p.pct, 0) || 1;
  for (const p of parts) people.push({ ...p, note: `${p.pct}% من الباقي`, effectivePct: ((100 - num(s.salimPct)) * p.pct) / 100 });
  void restTotal;
  return people;
}

/** مجموع نسب التقسيم يجب أن يكون 100 */
export const splitIsValid = (s) => Math.abs((s.restSplit || []).reduce((a, r) => a + num(r.pct), 0) - 100) < 0.001;

/** تجميع الزبائن من كل الطرود (مفتاحهم رقم الهاتف) */
export function buildCustomers(decharges, productsById = {}) {
  const map = new Map();
  for (const d of decharges) {
    for (const p of d.parcels) {
      const phone = normPhone(p.phone);
      const key = phone || `n:${p.name}`;
      let c = map.get(key);
      if (!c) {
        c = { key, name: p.name, phone, rawPhone: p.phone, wilaya: p.wilaya, commune: p.commune, orders: 0, spent: 0, last: '', products: new Set() };
        map.set(key, c);
      }
      c.orders += 1;
      c.spent += num(p.montant);
      if (!c.last || d.date > c.last) {
        c.last = d.date;
        c.wilaya = p.wilaya || c.wilaya;
        c.commune = p.commune || c.commune;
        c.name = p.name || c.name;
      }
      for (const it of parcelItems(p)) { const pr = productsById[it.productId]; if (pr) c.products.add(pr.name); }
    }
  }
  return [...map.values()].sort((a, b) => b.spent - a.spent);
}

/**
 * ملف CSV لرفعه في Meta كجمهور مخصص (Custom Audience) ثم Lookalike.
 * الأعمدة: phone, fn, ln, ct, st, country, value (value لإنشاء Lookalike حسب القيمة)
 */
export function metaCsv(customers) {
  const rows = [['phone', 'fn', 'ln', 'ct', 'st', 'country', 'value']];
  for (const c of customers) {
    if (!c.phone) continue;
    const parts = String(c.name || '').trim().split(/\s+/);
    const fn = parts.shift() || '';
    const ln = parts.join(' ');
    rows.push([c.phone, fn, ln, c.commune || '', c.wilaya || '', 'DZ', Math.round(c.spent)]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** تصفية أوراق الاستلام حسب الفترة */
export function filterPeriod(list, period, now = new Date()) {
  if (period === 'all') return list;
  const iso = (d) => d.toISOString().slice(0, 10);
  let from;
  if (period === 'today') from = iso(now);
  else if (period === '7d') from = iso(new Date(now.getTime() - 6 * 864e5));
  else if (period === '30d') from = iso(new Date(now.getTime() - 29 * 864e5));
  else if (period === 'month') from = iso(now).slice(0, 7) + '-01';
  else return list;
  return list.filter((d) => d.date >= from);
}
