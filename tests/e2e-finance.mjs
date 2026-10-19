import assert from 'node:assert/strict';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const pw = await import(process.env.PLAYWRIGHT || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const root = path.resolve('www');
const server = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f === root || f.endsWith(path.sep)) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); }).listen(8093);
const browser = await chromium.launch();
const SHOTS = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(SHOTS, { recursive: true });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('arbahi.welcome', '1'); } catch {} });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8093/'); await page.waitForSelector('.kpis');
  await page.evaluate(() => {
    const { store } = window.__arbahi; const now = new Date().toISOString();
    store.put('product', 'p1', { id: 'p1', name: 'منشار كهربائي', skus: 'SAW', cost: 2000, price: 5000 });
    const mk = (i, label, extra = {}) => store.put('order', 'o' + i, { id: 'o' + i, stage: 'sent', tracking: 'TRK' + i, name: 'زبون ' + i, phone: '0550' + (100000 + i), wilaya: 'وهران', commune: 'السانية', total: 5000, shipping: 600, items: [{ name: 'منشار كهربائي', sku: 'SAW', qty: 1 }], createdAt: now, eco: { step: 'delivered', group: 'delivered', label, at: now, ...extra } });
    mk(1, 'Livré non encaissé'); mk(2, 'Livré non encaissé'); mk(3, 'Encaissé non payé'); mk(4, 'Paiements prêts'); mk(5, 'Payé et archivé', { payAt: now }); mk(6, 'Payé et archivé', { payAt: now });
  });
  const go = async (h) => { await page.evaluate((h) => { location.hash = '#' + h; }, h); await page.waitForTimeout(250); };
  await go('finance/uncollected'); assert.equal(await page.locator('.ocard').count(), 2);
  await page.screenshot({ path: `${SHOTS}/fin-1.png` });
  await go('finance/collected'); assert.equal(await page.locator('.ocard').count(), 1);
  await go('finance/ready'); assert.equal(await page.locator('.ocard').count(), 1);
  await go('finance/history'); assert.equal(await page.locator('.ocard').count(), 1, 'دفعة واحدة معلقة');
  await page.fill('[data-f="metaCost"]', '1000'); await page.dispatchEvent('[data-f="metaCost"]', 'change');
  await page.fill('[data-f="confirmRate"]', '50'); await page.dispatchEvent('[data-f="confirmRate"]', 'change');
  await page.fill('[data-f="deliveryRate"]', '50'); await page.dispatchEvent('[data-f="deliveryRate"]', 'change');
  await page.click('[data-act="fopen"]'); await page.click('[data-act="fcalc"]'); await page.waitForSelector('.hero');
  // net 8800 − شراء 4000 − ميتا 2×4000 = −3200 (خسارة لأن الميتا مرتفع في هذا المثال)
  assert.match((await page.textContent('.hero-num')).replace(/\s| /g, ''), /-3200|3200/);
  await page.screenshot({ path: `${SHOTS}/fin-2.png`, fullPage: true });
  assert.equal(await page.evaluate(() => window.__arbahi.store.get('order', 'o5').payRef), 'pay-' + new Date().toISOString().slice(0, 10));
  // تسجيل استلام يدوي: الطلبان غير المحصّلين
  await page.click('[data-act="frecv"]'); await page.waitForSelector('.rcv');
  assert.equal(await page.locator('.rcv').count(), 4);
  await page.locator('.rcv').nth(0).check(); await page.click('[data-act="frecvok"]');
  await page.waitForSelector('.hero');
  assert.ok((await page.evaluate(() => window.__arbahi.store.orders().filter((o) => o.payManual === 'paid').length)) >= 1);
  // البحث
  await go('search'); await page.fill('#srchIn', 'منشر');
  await page.waitForSelector('#srchOut .ocard'); assert.ok((await page.locator('#srchOut .ocard').count()) >= 6);
  await page.fill('#srchIn', 'وهرن'); await page.waitForTimeout(150); assert.ok((await page.locator('#srchOut .ocard').count()) >= 1);
  await page.fill('#srchIn', 'zzzqqq'); await page.waitForTimeout(150); assert.equal(await page.locator('#srchOut .ocard').count(), 0);
  await page.screenshot({ path: `${SHOTS}/fin-3-search.png` });
  await go(''); await page.screenshot({ path: `${SHOTS}/fin-4-home.png` });
  assert.deepEqual(errors, []);
  console.log('✔ اختبار المالية والبحث نجح');
} finally { await browser.close(); server.close(); }
