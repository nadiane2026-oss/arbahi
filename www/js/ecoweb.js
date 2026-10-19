// قراءة مراحل الدفع من صفحات موقع Ecotrack نفسه (لأن الـAPI لا يعرضها).
// يدخل التطبيق بحسابك (البريد وكلمة السر المحفوظان على هاتفك فقط) ثم يفتح الصفحات الأربع،
// ويبحث فيها عن أرقام التتبع المعروفة عنده، فيعرف في أي مرحلة كل طلبية.
import { ecoConfig, isNative } from './transport.js';

export const WEB_PAGES = [
  { stage: 'uncollected', path: '/livraison/non/encaisse' },
  { stage: 'collected', path: '/livraison/cashOut' },
  { stage: 'ready', path: '/livraison/cashin' },
  { stage: 'paid', path: '/livraison/cashin/history' },
];
export const webInfo = { at: 0, ok: null, error: '', pages: {} };

const base = () => String(ecoConfig().url || '').trim().replace(/\/+$/, '').replace(/\/api\/v1.*$/, '');
const HTTP = () => globalThis.Capacitor?.Plugins?.CapacitorHttp;

async function req(method, url, { data, headers = {} } = {}) {
  const r = await HTTP().request({
    url, method, headers: { Accept: 'text/html,application/xhtml+xml', ...headers }, data,
    responseType: 'text', connectTimeout: 20000, readTimeout: 30000,
  });
  return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data || ''), url: r.url || url };
}

const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1] || '';
export const isLoginPage = (html) => /type\s*=\s*["']password["']/i.test(html);

/** يستخرج حقول نموذج الدخول (رمز CSRF وأسماء الحقول) */
export function parseLoginForm(html) {
  const inputs = [...html.matchAll(/<input\b[^>]*>/gi)].map((m) => m[0]);
  const hidden = {};
  let userName = '', passName = '';
  for (const t of inputs) {
    const type = (attr(t, 'type') || 'text').toLowerCase(), name = attr(t, 'name');
    if (!name) continue;
    if (type === 'hidden') hidden[name] = attr(t, 'value');
    else if (type === 'password' && !passName) passName = name;
    else if (['text', 'email'].includes(type) && !userName && !passName) userName = name;
  }
  const form = (html.match(/<form\b[^>]*>/gi) || []).find((f) => /login|connexion|auth/i.test(attr(f, 'action'))) || (html.match(/<form\b[^>]*>/i) || [''])[0];
  const meta = (html.match(/<meta[^>]*name=["']csrf-token["'][^>]*>/i) || [''])[0];
  if (meta && !hidden._token) hidden._token = attr(meta, 'content');
  return { hidden, userName: userName || 'email', passName: passName || 'password', action: attr(form, 'action') };
}

export async function webLogin() {
  const c = ecoConfig(), b = base();
  if (!b || !c.webUser || !c.webPass) throw new Error('web-config');
  const home = await req('GET', `${b}/login`);
  const f = parseLoginForm(home.text);
  const body = new URLSearchParams({ ...f.hidden, [f.userName]: c.webUser, [f.passName]: c.webPass }).toString();
  const action = f.action ? new URL(f.action, home.url).toString() : `${b}/login`;
  const r = await req('POST', action, { data: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${b}/login` } });
  if (isLoginPage(r.text)) throw new Error('login-failed');
  return true;
}

const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i += 97) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length; };

/** يجلب صفحة (مع ترقيم الصفحات) ويرجع النص الكامل */
async function fetchAll(path, maxPages = 6) {
  const b = base();
  let all = '', prev = '', status = 0;
  for (let p = 1; p <= maxPages; p++) {
    const r = await req('GET', `${b}${path}${p > 1 ? `?page=${p}` : ''}`);
    status = r.status;
    if (isLoginPage(r.text)) throw new Error('session');
    if (r.status >= 400) break;
    const h = hash(r.text);
    if (p > 1 && h === prev) break;
    prev = h; all += '\n' + r.text;
    if (!new RegExp(`[?&]page=${p + 1}\\b`).test(r.text)) break;
  }
  return { html: all, status };
}

/** يرجع Map(tracking → stage) لكل أرقام التتبع المعروفة التي وُجدت في الصفحات */
export async function fetchWebStages(trackings) {
  webInfo.at = Date.now(); webInfo.error = ''; webInfo.pages = {};
  const c = ecoConfig();
  if (!isNative() || !HTTP() || !c.webUser || !c.webPass || !c.url) { webInfo.ok = null; return null; }
  const list = [...new Set(trackings)].filter((t) => String(t).length >= 6);
  const out = new Map();
  try {
    let pages;
    const run = async () => { const res = []; for (const pg of WEB_PAGES) res.push({ ...pg, ...(await fetchAll(pg.path)) }); return res; };
    try { pages = await run(); } catch (e) { if (e.message !== 'session') throw e; await webLogin(); pages = await run(); }
    for (const pg of pages) {
      const lower = pg.html.toLowerCase();
      let n = 0;
      for (const t of list) if (lower.includes(String(t).toLowerCase())) { n++; out.set(t, pg.stage); /* الصفحات مرتبة، فالأخيرة تغلب */ }
      webInfo.pages[pg.stage] = { status: pg.status, size: pg.html.length, found: n };
    }
    webInfo.ok = true;
    return out;
  } catch (e) {
    webInfo.ok = false; webInfo.error = e.message === 'login-failed' ? 'login-failed' : (e.message || String(e));
    return null;
  }
}
