// Review 3 F1/F3: no sheet may contradict another. Setback values, site data labels, distances and sheet IDs all come from
// one source (core/sitefacts.ts, sheetIndex), so every sheet of every paper size says the same thing.
import { describe, it, expect } from 'vitest';
import { buildSheets, sheetIndex, egress, type SText } from '../out/sheet';
import { SIDE_REAR_SETBACK_MM, siteFacts, edgeFacts } from '../core/sitefacts';
import { fmtArch } from '../ui/pro/drafting';
import { demoProject } from '../core/model';
import { inch } from '../core/units';
import { furnished } from './_sheetfix';

const T = (s: { items: unknown[] }) => (s.items as SText[]).filter(x => x.k === 't');
const FT = /(\d+'-\d+(?: \d+\/\d+)?")/;
describe('no contradictions across sheets', () => {
  for (const [name, mk] of [['demo', demoProject], ['furnished', furnished]] as const) for (const paper of ['archd', 'tabloid', 'letter'] as const) it(`${name} ${paper}`, () => {
    const p = mk(); const sheets = buildSheets(p, paper, { kind: 'draft' }); const all = sheets.flatMap(T); const req = fmtArch(SIDE_REAR_SETBACK_MM);
    // every setback number printed anywhere is the one required setback
    const sb = all.filter(t => /SETBACK/.test(t.s) && FT.test(t.s)).map(t => t.s.match(FT)![1]); expect(sb.length).toBeGreaterThan(0); expect(new Set(sb)).toEqual(new Set([req]));
    // a distance is never called a setback
    expect(all.filter(t => /ADU SETBACK/.test(t.s))).toEqual([]);
    // site data labels are unique and each distance is also the dimension on the drawing
    const rows = siteFacts(p, false, fmtArch); expect(new Set(rows.map(r => r[0])).size).toBe(rows.length);
    const dimTexts = new Set(sheets.flatMap(s => T(s).filter(t => t.layer === 'A-ANNO-DIMS').map(t => t.s)));
    for (const f of edgeFacts(p)) if (f.clearMm <= 60 * 304.8) expect(dimTexts.has(fmtArch(f.clearMm)), fmtArch(f.clearMm)).toBe(true);
    // the setback dimension is red only when it is under the required setback
    for (const s of sheets) for (const t of T(s).filter(x => x.layer === 'A-ANNO-DIMS' && x.tone === 'fix')) expect(edgeFacts(p).some(f => f.short && fmtArch(f.clearMm) === t.s), t.s).toBe(true);
    // sheet IDs: from the index, never two different sheets with one ID
    const idx = paper === 'archd' ? sheetIndex(p).map(x => x.no) : ['A-1.1']; const firsts = sheets.filter(s => !s.cont);
    expect(new Set(firsts.map(s => s.no)).size).toBe(firsts.length);
    for (const s of sheets) { expect(idx).toContain(s.no); expect(T(s).find(t => t.field === 'sheet')?.s).toBe(s.no); }
  });
  it('the 11x17 and letter plot plans carry the index ID A-1.1, not A-1', () => { for (const pp of ['tabloid', 'letter'] as const) expect(buildSheets(furnished(), pp)[0].no).toBe('A-1.1'); });
  it('window schedule: height, sill and net area from the model; egress status computed', () => {
    const a2 = buildSheets(furnished())[1]; const t = T(a2).map(x => x.s); expect(t).toContain('EGRESS OK'); expect(t).toContain('12.0');
    expect(egress(inch(24), inch(36), inch(40))).toBe('EGRESS OK'); expect(egress(inch(19), inch(36), inch(40))).toBe('EGRESS FAILS'); expect(egress(inch(30), inch(24), inch(45))).toBe('EGRESS FAILS'); expect(egress(inch(30), null, inch(30))).toBe('EGRESS: SIZE?');
  });
});
