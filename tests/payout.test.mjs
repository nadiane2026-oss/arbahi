import assert from 'node:assert';
import { calcPayout, splitProfit, DEFAULT_SETTINGS } from '../www/js/calc.js';
// 10 طرود، مستلم 50000، ميتا 1€ × 250 ÷ (0.5×0.8)=625 للطرد
const r = calcPayout({ received: 50000, count: 10, eur: 1, rate: 250, confirmPct: 50, deliveryPct: 80, stockDel: 1000, stock: 2000, conf: 100, modes: {} });
assert.equal(r.finalUnit, 625); assert.equal(r.meta, 6250); assert.equal(r.stockDel, 1000); assert.equal(r.stock, 20000); assert.equal(r.conf, 1000);
assert.equal(r.profit, 50000 - 6250 - 1000 - 20000 - 1000);
const t = calcPayout({ received: 1000, count: 4, eur: 2, rate: 100, confirmPct: 100, deliveryPct: 100, stockDel: 10, stock: 20, conf: 5, modes: { meta: 'total', stockDel: 'parcel', stock: 'total', conf: 'total' } });
assert.equal(t.meta, 200); assert.equal(t.stockDel, 40); assert.equal(t.stock, 20); assert.equal(t.profit, 1000 - 200 - 40 - 20 - 5);
const p = splitProfit(10000, DEFAULT_SETTINGS); assert.equal(p[0].amount, 1000); assert.deepEqual(p.slice(1).map((x) => x.amount), [3600, 2700, 2700]);
console.log('✔ حساب الربح المبسّط');
