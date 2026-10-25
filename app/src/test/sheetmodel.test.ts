// One sheet model (out/sheet.ts) for the screen layouts and the PDF: NCS title block, a real A-2 floor plan, each length
// dimensioned once, no label on linework or on another label, 1/8" minimum text, and true scale.
import { describe, it, expect } from 'vitest';
import { buildSheets, overlaps, MIN_TEXT_IN, type SText, type SPath } from '../out/sheet';
import { sameSpan } from '../ui/pro/drafting';
import { demoProject } from '../core/model';
import { furnished } from './_sheetfix';

const texts = (s: { items: unknown[] }) => (s.items as (SText | SPath)[]).filter((x): x is SText => x.k === 't');
describe('sheet model', () => {
  for (const [name, mk] of [['demo', demoProject], ['furnished', furnished]] as const) for (const paper of ['archd', 'tabloid', 'letter'] as const) it(`${name} ${paper}: no overlaps, no duplicate dims, 1/8" text, title block`, () => {
    const sheets = buildSheets(mk(), paper, { kind: 'draft' });
    for (const s of sheets) {
      const ov = overlaps(s); expect(ov, `${s.no} ${s.title}: ${JSON.stringify(ov.slice(0, 6))}`).toEqual([]);
      const dup = s.dims.filter((a, i) => s.dims.some((b, j) => j < i && sameSpan(a, b))); expect(dup, s.no).toEqual([]);
      expect(Math.min(...texts(s).map(t => t.h))).toBeGreaterThanOrEqual(MIN_TEXT_IN - 1e-9);
      for (const f of ['project', 'address', 'apn', 'sheet', 'title', 'scale', 'date', 'rev', 'drawn', 'checked', 'preparer', 'stamp', 'signature']) expect(texts(s).some(t => t.field === f || t.field === f + ':label'), `${s.no} ${f}`).toBe(true);
    }
  });
  it('A-2 is a floor plan at true scale: the 20 ft garage wall measures 20 ft at the stated scale (within 1/32")', () => {
    const a2 = buildSheets(furnished())[1]; expect(a2.no).toBe('A-2'); const k = a2.vps[0].scale.k;
    const xs = (a2.items.filter(x => x.k === 'p' && /^A-WALL(-EXST)?$/.test(x.layer)) as SPath[]).flatMap(x => [...x.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(m => +m[1]));
    expect(Math.abs(Math.max(...xs) - Math.min(...xs) - (20 * 12) / k)).toBeLessThanOrEqual(1 / 32);
    for (const l of ['A-WALL', 'A-DOOR', 'A-GLAZ', 'A-DOOR-IDEN', 'A-GLAZ-IDEN', 'A-AREA-IDEN', 'P-FIXT', 'A-ANNO-DIMS']) expect(a2.items.some(x => x.layer === l), l).toBe(true);
    expect(texts(a2).some(t => t.s === 'DOOR SCHEDULE') && texts(a2).some(t => t.s === 'WINDOW SCHEDULE')).toBe(true);
    expect([12, 16, 24, 32, 48, 64, 96]).toContain(k);
  });
  it('sheet numbers follow NCS (no A-0)', () => { expect(buildSheets(furnished()).map(s => s.no)).toEqual(['A-1', 'A-2', 'A-1.1']); });
});
