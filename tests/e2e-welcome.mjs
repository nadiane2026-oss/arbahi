import assert from 'node:assert/strict';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const pw = await import(process.env.PLAYWRIGHT || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const root = path.resolve('www');
const server = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith(path.sep) || f === root) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); }).listen(8094);
const browser = await chromium.launch();
const SHOTS = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(SHOTS, { recursive: true });
const errors = [];
const SUPA = 'https://demo.supabase.co';
const CODE = Buffer.from(JSON.stringify({ u: SUPA, k: 'KEY', e: 'a@x.dz', p: 'secret1', eu: 'https://x.ecotrack.dz', t: 'TKN' })).toString('base64');
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route(SUPA + '/**', (r) => {
    const u = r.request().url();
    if (u.includes('/auth/v1/token')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ access_token: 'A', refresh_token: 'R', expires_in: 3600, user: { id: 'u1' } }) });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8094/');
  await page.waitForSelector('.welcome-screen');
  await page.screenshot({ path: `${SHOTS}/welcome-1.png` });
  await page.click('[data-w="next"]'); await page.screenshot({ path: `${SHOTS}/welcome-2.png` });
  await page.click('[data-w="code"]');
  await page.fill('#wCode', 'garbage'); await page.click('[data-w="docode"]');
  await page.waitForSelector('.banner.err');
  await page.fill('#wCode', CODE); await page.click('[data-w="docode"]');
  await page.waitForSelector('.welcome-screen', { state: 'detached' });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arbahi.eco')).token), 'TKN');
  assert.equal(await page.evaluate(() => window.__arbahi.sync.connected()), true);
  await page.reload(); await page.waitForSelector('.kpis');
  assert.equal(await page.locator('.welcome-screen').count(), 0, 'لا تظهر مرة ثانية');
  // خيار بدون ربط
  const c2 = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const p2 = await c2.newPage(); p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto('http://localhost:8094/'); await p2.waitForSelector('.welcome-screen');
  await p2.click('[data-w="next"]'); await p2.click('[data-w="local"]');
  await p2.waitForSelector('.kpis'); assert.equal(await p2.locator('.welcome-screen').count(), 0);
  assert.deepEqual(errors, []);
  console.log('✔ اختبار شاشة الترحيب والربط بالكود نجح');
} finally { await browser.close(); server.close(); }
