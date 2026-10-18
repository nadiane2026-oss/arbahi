// اختبار المزامنة ضد سيرفر Supabase وهمي (نفس شكل واجهة REST والمصادقة)
import http from 'node:http';
import assert from 'node:assert/strict';
import { createStore } from '../www/js/store.js';
import { createSync } from '../www/js/sync.js';

// ---------- سيرفر وهمي ----------
const USERS = { 'a@x.dz': { pw: 'secret1', id: 'u-1' }, 'b@x.dz': { pw: 'secret2', id: 'u-2' } };
const rows = new Map(); // `${user}|${kind}|${id}` -> row
let tick = 0;
const tokens = new Map();
let failNext = 0;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.headers.apikey !== 'KEY') return send(401, { message: 'bad key' });
  if (url.pathname === '/auth/v1/token') {
    const j = JSON.parse(body);
    if (url.searchParams.get('grant_type') === 'password') {
      const u = USERS[j.email];
      if (!u || u.pw !== j.password) return send(400, { error_description: 'Invalid login credentials' });
      const t = `tok-${u.id}-${++tick}`; tokens.set(t, u.id);
      return send(200, { access_token: t, refresh_token: 'r-' + u.id, expires_in: 3600, user: { id: u.id } });
    }
    const uid = (j.refresh_token || '').slice(2);
    const t = `tok-${uid}-${++tick}`; tokens.set(t, uid);
    return send(200, { access_token: t, refresh_token: j.refresh_token, expires_in: 3600, user: { id: uid } });
  }
  if (url.pathname === '/rest/v1/docs') {
    if (failNext > 0) { failNext--; return send(500, { message: 'boom' }); }
    const uid = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
    if (!uid) return send(401, { message: 'JWT invalid' });
    if (req.method === 'POST') {
      for (const r of JSON.parse(body)) {
        assert.equal(r.user_id, uid, 'RLS: لا يكتب لمستخدم آخر');
        rows.set(`${uid}|${r.kind}|${r.id}`, { ...r, synced_at: new Date(Date.UTC(2026, 9, 17, 12, 0, ++tick)).toISOString() });
      }
      res.writeHead(201); return res.end();
    }
    let list = [...rows.entries()].filter(([k]) => k.startsWith(uid + '|')).map(([, v]) => v);
    const f = url.searchParams.get('synced_at');
    if (f) list = list.filter((r) => r.synced_at >= f.replace('gte.', ''));
    list.sort((a, b) => a.synced_at.localeCompare(b.synced_at) || a.id.localeCompare(b.id));
    const off = +url.searchParams.get('offset') || 0, lim = +url.searchParams.get('limit') || 1000;
    return send(200, list.slice(off, off + lim).map(({ user_id, ...r }) => r));
  }
  send(404, {});
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://127.0.0.1:${server.address().port}`;

const mkDevice = async () => {
  const store = createStore(); await store.init();
  const mem = {}; const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v), removeItem: (k) => delete mem[k] };
  return { store, sync: createSync(store, { storage }), storage };
};

// ---------- السيناريو ----------
const phone = await mkDevice();
const pc = await mkDevice();

await assert.rejects(phone.sync.login(URL_, 'KEY', 'a@x.dz', 'wrong'), /Invalid login/);
await phone.sync.login(URL_, 'KEY', 'a@x.dz', 'secret1');
await pc.sync.login(URL_, 'KEY', 'a@x.dz', 'secret1');

// 1) الهاتف يضيف منتجاً وورقة
phone.store.put('product', 'p1', { id: 'p1', name: 'ساعة', price: 7900, cost: 2500 });
phone.store.put('decharge', 'd-2021', { id: 'd-2021', ref: '#2021', date: '2026-10-17', parcels: [{ tracking: 'T1', net: 7200, montant: 7900, productId: 'p1' }] });
let r = await phone.sync.syncNow();
assert.equal(r.pushed, 2);
assert.equal(phone.store.dirty().length, 0);

// 2) الكمبيوتر يسحب
r = await pc.sync.syncNow();
assert.equal(r.pulled, 2);
assert.equal(pc.store.get('product', 'p1').name, 'ساعة');
assert.equal(pc.store.decharges().length, 1);
assert.equal(pc.store.dirty().length, 0, 'ما سُحب لا يُدفع من جديد');

// 3) الكمبيوتر يعدّل، الهاتف يرى
pc.store.put('product', 'p1', { id: 'p1', name: 'ساعة', price: 7900, cost: 3000 });
await pc.sync.syncNow();
await phone.sync.syncNow();
assert.equal(phone.store.get('product', 'p1').cost, 3000);

// 4) حذف يمشي للجهاز الآخر
phone.store.del('decharge', 'd-2021');
await phone.sync.syncNow();
await pc.sync.syncNow();
assert.equal(pc.store.decharges().length, 0);

// 5) تعارض: الأحدث يكسب
phone.store.put('product', 'p1', { id: 'p1', name: 'قديم', price: 1, cost: 1 });
await new Promise((r) => setTimeout(r, 5));
pc.store.put('product', 'p1', { id: 'p1', name: 'جديد', price: 2, cost: 2 });
await pc.sync.syncNow();
await phone.sync.syncNow(); // الهاتف عنده تعديل أقدم غير مدفوع: يجب ألا يطغى
assert.equal(phone.store.get('product', 'p1').name, 'جديد');
await pc.sync.syncNow();
assert.equal(pc.store.get('product', 'p1').name, 'جديد');

// 6) عزل المستخدمين
const other = await mkDevice();
await other.sync.login(URL_, 'KEY', 'b@x.dz', 'secret2');
const ro = await other.sync.syncNow();
assert.equal(ro.pulled, 0);
assert.equal(other.store.products().length, 0);

// 7) فشل مؤقت ثم نجاح: التعديلات لا تضيع
phone.store.put('product', 'p2', { id: 'p2', name: 'حقيبة', price: 24900, cost: 9000 });
failNext = 1;
assert.equal(await phone.sync.syncNow(), null);
assert.equal(phone.sync.status, 'error');
assert.equal(phone.store.dirty().length, 1);
await phone.sync.syncNow();
assert.equal(phone.store.dirty().length, 0);
await pc.sync.syncNow();
assert.equal(pc.store.get('product', 'p2').name, 'حقيبة');

// 8) انتهاء الجلسة يُجدَّد تلقائياً
const c = JSON.parse(pc.storage.getItem('arbahi.sync')); c.session.expires_at = 0; pc.storage.setItem('arbahi.sync', JSON.stringify(c));
pc.store.put('product', 'p3', { id: 'p3', name: 'x', price: 1, cost: 1 });
await pc.sync.syncNow();
assert.equal(pc.sync.status, 'ok');

// 9) رمز الاتصال
const code = phone.sync.connectionCode();
assert.deepEqual(pc.sync.parseCode(code), { url: URL_, key: 'KEY', email: 'a@x.dz' });
assert.throws(() => pc.sync.parseCode('???'), /الرمز/);

// 10) نسخة احتياطية
const dump = phone.store.exportJson();
const fresh = await mkDevice();
fresh.store.importJson(dump);
assert.equal(fresh.store.products().length, phone.store.products().length);

server.close();
console.log('✔ كل اختبارات المزامنة نجحت');
