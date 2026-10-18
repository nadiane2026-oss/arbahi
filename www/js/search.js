// بحث تقريبي: لا يشترط تطابق الكلمة تماماً (يتجاوز الحركات والهمزات وأخطاء الإملاء البسيطة)
export function normText(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[ً-ٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const toks = (s) => normText(s).split(' ').filter(Boolean);

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** درجة تطابق كلمة البحث مع كلمات النص: 0 = لا تطابق */
function tokenScore(q, words) {
  let best = 0;
  for (const w of words) {
    if (w === q) return 4;
    if (w.startsWith(q)) best = Math.max(best, 3);
    else if (q.length >= 2 && w.includes(q)) best = Math.max(best, 2);
    else if (q.length >= 4) {
      const max = q.length >= 7 ? 2 : 1;
      if (lev(q, w, max) <= max || lev(q, w.slice(0, q.length), max) <= max) best = Math.max(best, 1);
    }
  }
  return best;
}

/** درجة كاملة (كل كلمات البحث يجب أن تجد ما يقابلها) */
export function score(query, text) {
  const qs = toks(query);
  if (!qs.length) return 0;
  const words = toks(text);
  const flat = words.join('');
  let total = 0;
  for (const q of qs) {
    let s = tokenScore(q, words);
    if (!s && /^\d{3,}$/.test(q) && flat.includes(q)) s = 2; // أرقام الهاتف
    if (!s) return 0;
    total += s;
  }
  return total;
}

export function searchAll(query, { orders, products, pages }) {
  const rank = (list, textOf) => list.map((x) => ({ x, s: score(query, textOf(x)) })).filter((r) => r.s).sort((a, b) => b.s - a.s).map((r) => r.x);
  return {
    orders: rank(orders, (o) => [o.name, o.phone, o.wilaya, o.commune, o.tracking, o.eco?.label, ...(o.items || []).flatMap((i) => [i.name, i.sku, i.variant])].join(' ')).slice(0, 40),
    products: rank(products, (p) => [p.name, p.skus, p.variants].join(' ')).slice(0, 20),
    pages: rank(pages, (p) => p.text).slice(0, 8),
  };
}
