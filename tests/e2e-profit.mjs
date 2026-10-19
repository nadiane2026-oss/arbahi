import assert from 'node:assert/strict';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const pw = await import(process.env.PLAYWRIGHT || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const root = path.resolve('www');
const server = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith(path.sep) || f === root) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); }).listen(8095);
const browser = await chromium.launch();
const SHOTS = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(SHOTS, { recursive: true });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('arbahi.welcome', '1'); } catch {} });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8095/');
  await page.waitForSelector('.stages');
  assert.ok((await page.locator('.stage').count()) >= 8, 'خانات Ecotrack');
  assert.equal(await page.locator('.kpis, .panels').count(), 0, 'لا مبيعات ولا أرباح في لوحة التحكم');
  await page.screenshot({ path: `${SHOTS}/dash.png` });
  assert.ok(!(await page.locator('#nav').innerText()).match(/المالية|Finance/), 'لا قسم مالية');
  await page.goto('http://localhost:8095/#profit');
  await page.waitForSelector('#drop');
  await page.screenshot({ path: `${SHOTS}/profit.png` });
  await page.goto('http://localhost:8095/#finance/ready');
  await page.waitForSelector('#drop');
  console.log('✔ لوحة التحكم بخانات Ecotrack وصفحة الأرباح');
} finally { await browser.close(); server.close(); }
assert.deepEqual(errors, []);
