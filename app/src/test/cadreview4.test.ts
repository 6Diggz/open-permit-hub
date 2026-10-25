// CAD review 4: plot plan legibility (enlarged ADU view, one scale style), door-swing clearance, A-2 interior dims off
// fixtures, door tags apart, sheets laid out on a grid.
import { describe, it, expect } from 'vitest';
import { buildSheets, ENG_SCALES, overlaps, type SText, type SPath, segs } from '../out/sheet';
import { draft, fixtures, swingArea, convexHit, inward, type Drawing } from '../ui/pro/drafting';
import { roomAbs, applyTape } from '../core/rooms';
import { demoProject } from '../core/model';
import { furnished } from './_sheetfix';

const texts = (s: { items: unknown[] }) => (s.items as (SText | SPath)[]).filter((x): x is SText => x.k === 't');
const plan = (p = furnished()) => draft(p, { anno: 24 * 25.4, scope: 'adu', detail: 'plan' });
const allBoxes = (p: ReturnType<typeof furnished>) => { const wh = p.adu.rooms.find(r => r.use === 'kitchen'); return p.adu.rooms.flatMap(r => fixtures(p, r, r === wh).boxes); };

describe('plot plan (A-1.1): enlarged ADU view, engineer scale', () => {
  for (const paper of ['letter', 'tabloid'] as const) it(`${paper}: main view + enlarged view, no overlaps`, () => {
    const s = buildSheets(furnished(), paper)[0]; expect(s.vps.length).toBe(2);
    const [ins, main] = [...s.vps].sort((a, b) => a.scale.k - b.scale.k);
    expect(ins.scale.k * 2).toBeLessThanOrEqual(main.scale.k);
    for (const v of s.vps) expect(ENG_SCALES.some(e => e.k === v.scale.k), v.scale.label).toBe(true); // one scale style
    expect(texts(s).find(t => t.field === 'scale')?.s).toBe('AS NOTED');
    expect(texts(s).some(t => t.s === 'ENLARGED AT ADU') && texts(s).some(t => t.s === 'SEE 2')).toBe(true);
    expect(overlaps(s)).toEqual([]);
    // the short setback dims are in the enlarged view, not stacked on the small one
    const inV = (t: SText, v: typeof main) => t.x > v.x && t.x < v.x + v.w && t.y > v.y && t.y < v.y + v.h;
    const dimT = texts(s).filter(t => t.layer === 'A-ANNO-DIMS');
    expect(dimT.filter(t => inV(t, ins) && t.s === `2'-0"`).length).toBe(2);
    expect(dimT.filter(t => inV(t, main)).map(t => t.s).sort()).toEqual([`130'-0"`, `28'-0"`, `50'-0"`]);
    // every main-view dimension has room for its text between its ticks (nothing squeezed outside)
    for (const t of dimT.filter(t => inV(t, main))) { const p = (s.items as SPath[]).find(x => x.k === 'p' && x.g === t.g)!; const L = Math.max(...segs(p.d).map(q => Math.hypot(q[2] - q[0], q[3] - q[1]))); expect(L, t.s).toBeGreaterThan(0.4); }
  });
  it('the plain demo lot still gets a plot plan with both views', () => { const s = buildSheets(demoProject(), 'letter')[0]; expect(s.vps.length).toBe(2); expect(overlaps(s)).toEqual([]); });
});

describe('door-swing clearance', () => {
  it('no door swing crosses a fixture or another swing (furnished plan)', () => {
    const p = furnished(); const d: Drawing = plan(p); expect(d.swingClashes).toEqual([]);
  });
  it('the bath door would hit the toilet hinged the old way; the drawing picks another swing', () => {
    const p = furnished(); const bath = p.adu.rooms.find(r => r.use === 'bath')!; const pl = roomAbs(p, applyTape(bath)); const op = bath.openings[0];
    const a = pl[op.wall], b = pl[(op.wall + 1) % pl.length]; const L = Math.hypot(b.x - a.x, b.y - a.y); const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const s0 = { x: a.x + u.x * op.offsetMm, y: a.y + u.y * op.offsetMm }; const old = swingArea(s0, inward(pl, op.wall), u, op.widthMm);
    expect(allBoxes(p).some(x => convexHit(old, x))).toBe(true);
  });
  it('a door with no clear swing is reported and drawn in the fix color', () => {
    const p = furnished(); const bath = p.adu.rooms.find(r => r.use === 'bath')!; bath.openings[0].widthMm = 2400; // an 8 ft door cannot swing anywhere
    const d = plan(p); expect(d.swingClashes!.length).toBeGreaterThan(0); expect(d.prims.some(x => x.layer === 'A-DOOR' && x.tone === 'fix')).toBe(true);
  });
});

describe('A-2 annotation', () => {
  it('interior room dims never run through a fixture', () => {
    const p = furnished(); const d = plan(p); const boxes = allBoxes(p).map(b => b.map(q => ({ x: q.x, y: -q.y })));
    const ds = d.prims.filter(x => x.layer === 'A-ANNO-DIMS' && x.obj?.startsWith('room:'));
    expect(ds.length).toBeGreaterThan(0);
    for (const x of ds) { const q = segs(x.d).sort((a, b) => Math.hypot(b[2] - b[0], b[3] - b[1]) - Math.hypot(a[2] - a[0], a[3] - a[1]))[0]; /* the dimension line */ const thin = [{ x: q[0], y: q[1] }, { x: q[2], y: q[3] }, { x: q[2] + 1, y: q[3] + 1 }, { x: q[0] + 1, y: q[1] + 1 }]; expect(boxes.some(b => convexHit(thin, b)), x.d.slice(0, 40)).toBe(false); }
  });
  it('A-2: door and window tags do not touch, no overlaps', () => { const a2 = buildSheets(furnished())[1]; expect(overlaps(a2)).toEqual([]); });
});
