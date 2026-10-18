import { store, sync, hooks } from '../core.js';
import { COMMIT_MODE_KEYS, finalCost, productMeta, splitProfit } from '../calc.js';
import { toDA } from '../crm.js';
import { esc, fmt, daHtml, isSet, num, today, uid } from '../util.js';
import { icon, pageHead, saveFile, toast } from '../ui.js';
import { T, P } from '../i18n.js';
import { prefs, setLang, setTheme, LANGS, THEMES } from '../prefs.js';
import { itemsLabel } from './shared.js';

// الإعدادات تحفظ نفسها عند الخروج من كل حقل، ولا تُعاد رسمها لتفادي ضياع المؤشر
export const noRerender = true;

const val = (v) => (isSet(v) ? v : '');
const field = (label, attrs, v, cls = '') =>
  `<label class="field"><span>${label}</span><input class="${cls}" value="${esc(v)}" ${attrs}></label>`;


const seg3 = (items, cur, act) => `<div class="seg" role="group">${items.map(([k, lbl]) => `<button data-act="${act}" data-v="${k}" aria-pressed="${cur === k}">${lbl}</button>`).join('')}</div>`;
function appearanceBlock() {
  return `<section class="block">
    <h2>${T('appearance.title')}</h2>
    <div class="hint">${T('appearance.lang')}</div>
    ${seg3([['both', 'عربي + English'], ['ar', 'عربي'], ['en', 'English']], prefs.lang, 'setlang')}
    <div class="hint">${T('appearance.theme')}</div>
    ${seg3(THEMES.map((k) => [k, T('theme.' + k)]), prefs.theme, 'settheme')}
  </section>`;
}

function combosBlock() {
  const byId = Object.fromEntries(store.products().map((p) => [p.id, p]));
  const list = store.combos().sort((a, b) => a.price - b.price);
  return `<section class="block">
    <h2>${T('combos.title')}</h2>
    <p class="hint">${T('combos.text')}</p>
    ${list.length ? list.map((c) => `<div class="item combo"><div><b class="num"><bdi>${fmt(c.price)}</bdi> DA</b> <span class="hint">=</span> ${esc(itemsLabel(c.items, byId))}</div>
      <button class="icon-btn" data-act="combodel" data-id="${esc(c.id)}" aria-label="${esc(P('combos.delete'))}">${icon('trash')}</button></div>`).join('') : `<p class="hint">${T('combos.empty')}</p>`}
  </section>`;
}


const csvList = (s) => String(s || '').split(/[,،;]/).map((x) => x.trim()).filter(Boolean);

function fxBlock(s) {
  const da = toDA(s.metaForeign, s.metaRate);
  return `<section class="block">
    <h2>${T('fx.title')}</h2>
    <p class="hint">${T('fx.text')}</p>
    <div class="row c3">
      ${field(T('fx.amount'), 'data-chg="g" data-inp="g" data-f="metaForeign" inputmode="decimal"', val(s.metaForeign), 'n')}
      <label class="field"><span>${T('fx.currency')}</span><select data-chg="g" data-f="metaCurrency"><option ${s.metaCurrency === 'USD' ? 'selected' : ''}>USD</option><option ${s.metaCurrency === 'EUR' ? 'selected' : ''}>EUR</option></select></label>
      ${field(T('fx.rate'), 'data-chg="g" data-inp="g" data-f="metaRate" inputmode="decimal"', val(s.metaRate), 'n')}
    </div>
    <div class="callout"><div class="hint">${T('fx.result')}</div><div class="big num" id="fxResult">${daHtml(da, 2)}</div></div>
  </section>`;
}

function crmBlock(s) {
  return `<section class="block">
      <h2>${T('confirmers.title')}</h2><p class="hint">${T('confirmers.text')}</p>
      ${field(T('confirmers.names'), 'data-chg="csv" data-f="confirmers"', (s.confirmers || []).join('، '))}
      <h2 style="margin-top:6px">${T('calls.title')}</h2><p class="hint">${T('calls.text')}</p>
      ${field(T('calls.title'), 'data-chg="csv" data-f="callResults"', (s.callResults || []).join('، '))}
    </section>`;
}

function costBlock(s) {
  return `<section class="block">
    <h2>${T('cost.title')}</h2>
    <p class="hint">${T('cost.text')}</p>
    <div class="row c3">
      ${field(T('cost.meta'), 'data-inp="g" data-chg="g" data-f="metaCost" inputmode="decimal"', val(s.metaCost), 'n')}
      ${field(T('cost.confirm'), 'data-inp="g" data-chg="g" data-f="confirmRate" inputmode="decimal"', val(s.confirmRate), 'n')}
      ${field(T('cost.delivery'), 'data-inp="g" data-chg="g" data-f="deliveryRate" inputmode="decimal"', val(s.deliveryRate), 'n')}
    </div>
    <div class="callout"><div class="hint">${T('cost.final')}</div>
      <div class="big num" id="finalMeta">${daHtml(finalCost(s.metaCost, s.confirmRate, s.deliveryRate))}</div>
      <div class="hint" id="finalHow" style="direction:ltr;text-align:right">${how(s.metaCost, s.confirmRate, s.deliveryRate)}</div></div>
  </section>`;
}
const how = (m, c, d) => `${fmt(num(m))} ÷ (${fmt(num(c))}% × ${fmt(num(d))}%)`;

function commitBlock() {
  const list = store.commitments();
  return `<section class="block">
    <h2>${T('commit.title')}</h2>
    <p class="hint">${T('commit.text')}</p>
    ${list.map((c) => `<div class="item">
      <div class="item-head">
        ${field(T('commit.name'), `data-chg="cf" data-id="${esc(c.id)}" data-f="name"`, c.name)}
        <button class="icon-btn" data-act="cdel" data-id="${esc(c.id)}" aria-label="${esc(P('commit.delete'))}">${icon('trash')}</button>
      </div>
      <div class="row c2">
        <label class="field"><span>${T('commit.mode')}</span><select data-chg="cf" data-id="${esc(c.id)}" data-f="mode">
          ${COMMIT_MODE_KEYS.map((k) => `<option value="${k}" ${c.mode === k ? 'selected' : ''}>${esc(P('mode.' + k))}</option>`).join('')}</select></label>
        ${field(T('commit.amount'), `data-chg="cf" data-id="${esc(c.id)}" data-f="amount" inputmode="decimal"`, c.amount, 'n')}
      </div></div>`).join('')}
    <div><button class="btn ghost sm" data-act="cadd">${icon('plus')} ${T('commit.add')}</button></div>
  </section>`;
}

function splitBlock(s) {
  return `<section class="block">
    <h2>${T('split.title')}</h2>
    <p class="hint">${T('split.text')}</p>
    <div class="row c2" style="grid-template-columns:2fr 1fr">
      ${field(T('split.name'), 'data-chg="sp" data-f="salimName"', s.salimName)}
      ${field(T('split.pctNet'), 'data-chg="sp" data-f="salimPct" inputmode="decimal"', s.salimPct, 'n')}
    </div>
    <div class="hint">${T('split.thenRest')}</div>
    ${s.restSplit.map((r, i) => `<div class="item-head">
      ${field(T('split.name'), `data-chg="rs" data-i="${i}" data-f="name"`, r.name)}
      ${field(T('split.pctRest'), `data-chg="rs" data-i="${i}" data-f="pct" inputmode="decimal"`, r.pct, 'n')}
      <button class="icon-btn" data-act="rdel" data-i="${i}" aria-label="${esc(P('split.remove'))}">${icon('trash')}</button></div>`).join('')}
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <button class="btn ghost sm" data-act="radd">${icon('plus')} ${T('split.add')}</button>
      <span id="splitTotal"></span>
    </div>
    <div class="callout"><div class="hint" id="splitExample"></div></div>
  </section>`;
}

function syncBlock() {
  const c = sync.config();
  const on = sync.connected();
  return `<section class="block" id="syncBlock">
    <h2>${T('sync.title')}</h2>
    ${on ? `
      <p class="hint">${T('sync.connected', { email: c.email || '' })}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <button class="btn sm" data-act="snow">${icon('refresh')} ${T('sync.now')}</button>
        <button class="btn ghost sm" data-act="scode">${T('sync.copyCode')}</button>
        <button class="btn danger sm" data-act="sout">${T('sync.disconnect')}</button>
      </div>
      <p class="hint">${T('sync.codeHelp')}</p>`
    : `
      <p class="hint">${T('sync.optional')}</p>
      <label class="field"><span>${T('sync.pasteCode')}</span><input id="code" placeholder="${esc(P('sync.pasteHere'))}" data-chg="code" dir="ltr"></label>
      ${field(T('sync.url'), 'id="sUrl" dir="ltr" placeholder="https://xxxx.supabase.co"', c.url || '')}
      ${field(T('sync.key'), 'id="sKey" dir="ltr"', c.key || '')}
      <div class="row c2">
        ${field(T('sync.email'), 'id="sMail" type="email" dir="ltr"', c.email || '')}
        <label class="field"><span>${T('sync.password')}</span><input id="sPass" type="password" dir="ltr"></label>
      </div>
      <div><button class="btn" data-act="slogin">${T('sync.connect')}</button></div>`}
  </section>`;
}

function backupBlock() {
  return `<section class="block">
    <h2>${T('backup.title')}</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button class="btn ghost sm" data-act="bexp">${icon('download')} ${T('backup.export')}</button>
      <button class="btn ghost sm" data-act="bimp">${T('backup.import')}</button>
      <button class="btn danger sm" data-act="wipe">${icon('trash')} ${T('backup.wipe')}</button>
    </div>
    <input type="file" id="backupIn" accept="application/json,.json" hidden data-chg="bfile">
    ${store.volatile ? `<div class="banner">${icon('alert')}<div>${T('backup.volatile')}</div></div>` : ''}
  </section>`;
}

export function render() {
  const s = store.settings();
  return `${pageHead('settings.title')}
    <div class="settings">
      <div>${appearanceBlock()}${costBlock(s)}${fxBlock(s)}${combosBlock()}</div>
      <div>${crmBlock(s)}${commitBlock()}${splitBlock(s)}${syncBlock()}${backupBlock()}</div>
    </div>`;
}

export function afterRender() { updateSplitInfo(); }

function updateSplitInfo() {
  const el = document.getElementById('splitTotal');
  if (!el) return;
  const s = store.settings();
  const total = s.restSplit.reduce((a, r) => a + num(r.pct), 0);
  const ok = Math.abs(total - 100) < 0.001;
  el.className = ok ? 'total-ok' : 'total-bad';
  el.innerHTML = ok ? T('split.ok') : T('split.bad', { t: fmt(total, total % 1 ? 1 : 0) });
  const ex = splitProfit(10000, s);
  document.getElementById('splitExample').innerHTML =
    T('split.example', { amount: daHtml(10000), list: ex.map((p) => `${esc(p.name)} <b class="num"><bdi dir="ltr">${fmt(p.amount)}</bdi></b>`).join('، ') });
}

const gv = (f) => num(document.querySelector(`[data-inp="g"][data-f="${f}"]`)?.value);
const lastRest = (patch) => store.saveSettings(patch);

export const handlers = {
  click: {
    setlang: (el) => { setLang(el.dataset.v); },
    settheme: (el) => { setTheme(el.dataset.v); },
    combodel: (el) => { store.del('combo', el.dataset.id); hooks.refresh(true); },
    cadd: () => { const id = uid(); store.put('commitment', id, { id, name: P('commit.newName'), mode: 'per_order', amount: 0 }); hooks.refresh(true); },
    cdel: (el) => { store.del('commitment', el.dataset.id); hooks.refresh(true); },
    radd: () => { const s = store.settings(); lastRest({ restSplit: [...s.restSplit, { name: P('split.newName'), pct: 0 }] }); hooks.refresh(true); },
    rdel: (el) => { const s = store.settings(); lastRest({ restSplit: s.restSplit.filter((_, i) => i !== +el.dataset.i) }); hooks.refresh(true); },
    slogin: async (el) => {
      const g = (id) => document.getElementById(id).value;
      el.disabled = true;
      try {
        await sync.login(g('sUrl'), g('sKey'), g('sMail'), g('sPass'));
        toast(P('sync.linked'));
        await sync.syncNow();
        hooks.refresh(true);
      } catch (e) { toast(e.message || P('sync.cantLink')); } finally { el.disabled = false; }
    },
    snow: async () => { await sync.syncNow(); toast(sync.status === 'ok' ? P('sync.done') : sync.message || P('sync.failed')); },
    sout: () => { if (confirm(P('sync.confirmOut'))) { sync.logout(); hooks.refresh(true); } },
    scode: async () => {
      const code = sync.connectionCode();
      try { await navigator.clipboard.writeText(code); toast(P('sync.copied')); } catch { prompt(P('sync.copyPrompt'), code); }
    },
    bexp: async () => { await saveFile(`arbahi-backup-${today()}.json`, JSON.stringify(store.exportJson()), 'application/json'); },
    bimp: () => document.getElementById('backupIn').click(),
    wipe: () => {
      if (!confirm(P('backup.wipeConfirm'))) return;
      store.wipe(); hooks.refresh(true); toast(P('backup.wiped'));
    },
  },
  change: {
    g: (el) => {
      const f = el.dataset.f;
      store.saveSettings({ [f]: f === 'metaCurrency' ? el.value : num(el.value) });
      const c = store.settings();
      if (num(c.metaForeign) > 0 && num(c.metaRate) > 0) {
        const da = toDA(c.metaForeign, c.metaRate);
        store.saveSettings({ metaCost: da });
        const mc = document.querySelector('[data-f="metaCost"]'); if (mc) mc.value = da;
        document.getElementById('finalMeta').innerHTML = daHtml(finalCost(da, c.confirmRate, c.deliveryRate));
      }
    },
    csv: (el) => { const f = el.dataset.f; store.saveSettings({ [f]: csvList(el.value) }); },
    cf: (el) => {
      const c = store.get('commitment', el.dataset.id);
      if (!c) return;
      const f = el.dataset.f;
      store.put('commitment', c.id, { ...c, [f]: f === 'amount' ? num(el.value) : f === 'mode' ? el.value : el.value.trim() || P('commit.newName') });
    },
    sp: (el) => {
      const f = el.dataset.f;
      store.saveSettings({ [f]: f === 'salimPct' ? num(el.value) : el.value.trim() || 'سليم' });
      updateSplitInfo();
    },
    rs: (el) => {
      const s = store.settings();
      const rest = s.restSplit.map((r) => ({ ...r }));
      const r = rest[+el.dataset.i];
      if (!r) return;
      if (el.dataset.f === 'pct') r.pct = num(el.value); else r.name = el.value.trim() || 'شخص';
      store.saveSettings({ restSplit: rest });
      updateSplitInfo();
    },
    code: (el) => {
      try {
        const c = sync.parseCode(el.value);
        document.getElementById('sUrl').value = c.url; document.getElementById('sKey').value = c.key; document.getElementById('sMail').value = c.email;
        toast(P('sync.filled'));
      } catch (e) { toast(e.message); }
    },
    bfile: async (el) => {
      const f = el.files[0]; el.value = '';
      if (!f) return;
      try { const n = store.importJson(JSON.parse(await f.text())); hooks.refresh(true); toast(P('backup.imported', { n })); }
      catch (e) { toast(e.message || P('backup.invalid')); }
    },
  },
  input: {
    g: () => {
      const fx = toDA(gv('metaForeign'), gv('metaRate'));
      const fxEl = document.getElementById('fxResult'); if (fxEl) fxEl.innerHTML = daHtml(fx, 2);
      const m = fx > 0 ? fx : gv('metaCost'), c = gv('confirmRate'), d = gv('deliveryRate');
      document.getElementById('finalMeta').innerHTML = daHtml(finalCost(m, c, d));
      document.getElementById('finalHow').textContent = how(m, c, d);
    },
  },
};
