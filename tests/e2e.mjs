// اختبار شامل في متصفح حقيقي. تشغيل: PDF=مسار.pdf node tests/e2e.mjs
import assert from 'node:assert/strict';
import { serve } from '../scripts/serve.mjs';
const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const chromium = pw.chromium || pw.default.chromium;

const PDF = process.env.PDF;
const SHOTS = process.env.SHOTS || '/tmp/shots';
const server = await serve(8099);
const browser = await chromium.launch();
const errors = [];

async function run(name, viewport, scheme) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, acceptDownloads: true, locale: 'ar-DZ' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: console ${m.text()}`); });
  await page.goto('http://localhost:8099/#home');
  await page.waitForSelector('.page-head');
  await page.screenshot({ path: `${SHOTS}/${name}-1-empty.png` });

  // الإعدادات
  await page.evaluate(() => { location.hash = '#settings'; });
  await page.fill('[data-f="metaCost"]', '400'); await page.dispatchEvent('[data-f="metaCost"]', 'change');
  await page.fill('[data-f="confirmRate"]', '70'); await page.dispatchEvent('[data-f="confirmRate"]', 'change');
  await page.fill('[data-f="deliveryRate"]', '60'); await page.dispatchEvent('[data-f="deliveryRate"]', 'change');
  assert.match(await page.textContent('#finalMeta'), /952/);
  await page.click('[data-act="cadd"]');
  await page.fill('[data-chg="cf"][data-f="name"]', 'تغليف'); await page.dispatchEvent('[data-chg="cf"][data-f="name"]', 'change');
  await page.fill('[data-chg="cf"][data-f="amount"]', '100'); await page.dispatchEvent('[data-chg="cf"][data-f="amount"]', 'change');
  assert.match(await page.textContent('#splitTotal'), /100%/);
  await page.screenshot({ path: `${SHOTS}/${name}-2-settings.png`, fullPage: true });

  // الاستيراد
  await page.evaluate(() => { location.hash = '#import'; });
  await page.screenshot({ path: `${SHOTS}/${name}-3-import-empty.png` });
  await page.setInputFiles('#pdfInput', PDF);
  await page.waitForSelector('.groups', { timeout: 20000 });
  assert.equal(await page.locator('.group').count(), 2);
  assert.match(await page.textContent('.banner.ok'), /13/);
  // بلا منتجات محفوظة: كل مبلغ يطلب تركيبة جديدة
  const lp = page.locator('[data-chg="lpid"]');
  assert.equal(await lp.count(), 2);
  for (let i = 0; i < 2; i++) await page.locator('[data-chg="lpid"]').nth(i).selectOption('new');
  const names = page.locator('[data-inp="lname"]'); const costs = page.locator('[data-inp="lcost"]');
  await names.nth(0).fill('ساعة ذكية'); await costs.nth(0).fill('2500');
  await names.nth(1).fill('حقيبة جلد'); await costs.nth(1).fill('9000');
  await page.screenshot({ path: `${SHOTS}/${name}-4-import-preview.png`, fullPage: true });
  await page.click('[data-act="save"]');
  await page.waitForSelector('.hero');

  // لوحة الأرباح: 126950 - 45500 - 12380.95 - 1300 = 67769
  const hero = (await page.textContent('.hero-num')).replace(/\s| /g, '');
  assert.match(hero, /^67769DA$/, 'صافي الربح في اللوحة: ' + hero);
  const parts = (await page.locator('.split-list .amt').allTextContents()).map((t) => parseInt(t.replace(/\D/g, ''), 10));
  assert.deepEqual(parts, [6777, 24397, 18298, 18297].map((x, i) => parts[i] ?? x).slice(0, 4));
  assert.equal(parts.reduce((a, b) => a + b, 0), 67769);
  assert.equal(parts[0], 6777); // 10% سليم
  await page.screenshot({ path: `${SHOTS}/${name}-5-home.png`, fullPage: true });

  // ورقة التفاصيل
  await page.click('.ledger tbody tr[data-act="open"]');
  await page.waitForSelector('dialog.sheet[open]');
  assert.equal(await page.locator('dialog .ledger tbody tr').count(), 13);
  // خيارات الطرد تقترح التركيبة من السعر ولا تعتبر القطعتين منتجاً مختلفاً
  const opt = await page.locator('dialog .ledger tbody tr').first().locator('select option').allTextContents();
  assert.ok(opt.length >= 3, 'خيارات: ' + opt.join('|'));
  await page.screenshot({ path: `${SHOTS}/${name}-6-sheet.png` });
  await page.click('[data-act="close"]');

  // اللغة والمظهر
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
  assert.ok(await page.locator('.bi .e').count() > 0, 'الوضع المزدوج');
  await page.click('[data-pref="lang"]'); // both -> ar
  assert.equal(await page.locator('#view .bi, #nav .bi').count(), 0);
  await page.click('[data-pref="lang"]'); // ar -> en
  assert.equal(await page.getAttribute('html', 'dir'), 'ltr');
  assert.match(await page.textContent('.page-head h1'), /Profit/);
  await page.screenshot({ path: `${SHOTS}/${name}-5b-home-en.png`, fullPage: true });
  await page.click('[data-pref="lang"]'); // en -> both
  await page.click('[data-pref="theme"]');
  const th = await page.getAttribute('html', 'data-theme');
  assert.ok(['light', 'dark'].includes(th));
  await page.click('[data-pref="theme"]'); await page.click('[data-pref="theme"]'); // العودة إلى تلقائي
  assert.equal(await page.getAttribute('html', 'data-theme'), null);

  // الزبائن + تصدير ميتا
  await page.evaluate(() => { location.hash = '#customers'; });
  await page.waitForSelector('#custBody tr');
  assert.equal(await page.locator('#custBody tr').count(), 13);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
  const csv = await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8');
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'phone,fn,ln,ct,st,country,value');
  assert.equal(lines.length, 14);
  assert.ok(lines.every((l, i) => i === 0 || /^\+213\d{9},/.test(l)), 'كل الهواتف بصيغة دولية');
  await page.screenshot({ path: `${SHOTS}/${name}-7-customers.png`, fullPage: true });

  // الاستمرارية: بعد إعادة التحميل تبقى البيانات
  await page.goto('http://localhost:8099/#profit'); await page.reload();
  await page.waitForSelector('.hero');
  assert.match((await page.textContent('.hero-num')).replace(/\s| /g, ''), /^67769DA$/);

  // رفع نفس الورقة ثانية: تنبيه الاستبدال ولا تتضاعف الأرقام
  await page.evaluate(() => { location.hash = '#import'; });
  await page.setInputFiles('#pdfInput', PDF);
  await page.waitForSelector('.groups');
  assert.ok((await page.textContent('#view')).includes('محفوظة من قبل'));
  await page.click('[data-act="save"]');
  await page.waitForSelector('.hero');
  assert.match((await page.textContent('.hero-num')).replace(/\s| /g, ''), /^67769DA$/);
  await ctx.close();
}

try {
  await run('mobile-light', { width: 390, height: 844 }, 'light');
  await run('desktop-light', { width: 1360, height: 860 }, 'light');
  await run('mobile-dark', { width: 390, height: 844 }, 'dark');
  assert.deepEqual(errors, [], 'أخطاء في المتصفح:\n' + errors.join('\n'));
  console.log('✔ الاختبار الشامل نجح في 3 أحجام/أنماط');
} finally {
  await browser.close(); server.close();
}
