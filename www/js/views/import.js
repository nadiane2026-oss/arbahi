import { store, ui, hooks } from '../core.js';
import { parsePdf } from '../pdf-parse.js';
import { candidatesFor, defaultChoice, sigOf } from '../calc.js';
import { esc, fmt, ltr, daHtml, num, uid } from '../util.js';
import { icon, pageHead, toast } from '../ui.js';
import { T, P } from '../i18n.js';
import { itemsLabel } from './shared.js';

let pending = null; // {parsed, groups, dupes, fileName, refId, ov}
let busy = false;
let error = '';

async function loadPdfJs() {
  const lib = await import('../../vendor/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return lib;
}

const blankLine = () => ({ pid: '', qty: '1', name: '', cost: '' });

export async function handleFile(file) {
  if (!file) return;
  error = ''; pending = null; busy = true; hooks.refresh(true);
  try {
    if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error(P('import.notPdf'));
    const parsed = await parsePdf(await file.arrayBuffer(), await loadPdfJs());
    if (!parsed.rows.length) throw new Error(parsed.warnings[0] || P('err.nothing'));
    const refId = idFor(parsed);
    const known = new Set();
    for (const d of store.decharges()) if (d.id !== refId) d.parcels.forEach((p) => known.add(p.tracking));
    const dupes = new Set(parsed.rows.filter((r) => known.has(r.tracking)).map((r) => r.tracking));
    const products = store.products();
    const combos = store.combos();
    const byPrice = new Map();
    for (const r of parsed.rows) byPrice.set(r.montant, (byPrice.get(r.montant) || 0) + (dupes.has(r.tracking) ? 0 : 1));
    const groups = [...byPrice.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([montant, count]) => {
      const cands = candidatesFor(montant, products, combos);
      const def = defaultChoice(cands);
      const sel = def ? def.sig : cands.length ? '' : 'custom';
      return { montant, count, cands, sel, guess: !!def?.guess, lines: [blankLine()] };
    });
    pending = { parsed, groups, dupes, fileName: file.name, refId, ov: {} };
  } catch (e) {
    error = e.message || String(e);
  } finally {
    busy = false;
    hooks.refresh(true);
  }
}

function idFor(parsed) {
  const base = 'd-' + (String(parsed.ref).replace(/\D/g, '') || uid());
  const ex = store.get('decharge', base);
  return ex && ex.sender && parsed.sender && ex.sender !== parsed.sender ? base + '-' + uid().slice(0, 4) : base;
}

function dropHtml() {
  return `<div class="drop" id="drop">
    ${icon('upload', 'big')}
    <h2>${T('import.dropTitle')}</h2>
    <p class="hint">${T('import.dropText')}</p>
    <button class="btn" data-act="pick">${T('import.pick')}</button>
  </div>`;
}

function groupHtml(g, i, products, byId) {
  const tag = (c) => (c.source === 'saved' ? ' ✓' : c.source === 'multiple' ? ' ×' : '');
  const select = `<select data-chg="gsel" data-i="${i}" aria-label="${esc(P('th.product'))}">
      ${g.sel === '' ? `<option value="" selected disabled>${esc(P('import.choose'))}</option>` : ''}
      ${g.cands.map((c) => `<option value="${esc(c.sig)}" ${g.sel === c.sig ? 'selected' : ''}>${esc(itemsLabel(c.items, byId) + tag(c))}</option>`).join('')}
      <option value="custom" ${g.sel === 'custom' ? 'selected' : ''}>${esc(P('import.newCombo'))}</option>
      <option value="none" ${g.sel === 'none' ? 'selected' : ''}>${esc(P('import.none'))}</option>
    </select>`;
  let extra = '';
  if (g.sel === '' ) extra = `<p class="hint warn-t">${T('import.ask')}</p>`;
  else if (g.guess) extra = `<p class="hint warn-t">${T('import.guess')}</p>`;
  if (g.sel === 'custom') {
    const lines = g.lines.map((ln, j) => `<div class="line">
        <label class="field"><span>${T('import.lineProduct')}</span>
          <select data-chg="lpid" data-i="${i}" data-j="${j}">
            <option value="" ${ln.pid === '' ? 'selected' : ''} disabled>${esc(P('import.choose'))}</option>
            ${products.map((p) => `<option value="${esc(p.id)}" ${ln.pid === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            <option value="new" ${ln.pid === 'new' ? 'selected' : ''}>${esc(P('import.newProduct'))}</option>
          </select></label>
        <label class="field q"><span>${T('import.qty')}</span><input class="n" inputmode="numeric" data-inp="lqty" data-i="${i}" data-j="${j}" value="${esc(ln.qty)}"></label>
        ${g.lines.length > 1 ? `<button class="icon-btn" data-act="lrm" data-i="${i}" data-j="${j}" aria-label="${esc(P('import.removeLine'))}">${icon('x')}</button>` : ''}
        ${ln.pid === 'new' ? `<label class="field wide"><span>${T('import.pName')}</span><input data-inp="lname" data-i="${i}" data-j="${j}" value="${esc(ln.name)}" placeholder="${esc(P('import.pNamePh'))}"></label>
          <label class="field wide"><span>${T('import.pCost')}</span><input class="n" inputmode="decimal" data-inp="lcost" data-i="${i}" data-j="${j}" value="${esc(ln.cost)}" placeholder="0"></label>` : ''}
      </div>`).join('');
    extra = `<p class="hint">${T('import.askNew')}</p>${lines}<button class="btn ghost sm" data-act="ladd" data-i="${i}">${icon('plus')} ${T('import.addLine')}</button>`;
  }
  return `<div class="group">
      <div class="group-head">
        <b class="num"><bdi>${fmt(g.montant)}</bdi> DA</b><span class="hint">${T('import.groupCount', { n: g.count })}</span>
        ${select}
      </div>${extra}</div>`;
}

function previewHtml() {
  const { parsed, groups, dupes } = pending;
  const products = store.products();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const existing = store.get('decharge', pending.refId);
  const okNote = parsed.warnings.length
    ? parsed.warnings.map((w) => `<div class="banner">${icon('alert')}<div>${esc(w)}</div></div>`).join('')
    : `<div class="banner ok">${icon('check')}<div>${T('import.ok', { n: parsed.rows.length, net: daHtml(parsed.sumNet) })}</div></div>`;
  const dupNote = dupes.size ? `<div class="banner">${icon('alert')}<div>${T('import.dupes', { n: dupes.size })}</div></div>` : '';
  const exNote = existing ? `<div class="banner">${icon('alert')}<div>${T('import.exists', { ref: parsed.ref })}</div></div>` : '';
  const gmap = new Map(groups.map((g) => [g.montant, g]));

  const rows = parsed.rows.map((r) => {
    const g = gmap.get(r.montant);
    const ambiguous = g && g.cands.length > 1 && !dupes.has(r.tracking);
    const L = (k) => esc(P(k));
    const prod = ambiguous
      ? `<td data-l="${L('th.product')}"><select data-chg="pov" data-t="${esc(r.tracking)}" aria-label="${L('th.product')}">
          <option value="" ${!pending.ov[r.tracking] ? 'selected' : ''}>${esc(g.sel && g.sel !== 'custom' && g.sel !== 'none' ? '= ' + (itemsLabel(g.cands.find((c) => c.sig === g.sel)?.items || [], byId)) : '—')}</option>
          ${g.cands.map((c) => `<option value="${esc(c.sig)}" ${pending.ov[r.tracking] === c.sig ? 'selected' : ''}>${esc(itemsLabel(c.items, byId))}</option>`).join('')}</select></td>`
      : '';
    return `<tr style="${dupes.has(r.tracking) ? 'opacity:.45' : ''}">
      <td data-l="${L('th.customer')}" class="full"><div class="ref">${esc(r.name)}</div><div class="sub">${ltr(r.phone)}</div></td>
      <td data-l="${L('th.address')}">${esc(r.wilaya)}${r.commune && r.commune !== r.wilaya ? '، ' + esc(r.commune) : ''}</td>
      <td data-l="${L('th.amount')}" class="n num"><bdi>${fmt(r.montant)}</bdi></td>
      <td data-l="${L('th.courierFee')}" class="n num"><bdi>${fmt(r.montant - r.net)}</bdi></td>
      <td data-l="${L('th.net')}" class="n num"><bdi>${fmt(r.net)}</bdi></td>${prod || `<td data-l="${L('th.product')}" class="muted-cell">${g && g.sel && g.sel !== 'custom' && g.sel !== 'none' ? esc(itemsLabel(g.cands.find((c) => c.sig === g.sel)?.items || [], byId)) : ''}</td>`}
    </tr>`;
  }).join('');

  return `${okNote}${exNote}${dupNote}
    <div class="summary">
      <div><div class="k">${T('import.sumRef')}</div><div class="v">${esc(parsed.ref || '—')}</div></div>
      <div><div class="k">${T('import.sumDate')}</div><div class="v num">${ltr(parsed.date)}</div></div>
      <div><div class="k">${T('import.sumSender')}</div><div class="v">${esc(parsed.sender || '—')}</div></div>
      <div><div class="k">${T('import.sumParcels')}</div><div class="v num">${parsed.rows.length}</div></div>
      <div><div class="k">${T('import.sumNet')}</div><div class="v num">${daHtml(parsed.sumNet)}</div></div>
    </div>
    <div class="section-title"><h2>${T('import.groups')}</h2></div>
    <p class="hint" style="margin:-6px 0 12px">${T('import.groupsHint')}</p>
    <div class="groups">${groups.map((g, i) => groupHtml(g, i, products, byId)).join('')}</div>
    <details class="more" ${window.innerWidth >= 960 ? 'open' : ''}><summary>${T('import.parcels', { n: parsed.rows.length })}</summary>
    <div class="ledger-wrap" style="margin-top:10px"><table class="ledger">
      <thead><tr><th>${T('th.customer')}</th><th>${T('th.address')}</th><th class="n">${T('th.amount')}</th><th class="n">${T('th.courierFee')}</th><th class="n">${T('th.net')}</th><th>${T('th.product')}</th></tr></thead>
      <tbody>${rows}</tbody></table></div></details>
    <div class="savebar">
      <button class="btn ghost" data-act="discard">${T('import.discard')}</button>
      <button class="btn" data-act="save">${icon('check')} ${T('import.save')}</button>
    </div>`;
}

export function render() {
  const body = busy ? `<div class="drop"><h2>${T('import.reading')}</h2></div>` : pending ? previewHtml() : dropHtml();
  return pageHead('import.title') +
    (error ? `<div class="banner err">${icon('alert')}<div>${esc(error)}</div></div>` : '') +
    body + `<input type="file" id="pdfInput" accept="application/pdf,.pdf" hidden data-chg="file">`;
}

/** يحوّل اختيار مجموعة إلى {items|null, create:[منتجات جديدة], saveCombo} أو رسالة خطأ */
function resolveGroup(g, newProducts) {
  const m = fmt(g.montant);
  if (g.sel === '') return { err: P('import.needChoice', { m }) };
  if (g.sel === 'none') return { items: [], none: true };
  if (g.sel === 'custom') {
    const items = [];
    for (const ln of g.lines) {
      const q = Math.round(num(ln.qty));
      if (!ln.pid || !(q >= 1)) return { err: P('import.needProduct', { m }) };
      if (ln.pid === 'new') {
        if (!ln.name.trim() || ln.cost.trim() === '') return { err: P('import.needCost', { m }) };
        const unit = g.lines.length === 1 && g.montant % q === 0 ? g.montant / q : 0;
        const p = { id: uid(), name: ln.name.trim(), price: unit, cost: num(ln.cost) };
        newProducts.push(p);
        items.push({ productId: p.id, qty: q });
      } else items.push({ productId: ln.pid, qty: q });
    }
    return { items, saveCombo: true };
  }
  const c = g.cands.find((x) => x.sig === g.sel);
  if (!c) return { err: P('import.needChoice', { m }) };
  return { items: structuredClone(c.items), saveCombo: !(c.source === 'saved' || (c.source === 'exact' && g.cands.length === 1)) };
}

function save() {
  const { parsed, groups, dupes, refId, ov } = pending;
  const newProducts = [];
  const res = new Map();
  for (const g of groups) {
    // مجموعة بلا اختيار مقبولة إذا كل طرودها لها اختيار فردي
    if (g.sel === '' && parsed.rows.filter((r) => r.montant === g.montant && !dupes.has(r.tracking)).every((r) => ov[r.tracking])) { res.set(g.montant, { items: [] }); continue; }
    const r = resolveGroup(g, newProducts);
    if (r.err) return toast(r.err);
    res.set(g.montant, r);
  }
  const cs = store.combos();
  for (const g of groups) {
    const r = res.get(g.montant);
    if (!r.saveCombo || !r.items.length) continue;
    const sig = sigOf(r.items);
    if (cs.some((c) => Math.round(num(c.price)) === g.montant && sigOf(c.items) === sig)) continue;
    const id = uid();
    store.put('combo', id, { id, price: g.montant, items: r.items });
  }
  newProducts.forEach((p) => store.put('product', p.id, p));
  const parcels = parsed.rows.filter((r) => !dupes.has(r.tracking)).map(({ ok, ...r }) => {
    const g = groups.find((x) => x.montant === r.montant);
    const o = ov[r.tracking] && g.cands.find((c) => c.sig === ov[r.tracking]);
    const base = res.get(r.montant);
    const items = o ? structuredClone(o.items) : base.items;
    return { ...r, items, noProduct: !o && !!base.none };
  });
  store.put('decharge', refId, {
    id: refId, ref: parsed.ref, date: parsed.date, sender: parsed.sender, count: parcels.length,
    total: parsed.total, parcels, createdAt: Date.now(),
  });
  // الطرود المطابقة لطلبات التطبيق (بالتتبع) تُعتبر مدفوعة ولا تُحسب مرتين
  const byTrk = new Map(store.orders().filter((o) => o.tracking).map((o) => [o.tracking, o]));
  for (const p of parcels) { const o = byTrk.get(p.tracking); if (o) store.put('order', o.id, { ...o, payManual: 'paid', payRef: refId }); }
  pending = null; error = '';
  ui.period = 'all';
  toast(P('import.saved', { n: parcels.length }));
  hooks.go('profit');
}

const L = (el) => pending.groups[+el.dataset.i].lines[+el.dataset.j];

export const handlers = {
  click: {
    pick: () => document.getElementById('pdfInput').click(),
    discard: () => { pending = null; error = ''; hooks.refresh(true); },
    ladd: (el) => { pending.groups[+el.dataset.i].lines.push({ pid: '', qty: '1', name: '', cost: '' }); hooks.refresh(true); },
    lrm: (el) => { pending.groups[+el.dataset.i].lines.splice(+el.dataset.j, 1); hooks.refresh(true); },
    save,
  },
  change: {
    file: (el) => { const f = el.files[0]; el.value = ''; handleFile(f); },
    gsel: (el) => { const g = pending.groups[+el.dataset.i]; g.sel = el.value; g.guess = false; hooks.refresh(true); },
    lpid: (el) => { L(el).pid = el.value; hooks.refresh(true); },
    pov: (el) => { if (el.value) pending.ov[el.dataset.t] = el.value; else delete pending.ov[el.dataset.t]; hooks.refresh(true); },
  },
  input: {
    lqty: (el) => { L(el).qty = el.value; },
    lname: (el) => { L(el).name = el.value; },
    lcost: (el) => { L(el).cost = el.value; },
  },
};

export function afterRender(root) {
  const drop = root.querySelector('#drop');
  if (!drop) return;
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handleFile(e.dataTransfer.files[0]); });
}
