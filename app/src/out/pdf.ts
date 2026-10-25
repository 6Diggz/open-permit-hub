import { PDFDocument, StandardFonts, rgb, degrees, type PDFPage, type PDFFont } from 'pdf-lib';
import type { Project } from '../core/model';
import type { Report } from '../rules/engine';
import { bbox, clearanceToEdge } from '../core/geom';
import { MM_PER_FT, fmtFtIn, fmtSqFt } from '../core/units';
import { area } from '../core/geom';

const INK = rgb(0.12, 0.14, 0.18), MUTE = rgb(0.42, 0.45, 0.5), RED = rgb(0.72, 0.16, 0.12), GREEN = rgb(0.1, 0.45, 0.25), AMBER = rgb(0.68, 0.45, 0.02);
const PT_PER_IN = 72;
type Kind = 'draft' | 'precheck' | 'handoff';
const SCALES = [1 / 8, 1 / 16, 1 / 32]; // inches on paper per foot (1/8" = 1'-0", ...)
const scaleName = (s: number) => s === 1 / 8 ? '1/8" = 1\'-0"' : s === 1 / 16 ? '1/16" = 1\'-0"' : '1/32" = 1\'-0"';

function wrap(t: string, f: PDFFont, size: number, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of t.split(' ')) { const n = line ? line + ' ' + w : w; if (f.widthOfTextAtSize(n, size) > max && line) { out.push(line); line = w; } else line = n; }
  if (line) out.push(line); return out;
}
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, '-');

/** ARCH D (24x36) sheet with true-scale site plan, scale bar, north arrow, title block. */
async function sitePlanSheet(doc: PDFDocument, p: Project, kind: Kind) {
  const W = 36 * PT_PER_IN, H = 24 * PT_PER_IN; const pg = doc.addPage([W, H]);
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  pg.drawRectangle({ x: 36, y: 36, width: W - 72, height: H - 72, borderColor: INK, borderWidth: 1.5 });
  const tbW = 4.5 * PT_PER_IN; const tbX = W - 36 - tbW;
  pg.drawLine({ start: { x: tbX, y: 36 }, end: { x: tbX, y: H - 36 }, thickness: 1.2, color: INK });
  // drawing area
  const areaW = tbX - 36 - 72, areaH = H - 72 - 144;
  const bb = bbox(p.site.lot); const wFt = (bb.maxX - bb.minX) / MM_PER_FT, hFt = (bb.maxY - bb.minY) / MM_PER_FT;
  const s = SCALES.find(sc => wFt * sc * PT_PER_IN <= areaW && hFt * sc * PT_PER_IN <= areaH) ?? 1 / 32;
  const k = (s * PT_PER_IN) / MM_PER_FT; const ox = 36 + 72 + (areaW - wFt * s * PT_PER_IN) / 2, oy = 36 + 108 + (areaH - hFt * s * PT_PER_IN) / 2;
  const X = (x: number) => ox + (x - bb.minX) * k, Y = (y: number) => oy + (y - bb.minY) * k;
  const poly = (pl: { x: number; y: number }[], th: number, color = INK, dash?: number[]) => pl.forEach((a, i) => { const b = pl[(i + 1) % pl.length]; pg.drawLine({ start: { x: X(a.x), y: Y(a.y) }, end: { x: X(b.x), y: Y(b.y) }, thickness: th, color, dashArray: dash }); });
  poly(p.site.lot, 2.2, INK, [14, 4, 2, 4]); poly(p.site.primary, 1.4, MUTE); poly(p.adu.footprint, 2.6, INK);
  const lab = (pl: { x: number; y: number }[], t: string) => { const b2 = bbox(pl); pg.drawText(safe(t), { x: X((b2.minX + b2.maxX) / 2) - f.widthOfTextAtSize(t, 11) / 2, y: Y((b2.minY + b2.maxY) / 2), size: 11, font: fb, color: INK }); };
  lab(p.site.primary, 'EXISTING HOUSE'); lab(p.adu.footprint, p.adu.mode === 'conversion' ? 'GARAGE CONVERSION (ADU)' : 'ADU');
  p.site.lot.forEach((a, i) => { const b = p.site.lot[(i + 1) % p.site.lot.length]; const mx = (X(a.x) + X(b.x)) / 2, my = (Y(a.y) + Y(b.y)) / 2; const L = fmtFtIn(Math.hypot(b.x - a.x, b.y - a.y)); pg.drawText(L, { x: mx + 6, y: my + 6, size: 10, font: f, color: INK });
    const d = clearanceToEdge(p.adu.footprint, p.site.lot, i); if (i !== p.site.streetEdge) pg.drawText(`ADU to line ${fmtFtIn(d)}`, { x: mx + 6, y: my - 18, size: 8, font: f, color: MUTE }); });
  // Enlarged ADU plan at 1/4" = 1'-0" in the free space (UX: sheet looked empty)
  { const ab = bbox(p.adu.footprint); const k2 = (0.25 * PT_PER_IN) / MM_PER_FT; const dw = (ab.maxX - ab.minX) * k2, dh = (ab.maxY - ab.minY) * k2;
    const room = tbX - 36 - (ox + wFt * s * PT_PER_IN) - 60;
    if (room > dw + 80) { const bx = tbX - 60 - dw, by = H / 2 - dh / 2;
      pg.drawRectangle({ x: bx, y: by, width: dw, height: dh, borderColor: INK, borderWidth: 3 });
      pg.drawText(`${fmtFtIn(ab.maxX - ab.minX)}`, { x: bx + dw / 2 - 20, y: by + dh + 8, size: 11, font: f, color: INK });
      pg.drawText(`${fmtFtIn(ab.maxY - ab.minY)}`, { x: bx + dw + 8, y: by + dh / 2, size: 11, font: f, color: INK });
      pg.drawText('ADU FOOTPRINT', { x: bx, y: by - 22, size: 14, font: fb, color: INK });
      pg.drawText(`Scale 1/4" = 1'-0"   ${fmtSqFt(area(p.adu.footprint))} outside   ${p.adu.interiorLivableSqFt ?? '-'} sq ft livable`, { x: bx, y: by - 38, size: 10, font: f, color: INK }); } }
  // scale bar (true size) + north arrow
  const sbY = 60, sbX = 72; const seg = s * PT_PER_IN * 10; for (let i = 0; i < 4; i++) pg.drawRectangle({ x: sbX + i * seg, y: sbY, width: seg, height: 6, color: i % 2 ? rgb(1, 1, 1) : INK, borderColor: INK, borderWidth: 0.6 });
  pg.drawText(`0     10     20     30     40 ft      Scale ${scaleName(s)} on 24x36 sheet`, { x: sbX, y: sbY + 12, size: 9, font: f, color: INK });
  pg.drawLine({ start: { x: tbX - 60, y: H - 140 }, end: { x: tbX - 60, y: H - 90 }, thickness: 2, color: INK }); pg.drawText('N', { x: tbX - 64, y: H - 84, size: 14, font: fb, color: INK });
  // title block
  const rows: [string, string][] = [
    ['Project', p.name], ['Address', p.site.address || '-'], ['APN', p.site.apn || '-'], ['Scope', p.adu.mode === 'conversion' ? 'Convert existing detached garage to ADU' : 'Detached ADU (YOU-ADU plan site fit)'],
    ['ADU footprint', fmtSqFt(area(p.adu.footprint))], ['Owner', p.people.ownerName || '-'], ['Prepared by', `${p.people.preparerName || '-'} (${p.people.preparerRole})`],
    ['License', p.people.preparerLicense || 'n/a'], ['Rule pack', p.rulePack], ['Sheet', 'A-1 Site plan'], ['Date', new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)],
  ];
  let ty = H - 72; pg.drawText('SITE PLAN', { x: tbX + 14, y: ty, size: 20, font: fb, color: INK }); ty -= 34;
  for (const [a, b] of rows) { pg.drawText(a, { x: tbX + 14, y: ty, size: 8, font: f, color: MUTE }); ty -= 13; for (const l of wrap(safe(b), f, 11, tbW - 28)) { pg.drawText(l, { x: tbX + 14, y: ty, size: 11, font: fb, color: INK }); ty -= 14; } ty -= 8; }
  const note = 'Owner-prepared with software; not reviewed or approved by any agency. Verify all dimensions in the field.';
  ty = 150; for (const l of wrap(note, f, 9, tbW - 28)) { pg.drawText(l, { x: tbX + 14, y: ty, size: 9, font: f, color: INK }); ty -= 12; }
  if (kind === 'draft') pg.drawText('DRAFT - NOT FOR SUBMITTAL', { x: W * 0.2, y: H * 0.25, size: 96, font: fb, color: rgb(0.85, 0.2, 0.15), opacity: 0.13, rotate: degrees(28) });
  if (kind === 'precheck') pg.drawText('Pre-check copy - not a submittal', { x: 44, y: H - 50, size: 10, font: fb, color: RED });
  return pg;
}

export async function sheetsPDF(p: Project, kind: Kind) { const d = await PDFDocument.create(); d.setTitle(`${p.name} - site plan`); await sitePlanSheet(d, p, kind); return d.save(); }

const STAT: Record<string, [string, string, ReturnType<typeof rgb>]> = {
  PASS: ['Pass', 'Cumple', GREEN], FAIL: ['Fix', 'Corregir', RED], UNKNOWN: ['Need info', 'Falta info', AMBER], NOT_CHECKED: ['NOT CHECKED - module off', 'NO REVISADO', MUTE], INFO: ['Note', 'Nota', MUTE],
};
export async function reportPDF(p: Project, rep: Report, lang: 'en' | 'es' = p.people.language) {
  const doc = await PDFDocument.create(); doc.setTitle(`${p.name} - check report`);
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  let pg: PDFPage = doc.addPage([612, 792]); let y = 740; const L = 54, Wd = 504;
  const line = (t: string, size = 10, font = f, color = INK, indent = 0) => { for (const l of wrap(safe(t), font, size, Wd - indent)) { if (y < 60) { pg = doc.addPage([612, 792]); y = 740; } pg.drawText(l, { x: L + indent, y, size, font, color }); y -= size + 4; } };
  const es = lang === 'es';
  line(es ? 'Revisión por software, no una revisión de la ciudad' : 'Software check, not a city review', 9, f, MUTE); y -= 14;
  line(p.name, 20, fb); line(`${p.site.address || '-'}   APN ${p.site.apn || '-'}`, 10, f, MUTE); y -= 6;
  const ov = { READY_FOR_PREPARER: es ? 'Listo para su preparador' : 'Ready for your preparer', FIX_ISSUES: es ? 'Hay cosas que corregir' : 'Issues to fix', INCOMPLETE: es ? 'Incompleto: falta información' : 'Incomplete: information missing', NOT_SUPPORTED: es ? 'Dirección no soportada' : 'Address not supported' }[rep.overall];
  line(ov, 16, fb, rep.overall === 'READY_FOR_PREPARER' ? GREEN : rep.overall === 'FIX_ISSUES' ? RED : AMBER);
  line(`${es ? 'Reglas vigentes al' : 'Rules as of'} ${rep.vestDate}   ${rep.pack}   ${es ? 'Aprobado' : 'Pass'} ${rep.counts.PASS} / ${es ? 'Corregir' : 'Fix'} ${rep.counts.FAIL} / ${es ? 'Falta info' : 'Need info'} ${rep.counts.UNKNOWN} / ${es ? 'No revisado' : 'Not checked'} ${rep.counts.NOT_CHECKED}`, 9, f, MUTE); y -= 8;
  const order = ['FAIL', 'UNKNOWN', 'NOT_CHECKED', 'INFO', 'PASS'];
  for (const r of [...rep.results].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))) {
    const [en, sp, c] = STAT[r.status]; line(`${es ? sp : en}   ${r.rule.id}  ${r.rule.title[lang]}`, 11, fb, c);
    line(r.msg[lang], 10, f, INK, 12); if (r.next) line((es ? 'Siguiente paso: ' : 'Next step: ') + r.next[lang], 10, f, INK, 12);
    if (r.dismissed) line(`Dismissed by user: ${r.dismissed}`, 9, f, AMBER, 12);
    line(r.rule.cites.map(c2 => c2.code + (c2.verified ? '' : ' [citation pending verification]')).join('; '), 8, f, MUTE, 12); y -= 6;
  }
  y -= 6; line(es ? 'Esta herramienta no aprueba planos. Solo la ciudad aprueba. Es gratis; si alguien le cobra por "permisos garantizados", repórtelo.' : 'This tool does not approve plans. Only the city does. It is free; if someone charges you for "guaranteed permits", report it.', 9, f, MUTE);
  return doc.save();
}
