// التخزين المحلي: كل شيء "وثائق" (kind + id + data). تُحفظ في IndexedDB
// (تبقى بدون إنترنت)، وتتزامن مع Supabase عبر sync.js.
import { P } from './i18n.js';
import { DEFAULT_SETTINGS } from './calc.js';

export const KINDS = { settings: 'settings', product: 'product', commitment: 'commitment', decharge: 'decharge', combo: 'combo', order: 'order', move: 'move' };

function memBackend() {
  const m = new Map();
  return {
    volatile: true,
    async loadAll() { return [...m.values()]; },
    async save(rec) { m.set(rec.key, structuredClone(rec)); },
  };
}

export function idbBackend(name = 'arbahi') {
  let dbp;
  const open = () =>
    (dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'key' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  return {
    volatile: false,
    async loadAll() {
      const db = await open();
      return new Promise((res, rej) => {
        const q = db.transaction('docs').objectStore('docs').getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    },
    async save(rec) {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction('docs', 'readwrite');
        tx.objectStore('docs').put(rec);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    },
  };
}

export function createStore(backend) {
  let be = backend;
  const docs = new Map(); // key -> {key,kind,id,data,updated_at,deleted,dirty}
  const listeners = new Set();
  const store = { volatile: false, error: '' };

  const keyOf = (kind, id) => `${kind}:${id}`;
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  const persist = async (rec) => {
    try { await be.save(rec); } catch (e) { store.error = P('err.saveLocal', { e: e?.message || e }); emit(); }
  };

  store.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  store.init = async () => {
    if (!be) be = typeof indexedDB !== 'undefined' ? idbBackend() : memBackend();
    let rows = [];
    try {
      rows = await be.loadAll();
    } catch (e) {
      be = memBackend();
      store.error = P('err.persist');
    }
    store.volatile = !!be.volatile;
    for (const r of rows) docs.set(r.key, r);
    emit();
  };

  store.get = (kind, id) => {
    const r = docs.get(keyOf(kind, id));
    return r && !r.deleted ? r.data : undefined;
  };
  store.list = (kind) => [...docs.values()].filter((r) => r.kind === kind && !r.deleted).map((r) => r.data);

  store.put = (kind, id, data) => {
    const k = keyOf(kind, id);
    const prev = docs.get(k);
    const updated_at = Math.max(Date.now(), (prev?.updated_at || 0) + 1);
    const rec = { key: k, kind, id, data: structuredClone(data), updated_at, deleted: false, dirty: true };
    docs.set(k, rec);
    persist(rec);
    emit();
    return rec.data;
  };

  store.del = (kind, id) => {
    const k = keyOf(kind, id);
    const prev = docs.get(k);
    if (!prev || prev.deleted) return;
    const rec = { ...prev, data: null, deleted: true, dirty: true, updated_at: Math.max(Date.now(), prev.updated_at + 1) };
    docs.set(k, rec);
    persist(rec);
    emit();
  };

  // ---- المزامنة ----
  store.dirty = () => [...docs.values()].filter((r) => r.dirty).map((r) => ({ ...r }));
  store.markClean = (pushed) => {
    for (const p of pushed) {
      const cur = docs.get(p.key);
      if (cur && cur.updated_at === p.updated_at) { cur.dirty = false; persist(cur); }
    }
  };
  store.applyRemote = (rows) => {
    let changed = 0;
    for (const r of rows) {
      const k = keyOf(r.kind, r.id);
      const cur = docs.get(k);
      if (cur && cur.updated_at >= r.updated_at) continue; // المحلي أحدث أو نفسه
      const rec = { key: k, kind: r.kind, id: r.id, data: r.deleted ? null : r.data, updated_at: r.updated_at, deleted: !!r.deleted, dirty: false };
      docs.set(k, rec);
      persist(rec);
      changed++;
    }
    if (changed) emit();
    return changed;
  };

  // ---- مساعدات ----
  store.settings = () => {
    const s = store.get(KINDS.settings, 'main') || {};
    return { ...structuredClone(DEFAULT_SETTINGS), ...s, restSplit: s.restSplit ? s.restSplit : structuredClone(DEFAULT_SETTINGS.restSplit) };
  };
  store.saveSettings = (patch) => store.put(KINDS.settings, 'main', { ...store.settings(), ...patch });
  store.products = () => store.list(KINDS.product).sort((a, b) => a.price - b.price);
  store.commitments = () => store.list(KINDS.commitment);
  store.orders = () => store.list(KINDS.order).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  store.moves = () => store.list(KINDS.move);
  store.combos = () => store.list(KINDS.combo);
  store.decharges = () => store.list(KINDS.decharge).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  store.ctx = () => {
    const productsById = {};
    for (const p of store.products()) productsById[p.id] = p;
    return { settings: store.settings(), productsById, commitments: store.commitments(), combos: store.combos() };
  };

  store.exportJson = () => ({
    app: 'arbahi', version: 1, exportedAt: new Date().toISOString(),
    docs: [...docs.values()].filter((r) => !r.deleted).map((r) => ({ kind: r.kind, id: r.id, data: r.data })),
  });
  store.importJson = (obj) => {
    if (!obj || obj.app !== 'arbahi' || !Array.isArray(obj.docs)) throw new Error(P('backup.notBackup'));
    for (const d of obj.docs) store.put(d.kind, d.id, d.data);
    return obj.docs.length;
  };
  store.wipe = () => {
    for (const r of [...docs.values()]) if (!r.deleted) store.del(r.kind, r.id);
  };

  return store;
}
