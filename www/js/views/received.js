import { store, ui, hooks } from '../core.js';
import { DASH_PERIODS, receivedList, receivedCsv } from '../crm.js';
import { tablePdf } from '../pdf.js';
import { esc, fmt, ltr, daHtml, today } from '../util.js';
import { icon, pageHead, saveFile, saveBinary, toast } from '../ui.js';
import { T, D } from '../i18n.js';
const A = (k) => D[k]?.[0] || k; // PDF بالعربية دائماً

if (!ui.rec) ui.rec = { period: 'all', q: '' };
const cur = () => receivedList(store.orders(), ui.rec.period, ui.rec.q);

export function render() {
  const { period, q } = ui.rec;
  const list = cur();
  const sum = list.reduce((a, r) => a + r.total, 0);
  const rows = list.slice(0, 200).map((r) => `<article class="ocard">
      <div class="oc-head"><div><div class="ref">${esc(r.name || '—')}</div><div class="sub num">${r.phone ? ltr(r.phone) : ''}</div></div>
        <div class="stock-big num"><bdi>${fmt(r.total)}</bdi><small>DA</small></div></div>
      <div class="hint">${esc(r.wilaya)}${r.commune ? '، ' + esc(r.commune) : ''} · ${esc(r.product)}</div>
      <div class="hint">${r.tracking ? ltr(r.tracking) + ' · ' : ''}${ltr(r.date)}</div>
    </article>`).join('');
  return `${pageHead('nav.received')}
    <div class="filters">
      <div class="seg">${DASH_PERIODS.map((k) => `<button data-act="rper" data-p="${k}" aria-pressed="${period === k}">${T('dp.' + k)}</button>`).join('')}</div>
      <label class="field grow"><span>${T('prod.search')}</span><input type="search" data-inp="rq" value="${esc(q)}"></label>
    </div>
    <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="kpi k-g"><span class="k-ic">${icon('check')}</span><div><div class="k-l">${T('rec.count')}</div><div class="k-v num"><bdi>${list.length}</bdi></div></div></div>
      <div class="kpi k-y"><span class="k-ic">${icon('wallet')}</span><div><div class="k-l">${T('k.sales')}</div><div class="k-v num">${daHtml(sum)}</div></div></div>
    </div>
    <div class="tools">
      <button class="btn sm" data-act="rpdf" ${list.length ? '' : 'disabled'}>${icon('download')} ${T('rec.pdf')}</button>
      <button class="btn ghost sm" data-act="rcsv" ${list.length ? '' : 'disabled'}>${icon('download')} ${T('rec.csv')}</button>
    </div>
    <p class="hint" style="margin-bottom:12px">${T('rec.hint')}</p>
    ${list.length ? `<div class="ocards">${rows}</div>` : `<div class="empty"><h2>${T('rec.emptyTitle')}</h2><p>${T('rec.emptyText')}</p></div>`}`;
}

const label = () => A('dp.' + ui.rec.period);
export const handlers = {
  click: {
    rper: (el) => { ui.rec.period = el.dataset.p; hooks.refresh(true); },
    rcsv: async () => { try { await saveFile(`customers-received-${today()}.csv`, receivedCsv(cur()), 'text/csv'); } catch (e) { toast(e.message); } },
    rpdf: async (el) => {
      const list = cur(); el.disabled = true;
      try {
        const sum = list.reduce((a, r) => a + r.total, 0);
        const bytes = await tablePdf({
          title: A('rec.pdfTitle'),
          subtitle: `${label()} · ${list.length} · ${fmt(sum)} دج · ${today()}`,
          footer: 'Arbahi',
          cols: [
            { h: '#', w: 4, get: (r, i) => String(i + 1) },
            { h: A('rec.cName'), w: 17, get: (r) => r.name },
            { h: A('rec.cPhone'), w: 15, get: (r) => r.phone },
            { h: A('rec.cPlace'), w: 18, get: (r) => `${r.wilaya}${r.commune ? '، ' + r.commune : ''}` },
            { h: A('rec.cProduct'), w: 24, get: (r) => r.product },
            { h: A('rec.cAmount'), w: 10, get: (r) => fmt(r.total) },
            { h: A('rec.cDate'), w: 12, get: (r) => r.date },
          ],
          rows: list,
        });
        await saveBinary(`customers-received-${today()}.pdf`, bytes, 'application/pdf');
      } catch (e) { toast(e.message || String(e)); } finally { el.disabled = false; }
    },
  },
  input: { rq: (el) => { ui.rec.q = el.value; hooks.refresh(true); const i = document.querySelector('[data-inp="rq"]'); i?.focus(); i?.setSelectionRange(el.value.length, el.value.length); } },
};
