// تفضيلات المستخدم: اللغة (معاً / عربي / English) والمظهر (تلقائي / فاتح / داكن)
const LS = (() => { try { return globalThis.localStorage || null; } catch { return null; } })();
const read = (k, d, ok) => { try { const v = LS?.getItem(k); return ok.includes(v) ? v : d; } catch { return d; } };
const write = (k, v) => { try { LS?.setItem(k, v); } catch { /* التخزين غير متاح: نتجاهل */ } };

export const LANGS = ['both', 'ar', 'en'];
export const THEMES = ['auto', 'light', 'dark'];
export const prefs = {
  lang: read('arbahi.lang', 'both', LANGS),
  theme: read('arbahi.theme', 'auto', THEMES),
};

const subs = new Set();
export const onPrefs = (fn) => { subs.add(fn); return () => subs.delete(fn); };

export function applyPrefs() {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;
  r.dir = prefs.lang === 'en' ? 'ltr' : 'rtl';
  r.lang = prefs.lang === 'en' ? 'en' : 'ar';
  if (prefs.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', prefs.theme);
  const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17171a' : '#ececef');
}

export function setLang(l) { if (!LANGS.includes(l)) return; prefs.lang = l; write('arbahi.lang', l); applyPrefs(); subs.forEach((f) => f()); }
export function setTheme(t) { if (!THEMES.includes(t)) return; prefs.theme = t; write('arbahi.theme', t); applyPrefs(); subs.forEach((f) => f()); }
export const nextOf = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];

if (typeof matchMedia !== 'undefined') matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => prefs.theme === 'auto' && applyPrefs());
