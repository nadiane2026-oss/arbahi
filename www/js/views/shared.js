// أدوات مشتركة بين شاشتي الاستيراد وتفاصيل الورقة: تسمية التركيبات وخياراتها
import { candidatesFor, sigOf, parcelItems } from '../calc.js';
import { fmt } from '../util.js';
import { P } from '../i18n.js';

/** "2 × منظف زجاج + أسبيراتور" نص عادي */
export function itemsLabel(items, byId) {
  return items
    .map((i) => {
      const n = byId[i.productId]?.name || '?';
      const q = Math.max(1, Math.round(Number(i.qty)) || 1);
      return q > 1 ? `${q} × ${n}` : n;
    })
    .join(' + ');
}

/** خيارات اختيار محتوى طرد: الاحتمالات من المبلغ أولاً، ثم كل منتج مفرد. كل خيار {sig, items, label} */
export function optionsFor(montant, products, combos, current = []) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const out = [];
  const seen = new Set();
  const add = (items, tag) => {
    const sig = sigOf(items);
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ sig, items, label: itemsLabel(items, byId) + (tag ? ` (${tag})` : '') });
  };
  for (const c of candidatesFor(montant, products, combos)) add(c.items, '');
  if (current.length && current.every((i) => byId[i.productId])) add(current, '');
  for (const p of products) add([{ productId: p.id, qty: 1 }], p.price ? `${fmt(p.price)} DA` : '');
  return out;
}

export const currentSig = (p) => { const it = parcelItems(p); return it.length ? sigOf(it) : p.noProduct ? 'none' : ''; };
export const noneLabel = () => P('sheet.noProduct');
