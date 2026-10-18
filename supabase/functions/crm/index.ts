// وسيط أرباحي: يقرأ شيتات Google ويكلّم Ecotrack من السيرفر (الـ token يبقى سرياً هنا ولا يصل للتطبيق).
// الصق هذا الملف في Supabase > Edge Functions > crm، ثم أضف الأسرار ECOTRACK_URL و ECOTRACK_TOKEN.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ALLOWED = new Set([
  'validate/token', 'get/orders', 'get/tracking/info', 'get/trackings/info', 'create/order', 'create/orders',
  'update/order', 'delete/order', 'valid/order', 'valid/returns', 'get/maj', 'ask/for/order/return',
]);

// رابط تصدير CSV لشيت عام: نقبل رابط الشيت العادي ونستخرج المعرّف و gid
function csvUrl(input: string): string | null {
  const m = String(input).match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/(?:e\/)?([\w-]+)/);
  if (!m) return null;
  const gid = String(input).match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
  if (/\/d\/e\//.test(input)) return input; // رابط "نشر على الويب" جاهز
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  if (b.action === 'csv') {
    const url = csvUrl(b.url);
    if (!url) return json({ error: 'رابط شيت غير صالح' }, 400);
    const r = await fetch(url, { redirect: 'follow' });
    const text = await r.text();
    if (!r.ok || /^\s*<!doctype html|^\s*<html/i.test(text)) return json({ error: 'تعذر قراءة الشيت: تأكد أنه "Anyone with the link: Viewer"', status: r.status }, 400);
    return json({ csv: text });
  }

  if (b.action === 'eco') {
    const base = Deno.env.get('ECOTRACK_URL');
    const token = Deno.env.get('ECOTRACK_TOKEN');
    if (!base || !token) return json({ error: 'ECOTRACK_URL / ECOTRACK_TOKEN غير مضبوطين في أسرار Supabase' }, 500);
    const path = String(b.path || '').replace(/^\/+|\/+$/g, '');
    if (!ALLOWED.has(path)) return json({ error: 'مسار غير مسموح' }, 403);
    const u = new URL(`${base.replace(/\/+$/, '')}/api/v1/${path}`);
    for (const [k, v] of Object.entries(b.query || {})) {
      if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, String(x)));
      else u.searchParams.set(k, String(v));
    }
    if (path === 'validate/token' && !u.searchParams.has('api_token')) u.searchParams.set('api_token', token);
    const method = ['GET', 'POST', 'DELETE'].includes(b.method) ? b.method : 'GET';
    const r = await fetch(u, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(b.body ? { 'Content-Type': 'application/json' } : {}) },
      body: b.body && method !== 'GET' ? JSON.stringify(b.body) : undefined,
    });
    const text = await r.text();
    let data: unknown; try { data = JSON.parse(text); } catch { data = text; }
    return json({ status: r.status, data });
  }
  return json({ error: 'unknown action' }, 400);
});
