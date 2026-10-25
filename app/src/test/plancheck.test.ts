/// <reference types="node" />
// Plan-set pre-check: fixture PDFs are made here with pdf-lib (including the app's own exported sheets as a known-good input),
// then read with pdf.js exactly as the app does (legacy build, Node).
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages, normalize, parseInches, toLines, counts, PlanError, PLAN_LIMITS, type PlanCheck } from '../io/plancheck';
import { sheetsPDF } from '../out/pdf';
import { blankProject, demoProject } from '../core/model';
import { inch } from '../core/units';
import { CATALOG } from '../rules/ladbs-adu-2025';

const read = async (bytes: Uint8Array) => analyze((await extractPages(bytes, pdfjs as any)).pages);
const item = (c: PlanCheck, id: string) => { const x = c.items.find(i => i.id === id); if (!x) throw new Error('no item ' + id); return x; };

/** A hand-made 4-sheet plan set: what a drafter's PDF text looks like. `bad` puts in a low ceiling and a small escape window. */
async function planSet(bad = false, pagesWanted = 4) {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  const sheet = (lines: string[]) => { const pg = d.addPage([2592, 1728]); let y = 1650; for (const l of lines) { pg.drawText(l, { x: 60, y, size: 14, font: f }); y -= 24; } };
  sheet(['COVER SHEET', 'SHEET A-0', 'Project address: 4305 W Edenhurst Ave, Los Angeles, CA 90039', 'APN: 5594-014-021', 'Owner: Maria Lopez', 'Prepared by: J. Drafter', 'License: C-12345',
    'Scope of work: Convert existing detached garage to ADU', 'Occupancy: R-3', 'Type V-B', '1 story', 'Lot area: 5,600 sq ft', '380 sq ft livable ADU', "Height: 12'-0\"", 'Very High Fire Hazard Severity Zone: No',
    'Sheet index', 'Applicable codes: 2023 LARC, 2023 LABC, 2022 California Energy Code', 'Smoke alarms in each bedroom and hallway, hardwired with battery backup, per CRC R314', 'Carbon monoxide alarm per CRC R315',
    'Water heater strapped with seismic straps', 'All-electric ADU', 'Tempered glass at shower door and within 24" of doors', 'Title 24 CF1R attached, HERS verification required', 'Fire sprinklers not required']);
  sheet(['SITE PLAN', 'SHEET A-1', 'Scale: 1/8" = 1\'-0"', "Side setback 3'-6\" to property line", "Rear setback 4'-0\"", "Lot 40'-0\" x 140'-0\"", "Building separation 43'-0\"", "20'-0\" x 20'-0\" ADU"]);
  sheet(['FLOOR PLAN', 'SHEET A-2', 'Scale: 1/4" = 1\'-0"', bad ? "Ceiling height 6'-10\"" : "Ceiling height 8'-0\"", bad ? 'Egress window 18" x 22" net clear' : 'Egress window 24" x 36" net clear, sill 40" max',
    'Exit door 3\'-0" x 6\'-8"', 'Bathroom exhaust fan 50 CFM', 'Eave overhang 1\'-0"', '1-hour rated exterior wall per R302.1']);
  sheet(['ELEVATIONS', 'SECTIONS', 'SHEET A-3', 'Scale: 1/4" = 1\'-0"', 'Max height 12\'-0" top of roof', 'FOUNDATION PLAN', '6 mil vapor retarder under slab', 'Anchor bolts 5/8" @ 48" o.c.', 'FRAMING PLAN', '2x6 rafters @ 24" o.c.', 'EXISTING FLOOR PLAN']);
  for (let i = 4; i < pagesWanted; i++) sheet(['GENERAL NOTES', `SHEET G-${i}`]);
  return d.save();
}

describe('text helpers', () => {
  it('reads feet-inch and inch text', () => {
    expect(parseInches("7'-6\"")).toBe(90); expect(parseInches("7' 6")).toBe(90); expect(parseInches('90"')).toBe(90); expect(parseInches('7.5 ft')).toBe(90); expect(parseInches("4'-0 1/2\"")).toBe(48.5); expect(parseInches('none')).toBeNull();
  });
  it('normalizes ligatures, curly quotes, primes and the exported-sheet fi glyph', () => {
    expect(normalize('con{rm the {eld')).toBe('confirm the field'); expect(normalize('7′–6″')).toBe(`7'-6"`); expect(normalize('ﬁre  rated')).toBe('fire rated');
  });
  it('groups pdf.js items into lines top to bottom, left to right', () => {
    expect(toLines([{ str: 'B', transform: [1, 0, 0, 1, 50, 100] }, { str: 'A', transform: [1, 0, 0, 1, 10, 101] }, { str: 'top', transform: [1, 0, 0, 1, 0, 200] }, { str: ' ', transform: [1, 0, 0, 1, 0, 0] }])).toEqual(['top', 'A B']);
  });
});

describe('plan-set pre-check: fixtures', () => {
  it("reads the app's own exported sheets as a known-good input", async () => {
    const p = demoProject(); p.people.ownerName = 'Maria Lopez';
    const c = await read(await sheetsPDF(p, 'draft'));
    expect(c.pages).toBe(2); expect(c.scanned).toBe(false);
    expect(c.sheets.map(s => s.id)).toEqual(['A-1', 'A-2']);
    expect(c.sheets[0].kinds).toContain('site'); expect(c.sheets[1].kinds).toContain('floor'); expect(c.sheets[0].scales.length).toBeGreaterThan(0);
    expect(c.title.apn?.text).toBe('0000-000-000'); expect(c.title.address?.text).toContain('123 Example St'); expect(c.title.owner?.text).toBe('Maria Lopez');
    expect(c.title.occupancy?.text).toMatch(/R-3/); expect(c.title.type?.text).toMatch(/Type V-B/i);
    expect(item(c, 'I.C.2').state).toBe('addressed'); expect(item(c, 'I.C.2').confidence).toBe('high');
    expect(item(c, 'I.C.7').state).toBe('addressed'); expect(item(c, 'I.C.7').pages).toContain(1);
    expect(item(c, 'III.G.1').state).toBe('addressed'); expect(c.dims.ceilings[0].inches).toBe(96); expect(item(c, 'III.G.1').attention).toBeUndefined();
    expect(c.dims.setbacks.some(s => s.inches === 24)).toBe(true);
    // What the app's own sheets do not cover is said as missing, not guessed.
    expect(item(c, 'III.H.9').state).toBe('missing'); expect(item(c, 'III.H.9').confidence).toBe('low');
    expect(item(c, 'III.E.1').state).toBe('addressed');
  });
  it('maps a drafter plan set to sheet items with page references and confidence', async () => {
    const c = await read(await planSet());
    expect(c.pages).toBe(4); expect(c.sheets.map(s => s.id)).toEqual(['A-0', 'A-1', 'A-2', 'A-3']);
    expect(c.title.apn?.text).toBe('5594-014-021'); expect(c.title.license?.text).toMatch(/C-12345/);
    expect(item(c, 'I.C.8').state).toBe('addressed'); expect(item(c, 'I.C.8').confidence).toBe('high');
    expect(item(c, 'I.C.5').state).toBe('addressed'); expect(item(c, 'I.C.6').state).toBe('addressed');
    expect(item(c, 'N.4').confidence).toBe('high');
    expect(item(c, 'III.E.2').confidence).toBe('high'); expect(item(c, 'III.E.3').pages).toEqual([1]);
    expect(item(c, 'III.F.1').state).toBe('addressed'); expect(item(c, 'III.F.1').pages).toContain(3); expect(item(c, 'III.F.1').attention).toBeUndefined();
    expect(item(c, 'III.F.2').confidence).toBe('high'); expect(item(c, 'III.J.1').confidence).toBe('high'); expect(item(c, 'III.J.18').pages).toEqual([4]);
    expect(item(c, 'I.C.1').confidence).toBe('low'); // stamps and signatures are pictures: never more than low
    expect(item(c, 'III.D.1').attention?.en).toMatch(/under 5 ft/); // 3'-6" side setback read
    expect(c.dims.setbacks.find(s => s.side === 'side')?.inches).toBe(42);
    const n = counts(c); expect(n.addressed + n.partial + n.missing).toBe(c.items.length);
    // Every item id is a real LADBS sheet item, and every item has both languages.
    c.items.forEach(i => { expect(CATALOG.some(x => x.id === i.id)).toBe(true); expect(i.why.en && i.why.es).toBeTruthy(); });
  });
  it('flags a low ceiling and an undersized escape window it read', async () => {
    const c = await read(await planSet(true));
    expect(item(c, 'III.G.1').attention?.en).toMatch(/under 7 ft/); expect(item(c, 'III.G.1').attention?.es).toMatch(/7 pies/);
    expect(item(c, 'III.F.1').attention?.en).toMatch(/18" x 22"/);
  });
  it('says a scanned set (pictures only) has no text, instead of reporting everything missing as fact', async () => {
    const d = await PDFDocument.create(); for (let i = 0; i < 3; i++) d.addPage([612, 792]).drawRectangle({ x: 50, y: 50, width: 400, height: 400 });
    const c = await read(await d.save()); expect(c.scanned).toBe(true); expect(c.textPages).toBe(0); expect(c.items.every(i => i.state === 'missing' && i.confidence === 'low')).toBe(true);
  });
  it('refuses a file that is not a PDF, a damaged PDF, a locked PDF and an oversize file, with a code the screen can explain', async () => {
    await expect(extractPages(new TextEncoder().encode('hello'), pdfjs as any)).rejects.toMatchObject({ code: 'notpdf' });
    await expect(extractPages(new TextEncoder().encode('%PDF-1.7\n garbage garbage'), pdfjs as any)).rejects.toMatchObject({ code: 'damaged' });
    const locked = { getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('pw'), { name: 'PasswordException' })) }) };
    await expect(extractPages(new TextEncoder().encode('%PDF-1.7'), locked)).rejects.toBeInstanceOf(PlanError);
    await expect(extractPages(new TextEncoder().encode('%PDF-1.7'), locked)).rejects.toMatchObject({ code: 'locked' });
    const big = { byteLength: PLAN_LIMITS.maxBytes + 1, subarray: () => new Uint8Array() } as unknown as Uint8Array;
    await expect(extractPages(big, pdfjs as any)).rejects.toMatchObject({ code: 'size' });
  });
  it('caps the pages read and reports progress; a cancel stops early', async () => {
    const bytes = await planSet(false, 8); const seen: number[] = [];
    const r = await extractPages(bytes, pdfjs as any, n => seen.push(n)); expect(r.total).toBe(8); expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const sig = { cancelled: false }; const r2 = await extractPages(bytes, pdfjs as any, n => { if (n === 2) sig.cancelled = true; }, sig); expect(r2.pages.length).toBe(2);
  });
  it('an empty project export still reads (no owner: I.C.2 is partial, not addressed)', async () => {
    const p = blankProject(); p.site.address = '1 Main St'; p.adu.ceilingHeightMm = inch(80);
    const c = await read(await sheetsPDF(p, 'draft')); expect(item(c, 'I.C.2').state).toBe('partial'); expect(item(c, 'III.G.1').attention).toBeDefined();
  });
});
