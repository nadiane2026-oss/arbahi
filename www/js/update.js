// فحص التحديثات: يقارن رقم بناء هذا التطبيق بآخر إصدار منشور في GitHub
import { P } from './i18n.js';
const REPO = 'nadiane2026-oss/arbahi';
export const APK_URL = `https://github.com/${REPO}/releases/download/latest/arbahi.apk`;
export const update = { available: false, build: 0, latest: 0, checking: false };
const listeners = new Set();
update.on = (f) => { listeners.add(f); return () => listeners.delete(f); };

export async function checkUpdate() {
  if (update.checking) return update;
  update.checking = true;
  try {
    const mine = await fetch('version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    update.build = Number(mine?.build) || 0;
    if (!update.build) return update; // نسخة محلية بلا رقم بناء: لا نزعج
    const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/latest`, { headers: { Accept: 'application/vnd.github+json' } }).then((r) => (r.ok ? r.json() : null));
    const m = String(rel?.body || '').match(/build\s+(\d+)/i);
    update.latest = m ? Number(m[1]) : 0;
    update.available = update.latest > update.build;
  } catch { /* بلا إنترنت: نتجاهل */ } finally { update.checking = false; listeners.forEach((f) => f()); }
  return update;
}
export const updateText = () => P('upd.available', { n: update.latest });
