// Pro (CAD) workspace: drafting graphics from the model, viewport math, snaps, drafting entities, the command engine,
// check pins and one-click fixes, file round trips and Spanish coverage. Each test guards a behavior the e2e suite drives.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { demoProject, blankProject, type Project } from '../core/model';
import { ft, inch } from '../core/units';
import { bbox, rect } from '../core/geom';
import { buildSheets } from '../out/sheet';
import { draft, fmtArch, garageDoorEdge, offsetInward, annoScaleFor, fitScale, LAYERS, readable, setUnits } from '../ui/pro/drafting';
import { fit, zoomAt, gridStep, snapPoint, snapSet, ortho, polar, hitTest, isAxisRect, dragCorner } from '../ui/pro/view';
import { sanitizeCad, arc3, trimLine, extendLine, offsetEnt, mapEnt, mirrorF, rotF, inWindow, crossParams, type Ent, DEFAULT_CAD } from '../core/cad';
import { IDLE, start, point, text, enter, parsePoint, dimGeom, ALIASES, type Ctx, type St, type Out } from '../ui/pro/cmd';
import { issuesOf, moveClear } from '../ui/pro/issues';
import { evaluate } from '../rules/engine';
import { RULES, PACK_ID } from '../rules/la-city';
import { migrate, serialize } from '../core/permitpack';
import { sitePlanSpec, addCad, toDXFR12 } from '../out/dxf';
import { ES } from '../ui/es';

const F = (n: number) => ft(n);
let idN = 0;
const ctxOf = (p: Project, extra: Partial<Ctx> = {}): Ctx => { return { p, cursor: null, sel: [], room: null, layer: 'A-DETL', textH: inch(9), newId: () => 'id' + ++idN, es: false, hit: () => null, ...extra }; };
/** Run a sequence of command-line inputs against a project and return the final project and outputs. */
function drive(p: Project, inputs: (string | { x: number; y: number })[], extra: Partial<Ctx> = {}): { p: Project; outs: Out[]; st: St } {
  let st: St = IDLE; let cur = structuredClone(p); const outs: Out[] = []; let sel = extra.sel ?? []; let room = extra.room ?? null;
  for (const i of inputs) {
    const c = ctxOf(cur, { ...extra, sel, room });
    const o = typeof i === 'string' ? (i === '' ? enter(st, c) : st.name ? text(st, i, c) : start(i, c)) : point(st, i, c);
    for (const f of o.fx) { if (f.kind === 'apply') { const d = structuredClone(cur); try { f.fn(d); cur = d; } catch { /* refused */ } } if (f.kind === 'select') { sel = f.ids; room = f.room ?? null; } }
    outs.push(o); st = o.st;
  }
  return { p: cur, outs, st };
}

describe('drafting graphics from the model', () => {
  const p = demoProject();
  const d = draft(p, { anno: 96 * 25.4 });
  it('property lines are phantom and setbacks dashed on their own NCS layers', () => {
    expect(d.prims.find(x => x.layer === 'C-PROP')?.dash).toBe('phantom');
    expect(d.prims.filter(x => x.layer === 'C-PROP-SBCK').every(x => x.dash === 'hidden')).toBe(true);
  });
  it('a converted garage draws existing walls at true 6" thickness (gray), and a new ADU draws new walls with poché', () => {
    const inner = offsetInward(p.adu.footprint, inch(6)); const ob = bbox(p.adu.footprint), ib = bbox(inner);
    expect(ib.minX - ob.minX).toBeCloseTo(inch(6)); expect(ob.maxY - ib.maxY).toBeCloseTo(inch(6));
    expect(d.prims.some(x => x.layer === 'A-WALL-EXST' && x.tone === 'exst')).toBe(true);
    const n = structuredClone(p); n.adu.mode = 'youadu'; const dn = draft(n, { anno: 96 * 25.4 });
    expect(dn.prims.some(x => x.layer === 'A-WALL-PATT' && x.fill === 'poche')).toBe(true); expect(dn.prims.some(x => x.layer === 'A-WALL' && x.lw === 0.5)).toBe(true);
  });
  it('a filled-in garage door is new infill wall plus a dashed demolished door (renovation convention)', () => {
    expect(d.prims.some(x => x.layer === 'A-WALL-DEMO' && x.dash === 'demo')).toBe(true);
    expect(garageDoorEdge(p)).toBe(0);
  });
  it('rooms get doors (arc + leaf), 3-line windows, fixtures from their use, and tags with name and area', () => {
    const q = structuredClone(p); const fb = bbox(q.adu.footprint); const W = fb.maxX - fb.minX;
    q.adu.rooms = [{ id: 'b', name: 'Bath', use: 'bath', shape: 'rect', poly: rect(inch(4), inch(4), F(9), F(7)), tape: { w: null, d: null }, ceilingMm: null, openings: [{ id: 'o1', kind: 'door', wall: 2, offsetMm: F(2), widthMm: inch(30), heightMm: inch(80), sillMm: null }] },
      { id: 'k', name: 'Kitchen', use: 'kitchen', shape: 'rect', poly: rect(F(9.6), inch(4), W - F(9.6) - inch(4), F(10)), tape: { w: null, d: null }, ceilingMm: null, openings: [{ id: 'o2', kind: 'window', wall: 0, offsetMm: F(2), widthMm: F(3), heightMm: null, sillMm: null }] }];
    const dd = draft(q, { anno: 48 * 25.4 });
    expect(dd.prims.filter(x => x.obj === 'open:b:o1' && x.layer === 'A-DOOR').length).toBe(3); // mask, leaf+jambs, swing arc
    expect(dd.prims.some(x => x.obj === 'open:k:o2' && x.layer === 'A-GLAZ' && (x.d.match(/M/g) ?? []).length >= 6)).toBe(true);
    const labels = dd.texts.map(t => t.s);
    expect(labels).toEqual(expect.arrayContaining(['SHWR', 'LAV', 'REF', 'SINK', 'RANGE', 'WH', 'BATH', 'KITCHEN']));
    expect(dd.texts.find(t => t.s === 'BATH' && t.layer === 'A-AREA-IDEN')).toBeTruthy(); expect(labels.some(s => /^63 SF$/.test(s))).toBe(true);
  });
  it('dimensions to side and rear lines use architectural ticks, and a short one is in the fix color', () => {
    const dims = d.texts.filter(t => t.layer === 'A-ANNO-DIMS').map(t => t.s);
    expect(dims).toContain(`2'-0"`); expect(d.prims.some(x => x.layer === 'A-ANNO-DIMS' && x.tone === 'fix')).toBe(true);
  });
  it('north arrow is a standard filled arrow, plan north up when not set (never "N ?" on the sheet); a scale bar is drawn', () => {
    // Sheet annotation lives on the sheets (review 2 #7): the model has no north arrow; the A-1 sheet has one and a graphic scale.
    expect(d.texts.some(t => t.s === 'N' || /N \?|NOT SET/.test(t.s))).toBe(false);
    const a1 = buildSheets(p)[0]; const tx = a1.items.filter(x => x.k === 't') as { s: string }[];
    expect(tx.filter(t => t.s === 'N').length).toBe(1); expect(tx.some(t => /N \?|NOT SET/.test(t.s))).toBe(false); expect(tx.some(t => t.s === 'FEET')).toBe(true);
    expect(a1.items.some(x => x.k === 'p' && x.layer === 'A-ANNO-SYMB' && x.fill === 'ink')).toBe(true);
    const q = structuredClone(p); q.site.northDeg = 90; expect(JSON.stringify(buildSheets(q)[0].items.filter(x => x.layer === 'A-ANNO-SYMB'))).not.toBe(JSON.stringify(a1.items.filter(x => x.layer === 'A-ANNO-SYMB')));
  });
  it('text never reads upside down or top to bottom', () => {
    expect(readable({ x: -1, y: 0 })).toBeCloseTo(0); expect(readable({ x: 0, y: -1 })).toBeCloseTo(-90); expect(readable({ x: 0, y: 1 })).toBeCloseTo(-90);
  });
  it('NCS layer list covers walls, doors, glazing, fixtures, dims and markup', () => {
    expect(LAYERS.map(l => l.id)).toEqual(expect.arrayContaining(['A-WALL', 'A-WALL-EXST', 'A-WALL-DEMO', 'A-DOOR', 'A-GLAZ', 'P-FIXT', 'A-ANNO-DIMS', 'G-ANNO-REDL', 'C-PROP']));
  });
  it('architectural ft-in format, and metric when chosen', () => {
    expect(fmtArch(F(5))).toBe(`5'-0"`); expect(fmtArch(F(12) + inch(6.5))).toBe(`12'-6 1/2"`);
    setUnits('metric'); expect(fmtArch(F(10))).toBe('3,048 mm'); setUnits('ftin');
  });
  it('annotation scale follows zoom; sheets pick the largest standard scale that fits', () => {
    expect(annoScaleFor(0.5).k).toBeLessThan(annoScaleFor(0.02).k);
    expect(fitScale(F(64), F(144), 28, 21).label).toBe(`1/8" = 1'-0"`);
  });
});

describe('viewport math and snaps', () => {
  it('fit, zoom about a point (the point stays put), and an adaptive grid', () => {
    const c = fit({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, 1000, 600, 0); expect(c.k).toBeCloseTo(1);
    const z = zoomAt(c, 2, 100, 100, 1000, 600, 0.001, 10); const before = { x: c.cx + (100 - 500) / c.k }, after = { x: z.cx + (100 - 500) / z.k }; expect(after.x).toBeCloseTo(before.x);
    expect(gridStep(0.05).minor).toBeGreaterThan(gridStep(1).minor);
  });
  it('endpoint beats midpoint; intersection, perpendicular and nearest are found; grid is the fallback', () => {
    const sq = [rect(0, 0, 1000, 1000)];
    expect(snapPoint({ x: 5, y: 4 }, sq, 20, { osnap: true, grid: null }).kind).toBe('end');
    expect(snapPoint({ x: 503, y: 2 }, sq, 20, { osnap: true, grid: null }).kind).toBe('mid');
    const p = blankProject(); p.cad = { ...DEFAULT_CAD(), ents: [{ id: 'a', t: 'line', layer: '0', pts: [{ x: 95000, y: 95000 }, { x: 105000, y: 105000 }] }, { id: 'b', t: 'line', layer: '0', pts: [{ x: 95000, y: 105000 }, { x: 105000, y: 95000 }] }] };
    const s = snapSet(p); const x = snapPoint({ x: 100006, y: 99996 }, s, 30, { osnap: true, grid: null }); expect(x.kind).toBe('int'); expect(x.pt.x).toBeCloseTo(100000);
    expect(snapPoint({ x: 300, y: 3 }, sq, 20, { osnap: true, grid: null, from: { x: 300, y: 500 } }).kind).toBe('perp');
    expect(snapPoint({ x: 280, y: 4 }, sq, 20, { osnap: true, grid: null }).kind).toBe('near');
    const g = snapPoint({ x: 140, y: 400 }, sq, 5, { osnap: true, grid: inch(6) }); expect(g.kind).toBe('grid'); expect(g.pt.x).toBeCloseTo(inch(6));
  });
  it('ortho and polar lock the direction', () => {
    expect(ortho({ x: 0, y: 0 }, { x: 100, y: 7 })).toEqual({ x: 100, y: 0 });
    const q = polar({ x: 0, y: 0 }, { x: 100, y: 103 })!; expect(q.x).toBeCloseTo(q.y);
    expect(polar({ x: 0, y: 0 }, { x: 100, y: 40 })).toBeNull();
  });
  it('hit test respects locked layers; corner grips resize rectangles', () => {
    const p = demoProject(); const b = bbox(p.adu.footprint); const m = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    expect(hitTest(p, m, 10)?.kind).toBe('adu'); expect(hitTest(p, m, 10, new Set(['A-WALL-EXST']))).toBeNull();
    const r = dragCorner(rect(0, 0, 1000, 1000), 2, { x: 3000, y: 500 }); expect(isAxisRect(r)).toBe(true); expect(bbox(r).maxX).toBe(3000);
  });
});

describe('drafting entities', () => {
  const L = (id: string, a: [number, number], b: [number, number]): Ent => ({ id, t: 'line', layer: '0', pts: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] });
  it('sanitize drops bad shapes, caps text and keeps good ones', () => {
    const c = sanitizeCad({ ents: [{ id: 'x', t: 'line', layer: 'A', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, { t: 'line', pts: [{ x: NaN, y: 0 }, { x: 1, y: 1 }] }, { t: 'circle', pts: [{ x: 0, y: 0 }] }, { t: 'virus', pts: [] }, { t: 'text', pts: [{ x: 0, y: 0 }], text: 'x'.repeat(5000) }], layers: [{ name: 'BAD<script>' }, { name: 'A-FURN', color: 3 }] })!;
    expect(c.ents.map(e => e.t)).toEqual(['line', 'text']); expect(c.ents[1].text!.length).toBe(2000); expect(c.layers.map(l => l.name)).toEqual(['A-FURN']);
  });
  it('three-point arc; trim at the nearest crossings; extend to the next edge; offset to the picked side', () => {
    const a = arc3({ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 })!; expect(a.r).toBeCloseTo(1); expect(a.c.x).toBeCloseTo(0);
    const h = L('h', [0, 0], [100, 0]); const v1 = L('v1', [30, -10], [30, 10]); const v2 = L('v2', [60, -10], [60, 10]);
    const t = trimLine(h, { x: 45, y: 0 }, [h, v1, v2], () => 'n')!; expect(t.map(e => e.pts.map(q => q.x))).toEqual([[0, 30], [60, 100]]);
    const s = L('s', [0, 0], [20, 0]); expect(extendLine(s, { x: 19, y: 0 }, [s, v1])!.pts[1].x).toBeCloseTo(30);
    const o = offsetEnt(h, 5, { x: 50, y: -3 }, 'o')!; expect(o.pts[0].y).toBeCloseTo(-5);
    expect(crossParams({ x: -2, y: 0 }, { x: 2, y: 0 }, { id: 'c', t: 'circle', layer: '0', pts: [{ x: 0, y: 0 }], r: 1 }).sort()).toEqual([0.25, 0.75]);
  });
  it('mirror reverses arcs; rotate turns text; window vs crossing selection', () => {
    const arc: Ent = { id: 'a', t: 'arc', layer: '0', pts: [{ x: 0, y: 0 }], r: 1, a0: 0, a1: Math.PI / 2 };
    const m = mapEnt(arc, mirrorF({ x: 0, y: -1 }, { x: 0, y: 1 }), { flip: true }); expect(Math.cos(m.a0!)).toBeCloseTo(0); expect(Math.cos(m.a1!)).toBeCloseTo(-1);
    const tx = mapEnt({ id: 't', t: 'text', layer: '0', pts: [{ x: 0, y: 0 }], rot: 0, text: 'A' }, rotF({ x: 0, y: 0 }, Math.PI / 2), { rot: Math.PI / 2 }); expect(tx.rot).toBeCloseTo(Math.PI / 2);
    const ln = L('l', [0, 0], [10, 0]); expect(inWindow(ln, { minX: -1, minY: -1, maxX: 5, maxY: 1 }, false)).toBe(false); expect(inWindow(ln, { minX: -1, minY: -1, maxX: 5, maxY: 1 }, true)).toBe(true);
  });
});

describe('command engine', () => {
  it('parses absolute, relative, polar and direct-distance points', () => {
    expect(parsePoint('10,20', null, null)).toEqual({ x: F(10), y: F(20) });
    const r = parsePoint("@3'6,0", { x: 0, y: 0 }, null)!; expect(r.x).toBeCloseTo(F(3.5));
    const pl = parsePoint('@10<90', { x: 0, y: 0 }, null)!; expect(pl.x).toBeCloseTo(0); expect(pl.y).toBeCloseTo(F(10));
    const dd = parsePoint("12'6", { x: 0, y: 0 }, { x: 0, y: -50 })!; expect(dd.y).toBeCloseTo(-F(12.5));
    expect(parsePoint('banana', { x: 0, y: 0 }, null)).toBeNull();
  });
  it('aliases map to generic command names', () => { for (const [a, n] of [['L', 'LINE'], ['PL', 'PLINE'], ['O', 'OFFSET'], ['TR', 'TRIM'], ['EX', 'EXTEND'], ['M', 'MOVE'], ['CO', 'COPY'], ['RO', 'ROTATE'], ['MI', 'MIRROR'], ['DI', 'DIST']]) expect(ALIASES[a]).toBe(n); });
  it('LINE draws one entity per segment and closes with C; undo inside the command drops the last one', () => {
    const r = drive(blankProject(), ['L', '0,0', '10,0', '10,10', 'C']); expect(r.p.cad!.ents.length).toBe(3);
    const u = drive(blankProject(), ['L', '0,0', '10,0', '10,10', 'U', '']); expect(u.p.cad!.ents.length).toBe(1);
  });
  it('ROOM with typed corners must sit inside the garage; use keywords set the room use', () => {
    const p = demoProject();
    expect(drive(p, ['RM', 'BATH', '29,109', '@6,6']).p.adu.rooms[0].use).toBe('bath');
    expect(drive(p, ['RM', '0,0', '@6,6']).p.adu.rooms.length).toBe(0);
  });
  it('ROTATE a selected room 90 degrees swaps its width and depth, and refuses to leave the garage', () => {
    const p = drive(demoProject(), ['RM', '29,109', '@10,8']).p; const id = p.adu.rooms[0].id;
    const r = drive(p, ['RO', '34,113', '90'], { room: id }).p.adu.rooms[0]; const b = bbox(r.poly); expect(b.maxX - b.minX).toBeCloseTo(F(8)); expect(b.maxY - b.minY).toBeCloseTo(F(10));
    const far = drive(p, ['RO', '0,0', '90'], { room: id }).p.adu.rooms[0]; expect(far.poly).toEqual(p.adu.rooms[0].poly);
  });
  it('DIMLINEAR picks horizontal or vertical from the line location and measures exactly', () => {
    const r = drive(blankProject(), ['DLI', '0,0', '10,3', '5,6']); const d = r.p.cad!.ents[0]; expect(d.rot).toBe(0); expect(dimGeom(d).len).toBeCloseTo(F(10));
    const v = drive(blankProject(), ['DLI', '0,0', '10,3', '14,1']).p.cad!.ents[0]; expect(dimGeom(v).len).toBeCloseTo(F(3));
  });
  it('TEXT, MTEXT (\\P new line) and LEADER notes; unknown commands explain themselves', () => {
    const r = drive(blankProject(), ['T', '1,1', 'NOTE A', 'MT', '1,3', 'LINE 1\\PLINE 2', 'LE', '0,0', '@5,5', '', 'SEE DETAIL']);
    expect(r.p.cad!.ents.map(e => e.t)).toEqual(['text', 'text', 'leader']); expect(r.p.cad!.ents[1].text).toBe('LINE 1\nLINE 2');
    const u = drive(blankProject(), ['FOO']); expect(u.outs[0].fx[0]).toMatchObject({ kind: 'say' });
  });
  it('MOVE, COPY, MIRROR, SCALE and ERASE act on the selection', () => {
    let p = drive(blankProject(), ['L', '0,0', '10,0', '']).p; const id = p.cad!.ents[0].id;
    p = drive(p, ['M', '0,0', '@0,5'], { sel: [id] }).p; expect(p.cad!.ents[0].pts[0].y).toBeCloseTo(F(5));
    p = drive(p, ['CO', '0,0', '@0,5', ''], { sel: [id] }).p; expect(p.cad!.ents.length).toBe(2);
    p = drive(p, ['SC', '0,5', '2'], { sel: [id] }).p; expect(p.cad!.ents[0].pts[1].x).toBeCloseTo(F(20));
    p = drive(p, ['E'], { sel: [id] }).p; expect(p.cad!.ents.length).toBe(1);
  });
});

describe('parity re-audit bugs', () => {
  it('1: MIRROR asks "Erase source objects?" and keeps the source by default (Enter or N); Y replaces it', () => {
    const p0 = drive(blankProject(), ['L', '0,0', '10,0', '']).p; const id = p0.cad!.ents[0].id;
    const r = drive(p0, ['MI', '0,1', '10,1'], { sel: [id] }); expect(r.outs[r.outs.length - 1].prompt).toMatch(/Erase source objects\? \[Yes\/No\] <No>/);
    expect(drive(p0, ['MI', '0,1', '10,1', ''], { sel: [id] }).p.cad!.ents.length).toBe(2);
    expect(drive(p0, ['MI', '0,1', '10,1', 'N'], { sel: [id] }).p.cad!.ents.length).toBe(2);
    const y = drive(p0, ['MI', '0,1', '10,1', 'Y'], { sel: [id] }).p; expect(y.cad!.ents.length).toBe(1); expect(y.cad!.ents[0].pts[0].y).toBeCloseTo(F(2));
  });
  it('2: COPY of a room to a spot outside the garage is refused (the app says why), never a silent "Copied"', () => {
    const p = demoProject(); p.adu.rooms = [{ id: 'r1', name: 'Bed', use: 'sleeping', shape: 'rect', poly: rect(inch(6), inch(6), F(8), F(8)), tape: { w: null, d: null }, ceilingMm: null, openings: [] }];
    const o = start('CO', ctxOf(p, { room: 'r1' })); let st = o.st; const c = ctxOf(p, { room: 'r1' });
    st = point(st, { x: 0, y: 0 }, c).st; const fin = point(st, { x: F(200), y: 0 }, c); const ap = fin.fx.find(f => f.kind === 'apply')!;
    const d = structuredClone(p); expect(() => (ap as { fn: (d: Project) => void }).fn(d)).toThrow(); expect(d.adu.rooms.length).toBe(1);
    const ok = point(st, { x: F(9), y: 0 }, c).fx.find(f => f.kind === 'apply') as { fn: (d: Project) => void }; const d2 = structuredClone(p); ok.fn(d2); expect(d2.adu.rooms.length).toBe(2);
  });
  it('4: a click on an object whose layer is locked names the locked layer', async () => {
    const { lockedLayerAt } = await import('../ui/pro/view'); const p = demoProject(); const b = bbox(p.adu.footprint); const m = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    expect(lockedLayerAt(p, m, 10, new Set(['A-WALL-EXST']))).toBe('A-WALL-EXST'); expect(lockedLayerAt(p, m, 10, new Set())).toBeNull();
    expect(lockedLayerAt(p, { x: -F(500), y: 0 }, 10, new Set(['X']), [{ layer: 'X', dist: 2 }])).toBe('X');
  });
});

describe('checks on the drawing', () => {
  it('pins come from the shared verdict, numbered, fixes first; the move fix clears fire separation', () => {
    const p = demoProject(); const rep = evaluate(p, RULES, PACK_ID); const iss = issuesOf(p, rep.results);
    const pinned = iss.filter(i => i.n); expect(pinned.map(i => i.n)).toEqual(pinned.map((_, k) => k + 1)); expect(pinned[0].status).toBe('FAIL');
    const fir = iss.find(i => i.id === 'FIR-01')!; const mv = fir.fixes.find(f => f.id === 'move5')!; expect(mv).toBeTruthy();
    const d = structuredClone(p); mv.apply(d); expect(evaluate(d, RULES, PACK_ID).results.find(r => r.rule.id === 'FIR-01')!.status).not.toBe('FAIL');
    expect(moveClear(d, F(5))).toBeNull();
  });
});

describe('files', () => {
  it('drafting entities travel in the .permitpack and survive a reopen', () => {
    const p = drive(demoProject(), ['L', '0,0', '10,0', '', 'T', '1,1', 'HELLO']).p; const back = migrate(JSON.parse(serialize(p)));
    expect(back.cad!.ents.map(e => e.t)).toEqual(['line', 'text']);
  });
  it('the CAD file carries drafter layers, open polylines, circles, rotated dims and text', () => {
    const p = drive(demoProject(), ['L', '0,0', '10,0', '', 'C', '5,5', '2', 'DLI', '0,0', '10,0', '5,3', 'T', '1,1', 'HELLO']).p;
    p.cad!.layers.push({ name: 'A-FURN', color: 3, on: true, locked: false });
    const s = sitePlanSpec(p); addCad(p, s);
    expect(s.outlines.some(o => o.closed === false)).toBe(true); expect(s.circles!.length).toBe(1); expect(s.dims.some(d => d.rot === 0 && d.da)).toBe(true);
    expect(s.layers!.some(l => l[0] === 'A-FURN')).toBe(true);
    const r12 = toDXFR12(p); expect(r12).toContain('CIRCLE'); expect(r12).toContain('A-FURN'); expect(r12).toContain('HELLO');
  });
});

describe('Spanish for the Pro workspace', () => {
  it('every label, command name and layer description has Spanish', () => {
    const dir = new URL('../ui/pro/', import.meta.url); const src = ['Workspace.tsx', 'Canvas.tsx'].map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n');
    const keys = [...src.matchAll(/\bL\('((?:[^'\\]|\\.)*)'\)/g)].map(m => m[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
    keys.push(...[...src.matchAll(/\ben: '([^']+)'/g)].map(m => m[1]));
    keys.push(...[...src.matchAll(/const CMD_EN[^\n]+/g)].flatMap(m => [...m[0].matchAll(/: '([^']+)'/g)].map(x => x[1])));
    keys.push(...LAYERS.map(l => l.desc));
    expect(keys.length).toBeGreaterThan(200);
    expect(keys.filter(k => !(k in ES))).toEqual([]);
  });
});

describe('right-to-left', () => {
  it('the drawing canvas never mirrors in RTL; only the chrome does', () => {
    const css = readFileSync(new URL('../ui/pro/pro.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\[dir="rtl"\] \.ms, \[dir="rtl"\] \.ms svg,[^{]*\{ direction: ltr; \}/);
    expect(css).not.toMatch(/\[dir="rtl"\][^{]*\.ms[^{]*\{[^}]*scaleX\(-1\)/);
  });
});

import { initCleanfix } from './wasm';
import { toDXF } from '../out/dxf';
import { inspect } from '../clean-wasm/cleanfix.js';
describe('DXF round trip (M2)', () => {
  it('the drafter plan writes and reads back with its layers, linear dims, circles and notes', async () => {
    initCleanfix();
    let p = demoProject(); p = drive(p, ['RM', 'BED', '28.5,108.5', '37.5,119.5', 'DLI', '28,128', '48,128', '38,131', 'DLI', '48,108', '48,115', '51,111', 'C', '40,120', '1', 'T', '50,124', 'EXISTING SLAB TO REMAIN']).p;
    p.cad!.layers.push({ name: 'A-FURN', color: 3, on: true, locked: false });
    const bytes = await toDXF(p); const txt = new TextDecoder().decode(bytes);
    expect(txt).toContain('EXISTING SLAB TO REMAIN'); expect(txt).toContain('A-FURN'); expect(txt).toMatch(/\nCIRCLE\r?\n/);
    const info = JSON.parse(inspect(bytes)); const s = JSON.stringify(info);
    expect(s).toMatch(/A-ANNO-DIMS/); expect(s).toMatch(/A-FURN/);
  });
});

describe('one NCS layer table for screen and DXF (parity re-audit 3)', () => {
  it('every layer the DXF writes for the model is a layer the Pro workspace shows', async () => {
    const { sitePlanSpec } = await import('../out/dxf');
    const names = new Set(LAYERS.map(l => l.id as string)); const s = sitePlanSpec(demoProject());
    const used = new Set([...s.outlines.map(x => x.layer), ...s.texts.map(x => x.layer), ...s.dims.map(x => x.layer)]);
    expect([...used].filter(n => !names.has(n))).toEqual([]);
    expect(used.has('A-BLDG-EXST')).toBe(true); expect(used.has('A-ADU-WALL')).toBe(false);
  });
});

describe('check pin layout (pins.ts)', () => {
  it('pins clear text boxes, linework and each other, and stay near their anchors', async () => {
    const { layoutPins } = await import('../ui/pro/pins');
    const rects = [{ x0: -40, y0: -10, x1: 40, y1: 10 }]; const segs: [number, number, number, number][] = [[-200, 30, 200, 30], [60, -200, 60, 200]];
    const out = layoutPins([{ key: 'a', ax: 0, ay: 0 }, { key: 'b', ax: 2, ay: 1 }, { key: 'c', ax: 1, ay: -2 }], { rects, segs }, 11);
    for (const p of out) { expect(Math.max(rects[0].x0 - (p.x + 11), p.x - 11 - rects[0].x1, rects[0].y0 - (p.y + 11), p.y - 11 - rects[0].y1)).toBeGreaterThanOrEqual(3); expect(Math.abs(p.y - 30)).toBeGreaterThan(11); expect(Math.abs(p.x - 60)).toBeGreaterThan(11); expect(Math.hypot(p.x - p.ax, p.y - p.ay)).toBeLessThan(260); }
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(Math.max(Math.abs(out[i].x - out[j].x), Math.abs(out[i].y - out[j].y))).toBeGreaterThanOrEqual(22);
  });
  it('a dimension the drafter drew is not drawn again by the automatic dims (same two points)', () => {
    const p = demoProject(); const fb = bbox(p.adu.footprint); const a = { x: fb.minX, y: fb.maxY }, b = { x: fb.maxX, y: fb.maxY };
    const base = draft(p, { anno: 96 * 25.4 }); const w = base.dims.filter(x => x.text === fmtArch(fb.maxX - fb.minX)).length;
    const d = draft(p, { anno: 96 * 25.4, userDims: [{ a: b, b: a }] }); const keys = d.dims.map(x => [x.a, x.b].map(q => `${Math.round(q.x)},${Math.round(q.y)}`).sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length); expect(d.dims.some(x => (x.a.x === a.x && x.a.y === a.y && x.b.x === b.x) || (x.a.x === b.x && x.b.x === a.x && x.a.y === a.y))).toBe(false); void w;
  });
  it('text heights follow the plotted standard: notes and dims 1/8" (LADBS I.C.3 minimum), room names 5/32"', () => {
    const A = 48 * 25.4; const q = demoProject(); q.adu.rooms = [{ id: 'b', name: 'Bed', use: 'sleeping', shape: 'rect', poly: rect(inch(6), inch(6), F(10), F(10)), tape: { w: null, d: null }, ceilingMm: null, openings: [] }];
    const d = draft(q, { anno: A }); expect(d.texts.find(t => t.s === 'BED')!.h).toBeCloseTo(A * 5 / 32); expect(d.texts.filter(t => t.layer === 'A-ANNO-DIMS').every(t => Math.abs(t.h - A / 8) < 1e-6)).toBe(true);
    expect(d.texts.filter(t => t.layer === 'A-ANNO-DIMS').every(t => t.mask)).toBe(true);
  });
  it('pen table: cut walls heavier than existing, existing heavier than dims; LWT honors it', async () => {
    const { PEN, lwPx } = await import('../ui/pro/drafting');
    expect(PEN['A-WALL']).toBeGreaterThan(PEN['A-WALL-EXST']); expect(PEN['A-WALL-EXST']).toBeGreaterThan(PEN['A-ANNO-DIMS']); expect(PEN['C-PROP']).toBe(0.5);
    expect(lwPx(0.5, true)).toBeGreaterThan(lwPx(0.18, true) * 2); expect(lwPx(0.5, false)).toBe(1);
    const d = draft(demoProject(), { anno: 96 * 25.4 }); expect(d.prims.filter(x => x.layer === 'A-ANNO-DIMS').every(x => x.lw === PEN['A-ANNO-DIMS'])).toBe(true);
  });
});
