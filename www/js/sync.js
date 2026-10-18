// المزامنة مع Supabase بدون أي مكتبة: فقط fetch إلى واجهة REST والمصادقة.
// الجدول public.docs (انظر supabase/schema.sql). الحل عند التعارض: الأحدث يكسب (updated_at).
import { P } from './i18n.js';

const CFG_KEY = 'arbahi.sync';

export function createSync(store, { fetchImpl, storage, now = () => Date.now() } = {}) {
  const F = (...a) => (fetchImpl || fetch)(...a);
  const S = storage || (typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem() {}, removeItem() {} });
  const sync = { status: 'off', message: '', lastSync: 0 };
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f());
  sync.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  const load = () => { try { return JSON.parse(S.getItem(CFG_KEY) || '{}'); } catch { return {}; } };
  const save = (c) => S.setItem(CFG_KEY, JSON.stringify(c));
  sync.config = () => load();
  sync.connected = () => !!load().session;
  const set = (status, message = '') => { sync.status = status; sync.message = message; emit(); };
  if (sync.connected()) sync.status = 'idle';

  const clean = (u) => String(u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '');

  async function authCall(cfg, path, body) {
    const r = await F(`${cfg.url}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = j.error_description || j.msg || j.message || j.error || `HTTP ${r.status}`;
      const e = new Error(m); e.status = r.status; throw e;
    }
    return j;
  }
  const toSession = (j) => ({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: now() + (j.expires_in || 3600) * 1000,
    user_id: j.user?.id,
  });

  sync.login = async (url, key, email, password) => {
    const cfg = { ...load(), url: clean(url), key: String(key || '').trim(), email: String(email || '').trim() };
    if (!/^https?:\/\//.test(cfg.url)) throw new Error(P('err.badUrl'));
    if (!cfg.key) throw new Error(P('err.noKey'));
    set('syncing', P('err.signing'));
    try {
      const j = await authCall(cfg, 'token?grant_type=password', { email: cfg.email, password });
      cfg.session = toSession(j);
      if (!cfg.session.user_id) throw new Error(P('err.badResponse'));
      save(cfg);
      set('idle');
    } catch (e) {
      set(sync.connected() ? 'idle' : 'off', e.message);
      throw e;
    }
  };

  sync.logout = () => {
    const c = load();
    save({ url: c.url, key: c.key, email: c.email }); // نحتفظ بالرابط والمفتاح فقط
    set('off');
  };

  async function token() {
    const cfg = load();
    if (!cfg.session) throw new Error(P('err.notConnected'));
    if (cfg.session.expires_at - now() > 60000) return { cfg, tok: cfg.session.access_token };
    try {
      const j = await authCall(cfg, 'token?grant_type=refresh_token', { refresh_token: cfg.session.refresh_token });
      cfg.session = toSession(j);
      save(cfg);
      return { cfg, tok: cfg.session.access_token };
    } catch (e) {
      if (e.status === 400 || e.status === 401) { const c = load(); delete c.session; save(c); set('off', P('err.expired')); }
      throw e;
    }
  }

  const headers = (cfg, tok, extra = {}) => ({ apikey: cfg.key, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...extra });

  async function pull(cfg, tok) {
    let total = 0;
    const PAGE = 500;
    let seenMax = '';
    for (let offset = 0; ; offset += PAGE) {
      const q = new URLSearchParams({ select: 'kind,id,data,updated_at,deleted,synced_at', order: 'synced_at.asc,id.asc', limit: String(PAGE), offset: String(offset) });
      if (cfg.cursor) q.set('synced_at', `gte.${cfg.cursor}`);
      const r = await F(`${cfg.url}/rest/v1/docs?${q}`, { headers: headers(cfg, tok) });
      if (!r.ok) throw new Error(await errText(r));
      const rows = await r.json();
      total += store.applyRemote(rows);
      for (const x of rows) if (x.synced_at > seenMax) seenMax = x.synced_at;
      if (rows.length < PAGE) break;
    }
    if (seenMax) {
      // نرجع دقيقتين للخلف لتفادي ضياع صفوف أُكملت معاملتها متأخرة (إعادة جلبها آمنة)
      const next = new Date(Date.parse(seenMax) - 120000).toISOString();
      const c = load();
      if (!c.cursor || next > c.cursor) { c.cursor = next; save(c); }
    }
    return total;
  }

  async function push(cfg, tok) {
    const dirty = store.dirty();
    for (let i = 0; i < dirty.length; i += 200) {
      const chunk = dirty.slice(i, i + 200);
      const body = chunk.map((d) => ({
        user_id: cfg.session.user_id, kind: d.kind, id: d.id, data: d.data ?? {}, updated_at: d.updated_at, deleted: !!d.deleted,
      }));
      const r = await F(`${cfg.url}/rest/v1/docs?on_conflict=user_id,kind,id`, {
        method: 'POST',
        headers: headers(cfg, tok, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await errText(r));
      store.markClean(chunk);
    }
    return dirty.length;
  }

  async function errText(r) {
    const j = await r.json().catch(() => ({}));
    const m = j.message || j.hint || j.error || '';
    if (/relation .*docs.* does not exist|PGRST205/.test(m + (j.code || ''))) return P('err.noTable');
    if (r.status === 401 || r.status === 403) return P('err.denied');
    return m || `HTTP ${r.status}`;
  }

  /** استدعاء الوسيط (Edge Function باسم crm): قراءة الشيتات وطلبات Ecotrack */
  sync.invoke = async (body) => {
    const { cfg, tok } = await token();
    const r = await F(`${cfg.url}/functions/v1/crm`, { method: 'POST', headers: headers(cfg, tok), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error(P('err.noFn'));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };

  let running = null;
  sync.syncNow = () => {
    if (!sync.connected()) return Promise.resolve(null);
    if (running) return running;
    running = (async () => {
      set('syncing');
      try {
        const { cfg, tok } = await token();
        const pulled = await pull(cfg, tok);
        const pushed = await push(cfg, tok);
        sync.lastSync = now();
        set('ok');
        return { pulled, pushed };
      } catch (e) {
        if (sync.connected()) set('error', e.message === 'Failed to fetch' ? P('err.offline') : e.message);
        return null;
      } finally { running = null; }
    })();
    return running;
  };

  let timer = null;
  sync.startAuto = () => {
    store.on(() => { if (!sync.connected() || !store.dirty().length) return; clearTimeout(timer); timer = setTimeout(sync.syncNow, 2500); });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) sync.syncNow(); });
      setInterval(() => { if (!document.hidden) sync.syncNow(); }, 60000);
    }
    sync.syncNow();
  };

  // رمز اتصال يُنسخ من جهاز إلى آخر (رابط + مفتاح + بريد)
  sync.connectionCode = () => { const c = load(); return c.url ? btoa(unescape(encodeURIComponent(JSON.stringify({ u: c.url, k: c.key, e: c.email })))) : ''; };
  sync.parseCode = (code) => {
    try { const o = JSON.parse(decodeURIComponent(escape(atob(String(code).trim())))); return { url: o.u, key: o.k, email: o.e || '' }; }
    catch { throw new Error(P('err.badCode')); }
  };

  return sync;
}
