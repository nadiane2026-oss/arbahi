// شاشة الترحيب عند أول تشغيل: تعريف + إنشاء حساب (أول هاتف) أو إدخال كود من هاتف آخر
import { store, sync } from './core.js';
import { saveEcoConfig } from './transport.js';
import { esc } from './util.js';
import { T, P } from './i18n.js';

const FLAG = 'arbahi.welcome';
const seen = () => { try { return !!localStorage.getItem(FLAG); } catch { return true; } };
const mark = () => { try { localStorage.setItem(FLAG, '1'); } catch { /* تجاهل */ } };

const ART = `<svg viewBox="0 0 240 170" class="w-art" aria-hidden="true">
  <defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb627"/><stop offset="1" stop-color="#ff7a1a"/></linearGradient></defs>
  <rect x="70" y="6" width="100" height="158" rx="16" fill="#161a26"/><rect x="77" y="20" width="86" height="130" rx="8" fill="#fff"/>
  <rect x="84" y="28" width="30" height="8" rx="4" fill="#ffb627"/>
  <rect x="86" y="96" width="12" height="40" rx="3" fill="url(#wg)"/><rect x="104" y="80" width="12" height="56" rx="3" fill="url(#wg)"/><rect x="122" y="62" width="12" height="74" rx="3" fill="url(#wg)"/><rect x="140" y="46" width="12" height="90" rx="3" fill="url(#wg)"/>
  <rect x="84" y="44" width="40" height="22" rx="6" fill="#f2f4f8"/><rect x="128" y="44" width="28" height="22" rx="6" fill="#f2f4f8"/>
  <g fill="none" stroke="url(#wg)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 112l22-34 22 12" /><rect x="190" y="84" width="34" height="26" rx="4"/><path d="M190 96h34M207 84v26"/>
  </g>
  <circle cx="40" cy="140" r="9" fill="#ffb627"/><circle cx="212" cy="50" r="7" fill="#ff7a1a"/><circle cx="26" cy="40" r="5" fill="#ffd98a"/>
</svg>`;

let root; let step = 'intro'; let busy = false; let msg = '';
const val = (id) => document.getElementById(id)?.value.trim() ?? '';

function view() {
  if (step === 'intro') {
    return `${ART}<h1>${T('w.hello')}</h1><p class="w-lead">${T('w.about')}</p>
      <ul class="w-list"><li>${T('w.f1')}</li><li>${T('w.f2')}</li><li>${T('w.f3')}</li></ul>
      <button class="btn big" data-w="next">${T('w.start')}</button>`;
  }
  if (step === 'choose') {
    return `<h1>${T('w.chooseTitle')}</h1>
      <button class="w-choice" data-w="code"><b>${T('w.haveCode')}</b><small>${T('w.haveCodeSub')}</small></button>
      <button class="w-choice" data-w="first"><b>${T('w.first')}</b><small>${T('w.firstSub')}</small></button>
      <button class="w-choice" data-w="local"><b>${T('w.local')}</b><small>${T('w.localSub')}</small></button>`;
  }
  const err = msg ? `<div class="banner err"><div>${esc(msg)}</div></div>` : '';
  if (step === 'code') {
    return `<h1>${T('w.codeTitle')}</h1><p class="w-lead">${T('w.codeText')}</p>
      <label class="field"><span>${T('sync.pasteCode')}</span><textarea id="wCode" rows="4" dir="ltr" placeholder="eyJ1Ijoi..."></textarea></label>
      <label class="field"><span>${T('w.passIf')}</span><input id="wPass" type="password" dir="ltr" autocomplete="off"></label>${err}
      <button class="btn big" data-w="docode" ${busy ? 'disabled' : ''}>${T('w.enter')}</button><button class="btn ghost" data-w="back">${T('nav.back')}</button>`;
  }
  return `<h1>${T('w.firstTitle')}</h1><p class="w-lead">${T('w.firstText')}</p>
    <label class="field"><span>${T('sync.url')}</span><input id="wUrl" dir="ltr" placeholder="https://xxxx.supabase.co"></label>
    <label class="field"><span>${T('sync.key')}</span><input id="wKey" dir="ltr"></label>
    <div class="row c2"><label class="field"><span>${T('sync.email')}</span><input id="wMail" type="email" dir="ltr"></label>
    <label class="field"><span>${T('sync.password')}</span><input id="wPw" type="password" dir="ltr" autocomplete="new-password"></label></div>${err}
    <button class="btn big" data-w="dofirst" ${busy ? 'disabled' : ''}>${T('w.create')}</button><button class="btn ghost" data-w="back">${T('nav.back')}</button>`;
}

function paint() { root.querySelector('.w-card').innerHTML = view(); }
function finish() { mark(); root.remove(); root = null; location.hash = '#'; }

async function connected() { try { await sync.syncNow(); } catch { /* يعاد لاحقاً تلقائياً */ } finish(); }

const act = {
  next: () => { step = 'choose'; paint(); },
  back: () => { step = 'choose'; msg = ''; paint(); },
  code: () => { step = 'code'; msg = ''; paint(); },
  first: () => { step = 'first'; msg = ''; paint(); },
  local: finish,
  docode: async () => {
    busy = true; msg = ''; const code = val('wCode'), pass = val('wPass'); paint();
    try {
      const c = sync.parseCode(code);
      await sync.login(c.url, c.key, c.email, c.password || pass);
      if (c.eco) saveEcoConfig(c.eco);
      await connected();
    } catch (e) { msg = e.message || String(e); busy = false; step = 'code'; paint(); const el = document.getElementById('wCode'); if (el) el.value = code; }
  },
  dofirst: async () => {
    const f = { u: val('wUrl'), k: val('wKey'), e: val('wMail'), p: document.getElementById('wPw')?.value || '' };
    busy = true; msg = ''; paint();
    try {
      try { await sync.signup(f.u, f.k, f.e, f.p); }
      catch (e) { if (/already|registered|exists/i.test(e.message)) await sync.login(f.u, f.k, f.e, f.p); else throw e; }
      await connected();
    } catch (e) { msg = e.message || String(e); busy = false; paint(); }
  },
};

export function showWelcome({ force = false } = {}) {
  if (root) return;
  if (!force && (seen() || sync.connected() || store.orders().length || store.products().length)) { mark(); return; }
  step = 'intro'; busy = false; msg = '';
  root = document.createElement('div'); root.className = 'welcome-screen';
  root.innerHTML = `<div class="w-card"></div>`;
  document.body.appendChild(root); paint();
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (b && !b.disabled) act[b.dataset.w]?.(); });
}
void P;
