import assert from 'node:assert/strict';
import { finalCost, parcelCalc, decharge, splitProfit, buildCustomers, metaCsv, filterPeriod, DEFAULT_SETTINGS, candidatesFor, defaultChoice, sigOf, parcelItems } from '../www/js/calc.js';
import { normPhone, fmt } from '../www/js/util.js';

// الكوست النهائي: 400 ÷ (0.7 × 0.6) = 952.38
assert.ok(Math.abs(finalCost(400, 70, 60) - 952.380952) < 1e-3);
assert.equal(finalCost(0, 70, 60), 0);
assert.equal(finalCost(400, 0, 60), 400); // نسبة غير صالحة لا تنفجر

const settings = { ...DEFAULT_SETTINGS, metaCost: 400, confirmRate: 70, deliveryRate: 60 };
const A = { id: 'A', name: 'منتج 7900', price: 7900, cost: 2500 };
const B = { id: 'B', name: 'منتج 24900', price: 24900, cost: 9000, metaCost: 1200, confirmRate: 80, deliveryRate: 75 };
const commitments = [
  { id: 'c1', name: 'تغليف', mode: 'per_order', amount: 100 },
  { id: 'c2', name: 'مركز اتصال', mode: 'percent', amount: 2 },
  { id: 'c3', name: 'نقل المخزون', mode: 'per_batch', amount: 1000 },
];
const ctx = { settings, productsById: { A, B }, commitments, combos: [] };

// طرد 7900 بصافي 7200
const p = parcelCalc({ items: [{ productId: 'A', qty: 1 }], montant: 7900, net: 7200 }, ctx);
const metaA = 400 / (0.7 * 0.6);
assert.ok(Math.abs(p.meta - metaA) < 1e-9);
assert.equal(p.buy, 2500);
assert.ok(Math.abs(p.commit - (100 + 158)) < 1e-9); // 100 + 2% من 7900
assert.ok(Math.abs(p.profit - (7200 - 2500 - metaA - 258)) < 1e-9);

// منتج له كوست خاص: 1200 ÷ (0.8 × 0.75) = 2000
assert.ok(Math.abs(parcelCalc({ items: [{ productId: 'B', qty: 1 }], montant: 24900, net: 24200 }, ctx).meta - 2000) < 1e-9);

// ورقة: طرد بلا منتج يُحتسب بصفر تكلفة شراء ويُعدّ غير مُعيَّن
const d = { parcels: [
  { productId: 'A', montant: 7900, net: 7200 }, // الشكل القديم ما زال مدعوماً
  { items: [{ productId: 'B', qty: 1 }], montant: 24900, net: 24200 },
  { items: [], montant: 7900, net: 7100 },
] };
const t = decharge(d, ctx);
assert.equal(t.count, 3);
assert.equal(t.unassigned, 1);
assert.equal(t.net, 7200 + 24200 + 7100);
const perBatch = 1000;
const expected = parcelCalc(d.parcels[0], ctx).profit + parcelCalc(d.parcels[1], ctx).profit + parcelCalc(d.parcels[2], ctx).profit - perBatch;
assert.ok(Math.abs(t.profit - expected) < 1e-6);

// التقسيم: 10% سليم، والـ 90% الباقية 40/30/30
const people = splitProfit(10000, settings);
assert.deepEqual(people.map((x) => x.amount), [1000, 3600, 2700, 2700]);
assert.equal(people.reduce((a, x) => a + x.amount, 0), 10000);
// مبلغ لا يقبل القسمة: المجموع يبقى مطابقاً للربح
const odd = splitProfit(12345, settings);
assert.equal(odd.reduce((a, x) => a + x.amount, 0), 12345);
// خسارة
const loss = splitProfit(-5000, settings);
assert.equal(loss.reduce((a, x) => a + x.amount, 0), -5000);

// الهاتف والزبائن وملف ميتا
assert.equal(normPhone('0658158034'), '+213658158034');
assert.equal(normPhone('+213 658 15 80 34'), '+213658158034');
assert.equal(normPhone('658158034'), '+213658158034');
assert.equal(normPhone('123'), '');
const ds = [
  { date: '2026-10-10', parcels: [{ name: 'Ali Ben', phone: '0658158034', wilaya: 'Oran', commune: 'Oran', montant: 7900, productId: 'A' }] },
  { date: '2026-10-17', parcels: [{ name: 'Ali Ben Salah', phone: '0658158034', wilaya: 'Oran', commune: 'Es Senia', montant: 24900, productId: 'B' }, { name: 'بلال', phone: '0555000111', wilaya: 'Alger', commune: 'Bab', montant: 7900 }] },
];
const cust = buildCustomers(ds, { A, B });
assert.equal(cust.length, 2);
assert.equal(cust[0].orders, 2);
assert.equal(cust[0].spent, 32800);
assert.equal(cust[0].commune, 'Es Senia'); // آخر عنوان
const csv = metaCsv(cust).trim().split('\n');
assert.equal(csv[0], 'phone,fn,ln,ct,st,country,value');
assert.equal(csv[1], '+213658158034,Ali,Ben Salah,Es Senia,Oran,DZ,32800');

// الفترات
const list = [{ date: '2026-10-17' }, { date: '2026-10-05' }, { date: '2026-09-28' }];
const now = new Date('2026-10-17T12:00:00Z');
assert.equal(filterPeriod(list, 'today', now).length, 1);
assert.equal(filterPeriod(list, 'month', now).length, 2);
assert.equal(filterPeriod(list, '7d', now).length, 1);
assert.equal(filterPeriod(list, 'all', now).length, 3);

assert.equal(fmt(126950), '126 950');

// ---- التركيبات: قطعتان من نفس المنتج لا تُعدّان منتجاً آخر ----
const prods = [A, B];
// 2 × منتج A (15800) تُقترح كمضاعف، لا كمنتج جديد
let c = candidatesFor(15800, prods, []);
assert.equal(c.length, 1);
assert.deepEqual(c[0].items, [{ productId: 'A', qty: 2 }]);
assert.equal(c[0].source, 'multiple');
assert.deepEqual(defaultChoice(c), { sig: c[0].sig, guess: true }); // تخمين يحتاج تأكيداً
// 7900 مطابق تماماً: ثقة أعلى
c = candidatesFor(7900, prods, []);
assert.equal(c[0].source, 'exact');
assert.equal(defaultChoice(c).guess, false);
// منتج + منتج = 32800
c = candidatesFor(32800, prods, []);
assert.equal(c.length, 1);
assert.equal(c[0].source, 'pair');
assert.equal(c[0].items.length, 2);
// مبلغ مجهول: لا اقتراح
assert.equal(candidatesFor(11111, prods, []).length, 0);
assert.equal(defaultChoice([]), null);
// منتجان بنفس السعر: غموض، لا تخمين بصمت
const C = { id: 'C', name: 'منتج آخر بنفس سعر A', price: 7900, cost: 1000 };
c = candidatesFor(7900, [A, B, C], []);
assert.equal(c.length, 2);
assert.equal(defaultChoice(c), null);
// تركيبة محفوظة واحدة تحسم الغموض، وتركيبتان محفوظتان تعيدان السؤال
const saved1 = [{ id: 's1', price: 7900, items: [{ productId: 'C', qty: 1 }] }];
c = candidatesFor(7900, [A, B, C], saved1);
assert.equal(c[0].source, 'saved');
assert.deepEqual(defaultChoice(c), { sig: c[0].sig, guess: false });
const saved2 = [...saved1, { id: 's2', price: 7900, items: [{ productId: 'A', qty: 1 }] }];
assert.equal(defaultChoice(candidatesFor(7900, [A, B, C], saved2)), null);
// تركيبة محفوظة تُتجاهل إذا حُذف أحد منتجاتها
assert.equal(candidatesFor(7900, [A, B], saved1).some((x) => x.source === 'saved'), false);

// الحساب مع الكمية: 2 × A = 2 × 2500 تكلفة شراء، وكوست ميتا مرة واحدة
const two = parcelCalc({ items: [{ productId: 'A', qty: 2 }], montant: 15800, net: 15100 }, { ...ctx, commitments: [] });
assert.equal(two.buy, 5000);
assert.ok(Math.abs(two.meta - 400 / (0.7 * 0.6)) < 1e-9);
assert.ok(Math.abs(two.profit - (15100 - 5000 - 400 / 0.42)) < 1e-9);
// منتجان في طرد واحد
const mix = parcelCalc({ items: [{ productId: 'A', qty: 1 }, { productId: 'B', qty: 1 }], montant: 32800, net: 31900 }, { ...ctx, commitments: [] });
assert.equal(mix.buy, 2500 + 9000);
assert.equal(sigOf([{ productId: 'B', qty: 1 }, { productId: 'A', qty: 1 }]), sigOf([{ productId: 'A', qty: 1 }, { productId: 'B', qty: 1 }]));
// طرد بلا منتج بقرار صريح لا يُعدّ ناقصاً
assert.equal(parcelCalc({ items: [], noProduct: true, montant: 100, net: 90 }, ctx).assigned, true);
assert.equal(parcelCalc({ items: [{ productId: 'ZZZ', qty: 1 }], montant: 100, net: 90 }, ctx).assigned, false);
assert.equal(parcelItems({ productId: 'A' })[0].qty, 1);

console.log('✔ كل اختبارات الحساب نجحت');
