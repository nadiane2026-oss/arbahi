// الحالة المشتركة بين الشاشات (تفادياً للاستيراد الدائري)
import { createStore } from './store.js';
import { createSync } from './sync.js';

export const store = createStore();
export const sync = createSync(store);
export const ui = { tab: 'home', period: 'month' };
export const hooks = { refresh() {}, go() {}, openSheet() {} };

/** يربط أحداث click/change/input عبر السمات data-act / data-chg / data-inp */
export function wire(root, getHandlers) {
  const run = (kind, attr, e) => {
    const el = e.target.closest?.(`[${attr}]`);
    if (!el || !root.contains(el)) return;
    const h = getHandlers()?.[kind]?.[el.getAttribute(attr)];
    if (h) h(el, e);
  };
  root.addEventListener('click', (e) => run('click', 'data-act', e));
  root.addEventListener('change', (e) => run('change', 'data-chg', e));
  root.addEventListener('input', (e) => run('input', 'data-inp', e));
}
