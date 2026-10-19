// تنظيف لمرة واحدة: إزالة "الدفعات" التي ولّدها الإصدار القديم تلقائياً بالتخمين.
import { store } from './core.js';

export function migratePay() {
  if (store.settings().migPay1) return;
  for (const d of store.decharges()) if (d.auto || String(d.id).startsWith('pay-')) store.del('decharge', d.id);
  for (const o of store.orders()) {
    const fix = {};
    if (String(o.payRef || '').startsWith('pay-')) { fix.payRef = ''; fix.payManual = ''; }
    if (o.eco && (o.eco.payHint || o.eco.payFields)) fix.eco = { ...o.eco, payHint: '', payFields: undefined };
    if (Object.keys(fix).length) store.put('order', o.id, { ...o, ...fix });
  }
  store.saveSettings({ migPay1: 1 });
}
