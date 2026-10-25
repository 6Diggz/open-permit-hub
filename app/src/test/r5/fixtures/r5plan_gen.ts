// r5plan fixture generator: plan sets drawn with pdf-lib the way LA drafters' PDFs come out of AutoCAD / Revit / ArchiCAD.
// Each builder returns PDF bytes. Text is placed like a real 24x36 sheet: title block strip on the right, notes in columns.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from '../../../../node_modules/pdf-lib/cjs/index.js';

export type Style = { glyphs?: boolean; rotateTitle?: boolean; columns?: boolean };
export interface SheetSpec { id: string; title: string; notes: string[]; scale?: string; vectorDims?: number }

const W = 2592, H = 1728; // 36x24 in at 72 pt

function put(pg: PDFPage, f: PDFFont, s: string, x: number, y: number, size: number, st: Style, rot = 0) {
  if (!st.glyphs) { pg.drawText(s, { x, y, size, font: f, rotate: degrees(rot) }); return; }
  // CAD "explode text" / SHX export: each glyph is its own text object at its own position.
  let dx = 0; for (const ch of s) { if (ch !== ' ') {
    if (rot) pg.drawText(ch, { x, y: y + dx, size, font: f, rotate: degrees(rot) }); else pg.drawText(ch, { x: x + dx, y, size, font: f }); }
    dx += f.widthOfTextAtSize(ch === ' ' ? ' ' : ch, size); }
}

export async function planSet(sheets: SheetSpec[], title: string[], st: Style = {}): Promise<Uint8Array> {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (const sh of sheets) {
    const pg = d.addPage([W, H]);
    // vector-only dimension strings: lines + ticks with no text (dims drawn as geometry, text as outlines)
    for (let i = 0; i < (sh.vectorDims ?? 0); i++) { pg.drawLine({ start: { x: 200, y: 300 + i * 20 }, end: { x: 900, y: 300 + i * 20 }, thickness: 1, color: rgb(0, 0, 0) }); }
    // title block strip (right edge)
    const tb = [...title, sh.title, 'SHEET', sh.id];
    if (st.rotateTitle) tb.forEach((l, i) => put(pg, f, l, W - 40 - i * 18, 200, 12, st, 90));
    else tb.forEach((l, i) => put(pg, f, l, W - 300, H - 80 - i * 22, 12, st));
    put(pg, f, sh.title, 100, 120, 24, st);
    if (sh.scale) put(pg, f, sh.scale, 100, 90, 12, st);
    if (st.columns) { // general notes in 3 columns, 20 pt gutters, same baselines
      const per = Math.ceil(sh.notes.length / 3);
      sh.notes.forEach((n, i) => put(pg, f, n, 100 + Math.floor(i / per) * 520, H - 100 - (i % per) * 18, 10, st));
    } else sh.notes.forEach((n, i) => put(pg, f, n, 100, H - 100 - i * 18, 10, st));
  }
  return d.save();
}

export const TITLE = ['PROJECT ADDRESS:', '4305 W EDENHURST AVE, LOS ANGELES, CA 90039', 'OWNER:', 'MARIA LOPEZ', 'PREPARED BY:', 'J. DRAFTER DESIGN', 'DATE:', '10/01/2026'];

/** A complete garage-to-ADU set: every one of the 26 pre-check items is really on it. */
export function goodSet(fmt: 'ftin' | 'space' | 'mm' | 'ft' = 'ftin'): SheetSpec[] {
  const L = (ft: number, inch = 0) => fmt === 'ftin' ? `${ft}'-${inch}"` : fmt === 'space' ? `${ft}' ${inch}"` : fmt === 'mm' ? `${Math.round((ft * 12 + inch) * 25.4)} mm` : `${ft + inch / 12}ft`;
  return [
    { id: 'A0.0', title: 'TITLE SHEET', scale: 'SCALE: N.T.S.', notes: ['PROJECT DATA', 'APN: 5594-014-021', 'OCCUPANCY: R-3', 'TYPE V-B CONSTRUCTION', '1 STORY', 'LOT AREA: 5,600 SQ FT', '380 SQ FT LIVABLE ADU AREA', `HEIGHT: 12'-0"`, 'VERY HIGH FIRE HAZARD SEVERITY ZONE: NO',
      'APPLICABLE CODES: 2023 LARC, 2023 LABC, 2022 CALIFORNIA ENERGY CODE', 'SCOPE OF WORK: CONVERT EXISTING DETACHED GARAGE TO ADU', 'ALL-ELECTRIC ADU, NO GAS', 'LICENSE NO. C-12345'] },
    { id: 'A1.1', title: 'SITE PLAN', scale: `SCALE: 1/8" = 1'-0"`, notes: [`SIDE SETBACK ${L(4)} TO PROPERTY LINE`, `REAR SETBACK ${L(4)}`, `LOT ${L(40)} X ${L(140)}`, `BUILDING SEPARATION ${L(43)}`, `ADU ${L(20)} X ${L(20)}`, 'PROPERTY LINE'] },
    { id: 'A2.1', title: 'FLOOR PLAN', scale: `SCALE: 1/4" = 1'-0"`, notes: [`CEILING HEIGHT ${L(8)}`, 'EGRESS WINDOW 24" X 48" NET CLEAR OPENING', `EXIT DOOR 3'-0" X 6'-8"`, 'BATHROOM EXHAUST FAN 50 CFM', 'SMOKE ALARM IN EACH BEDROOM AND HALL PER CRC R314',
      'SMOKE ALARMS HARDWIRED WITH BATTERY BACKUP, INTERCONNECTED', 'CARBON MONOXIDE ALARM PER CRC R315', 'TEMPERED GLASS AT SHOWER DOOR PER R308', 'WATER HEATER STRAPPED WITH SEISMIC STRAPS', 'FIRE SPRINKLERS NOT REQUIRED (NFPA 13D N/A, CONVERSION)'] },
    { id: 'A2.0', title: 'EXISTING FLOOR PLAN', scale: `SCALE: 1/4" = 1'-0"`, notes: ['EXISTING GARAGE TO BE CONVERTED'] },
    { id: 'A3.1', title: 'ELEVATIONS', scale: `SCALE: 1/4" = 1'-0"`, notes: [`MAX HEIGHT ${L(12)} TOP OF ROOF`, `EAVE OVERHANG ${L(1)} MAX`, '1-HOUR RATED EXTERIOR WALL PER R302.1'] },
    { id: 'A4.1', title: 'BUILDING SECTIONS', scale: `SCALE: 1/2" = 1'-0"`, notes: ['SECTION A-A'] },
    { id: 'S1', title: 'FOUNDATION PLAN', scale: `SCALE: 1/4" = 1'-0"`, notes: ['10 MIL VAPOR RETARDER UNDER SLAB', 'ANCHOR BOLTS 5/8" @ 48" O.C. 7" EMBED'] },
    { id: 'S2', title: 'ROOF FRAMING PLAN', scale: `SCALE: 1/4" = 1'-0"`, notes: ['2X6 RAFTERS @ 24" O.C.', '4X8 HEADER'] },
    { id: 'T24.1', title: 'TITLE 24 ENERGY COMPLIANCE', scale: 'SCALE: N.T.S.', notes: ['CF1R ATTACHED. HERS VERIFICATION REQUIRED.'] },
  ];
}

/** A set where NONE of the life-safety / note items is actually satisfied, but the words drafters really use appear. */
export function trapSet(): SheetSpec[] {
  return [
    { id: 'A0.0', title: 'TITLE SHEET', scale: 'SCALE: N.T.S.', notes: ['SHEET INDEX', 'A0.0 TITLE SHEET', 'A1.1 SITE PLAN', 'A2.1 FLOOR PLAN', 'A3.1 ELEVATIONS', 'A4.1 BUILDING SECTIONS', 'T24.1 TITLE 24 ENERGY COMPLIANCE', 'S1 FOUNDATION PLAN', 'S2 ROOF FRAMING PLAN', 'A2.0 EXISTING FLOOR PLAN'] },
    { id: 'A2.1', title: 'FLOOR PLAN', scale: `SCALE: 1/4" = 1'-0"`, notes: [
      'SMOKE ALARMS: NOT PROVIDED', 'CARBON MONOXIDE ALARM: N/A', 'NO BATHROOM EXHAUST FAN (WINDOW VENT)', 'NOT ALL-ELECTRIC: GAS RANGE AND GAS WATER HEATER', 'NO TEMPERED GLASS REQUIRED',
      'USE MALLEABLE IRON WASHERS UNDER HEAD AND NUT', 'FIRE SPRINKLERS: TBD', 'VAPOR RETARDER: N/A', 'ANCHOR BOLTS: SEE ENGINEER', 'MUDSILL: EXISTING',
      `CEILING HEIGHT 6'-8"`, 'EGRESS WINDOW 18" X 22"', 'EXISTING ENTRY DOOR TO REMAIN', 'NO EAVES', 'NON-RATED WALL'] },
  ];
}
