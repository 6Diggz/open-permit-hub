import { PDFDocument, rgb, degrees, PDFName, PDFString, PDFDict, PDFOperator, PDFOperatorNames, LineCapStyle, type PDFRef, type PDFPage, type PDFFont } from 'pdf-lib';
import type { Project } from '../core/model';
import type { Report } from '../rules/engine';
import { PACK, rulesLine } from '../rules/pack';
import { safe, missingGlyphNote, typed } from './glyphs';
import { sheetFonts, drawT, textWidth } from './pdffonts';
import { buildSheets, sheetIndex, sigLabel, PAPER_IN, type PaperId, type Sheet, type Marker } from './sheet';
import { SCALES } from '../ui/pro/drafting';
import { issuesOf } from '../ui/pro/issues';
import { getVerdict } from '../core/verdict';
export { missingGlyphNote };
import { readiness, scoreLine } from '../rules/readiness';
import { verdictOf } from '../core/verdict';
import { RULE_ITEMS } from '../rules/ladbs-adu-2025';
import { citeText } from '../rules/cites-es';

const INK = rgb(0.12, 0.14, 0.18), MUTE = rgb(0.42, 0.45, 0.5), RED = rgb(0.72, 0.16, 0.12), GREEN = rgb(0.1, 0.45, 0.25), AMBER = rgb(0.68, 0.45, 0.02);
const PT_PER_IN = 72;
type Kind = 'draft' | 'precheck' | 'handoff';

function wrap(t: string, f: PDFFont, size: number, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of t.split(' ')) { const n = line ? line + ' ' + w : w; if (f.widthOfTextAtSize(n, size) > max && line) { out.push(line); line = w; } else line = n; }
  if (line) out.push(line); return out;
}
const setLang = (doc: PDFDocument, lang: string) => doc.catalog.set(PDFName.of('Lang'), PDFString.of(lang));

// ---------- plan sheets: drawn from the one sheet model (sheet.ts), the same geometry the Pro layout tabs show ----------
const PT = PT_PER_IN;
const TONE: Record<string, ReturnType<typeof rgb>> = { ink: INK, exst: rgb(0.45, 0.48, 0.53), fix: RED, mute: MUTE, red: RED, green: GREEN, amber: AMBER };
const FILL: Record<string, ReturnType<typeof rgb>> = { poche: rgb(0.29, 0.31, 0.34), exst: rgb(0.89, 0.9, 0.91), bg: rgb(1, 1, 1), ink: INK, red: RED, green: GREEN, amber: AMBER };
/** Linetype dash patterns, paper inches (plotted). */
const DASH_IN: Record<string, number[]> = { phantom: [0.3, 0.06, 0.06, 0.06, 0.06, 0.06], hidden: [0.1, 0.05], demo: [0.06, 0.04] };
const toPt = (d: string) => d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a, b) => `${(+a * PT).toFixed(2)} ${(+b * PT).toFixed(2)}`);
/** PDF layers (optional content groups), one per NCS layer, so a reader can turn layers on and off like the CAD file. */
function pdfLayers(doc: PDFDocument) {
  const refs = new Map<string, PDFRef>();
  return {
    ref(name: string) { let r = refs.get(name); if (!r) { r = doc.context.register(doc.context.obj({ Type: 'OCG', Name: PDFString.of(name) })); refs.set(name, r); } return r; },
    finish() { if (!refs.size) return; const all = [...refs.values()]; doc.catalog.set(PDFName.of('OCProperties'), doc.context.obj({ OCGs: all, D: { Order: all, ON: all, Name: PDFString.of('NCS layers') } })); },
  };
}
async function drawSheet(doc: PDFDocument, sh: Sheet, f: PDFFont, fb: PDFFont, L: ReturnType<typeof pdfLayers>) {
  const pg = doc.addPage([sh.w * PT, sh.h * PT]); const H = sh.h * PT;
  const res = pg.node.Resources()!; let props = res.lookupMaybe(PDFName.of('Properties'), PDFDict); if (!props) { props = doc.context.obj({}); res.set(PDFName.of('Properties'), props); }
  const keys = new Map<string, string>(); let cur: string | null = null;
  const layer = (name: string) => { if (cur === name) return; if (cur) pg.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
    let k = keys.get(name); if (!k) { k = `L${keys.size}`; keys.set(name, k); props!.set(PDFName.of(k), L.ref(name)); }
    pg.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('OC'), PDFName.of(k)])); cur = name; };
  for (const it of sh.items) {
    layer(it.layer);
    if (it.k === 'p') {
      const stroke = it.stroke !== false; const fill = it.fill && it.fill !== 'none' ? FILL[it.fill] : undefined; if (!stroke && !fill) continue;
      pg.drawSvgPath(toPt(it.d), { x: 0, y: H, borderColor: stroke ? TONE[it.tone ?? 'ink'] : undefined, borderWidth: stroke ? Math.max(0.3, ((Number.isFinite(it.lw) ? it.lw : 0.25) * PT) / 25.4) : 0, color: fill,
        borderDashArray: it.dash ? DASH_IN[it.dash].map(v => v * PT) : undefined, borderLineCap: LineCapStyle.Round });
    } else {
      const font = it.bold ? fb : f; const size = it.h * PT; const s = safe(it.s); const w = textWidth(s, font, size); const off = it.anchor === 'middle' ? -w / 2 : it.anchor === 'end' ? -w : 0;
      const r = ((it.rot ?? 0) * Math.PI) / 180; const x = it.x * PT + off * Math.cos(r), y = H - (it.y * PT + off * Math.sin(r));
      drawT(pg, s, { x, y, size, font, color: it.white ? rgb(1, 1, 1) : TONE[it.tone ?? 'ink'], ...(it.rot ? { rotate: degrees(-it.rot) } : {}) });
    }
  }
  if (cur) pg.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  return pg;
}
/** Check markers for the G-2 sheet: the same open checks the Pro workspace pins, plus the review notes. */
export function markersOf(p: Project, withChecks = true): Marker[] {
  const out: Marker[] = [];
  if (withChecks) for (const i of issuesOf(p, getVerdict(p).report.results)) if (i.at && i.n) out.push({ key: 'issue:' + i.id, n: String(i.n), at: i.at, tone: i.status === 'FAIL' ? 'fix' : 'need', text: `${i.r.rule.id} ${i.r.rule.title[p.people.language === 'es' ? 'es' : 'en']}` });
  for (const x of p.markup.pins) out.push({ key: 'pin:' + x.id, n: 'R' + x.n, at: { x: x.x, y: x.y }, tone: x.status === 'open' ? 'rev' : 'done', text: x.comment || '(no text)' });
  return out;
}
/** Plan sheets. ARCH D (default): the full 24x36 set, ending with the 8.5x11 plot plan page for the application (I.A.1).
 *  11x17 or letter: the plot plan at that size. Every page is the sheet model rendered as vectors with embedded fonts. */
export async function sheetsPDF(p: Project, kind: Kind, paper: Paper = 'archd') {
  const d = await PDFDocument.create(); d.setTitle(`${p.name} - ${paper === 'archd' ? 'site plan' : 'plot plan ' + PAPER[paper].label}`); setLang(d, p.people.language === 'es' ? 'es-US' : 'en-US');
  const g2 = p.markup.pins.length > 0 || p.markup.responses.length > 0;
  const sheets = buildSheets(p, paper, { kind, es: p.people.language === 'es', markers: g2 && paper === 'archd' ? markersOf(p) : undefined });
  const { f, fb } = await sheetFonts(d, typed(p)); const L = pdfLayers(d);
  for (const sh of sheets) await drawSheet(d, sh, f, fb, L);
  L.finish(); return d.save();
}
/** The sheets site-plan.pdf holds, in order (also listed in the handoff README). */
export const sheetList = (p: Project) => sheetIndex(p).map(x => `${x.no} ${x.title}`);

/** Paper sizes for plan output (r3market-06). ARCH D is the full set; 11x17 and letter carry the plot plan sheet. */
export type Paper = PaperId;
export const PAPER = PAPER_IN;
/** Standard plan scales, largest first, as [paper inches per foot, name]. Only these are used, so the printed scale is one a reader's scale ruler has. */
export const PLOT_SCALES: [number, string][] = SCALES.filter(s => s.k >= 48 && s.k <= 1200).map(s => [12 / s.k, s.label] as [number, string]);
/** Largest standard scale at which a wFt x hFt drawing fits in an area of aw x ah points. */
export function fitScale(wFt: number, hFt: number, aw: number, ah: number): [number, string] {
  return PLOT_SCALES.find(([sc]) => wFt * sc * PT_PER_IN <= aw && hFt * sc * PT_PER_IN <= ah) ?? PLOT_SCALES[PLOT_SCALES.length - 1];
}
/** Smallest lettering on every plan sheet: 9 pt (LADBS I.C.3 asks for 1/8" lettering; 9 pt = 1/8"). */
export const MIN_PT = 9;
export { sigLabel };

const STAT: Record<string, [string, string, ReturnType<typeof rgb>]> = {
  PASS: ['Pass', 'Cumple', GREEN], FAIL: ['Fix', 'Corregir', RED], UNKNOWN: ['Need info', 'Falta info', AMBER], NOT_CHECKED: ['NOT CHECKED', 'NO REVISADO', MUTE], INFO: ['Note', 'Nota', MUTE],
};
export async function reportPDF(p: Project, rep: Report, lang: 'en' | 'es' = p.people.language) {
  const doc = await PDFDocument.create(); doc.setTitle(`${p.name} - check report`); setLang(doc, lang === 'es' ? 'es-US' : 'en-US');
  const { f, fb } = await sheetFonts(doc, typed(p));
  let pg: PDFPage = doc.addPage([612, 792]); let y = 740; const L = 54, Wd = 504;
  const line = (t: string, size = 10, font = f, color = INK, indent = 0) => { for (const l of wrap(safe(t), font, size, Wd - indent)) { if (y < 60) { pg = doc.addPage([612, 792]); y = 740; } drawT(pg, l, { x: L + indent, y, size, font, color }); y -= size + 4; } };
  const es = lang === 'es';
  line(es ? 'Revisión por software, no una revisión de la ciudad' : 'Software check, not a city review', 9, f, MUTE); y -= 14;
  line(p.name, 20, fb); line(`${p.site.address || '-'}   APN ${p.site.apn || '-'}`, 10, f, MUTE); y -= 6;
  const ov = { READY_FOR_PREPARER: es ? 'Listo para su preparador' : 'Ready for your preparer', FIX_ISSUES: es ? 'Hay cosas que corregir' : 'Issues to fix', INCOMPLETE: es ? 'Incompleto: falta información' : 'Incomplete: information missing', NOT_SUPPORTED: es ? 'Dirección no soportada' : 'Address not supported' }[rep.overall];
  line(ov, 16, fb, rep.overall === 'READY_FOR_PREPARER' ? GREEN : rep.overall === 'FIX_ISSUES' ? RED : AMBER);
  line(verdictOf(p, rep).plain[es ? 'es' : 'en'], 10, fb, INK); // r5whole-05: the same plain answer as the check card
  const fr = rulesLine(p.applicationDate, rep.pack, es);
  line(fr.text, 9, f, fr.stale ? AMBER : MUTE);
  line(es ? `Base del código: la hoja LADBS cita ${PACK.sheet.codes}; ciclo estatal: ${PACK.stateCycleEs}. ${PACK.localCycleNoteEs}` : `Code basis: the LADBS sheet cites ${PACK.sheet.codes}; state cycle ${PACK.stateCycle}. ${PACK.localCycleNote}`, 8, f, MUTE);
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
