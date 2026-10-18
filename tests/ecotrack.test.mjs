// اختبار المسار الكامل مع Ecotrack وهمي:
// prêt à expédier ← التأكيدات ← تأكيد ← vers station ← ... ← livré / retour en traitement، والمخزون.
import assert from 'node:assert/strict';
import { fakeEcotrack } from './fake-ecotrack.mjs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.Capacitor = { isNativePlatform: () => true }; // اتصال مباشر كما في الـ APK

const eco = fakeEcotrack();
const base = await eco.listen();
localStorage.setItem('arbahi.eco', JSON.stringify({ url: base, token: 'TOK' }));

const { store } = await import('../www/js/core.js');
const { syncEcotrack, confirmOrder, cancelOrder } = await import('../www/js/ops.js');
const { orderTab, stockReport, newMove } = await import('../www/js/crm.js');
await store.init();

eco.add({ tracking: 'ECO1', status: 'Prêt à expédier', client: 'Ali', phone: '0550000001', wilaya_id: 16, commune: 'Bab Ezzouar', montant: 2200, produit: 'SANDAL ARMANI (42) x1', reference: 'JS-1' });
eco.add({ tracking: 'ECO2', status: 'prete_a_expedier', client: 'Sara', phone: '213661000002', wilaya_id: 9, commune: 'Blida', montant: 4400, produit: 'Sandal Armani x2' });
eco.add({ tracking: 'ECO3', status: 'Prêt à expédier', client: 'Omar', phone: '0770000003', wilaya_id: 31, commune: 'Oran', montant: 2800, produit: 'Pack 2 pièces' });

// 1) أول مزامنة: الطلبيات تدخل خانة التأكيدات
let r = await syncEcotrack();
assert.equal(r.added, 3);
const byT = (t) => store.orders().find((o) => o.tracking === t);
assert.equal(orderTab(byT('ECO1')), 'new');
assert.equal(byT('ECO2').phone, '0661000002');
assert.equal(byT('ECO1').wilaya, 'Alger');
assert.ok(eco.calls.filter((c) => c.path === 'get/orders').length >= 2, 'تُقرأ كل الصفحات');

// منتج + مخزون: 10 قطع
store.put('product', 'p1', { id: 'p1', name: 'Sandal Armani', price: 2200, cost: 1000, skus: '', variants: '' });
store.put('move', 'm1', newMove('p1', 10));
const stock = () => stockReport(store.products(), store.moves(), store.orders()).rep.get('p1');
assert.deepEqual([stock().onHand, stock().inHand, stock().carrier, stock().pending], [10, 10, 0, 3]);

// 2) تأكيد ECO1 و ECO2 ← Vers station في Ecotrack
assert.ok((await confirmOrder(byT('ECO1').id, 'Nadia')).ok);
assert.ok((await confirmOrder(byT('ECO2').id, 'Nadia')).ok);
assert.equal(eco.orders.get('ECO1').status, 'Vers station');
assert.equal(orderTab(byT('ECO1')), 'to_station');
assert.equal(byT('ECO1').confirmedBy, 'Nadia');
assert.deepEqual([stock().onHand, stock().inHand, stock().carrier], [10, 7, 3], 'المؤكدة خرجت لعند التوصيل والكلي لم ينقص');

// 3) إلغاء ECO3 يحذفها من Ecotrack
assert.ok((await cancelOrder(byT('ECO3').id, 'Nadia')).ok);
assert.ok(!eco.orders.has('ECO3'));
assert.equal(orderTab(byT('ECO3')), 'cancelled');

// 4) الحالات تتقدم في Ecotrack ← التطبيق يتبعها خطوة بخطوة
const path = [['En station', 'at_station'], ['vers_wilaya', 'to_wilaya'], ['En préparation', 'preparing'], ['En livraison', 'delivering']];
for (const [label, tab] of path) {
  eco.setStatus('ECO1', label);
  r = await syncEcotrack();
  assert.equal(orderTab(byT('ECO1')), tab, label);
  assert.deepEqual(r.changes.map((c) => c.to), [tab], 'تغيير واحد = إشعار واحد');
}
// ملاحظة الموزّع أثناء التوصيل
eco.remarks.set('ECO1', [{ remarque: 'Client ne répond pas', livreur: 'Karim', created_at: '2026-10-18 15:10:00' }]);
eco.setStatus('ECO1', 'Suspendu');
r = await syncEcotrack();
assert.equal(orderTab(byT('ECO1')), 'suspended');
assert.equal(byT('ECO1').eco.remarks[0].text, 'Client ne répond pas');

// 5) ECO1 تُسلَّم ← المخزون الكلي ينقص 1
eco.setStatus('ECO1', 'Livré non encaissé');
await syncEcotrack();
assert.equal(orderTab(byT('ECO1')), 'delivered');
assert.deepEqual([stock().onHand, stock().inHand, stock().carrier, stock().sold], [9, 7, 2, 1]);

// 6) ECO2 ترجع: chez livreur لا يغير شيئاً، en traitement ترجع ليدك
eco.setStatus('ECO2', 'Retour chez livreur');
await syncEcotrack();
assert.equal(orderTab(byT('ECO2')), 'returns');
assert.deepEqual([stock().onHand, stock().inHand, stock().carrier], [9, 7, 2]);
eco.setStatus('ECO2', 'retour_en_traitement');
await syncEcotrack();
assert.deepEqual([stock().onHand, stock().inHand, stock().carrier, stock().returned], [9, 9, 0, 2]);

// 7) مزامنة بدون تغيير = لا إشعارات
r = await syncEcotrack();
assert.equal(r.changes.length, 0);

await eco.close();
console.log('✔ مسار Ecotrack الكامل والمخزون');
