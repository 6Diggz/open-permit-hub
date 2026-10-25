import { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFString, type PDFPage, type PDFFont } from 'pdf-lib';
import type { Project } from '../core/model';
import type { Report } from '../rules/engine';
import { bbox, clearanceToEdge, gap } from '../core/geom';
import { PACK, PACK_ID, rulesLine } from '../rules/pack';
import { streetName } from './dxf';
import { safe, missingGlyphNote } from './glyphs';
export { missingGlyphNote };
import { toSqFt } from '../core/units';
import { MM_PER_FT, fmtFtIn, fmtSqFt } from '../core/units';
import { area } from '../core/geom';
import { readiness, scoreLine } from '../rules/readiness';
import { RULE_ITEMS } from '../rules/ladbs-adu-2025';
import { citeText } from '../rules/cites-es';

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
const setLang = (doc: PDFDocument, lang: string) => doc.catalog.set(PDFName.of('Lang'), PDFString.of(lang));

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
    const d = clearanceToEdge(p.adu.footprint, p.site.lot, i); if (i !== p.site.streetEdge) pg.drawText(`ADU SETBACK ${fmtFtIn(d)}`, { x: mx + 6, y: my - 20, size: 11, font: fb, color: INK }); });
  { const se = p.site.streetEdge, a = p.site.lot[se], b = p.site.lot[(se + 1) % p.site.lot.length]; const st = streetName(p.site.address);
    const t = safe(st ? `STREET: ${st.toUpperCase()}` : 'STREET'); pg.drawText(t, { x: (X(a.x) + X(b.x)) / 2 - fb.widthOfTextAtSize(t, 14) / 2, y: (Y(a.y) + Y(b.y)) / 2 - 40, size: 14, font: fb, color: INK }); }
  { const g = gap(p.adu.footprint, p.site.primary); const hb = bbox(p.site.primary), ab = bbox(p.adu.footprint);
    if (g > 0 && Number.isFinite(g)) { const x = (Math.max(hb.minX, ab.minX) + Math.min(hb.maxX, ab.maxX)) / 2; const [y1, y2] = hb.maxY <= ab.minY ? [hb.maxY, ab.minY] : ab.maxY <= hb.minY ? [ab.maxY, hb.minY] : [NaN, NaN];
      if (Number.isFinite(y1)) { pg.drawLine({ start: { x: X(x), y: Y(y1) }, end: { x: X(x), y: Y(y2) }, thickness: 1, color: INK }); [y1, y2].forEach(yy => pg.drawLine({ start: { x: X(x) - 5, y: Y(yy) }, end: { x: X(x) + 5, y: Y(yy) }, thickness: 1, color: INK }));
        pg.drawText(`BUILDING SEPARATION ${fmtFtIn(g)}`, { x: X(x) + 8, y: (Y(y1) + Y(y2)) / 2, size: 11, font: fb, color: INK }); } } }
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
    ['License', p.people.preparerLicense || 'n/a'], ...(p.people.engineerName ? [['Engineer (non-conventional parts)', p.people.engineerName] as [string, string]] : []),
    ['Rule pack', `${PACK_ID} (checked ${PACK.verifiedOn})`], ['Sheet', 'A-1 Site plan'], ['Date', new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)],
  ];
  let ty = H - 72; pg.drawText('SITE PLAN', { x: tbX + 14, y: ty, size: 20, font: fb, color: INK }); ty -= 34;
  for (const [a, b] of rows) { pg.drawText(a, { x: tbX + 14, y: ty, size: 8, font: f, color: MUTE }); ty -= 13; for (const l of wrap(safe(b), f, 11, tbW - 28)) { pg.drawText(l, { x: tbX + 14, y: ty, size: 11, font: fb, color: INK }); ty -= 14; } ty -= 8; }
  const note = `Prepared by the person named above using Open Permit Hub software. The software is not the preparer. Not reviewed or approved by any agency. Verify all dimensions in the field.${missingGlyphNote(p, false, true) ? ' ' + missingGlyphNote(p, false, true) : ''}`;
  sigBlock(pg, tbX + 14, 210, tbW - 28, f, p);
  ty = 150; for (const l of wrap(note, f, 9, tbW - 28)) { pg.drawText(l, { x: tbX + 14, y: ty, size: 9, font: f, color: INK }); ty -= 12; }
  if (kind === 'draft') pg.drawText('DRAFT - NOT FOR SUBMITTAL', { x: W * 0.2, y: H * 0.25, size: 96, font: fb, color: rgb(0.85, 0.2, 0.15), opacity: 0.13, rotate: degrees(28) });
  if (kind === 'precheck') pg.drawText('Pre-check copy - not a submittal', { x: 44, y: H - 50, size: 10, font: fb, color: RED });
  return pg;
}

/** Signature and date lines for the person who prepared the plans (B&P §5536.2 asks the preparer to sign plans made for others). Layout only. */
export function sigLabel(p: Project): string {
  return p.people.preparerRole === 'owner' ? 'Owner signature (plans prepared by the owner)' : `Signature of preparer: ${p.people.preparerName || '-'} (${p.people.preparerRole})${p.people.preparerLicense ? `, license ${p.people.preparerLicense}` : ''}`;
}
function sigBlock(pg: PDFPage, x: number, y: number, w: number, f: PDFFont, p: Project) {
  const dw = 90;
  pg.drawLine({ start: { x, y }, end: { x: x + w - dw - 12, y }, thickness: 0.8, color: INK });
  pg.drawLine({ start: { x: x + w - dw, y }, end: { x: x + w, y }, thickness: 0.8, color: INK });
  let ly = y - 11; for (const l of wrap(safe(sigLabel(p)), f, 8, w - dw - 12)) { pg.drawText(l, { x, y: ly, size: 8, font: f, color: MUTE }); ly -= 10; }
  pg.drawText('Date', { x: x + w - dw, y: y - 11, size: 8, font: f, color: MUTE });
}

/** Sheet A-2: floor plan data from the Rooms step (ADU outline at 1/4" = 1'-0", window schedule with escape tags, alarms, areas). */
async function floorPlanSheet(doc: PDFDocument, p: Project, kind: Kind) {
  const W = 36 * PT_PER_IN, H = 24 * PT_PER_IN; const pg = doc.addPage([W, H]);
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  pg.drawRectangle({ x: 36, y: 36, width: W - 72, height: H - 72, borderColor: INK, borderWidth: 1.5 });
  const ab = bbox(p.adu.footprint); const k = (0.25 * PT_PER_IN) / MM_PER_FT; const ox = 108, oy = 260;
  p.adu.footprint.forEach((a, i) => { const b = p.adu.footprint[(i + 1) % p.adu.footprint.length]; pg.drawLine({ start: { x: ox + (a.x - ab.minX) * k, y: oy + (a.y - ab.minY) * k }, end: { x: ox + (b.x - ab.minX) * k, y: oy + (b.y - ab.minY) * k }, thickness: 4, color: INK }); });
  pg.drawText('FLOOR PLAN (OUTLINE)', { x: ox, y: oy - 30, size: 16, font: fb, color: INK });
  pg.drawText(`Scale 1/4" = 1'-0"   Outside ${fmtFtIn(ab.maxX - ab.minX)} x ${fmtFtIn(ab.maxY - ab.minY)} (${fmtSqFt(area(p.adu.footprint))})   Livable ${p.adu.interiorLivableSqFt ?? '-'} sq ft   Ceiling ${p.adu.ceilingHeightMm != null ? fmtFtIn(p.adu.ceilingHeightMm) : '-'}`, { x: ox, y: oy - 48, size: 11, font: f, color: INK });
  pg.drawText('Room layout, doors and wall locations: drawn by your preparer. This sheet lists what you entered.', { x: ox, y: oy - 64, size: 10, font: f, color: MUTE });
  let y = H - 90; const x0 = W * 0.55;
  pg.drawText('WINDOW SCHEDULE', { x: x0, y, size: 16, font: fb, color: INK }); y -= 24;
  const head = ['#', 'Room', 'Clear W', 'Clear H', 'Sill', 'Escape', 'Net sq ft'];
  const cols = [0, 30, 210, 290, 370, 440, 520]; head.forEach((h, i) => pg.drawText(h, { x: x0 + cols[i], y, size: 10, font: fb, color: INK })); y -= 16;
  p.adu.windows.forEach((w, i) => { const sq = w.clearWidthMm != null && w.clearHeightMm != null ? toSqFt(w.clearWidthMm * w.clearHeightMm).toFixed(1) : '-';
    [String(i + 1), safe(w.room || '-').slice(0, 28), w.clearWidthMm != null ? fmtFtIn(w.clearWidthMm) : '-', w.clearHeightMm != null ? fmtFtIn(w.clearHeightMm) : '-', w.sillMm != null ? fmtFtIn(w.sillMm) : '-', w.sleeping ? 'EGRESS' : '-', sq].forEach((c, j) => pg.drawText(c, { x: x0 + cols[j], y, size: 10, font: f, color: INK })); y -= 14; });
  if (!p.adu.windows.length) { pg.drawText('No windows entered yet.', { x: x0, y, size: 10, font: f, color: MUTE }); y -= 14; }
  y -= 20; pg.drawText('ROOMS AND SAFETY', { x: x0, y, size: 16, font: fb, color: INK }); y -= 20;
  const tri = (v: string) => v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Not answered';
  const rows: [string, string][] = [['Bedrooms', p.adu.bedrooms === 0 ? 'Studio (main room counts as a sleeping room unless stated)' : String(p.adu.bedrooms)], ['Smoke and CO alarms on plan', tri(p.adu.smokeCoPlanned)], ['Smoke alarms hardwired with battery backup', tri(p.adu.smokeHardwired)], ['Sprinklers', tri(p.adu.sprinklered)], ['All-electric', tri(p.adu.allElectric)], ['Slab vapor barrier or epoxy coating', tri(p.adu.slabVaporBarrier)]];
  for (const [a, b] of rows) { pg.drawText(a, { x: x0, y, size: 10, font: f, color: MUTE }); pg.drawText(b, { x: x0 + 250, y, size: 10, font: fb, color: INK }); y -= 15; }
  pg.drawText(safe(`A-2 Floor plan data   ${p.site.address || p.name}   ${PACK_ID}`), { x: 60, y: 54, size: 10, font: f, color: INK });
  if (kind === 'draft') pg.drawText('DRAFT - NOT FOR SUBMITTAL', { x: W * 0.2, y: H * 0.25, size: 96, font: fb, color: rgb(0.85, 0.2, 0.15), opacity: 0.13, rotate: degrees(28) });
}

export async function sheetsPDF(p: Project, kind: Kind) { const d = await PDFDocument.create(); d.setTitle(`${p.name} - site plan`); setLang(d, p.people.language === 'es' ? 'es-US' : 'en-US'); await sitePlanSheet(d, p, kind); await floorPlanSheet(d, p, kind); return d.save(); }

const STAT: Record<string, [string, string, ReturnType<typeof rgb>]> = {
  PASS: ['Pass', 'Cumple', GREEN], FAIL: ['Fix', 'Corregir', RED], UNKNOWN: ['Need info', 'Falta info', AMBER], NOT_CHECKED: ['NOT CHECKED', 'NO REVISADO', MUTE], INFO: ['Note', 'Nota', MUTE],
};
export async function reportPDF(p: Project, rep: Report, lang: 'en' | 'es' = p.people.language) {
  const doc = await PDFDocument.create(); doc.setTitle(`${p.name} - check report`); setLang(doc, lang === 'es' ? 'es-US' : 'en-US');
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  let pg: PDFPage = doc.addPage([612, 792]); let y = 740; const L = 54, Wd = 504;
  const line = (t: string, size = 10, font = f, color = INK, indent = 0) => { for (const l of wrap(safe(t), font, size, Wd - indent)) { if (y < 60) { pg = doc.addPage([612, 792]); y = 740; } pg.drawText(l, { x: L + indent, y, size, font, color }); y -= size + 4; } };
  const es = lang === 'es';
  line(es ? 'Revisión por software, no una revisión de la ciudad' : 'Software check, not a city review', 9, f, MUTE); y -= 14;
  line(p.name, 20, fb); line(`${p.site.address || '-'}   APN ${p.site.apn || '-'}`, 10, f, MUTE); y -= 6;
  const ov = { READY_FOR_PREPARER: es ? 'Listo para su preparador' : 'Ready for your preparer', FIX_ISSUES: es ? 'Hay cosas que corregir' : 'Issues to fix', INCOMPLETE: es ? 'Incompleto: falta información' : 'Incomplete: information missing', NOT_SUPPORTED: es ? 'Dirección no soportada' : 'Address not supported' }[rep.overall];
  line(ov, 16, fb, rep.overall === 'READY_FOR_PREPARER' ? GREEN : rep.overall === 'FIX_ISSUES' ? RED : AMBER);
  const fr = rulesLine(p.applicationDate, rep.pack, es);
  line(fr.text, 9, f, fr.stale ? AMBER : MUTE);
  line(es ? `Base del código: la hoja LADBS cita ${PACK.sheet.codes}; ciclo estatal ${PACK.stateCycle}. ${PACK.localCycleNote}` : `Code basis: the LADBS sheet cites ${PACK.sheet.codes}; state cycle ${PACK.stateCycle}. ${PACK.localCycleNote}`, 8, f, MUTE);
  line(`${es ? 'Revisiones de reglas' : 'Rule checks'}: ${es ? 'Cumple' : 'Pass'} ${rep.counts.PASS} / ${es ? 'Corregir' : 'Fix'} ${rep.counts.FAIL} / ${es ? 'Falta info' : 'Need info'} ${rep.counts.UNKNOWN} / ${es ? 'No revisado' : 'Not checked'} ${rep.counts.NOT_CHECKED}`, 10, fb, INK);
  line((es ? 'Puntos de la hoja LADBS: ' : 'LADBS sheet items: ') + scoreLine(readiness(p, rep), es) + ` - ${PACK.sheet.form} Rev ${PACK.sheet.rev}`, 10, fb, INK);
  line(es ? 'Una revisión de regla puede cubrir varios puntos de la hoja, así que los dos números de "corregir" pueden ser distintos.' : 'One rule check can cover several sheet items, so the two "fix" numbers can differ.', 8, f, MUTE);
  if (missingGlyphNote(p, es, true)) line(missingGlyphNote(p, es, true), 8, f, AMBER); y -= 8;
  const order = ['FAIL', 'UNKNOWN', 'NOT_CHECKED', 'INFO', 'PASS'];
  for (const r of [...rep.results].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))) {
    const [en, sp, c] = STAT[r.status]; line(`${es ? sp : en}   ${r.rule.id}  ${r.rule.title[lang]}`, 11, fb, c);
    line(r.msg[lang], 10, f, INK, 12); if (r.next) line((es ? 'Siguiente paso: ' : 'Next step: ') + r.next[lang], 10, f, INK, 12);
    if (r.dismissed) line(`${es ? 'Descartado por el usuario' : 'Dismissed by user'}: ${r.dismissed}`, 9, f, AMBER, 12);
    line(r.rule.cites.map(c2 => citeText(c2, es) + (c2.verified ? '' : es ? ' [cita en verificación]' : ' [citation pending verification]')).join('; ') + (RULE_ITEMS[r.rule.id]?.length ? `; ${es ? 'hoja' : 'sheet'} ${RULE_ITEMS[r.rule.id].join(', ')}` : ''), 8, f, MUTE, 12); y -= 6;
  }
  y -= 6; line(es ? 'Esta herramienta no aprueba planos. Solo la ciudad aprueba. Es gratis; si alguien le cobra por "permisos garantizados", repórtelo.' : 'This tool does not approve plans. Only the city does. It is free; if someone charges you for "guaranteed permits", report it.', 9, f, MUTE);
  return doc.save();
}
