import { store } from '../core.js';
import { pageHead } from '../ui.js';
import { teamHtml } from './orders.js';

export function render() {
  return pageHead('nav.team') + teamHtml(store.orders(), store.settings());
}
export const handlers = { click: {} };
