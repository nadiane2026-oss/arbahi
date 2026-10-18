// تشغيل: node tests/parse.test.mjs <مسار-ملف-PDF>
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parsePdf } from '../www/js/pdf-parse.js';

const file = process.argv[2];
if (!file) { console.log('مرر مسار ملف PDF'); process.exit(0); }
const pdfjs = await import(process.env.PDFJS || '../www/vendor/pdf.min.mjs');
const res = await parsePdf(fs.readFileSync(file), pdfjs);
console.log({ ref: res.ref, date: res.date, sender: res.sender, count: res.count, total: res.total, rows: res.rows.length, sumNet: res.sumNet, sumMontant: res.sumMontant, warnings: res.warnings });
for (const r of res.rows) console.log(r.tracking.slice(-6), '|', r.name, '|', r.phone.slice(0, 4) + '…', '|', r.wilaya, '/', r.commune, '|', r.montant, r.delivery, r.net, r.ok ? 'ok' : 'BAD');
assert.equal(res.rows.length, res.count, 'عدد الطرود');
assert.equal(res.sumNet, res.total, 'مجموع الصافي');
assert.deepEqual(res.warnings, [], 'تحذيرات');
console.log('✔ القراءة سليمة');
