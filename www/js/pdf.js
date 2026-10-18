// يرسم جدولاً على canvas (المتصفح يتولى تشكيل الحروف العربية) ثم يضع الصفحات في ملف PDF بسيط
const W = 1240, H = 1754, M = 60, ROW = 46;

function fit(ctx, text, max) {
  let s = String(text ?? '');
  if (ctx.measureText(s).width <= max) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

/** cols: [{h, w (نسبة), get(row)}] مرتبة من اليمين إلى اليسار. rows: مصفوفة كائنات */
export async function tablePdf({ title, subtitle, cols, rows, footer }) {
  const font = (px, wt = 500) => `${wt} ${px}px Cairo, "Segoe UI", Tahoma, sans-serif`;
  const sumW = cols.reduce((a, c) => a + c.w, 0);
  const inner = W - M * 2;
  const widths = cols.map((c) => (c.w / sumW) * inner);
  const perFirst = Math.floor((H - 330) / ROW);
  const perNext = Math.floor((H - 2 * M - 80) / ROW);
  const pages = [];
  let i = 0, first = true;
  do {
    const n = first ? perFirst : perNext;
    pages.push({ chunk: rows.slice(i, i + n), first, offset: i });
    i += n; first = false;
  } while (i < rows.length);

  const jpegs = [];
  for (let p = 0; p < pages.length; p++) {
    const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
    let y = M;
    if (pages[p].first) {
      ctx.fillStyle = '#161a26'; ctx.textAlign = 'right'; ctx.font = font(44, 800);
      ctx.fillText(title, W - M, y + 30);
      ctx.fillStyle = '#667085'; ctx.font = font(26, 500);
      ctx.fillText(subtitle, W - M, y + 86);
      y += 150;
    }
    // رأس الجدول
    ctx.fillStyle = '#ff7a1a'; ctx.fillRect(M, y, inner, ROW);
    let x = W - M;
    ctx.fillStyle = '#fff'; ctx.font = font(22, 700); ctx.textAlign = 'right';
    cols.forEach((c, k) => { ctx.fillText(fit(ctx, c.h, widths[k] - 16), x - 8, y + ROW / 2); x -= widths[k]; });
    y += ROW;
    pages[p].chunk.forEach((r, ri) => {
      if (ri % 2) { ctx.fillStyle = '#f4f5f9'; ctx.fillRect(M, y, inner, ROW); }
      ctx.fillStyle = '#161a26'; ctx.font = font(21, 500);
      let cx = W - M;
      cols.forEach((c, k) => {
        const v = c.get(r, pages[p].offset + ri);
        ctx.textAlign = 'right';
        ctx.fillText(fit(ctx, v, widths[k] - 16), cx - 8, y + ROW / 2);
        cx -= widths[k];
      });
      y += ROW;
    });
    ctx.fillStyle = '#9aa1b2'; ctx.font = font(20, 500); ctx.textAlign = 'center'; ctx.direction = 'ltr';
    ctx.fillText(`${p + 1} / ${pages.length}${footer ? '  ·  ' + footer : ''}`, W / 2, H - 30);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88));
    jpegs.push(new Uint8Array(await blob.arrayBuffer()));
  }
  return buildPdf(jpegs);
}

function buildPdf(jpegs) {
  const enc = new TextEncoder();
  const chunks = []; const offsets = []; let len = 0;
  const push = (b) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
  const obj = (n, parts) => { offsets[n] = len; push(`${n} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); };
  const N = jpegs.length;
  push('%PDF-1.4\n');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Count ${N} /Kids [${jpegs.map((_, k) => `${3 + k * 3} 0 R`).join(' ')}] >>`]);
  jpegs.forEach((j, k) => {
    const pg = 3 + k * 3, im = pg + 1, ct = pg + 2;
    obj(pg, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`]);
    obj(im, [`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.length} >>\nstream\n`, j, '\nendstream']);
    const c = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
    obj(ct, [`<< /Length ${c.length} >>\nstream\n${c}\nendstream`]);
  });
  const xref = len;
  const total = 3 + N * 3;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) push(String(offsets[n]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
