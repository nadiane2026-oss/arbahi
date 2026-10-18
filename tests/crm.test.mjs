import assert from 'node:assert/strict';
import { ordersFromCsv, wilayaCode, phoneLocal, ecotrackPayload, ecoGroup, readEcoOrder, stockReport, confirmerStats, toDA, newMove, isOut } from '../www/js/crm.js';

const csv = `Username,Phone,City,State,SKU,Variant,Quantity,Price,Shipping Price,Total,ShippingTo?,Product Name,Date
بلقراف ممد,549959105,Blida,,GROUPE,{},1,16900,0,16900,Home,"مولد كهربائي BEETRO 750W | Générateur, Groupe",2026-03-10 23:56
Sliman Sliman,213698472570,Blida,El-Affroun,SAW,{},1,12900,0,12900,Desk,منشار كهربائي,2026-04-10 14:52
 ,599981179,Chlef,,SAW,"{""Color"":""Red""}",2,12900,0,25800,Home,منشار,2026-04-21 11:25
S,213553037708,El Meniaa,,GROUPE,,1,17900,0,17900,shippingHome,x,2026-06-10 19:58:45
,,,,,,,,,,,,
S,213553037708,El Meniaa,,GROUPE,,1,17900,0,17900,shippingHome,x,2026-06-10 19:58:45`;
const sheet = { id: 'sh1', name: 'مختلط' };
const os = ordersFromCsv(csv, sheet);
assert.equal(os.length, 5);
assert.equal(os[0].phone, '0549959105');
assert.equal(os[1].phone, '0698472570');
assert.equal(os[1].delivery, 'desk');
assert.equal(os[0].wilayaCode, 9);
assert.equal(os[3].wilayaCode, 50);
assert.equal(os[2].items[0].variant, 'Color: Red');
assert.equal(os[2].total, 25800);
assert.equal(os[0].createdAt, '2026-03-10T23:56:00+01:00');
assert.notEqual(os[3].id, os[4].id, 'صفان متطابقان لهما معرّفان مختلفان');
assert.deepEqual(ordersFromCsv(csv, sheet).map((o) => o.id), os.map((o) => o.id), 'المعرّفات ثابتة');
assert.equal(new Set(os.map((o) => o.id)).size, 5);

assert.equal(wilayaCode('Alger'), 16); assert.equal(wilayaCode('Béjaïa'), 6); assert.equal(wilayaCode('Bejaia'), 6);
assert.equal(wilayaCode('Oum El Bouaghi'), 4); assert.equal(wilayaCode('Souk Ahras'), 41); assert.equal(wilayaCode('Naama'), 45);
assert.equal(wilayaCode("M'Sila"), 28); assert.equal(wilayaCode('In Salah'), 57); assert.equal(wilayaCode('Touggourt'), 55);
assert.equal(wilayaCode('Unknownville'), 0);
assert.equal(phoneLocal('+213 770 84 76 53'), '0770847653'); assert.equal(phoneLocal('0770847653'), '0770847653'); assert.equal(phoneLocal('123'), '');

const { payload, problems } = ecotrackPayload(os[1]);
assert.deepEqual(problems, []); assert.equal(payload.stop_desk, 1); assert.equal(payload.code_wilaya, 9); assert.equal(payload.montant, 12900);
assert.ok(ecotrackPayload(os[0]).problems.includes('commune'));

assert.equal(ecoGroup('Retours reçu'), 'returned'); assert.equal(ecoGroup('En livraison'), 'delivering');
assert.equal(ecoGroup('Livré encaissé non payé'), 'delivered'); assert.equal(ecoGroup('Retours en transit stock'), 'returning');
assert.equal(ecoGroup('Prêt à expédier'), 'prep'); assert.equal(ecoGroup('zzz'), 'unknown');
assert.equal(readEcoOrder({ tracking: 'AB1', status: 'Vers hub' }).group, 'transit');

const products = [{ id: 'p1', name: 'Générateur', skus: 'GROUPE, groupe2' }, { id: 'p2', name: 'Scie', skus: 'SAW' }];
const moves = [newMove('p1', 10), newMove('p2', 5)];
const orders = [
  { ...os[0], stage: 'sent', tracking: 'T1', eco: { group: 'transit' } },       // خرج
  { ...os[3], stage: 'sent', tracking: 'T2', eco: { group: 'returned' } },      // رجع
  { ...os[1], stage: 'sent', tracking: 'T3', eco: { group: 'delivered' } },     // بيع
  { ...os[2], stage: 'confirmed' },                                             // محجوز لم يُرسل
];
const { rep } = stockReport(products, moves, orders);
// القاعدة: الكلي ينقص فقط عند التسليم؛ ما في الطريق يُحسب «عند التوصيل»
assert.equal(rep.get('p1').onHand, 10); assert.equal(rep.get('p1').inHand, 9); assert.equal(rep.get('p1').carrier, 1); assert.equal(rep.get('p1').returned, 1);
assert.equal(rep.get('p2').onHand, 4); assert.equal(rep.get('p2').sold, 1); assert.equal(rep.get('p2').pending, 2);
assert.ok(isOut(orders[0]) && !isOut(orders[1]) && !isOut(orders[3]));

const st = confirmerStats([
  { stage: 'sent', confirmedBy: 'أ', eco: { group: 'delivered' } }, { stage: 'sent', confirmedBy: 'أ', eco: { group: 'returned' } },
  { stage: 'cancelled', confirmedBy: 'أ' }, { stage: 'sent', confirmedBy: 'ب', eco: { group: 'delivered' } },
], ['أ', 'ب', 'ج']);
const a = st.find((x) => x.name === 'أ');
assert.equal(Math.round(a.confirmRate), 67); assert.equal(a.deliveryRate, 50);
assert.equal(st.find((x) => x.name === 'ج').confirmRate, null);
assert.equal(toDA(100, 245.5), 24550);
console.log('✔ كل اختبارات الطلبات والمخزون نجحت');

import { dashStats, inPeriod, sheetCsvUrl } from '../www/js/crm.js';
const NOW = new Date('2026-10-18T12:00:00Z');
assert.ok(inPeriod('2026-10-18T09:00:00+01:00', 'today', NOW) && !inPeriod('2026-10-17T09:00:00+01:00', 'today', NOW));
assert.ok(inPeriod('2026-10-17T09:00:00+01:00', 'yesterday', NOW) && inPeriod('2026-10-12T09:00:00+01:00', 'week', NOW) && !inPeriod('2026-10-01T09:00:00+01:00', 'week', NOW));
const ds = dashStats([
  { createdAt: '2026-10-18T10:00:00+01:00', stage: 'sent', eco: { group: 'delivered' }, total: 1000, wilaya: 'Blida', sheetName: 'A', confirmedBy: 'x', items: [{ name: 'P1', qty: 2 }] },
  { createdAt: '2026-10-18T11:00:00+01:00', stage: 'sent', eco: { group: 'returning' }, total: 500, wilaya: 'Blida', sheetName: 'A', confirmedBy: 'x', items: [{ name: 'P1', qty: 1 }] },
  { createdAt: '2026-10-18T11:30:00+01:00', stage: 'new', total: 700, wilaya: 'Alger', sheetName: 'B', items: [{ name: 'P2', qty: 1 }] },
], 'all', NOW);
assert.equal(ds.total, 3); assert.equal(ds.confirmed, 2); assert.equal(ds.delivered, 1); assert.equal(ds.returned, 1); assert.equal(ds.sales, 1000);
assert.equal(ds.products[0].name, 'P1'); assert.equal(ds.products[0].count, 3); assert.equal(ds.wilayas[0].name, 'Blida');
assert.equal(sheetCsvUrl('https://docs.google.com/spreadsheets/d/AbC-1/edit?gid=123#gid=123'), 'https://docs.google.com/spreadsheets/d/AbC-1/export?format=csv&gid=123');
assert.equal(sheetCsvUrl('https://example.com/x'), '');
console.log('✔ لوحة التحكم والروابط');
