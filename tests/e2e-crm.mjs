// اختبار شاشات الطلبات والمخزون بوسيط وهمي (بدون إنترنت). تشغيل: node tests/e2e-crm.mjs
import assert from 'node:assert/strict';
import { serve } from '../scripts/serve.mjs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = pw.chromium || pw.default.chromium;
const SHOTS = process.env.SHOTS || '/tmp/shots';
const server = await serve(8098);
const browser = await chromium.launch();
const errors = [];

const CSV = `Username,Phone,City,State,SKU,Variant,Quantity,Price,Shipping Price,Total,ShippingTo?,Product Name,Date
Ali Test,549959105,Blida,El-Affroun,SAW,{},1,12900,0,12900,Home,منشار كهربائي,2026-10-17 10:00:00
سمير,213770847653,Chlef,,SAW,{},2,12900,0,25800,Desk,منشار كهربائي,2026-10-17 11:00:00
Nadia,0661234567,Oran,Oran,GROUPE,{},1,17900,0,17900,Home,مولد كهربائي,2026-10-17 12:00:00`;

const go = async (page, h) => { await page.evaluate((h) => { location.hash = '#' + h; }, h); await page.waitForTimeout(250); };
async function run(name, viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'ar-DZ', colorScheme: 'light' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('arbahi.welcome', '1'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: console ${m.text()}`); });
  await page.goto('http://localhost:8098/#orders');
  await page.waitForSelector('.page-head');
  // وسيط وهمي: الشيت يرجع CSV، وEcotrack يرجع tracking ثم حالات
  await page.evaluate(async (csv) => {
    const { store } = window.__arbahi;
    store.saveSettings({ sheets: [{ id: 'sh1', name: 'منتجات', url: 'https://docs.google.com/spreadsheets/d/x/edit', since: '2026-01-01' }], confirmers: ['أحمد', 'ياسين'] });
    store.put('product', 'pSaw', { id: 'pSaw', name: 'منشار', price: 12900, cost: 6000, skus: 'SAW', variants: '' });
    store.put('product', 'pGen', { id: 'pGen', name: 'مولد', price: 17900, cost: 9000, skus: 'GROUPE', variants: '' });
    store.put('move', 'm1', { id: 'm1', productId: 'pSaw', variant: '', qty: 20, note: 'in', at: new Date().toISOString() });
    store.put('move', 'm2', { id: 'm2', productId: 'pGen', variant: '', qty: 10, note: 'in', at: new Date().toISOString() });
  }, CSV);
  await page.waitForTimeout(400);
  await page.reload(); await page.waitForSelector('[data-act="pull"]');
  await page.evaluate(async (csv) => {
    const { transport: sync } = window.__arbahi;
    let n = 0; const sent = [];
    window.__sent = sent;
    sync.invoke = async (b) => {
      if (b.action === 'csv') return { csv };
      if (b.path === 'create/order') { sent.push(b.query); return { status: 200, data: { success: true, tracking: 'TRK' + (++n) } }; }
      if (b.path === 'get/orders') return { status: 200, data: { data: [{ tracking: 'TRK1', status: 'Livré non encaissé' }, { tracking: 'TRK2', status: 'Retours prêts' }] } };
      if (b.path === 'valid/returns') return { status: 200, data: { success: true } };
      if (b.path === 'valid/order') return { status: 200, data: { success: true } };
      return { status: 404, data: {} };
    };
  }, CSV);
  await page.click('[data-act="pull"]');
  await page.waitForSelector('.ocard');
  assert.equal(await page.locator('.ocard').count(), 3);
  await page.click('[data-act="pull"]'); // مرة ثانية لا تكرّر
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.ocard').count(), 3);
  await page.screenshot({ path: `${SHOTS}/${name}-crm-1-new.png`, fullPage: true });

  // تأكيد دون اختيار اسم: يُرفض. الطلب الأول ناقص البلدية؟ (El-Affroun موجودة) والثاني بلا بلدية
  const first = page.locator('.ocard').nth(2); // الأقدم أخيراً
  await page.selectOption('select[data-chg="me"]', 'أحمد');
  await page.click('[data-act="call"] >> nth=0'); // نتيجة اتصال
  await first.locator('[data-act="confirm"]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.ocard').count(), 2, 'تم تأكيد طلب');
  // الطلب بلا بلدية لا يؤكَّد
  const noCommune = page.locator('.ocard', { hasText: 'سمير' });
  await noCommune.locator('[data-act="confirm"]').click();
  assert.equal(await page.locator('.ocard').count(), 2);
  await noCommune.locator('summary').click();
  await noCommune.locator('[data-f="commune"]').fill('Chlef');
  await noCommune.locator('[data-f="commune"]').dispatchEvent('change');
  await page.locator('.ocard', { hasText: 'سمير' }).locator('[data-act="confirm"]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.ocard').count(), 1);
  await page.click('[data-act="tab"][data-t="confirmed"]'); await page.waitForTimeout(250);
  assert.equal(await page.locator('.ocard').count(), 2);
  await page.screenshot({ path: `${SHOTS}/${name}-crm-2-confirmed.png`, fullPage: true });

  // إرسال الكل
  await page.click('[data-act="sendAll"]');
  await page.waitForFunction(() => window.__sent.length === 2);
  const sent = await page.evaluate(() => window.__sent);
  assert.ok(sent.every((p) => p.type === 1 && /^0\d{9}$/.test(p.telephone) && p.code_wilaya > 0));
  assert.ok(sent.some((p) => p.stop_desk === 1));
  await page.click('[data-act="tab"][data-t="sent"]'); await page.waitForTimeout(250);
  assert.equal(await page.locator('.ocard').count(), 2);

  // تحديث الحالات: TRK1 مسلَّم، TRK2 راجع
  await page.click('[data-act="status"]');
  await page.waitForFunction(() => window.__arbahi.store.orders().some((o) => o.eco?.group === 'delivered'));
  await page.click('[data-act="tab"][data-t="returns"]'); await page.waitForTimeout(250);
  assert.equal(await page.locator('.ocard').count(), 1);
  await page.screenshot({ path: `${SHOTS}/${name}-crm-3-returns.png`, fullPage: true });

  // المخزون قبل استلام الراجع: منشار 20 - 1(مسلَّم) - 2(راجع لم يصل) = 17
  await go(page, 'stock');
  await page.waitForSelector('.stockcard');
  const saw = page.locator('.stockcard', { hasText: 'منشار' });
  assert.equal((await saw.locator('.stock-big').textContent()).trim(), '17');
  await page.screenshot({ path: `${SHOTS}/${name}-crm-4-stock.png`, fullPage: true });
  // استلام الراجع يعيد 2
  await go(page, 'orders/returns');
  await page.click('[data-act="retok"]'); await page.waitForTimeout(300);
  await go(page, 'stock'); await page.waitForSelector('.stockcard');
  assert.equal((await page.locator('.stockcard', { hasText: 'منشار' }).locator('.stock-big').textContent()).trim(), '18');
  // إضافة كمية
  const sawc = page.locator('.stockcard', { hasText: 'منشار' });
  await page.selectOption('#sp', 'pSaw'); await page.fill('#sq', '5'); await page.click('[data-act="addq"]');
  await page.waitForTimeout(200);
  assert.equal((await page.locator('.stockcard', { hasText: 'منشار' }).locator('.stock-big').textContent()).trim(), '23');

  // المؤكدون
  await go(page, 'team');
  assert.match(await page.textContent('.ledger'), /أحمد/);
  await page.screenshot({ path: `${SHOTS}/${name}-crm-5-team.png`, fullPage: true });

  // العملة
  await go(page, 'settings');
  await page.fill('[data-f="metaForeign"]', '10'); await page.fill('[data-f="metaRate"]', '250');
  await page.dispatchEvent('[data-f="metaRate"]', 'change');
  assert.match((await page.textContent('#fxResult')).replace(/\s| /g, ''), /2500/);
  assert.equal(await page.inputValue('[data-f="metaCost"]'), '2500');
  await page.screenshot({ path: `${SHOTS}/${name}-crm-6-settings.png`, fullPage: true });
  // لوحة التحكم والصفحات الجديدة
  await go(page, '');
  await page.waitForSelector('.kpis');
  assert.match(await page.textContent('.kpis'), /3/);
  await page.screenshot({ path: `${SHOTS}/${name}-crm-7-dash.png`, fullPage: true });
  await go(page, 'products'); await page.waitForSelector('.ocard');
  assert.ok((await page.locator('.ocard').count()) >= 2);
  await go(page, 'channels'); await page.waitForSelector('.ocard');
  await go(page, 'carrier'); await page.waitForSelector('#ecoTok');
  await page.fill('#ecoTok', 'TESTTOKEN'); await page.click('[data-act="csave"]');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arbahi.eco')).token), 'TESTTOKEN');
  await page.screenshot({ path: `${SHOTS}/${name}-crm-8-carrier.png`, fullPage: true });
  await ctx.close();
}
try {
  await run('mobile', { width: 390, height: 844 });
  await run('desktop', { width: 1360, height: 860 });
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('✔ اختبار الطلبات والمخزون الشامل نجح');
} finally { await browser.close(); server.close(); }
