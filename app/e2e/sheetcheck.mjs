// Sheet checks shared by the screen layouts and the exported PDF pages (e2e/cadviz.mjs). Input is what was actually rendered:
// text runs (string, baseline origin, size, advance width, angle) and line segments with their layer, in inches, y up.
// Checks: no text on another text or on linework, no text under 1/8", title block fields, each length dimensioned once,
// true scale (a 20 ft wall at the stated scale, within 1/32"), and the A-2 floor plan entities.
export const ASC = 0.95, DSC = 0.225;
const box = t => { const c = Math.cos(t.ang), s = Math.sin(t.ang); const lx = t.w / 2, ly = (ASC - DSC) * t.size / 2; return { cx: t.x + lx * c - ly * s, cy: t.y + lx * s + ly * c, hw: t.w / 2, hh: (ASC + DSC) * t.size / 2, c, s }; };
const corners = b => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: b.cx + i * b.hw * b.c - j * b.hh * b.s, y: b.cy + i * b.hw * b.s + j * b.hh * b.c }));
const hit = (a, b, e) => { const ax = [{ x: a.c, y: a.s }, { x: -a.s, y: a.c }, { x: b.c, y: b.s }, { x: -b.s, y: b.c }]; const A = corners(a), B = corners(b);
  return ax.every(v => { const pa = A.map(q => q.x * v.x + q.y * v.y), pb = B.map(q => q.x * v.x + q.y * v.y); return !(Math.max(...pa) - e <= Math.min(...pb) || Math.max(...pb) - e <= Math.min(...pa)); }); };
const segHit = (b, g, e) => { const L = (x, y) => { const dx = x - b.cx, dy = y - b.cy; return { u: dx * b.c + dy * b.s, v: -dx * b.s + dy * b.c }; }; const A = L(g.x0, g.y0), B = L(g.x1, g.y1); const hw = b.hw - e, hh = b.hh - e; if (hw <= 0 || hh <= 0) return false;
  let t0 = 0, t1 = 1; const du = B.u - A.u, dv = B.v - A.v; for (const [p, q] of [[-du, A.u + hw], [du, hw - A.u], [-dv, A.v + hh], [dv, hh - A.v]]) { if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; } const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } return t0 <= t1; };
const FT = /^(\d+)'-(\d+)(?: (\d+)\/(\d+))?"$/;
export function check({ texts, segs }, e = 0.01) {
  texts = texts.filter(t => t.s.trim()); const B = texts.map(box); const over = [];
  texts.forEach((t, i) => { for (let j = i + 1; j < texts.length; j++) if (hit(B[i], B[j], e)) over.push(`${t.s} / ${texts[j].s}`);
    for (const g of segs) { if (t.g && g.g === t.g) continue; if (segHit(B[i], g, e)) { over.push(`${t.s} / ${g.layer} line`); break; } } });
  const minSize = Math.min(...texts.map(t => t.size));
  // Each length dimensioned once: every dimension text sits on a parallel dimension line; no two share direction and span.
  const spans = [];
  for (const t of texts) { if (!FT.test(t.s)) continue; const b = B[texts.indexOf(t)]; let best = null, bd = 0.3;
    for (const g of segs) { if (g.layer !== 'A-ANNO-DIMS') continue; const dx = g.x1 - g.x0, dy = g.y1 - g.y0, L = Math.hypot(dx, dy); if (L < 0.2) continue; const ux = dx / L, uy = dy / L; if (Math.abs(ux * b.s - uy * b.c) > 0.02) continue;
      const tc = (b.cx - g.x0) * ux + (b.cy - g.y0) * uy; const dperp = Math.abs(-(b.cx - g.x0) * uy + (b.cy - g.y0) * ux); if (tc < -0.05 || tc > L + 0.05 || dperp > bd) continue; bd = dperp; best = { g, ux, uy }; }
    if (best) { const { g, ux, uy } = best; const p = [g.x0 * ux + g.y0 * uy, g.x1 * ux + g.y1 * uy].sort((a, c) => a - c); spans.push({ s: t.s, a: Math.abs(Math.atan2(uy, ux)) % Math.PI, p }); } }
  const dup = []; spans.forEach((a, i) => spans.slice(i + 1).forEach(b => { if (Math.abs(a.a - b.a) < 0.02 && Math.abs(a.p[0] - b.p[0]) < 0.03 && Math.abs(a.p[1] - b.p[1]) < 0.03 && a.s === b.s) dup.push(a.s); }));
  const all = texts.map(t => t.s).join('\n');
  const fields = ['Prepared by', 'STAMP', 'Project', 'Address', 'APN', 'REVISIONS', 'DRAWN BY', 'CHECKED BY', 'Date', 'SCALE', 'SHEET'].filter(f => !new RegExp(`^${f}:?$`, 'mi').test(all));
  const sheetNo = texts.filter(t => t.size >= 0.29 && /^[AG]-\d(\.\d)?$/.test(t.s)).map(t => t.s)[0] ?? null;
  // True scale: the ADU's outer wall extent on the A-2 plan against the stated scale and the overall dimension it carries.
  let scale = null; const m = all.match(/SCALE: (\d+)(?:\/(\d+))?" = 1'-0"/);
  if (m) { const inPerFt = m[2] ? +m[1] / +m[2] : +m[1]; const ws = segs.filter(g => /^A-WALL(-EXST)?$/.test(g.layer)); if (ws.length) { const xs = ws.flatMap(g => [g.x0, g.x1]); const wIn = Math.max(...xs) - Math.min(...xs);
    scale = { label: m[0], inPerFt, wallIn: wIn, wallFt: wIn / inPerFt, err: Math.abs(wIn - 20 * inPerFt) }; } }
  const layers = [...new Set(segs.map(g => g.layer))];
  return { over, minSize, dup, fields, sheetNo, scale, layers, n: texts.length };
}
/** Text runs and segments of one PDF page (pdf.js text content and operator list, layers from optional content), in inches. */
export async function pdfPage(pdfjs, doc, i) {
  const pg = await doc.getPage(i); const tc = await pg.getTextContent(); const oc = await doc.getOptionalContentConfig(); const name = id => oc.getGroup(id)?.name ?? '?';
  const texts = tc.items.filter(t => t.str).map(t => { const [a, b] = t.transform; return { s: t.str, x: t.transform[4] / 72, y: t.transform[5] / 72, size: Math.hypot(a, b) / 72, w: t.width / 72, ang: Math.atan2(b, a) }; });
  const ops = await pg.getOperatorList(); const O = pdfjs.OPS; let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; const lay = []; const segs = [];
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const P = (x, y) => [(ctm[0] * x + ctm[2] * y + ctm[4]) / 72, (ctm[1] * x + ctm[3] * y + ctm[5]) / 72];
  for (let k = 0; k < ops.fnArray.length; k++) { const f = ops.fnArray[k], a = ops.argsArray[k];
    if (f === O.save) stack.push(ctm); else if (f === O.restore) ctm = stack.pop() ?? ctm; else if (f === O.transform) ctm = mul(ctm, a);
    else if (f === O.beginMarkedContentProps) lay.push(a[0] === 'OC' && a[1]?.id ? name(a[1].id) : lay[lay.length - 1] ?? '?'); else if (f === O.beginMarkedContent) lay.push(lay[lay.length - 1] ?? '?'); else if (f === O.endMarkedContent) lay.pop();
    else if (f === O.constructPath) { const op = a[0]; if (op === O.fill || op === O.eoFill) continue; const d = a[1][0]; let cur = null, st = null;
      for (let j = 0; j < d.length;) { const c = d[j]; if (c === 0) { cur = st = P(d[j + 1], d[j + 2]); j += 3; } else if (c === 1) { const q = P(d[j + 1], d[j + 2]); segs.push({ layer: lay[lay.length - 1] ?? '?', x0: cur[0], y0: cur[1], x1: q[0], y1: q[1] }); cur = q; j += 3; }
        else if (c === 2) { const q = P(d[j + 5], d[j + 6]); segs.push({ layer: lay[lay.length - 1] ?? '?', x0: cur[0], y0: cur[1], x1: q[0], y1: q[1] }); cur = q; j += 7; } else if (c === 3) { const q = P(d[j + 3], d[j + 4]); cur = q; j += 5; }
        else if (c === 4) { if (cur && st) segs.push({ layer: lay[lay.length - 1] ?? '?', x0: cur[0], y0: cur[1], x1: st[0], y1: st[1] }); cur = st; j += 1; } else j += 1; } } }
  const vp = pg.getViewport({ scale: 1 }); return { texts, segs, w: vp.width / 72, h: vp.height / 72 };
}
