// قراءة ورقة "Décharge de paiement" من Ecotrack.
// الفكرة: نعتمد على أرقام التتبع كمرساة لكل سطر، ونوزّع باقي النصوص على الأعمدة
// حسب مواقعها. هذا يتحمل أسماء الزبائن والبلديات الطويلة التي تنزل لسطرين.
import { P } from './i18n.js';

const TRACK_RE = /^[A-Za-z]{2,}[A-Za-z0-9]*\d{6,}$/;
const NUM_RE = /^-?\d+(?:[.,]\d+)?$/;
const PHONE_RE = /^(?:0|\+?213)\d{9}$/;

// مواقع مراكز الأعمدة الافتراضية (إن لم نجد سطر العناوين)
const DEFAULT_CENTERS = { ref: 152, dest: 228, tel: 266, wilaya: 300, commune: 333 };

const clean = (s) =>
  String(s ?? '')
    .normalize('NFKC') // يحوّل الحروف العربية المشكّلة (ﺑﻮ) إلى حروف عادية
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const parseNum = (s) => parseFloat(String(s).replace(',', '.'));
const center = (it) => it.x + it.w / 2;

/** pdf.js textContent -> عناصر بسيطة */
export function toItems(textContent) {
  const out = [];
  for (const it of textContent.items) {
    const str = clean(it.str);
    if (!str) continue;
    out.push({ str, x: it.transform[4], y: it.transform[5], w: it.width || 0, rtl: it.dir === 'rtl' });
  }
  return out;
}

/** يجمع عناصر خلية واحدة (قد تكون على عدة أسطر) في نص واحد */
function joinCell(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines
    .map((l) => {
      const rtl = l.items.filter((i) => i.rtl).length > l.items.length / 2;
      l.items.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
      return l.items.map((i) => i.str).join(' ');
    })
    .join(' ')
    .trim();
}

function findHeaderCenters(items) {
  // نقرأ العناوين من سطر "Tracking" فقط (ملخص الورقة في الأعلى فيه كلمة Réference أيضاً)
  const trk = items.find((i) => /^Tracking$/i.test(i.str));
  const pool = trk ? items.filter((i) => Math.abs(i.y - trk.y) <= 4) : items;
  const find = (re) => pool.find((i) => re.test(i.str));
  const ref = find(/^R[ée]f[ée]rence$/i);
  const dest = find(/^D[ée]stinataire$/i);
  const tel = find(/^T[ée]l[ée]phone$/i);
  const wil = find(/^Wilaya$/i);
  const com = find(/^Commune$/i);
  if (dest && tel && wil && com) {
    return {
      ref: ref ? center(ref) : DEFAULT_CENTERS.ref,
      dest: center(dest), tel: center(tel), wilaya: center(wil), commune: center(com), found: true,
    };
  }
  return { ...DEFAULT_CENTERS, found: false };
}

function parseTopBlock(items) {
  const info = {};
  const refItem = items.find((i) => /^#\d+$/.test(i.str));
  if (!refItem) return info;
  info.ref = refItem.str;
  const line = items.filter((i) => Math.abs(i.y - refItem.y) <= 3);
  const used = new Set([refItem]);
  const date = line.find((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.str));
  if (date) { info.date = date.str; used.add(date); }
  const total = line.find((i) => /^[\d\s]+DA$/i.test(i.str));
  if (total) { info.total = parseNum(total.str.replace(/DA/i, '').replace(/\s/g, '')); used.add(total); }
  const count = line.find((i) => !used.has(i) && /^\d+$/.test(i.str));
  if (count) { info.count = parseInt(count.str, 10); used.add(count); }
  const rest = line.filter((i) => !used.has(i)).sort((a, b) => a.x - b.x);
  if (rest.length) info.sender = rest.map((i) => i.str).join(' ');
  return info;
}

/** يقرأ صفحة واحدة: يرجع {rows, totals, info, headerFound} */
export function parsePage(items, carry = {}) {
  const anchors = items.filter((i) => TRACK_RE.test(i.str) && i.x < 120).sort((a, b) => b.y - a.y);
  const info = parseTopBlock(items);
  const hc = findHeaderCenters(items);
  const centers = hc.found ? hc : carry.centers || hc;
  const rows = [];
  if (!anchors.length) return { rows, totals: null, info, centers };

  // مدى كل سطر: نصف المسافة إلى المرساة المجاورة من كل جهة
  const gap = anchors.map((a, i) => ({
    up: i > 0 ? (anchors[i - 1].y - a.y) / 2 : null,
    down: i < anchors.length - 1 ? (a.y - anchors[i + 1].y) / 2 : null,
  }));
  gap.forEach((g, i) => {
    if (g.up === null) g.up = g.down ?? 10;
    if (g.down === null) g.down = g.up ?? 10;
    void i;
  });

  const bucket = anchors.map(() => []);
  const rest = [];
  for (const it of items) {
    if (anchors.includes(it)) continue;
    let bi = -1, best = Infinity;
    anchors.forEach((a, i) => {
      const d = Math.abs(it.y - a.y);
      if (d < best) { best = d; bi = i; }
    });
    const dy = it.y - anchors[bi].y; // موجب = فوق المرساة
    const reach = (dy >= 0 ? gap[bi].up : gap[bi].down) + 1;
    if (Math.abs(dy) <= reach) bucket[bi].push(it);
    else rest.push(it);
  }

  anchors.forEach((a, i) => {
    const cell = bucket[i];
    // أعمدة الأرقام: كل ما كان يمين عمود البلدية
    const numericX = centers.commune + 10; // أول عمود رقمي (الوزن) مركزه بعد البلدية
    const nums = cell.filter((c) => NUM_RE.test(c.str) && center(c) > numericX).sort((x, y) => x.x - y.x);
    const texts = cell.filter((c) => !nums.includes(c));
    const phoneItem = texts.find((c) => PHONE_RE.test(c.str.replace(/\s/g, '')));
    const byCol = { ref: [], dest: [], wilaya: [], commune: [] };
    const b1 = (centers.ref + centers.dest) / 2; // حد المرجع | الزبون
    const b2 = (centers.tel + centers.wilaya) / 2; // حد الزبون | الولاية
    const b3 = (centers.wilaya + centers.commune) / 2; // حد الولاية | البلدية
    for (const t of texts) {
      if (t === phoneItem) continue;
      const c = center(t);
      if (c < b1) byCol.ref.push(t);
      else if (c < b2) byCol.dest.push(t);
      else if (c < b3) byCol.wilaya.push(t);
      else byCol.commune.push(t);
    }
    const v = nums.map((n) => parseNum(n.str));
    // الترتيب: وزن، مبلغ، توصيل، sur-facturation، عمولة، تخزين، تعريفة وزن، صافي
    const row = {
      tracking: a.str,
      reference: joinCell(byCol.ref),
      name: joinCell(byCol.dest),
      phone: phoneItem ? phoneItem.str.replace(/\s/g, '') : '',
      wilaya: joinCell(byCol.wilaya),
      commune: joinCell(byCol.commune),
      weight: v[0] ?? 0,
      montant: v[1] ?? 0,
      delivery: v[2] ?? 0,
      surcharge: v[3] ?? 0,
      commission: v[4] ?? 0,
      otherFees: (v[5] ?? 0) + (v[6] ?? 0),
      net: v.length ? v[v.length - 1] : 0,
      productId: null,
    };
    const expected = row.montant - row.delivery - row.surcharge - row.commission - row.otherFees;
    row.ok = v.length === 8 && Math.abs(expected - row.net) <= 1;
    rows.push(row);
  });

  // سطر المجاميع: أول سطر تحت آخر مرساة فيه 4 أرقام فأكثر
  let totals = null;
  const lastY = anchors[anchors.length - 1].y;
  const below = rest.filter((i) => i.y < lastY && NUM_RE.test(i.str));
  const lines = new Map();
  for (const it of below) {
    const k = Math.round(it.y / 3);
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k).push(it);
  }
  const cand = [...lines.entries()].sort((a, b) => b[0] - a[0]).map((e) => e[1]).find((l) => l.length >= 4);
  if (cand) {
    cand.sort((a, b) => a.x - b.x);
    const vals = cand.map((i) => parseNum(i.str));
    totals = { montant: vals[0], net: vals[vals.length - 1] };
  }
  return { rows, totals, info, centers };
}

/** يجمع كل صفحات الملف في ورقة استلام واحدة */
export function parsePages(pagesItems) {
  const result = { ref: '', date: '', sender: '', count: 0, total: 0, rows: [], totals: null, warnings: [] };
  let carry = {};
  for (const items of pagesItems) {
    const p = parsePage(items, carry);
    carry = { centers: p.centers };
    if (p.info.ref && !result.ref) Object.assign(result, p.info);
    result.rows.push(...p.rows);
    if (p.totals) result.totals = p.totals;
  }
  const seen = new Set();
  result.rows = result.rows.filter((r) => (seen.has(r.tracking) ? false : seen.add(r.tracking)));

  const sumNet = result.rows.reduce((a, r) => a + r.net, 0);
  const sumMontant = result.rows.reduce((a, r) => a + r.montant, 0);
  if (!result.rows.length) result.warnings.push(P('err.nothing'));
  if (result.count && result.count !== result.rows.length)
    result.warnings.push(P('err.count', { a: result.count, b: result.rows.length }));
  if (result.total && Math.abs(result.total - sumNet) > 1)
    result.warnings.push(P('err.total', { a: result.total, b: sumNet }));
  if (result.totals && Math.abs(result.totals.montant - sumMontant) > 1)
    result.warnings.push(P('err.sales', { a: result.totals.montant, b: sumMontant }));
  const bad = result.rows.filter((r) => !r.ok).length;
  if (bad) result.warnings.push(P('err.bad', { n: bad }));
  const noPhone = result.rows.filter((r) => !r.phone).length;
  if (noPhone) result.warnings.push(P('err.nophone', { n: noPhone }));
  result.sumNet = sumNet;
  result.sumMontant = sumMontant;
  if (!result.date) result.date = new Date().toISOString().slice(0, 10);
  return result;
}

/** قراءة ملف PDF كامل باستعمال مكتبة pdf.js الممررة */
export async function parsePdf(data, pdfjsLib) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    pages.push(toItems(await page.getTextContent()));
  }
  return parsePages(pages);
}
