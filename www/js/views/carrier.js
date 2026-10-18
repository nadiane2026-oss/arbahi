import { store, hooks } from '../core.js';
import { ecoConfig, saveEcoConfig, isNative } from '../transport.js';
import { testEcotrack, refreshStatuses, lastDebug } from '../ops.js';
import { esc } from '../util.js';
import { icon, pageHead, toast } from '../ui.js';
import { T, P } from '../i18n.js';

export const noRerender = true;
let result = null;

export function render() {
  const c = ecoConfig();
  const s = store.settings();
  const app = !isNative() ? `<div class="banner">${icon('alert')}<div>${T('ch.webWarn')}</div></div>` : '';
  const res = result ? `<div class="banner ${result.ok ? 'ok' : 'err'}">${icon(result.ok ? 'check' : 'alert')}<div>${esc(result.msg)}</div></div>` : '';
  return `${pageHead('nav.carrier')}${app}
    <section class="block carrier">
      <div class="oc-head"><div><h2>Ecotrack</h2><p class="hint">${T('car.text')}</p></div><span class="tag ${c.token ? 'eco-delivered' : ''}">${c.token ? T('car.linked') : T('car.notLinked')}</span></div>
      <label class="field"><span>${T('car.url')}</span><input id="ecoUrl" dir="ltr" value="${esc(c.url || '')}" placeholder="https://yourcompany.ecotrack.dz"></label>
      <label class="field"><span>${T('car.token')}</span><input id="ecoTok" type="password" dir="ltr" value="${esc(c.token || '')}" autocomplete="off"></label>
      <label class="check"><input type="checkbox" data-chg="askc" ${s.shipAskCollection ? 'checked' : ''}> <span>${T('eco.askCollection')}</span></label>
      <p class="hint">${T('car.privacy')}</p>
      <div class="oc-actions"><button class="btn" data-act="csave">${icon('check')} ${T('car.save')}</button>
        <button class="btn ghost" data-act="ctest">${T('eco.test')}</button>
        <button class="btn ghost" data-act="cstatus">${icon('refresh')} ${T('orders.refreshStatus')}</button></div>
      ${res}
    </section>
    ${lastDebug.eco ? `<details class="more"><summary>${T('car.debug')}</summary><pre class="debug" dir="ltr">${esc(JSON.stringify({ path: lastDebug.eco.path, status: lastDebug.eco.status, data: lastDebug.eco.data }, null, 2).slice(0, 3000))}</pre></details>` : ''}`;
}

const val = (id) => document.getElementById(id)?.value.trim() ?? '';
export const handlers = {
  click: {
    csave: () => { saveEcoConfig({ url: val('ecoUrl'), token: val('ecoTok') }); toast(P('stock.saved')); hooks.refresh(true); },
    ctest: async () => {
      saveEcoConfig({ url: val('ecoUrl'), token: val('ecoTok') });
      try {
        const r = await testEcotrack();
        const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
        const ok = r.status === 200 && /VALID_TOKEN/.test(txt) && !/INVALID/.test(txt);
        result = { ok, msg: ok ? P('eco.ok') : P('eco.bad', { e: txt.slice(0, 160) }) };
      } catch (e) { result = { ok: false, msg: P('eco.bad', { e: e.message }) }; }
      hooks.refresh(true);
    },
    cstatus: async () => { try { const r = await refreshStatuses(); toast(P('orders.statusDone', { n: r.updated })); } catch (e) { toast(e.message); } hooks.refresh(true); },
  },
  change: { askc: (el) => store.saveSettings({ shipAskCollection: el.checked ? 1 : 0 }) },
};
