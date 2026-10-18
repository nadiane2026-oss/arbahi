// أدوات صغيرة مشتركة

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** يحوّل نصاً مثل "1 250,5" إلى رقم. القيمة الفارغة تعطي 0. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** هل القيمة مُدخلة فعلاً (لا فارغة ولا undefined)؟ */
export const isSet = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

/** 126950 -> "126 950" */
export function fmt(n, digits = 0) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  const fixed = Math.abs(v).toFixed(digits);
  const [i, d] = fixed.split('.');
  return sign + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? '.' + d : '');
}
export const fmtDA = (n, digits = 0) => `${fmt(n, digits)} DA`;

/** رقم هاتف جزائري -> صيغة دولية E.164 (+213...). يرجع '' إن لم يمكن. */
export function normPhone(p) {
  let d = String(p ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('213') && d.length === 12) return '+' + d;
  if (d.startsWith('0') && d.length === 10) return '+213' + d.slice(1);
  if (d.length === 9 && /^[567]/.test(d)) return '+213' + d;
  return '';
}

/** نص يبقى من اليسار لليمين داخل جملة عربية (تواريخ، هواتف، أرقام) */
export const ltr = (s) => `<bdi dir="ltr">${esc(s)}</bdi>`;
/** نفس الفكرة داخل نص عادي لا يقبل وسوم (مثل خيارات select) */
export const ltrText = (s) => '\u2066' + s + '\u2069';
/** مبلغ بالدينار جاهز للإدراج في HTML */
export const daHtml = (n, digits = 0) => `<bdi dir="ltr">${fmt(n, digits)} DA</bdi>`;

export const today = () => new Date().toISOString().slice(0, 10);

export function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
