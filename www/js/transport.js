// النقل: كيف يصل التطبيق إلى الشيت وEcotrack.
//  1) تطبيق الأندرويد (APK): اتصال مباشر (لا قيود CORS)، والـ token محفوظ على الهاتف فقط.
//  2) إن وُجد وسيط Supabase يُستعمل. 3) غير ذلك نحاول مباشرة ونشرح الخطأ.
import { sync } from './core.js';
import { sheetCsvUrl } from './crm.js';
import { P } from './i18n.js';

const KEY = 'arbahi.eco';
export const isNative = () => !!globalThis.Capacitor?.isNativePlatform?.();

export const ecoConfig = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
export const saveEcoConfig = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* تجاهل */ } };
const cleanBase = (u) => String(u || '').trim().replace(/\/+$/, '').replace(/\/api\/v1.*$/, '');

async function directCsv(url) {
  const u = sheetCsvUrl(url);
  if (!u) throw new Error(P('crm.err.sheetUrl'));
  let r;
  try { r = await fetch(u); } catch { throw new Error(isNative() ? P('err.offline') : P('crm.err.needApp')); }
  const text = await r.text();
  if (!r.ok || /^\s*<!doctype html|^\s*<html/i.test(text)) throw new Error(P('crm.err.sheetPrivate'));
  return { csv: text };
}

async function directEco({ method = 'GET', path, query, body }) {
  const c = ecoConfig();
  const base = cleanBase(c.url);
  if (!base || !c.token) throw new Error(P('crm.err.noEco'));
  const u = new URL(`${base}/api/v1/${String(path).replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(query || {})) { if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, String(x))); else u.searchParams.set(k, String(v)); }
  let r;
  try {
    r = await fetch(u.toString(), {
      method,
      headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error(isNative() ? P('err.offline') : P('crm.err.needApp')); }
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

export const transport = {
  async invoke(b) {
    const viaServer = !isNative() && sync.connected();
    if (b.action === 'csv') return viaServer ? sync.invoke(b) : directCsv(b.url);
    if (b.action === 'eco') return viaServer && !ecoConfig().token ? sync.invoke(b) : directEco(b);
    throw new Error('?');
  },
};
