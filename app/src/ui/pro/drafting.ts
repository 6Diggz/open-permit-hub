// Drafting graphics generated from the model (Pro workspace). Pure: no DOM, no React, so it is unit-tested.
// Model units are mm with y up. Output is in screen-oriented model units (x right, y down = -model y), ready for an SVG viewBox.
import type { Project, Room } from '../../core/model';
import { bbox, area, clearanceToEdge, onOutline, type Poly, type Pt } from '../../core/geom';
import { ft, inch, fmtFtIn, toSqFt } from '../../core/units';
import { roomAbs, applyTape, roomArea } from '../../core/rooms';

/** NCS (US National CAD Standard) layer names used by the workspace. */
export const LAYERS = [
  { id: 'C-PROP', desc: 'Property lines', lw: 0.5 },
  { id: 'C-PROP-SBCK', desc: 'Setback lines', lw: 0.18 },
  { id: 'A-BLDG-EXST', desc: 'Existing buildings', lw: 0.35 },
  { id: 'A-WALL-EXST', desc: 'Walls, existing', lw: 0.35 },
  { id: 'A-WALL', desc: 'Walls, new', lw: 0.5 },
  { id: 'A-WALL-DEMO', desc: 'Walls and doors, demolition', lw: 0.25 },
  { id: 'A-WALL-PATT', desc: 'Wall poché', lw: 0.09 },
  { id: 'A-DOOR', desc: 'Doors', lw: 0.25 },
  { id: 'A-GLAZ', desc: 'Windows', lw: 0.18 },
  { id: 'P-FIXT', desc: 'Plumbing fixtures', lw: 0.18 },
  { id: 'A-EQPM', desc: 'Appliances', lw: 0.18 },
  { id: 'A-AREA-IDEN', desc: 'Room tags', lw: 0.18 },
  { id: 'A-ANNO-DIMS', desc: 'Dimensions', lw: 0.13 },
  { id: 'A-ANNO-TEXT', desc: 'Labels', lw: 0.18 },
  { id: 'A-ANNO-SYMB', desc: 'North arrow, scale bar', lw: 0.25 },
  { id: 'G-ANNO-REDL', desc: 'Check pins and review markup', lw: 0.35 },
] as const;
export type LayerId = typeof LAYERS[number]['id'];

export type Fill = 'none' | 'poche' | 'exst' | 'bg' | 'ink';
export type Dash = 'phantom' | 'hidden' | 'demo';
/** One stroked or filled path. `tone`: ink (default), exst (existing, gray), fix (fails a check). `obj` names the model object it belongs to. */
export interface Prim { layer: LayerId; lw: number; d: string; fill?: Fill; dash?: Dash; tone?: 'ink' | 'exst' | 'fix'; obj?: string; stroke?: boolean }
export interface Txt { layer: LayerId; x: number; y: number; h: number; s: string; anchor?: 'start' | 'middle' | 'end'; rot?: number; tone?: 'ink' | 'exst' | 'fix'; bold?: boolean; obj?: string; /** Vertically centered on (x, y). */ mid?: boolean }
/** Screen angle (degrees, SVG rotate) of model direction u, turned so text never reads upside down or top-to-bottom. */
export function readable(u: { x: number; y: number }): number { let a = Math.atan2(-u.y, u.x) * 180 / Math.PI; if (a >= 89.99) a -= 180; else if (a < -90.01) a += 180; return a; }
export interface Drawing { prims: Prim[]; texts: Txt[]; extents: { minX: number; minY: number; maxX: number; maxY: number } }

/** Architectural feet-inches: 5'-0", 12'-6 1/2". */
let UNITS: 'ftin' | 'metric' = 'ftin';
/** Display units for the Pro workspace (input always accepts both). */
export const setUnits = (u: 'ftin' | 'metric') => { UNITS = u; };
export const getUnits = () => UNITS;
export const fmtArch = (mm: number) => (UNITS === 'metric' ? (Number.isFinite(mm) ? `${Math.round(mm).toLocaleString('en-US')} mm` : '—') : fmtFtIn(mm).replace("' ", "'-"));

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
/** Model point to the screen-oriented frame (y flipped). */
export const S = (q: Pt) => `${f1(q.x)} ${f1(-q.y)}`;
const line = (a: Pt, b: Pt) => `M${S(a)}L${S(b)}`;
const ring = (pl: Pt[], close = true) => pl.length ? `M${pl.map(S).join('L')}${close ? 'Z' : ''}` : '';
const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Pt) => Math.hypot(v.x, v.y);
const unit = (v: Pt): Pt => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
const signedArea = (pl: Poly) => { let s = 0; pl.forEach((a, i) => { const b = pl[(i + 1) % pl.length]; s += a.x * b.y - b.x * a.y; }); return s / 2; };
/** Unit normal pointing into the polygon for edge i. */
export const inward = (pl: Poly, i: number): Pt => { const a = pl[i], b = pl[(i + 1) % pl.length]; const u = unit(sub(b, a)); return signedArea(pl) >= 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x }; };

/** Offset every edge of a polygon inward by its own distance (miter joins). Used for wall inner faces and setback lines. */
export function offsetInward(pl: Poly, t: number | ((i: number) => number)): Poly {
  const n = pl.length; const d = (i: number) => (typeof t === 'number' ? t : t(i));
  const lines = pl.map((a, i) => { const nv = inward(pl, i); const o = add(a, nv, d(i)); return { o, u: unit(sub(pl[(i + 1) % n], a)) }; });
  return pl.map((_, i) => {
    const A = lines[(i - 1 + n) % n], B = lines[i]; const den = A.u.x * B.u.y - A.u.y * B.u.x;
    if (Math.abs(den) < 1e-9) return B.o;
    const w = sub(B.o, A.o); const s = (w.x * B.u.y - w.y * B.u.x) / den; return add(A.o, A.u, s);
  });
}

/** Closest pair of points between polygon `a` and segment p-q (vertex projections cover rectangles and most real lots). */
export function closestPair(a: Poly, p: Pt, q: Pt): [Pt, Pt] {
  const proj = (x: Pt, s: Pt, e: Pt): Pt => { const d = sub(e, s); const L = d.x * d.x + d.y * d.y; let t = L ? ((x.x - s.x) * d.x + (x.y - s.y) * d.y) / L : 0; t = Math.max(0, Math.min(1, t)); return add(s, d, t); };
  let best: [Pt, Pt] = [a[0], proj(a[0], p, q)]; let bd = Infinity;
  const test = (x: Pt, y: Pt) => { const dd = len(sub(x, y)); if (dd < bd - 1e-6) { bd = dd; best = [x, y]; } };
  a.forEach(v => test(v, proj(v, p, q)));
  a.forEach((v, i) => { const w = a[(i + 1) % a.length]; test(proj(p, v, w), p); test(proj(q, v, w), q); });
  return best;
}

/** Architectural dimension: extension lines, dimension line, 45° ticks, text above the line. Offset is model mm, signed (left of a->b is +). */
export function dimension(a: Pt, b: Pt, off: number, h: number, text: string, tone: 'ink' | 'fix' = 'ink', obj?: string): { prims: Prim[]; texts: Txt[] } {
  const u = unit(sub(b, a)); const nv = { x: -u.y, y: u.x }; const A = add(a, nv, off), B = add(b, nv, off);
  const ext = off === 0 ? '' : `${line(add(a, nv, Math.sign(off) * h * 0.6), add(A, nv, Math.sign(off) * h * 0.8))}${line(add(b, nv, Math.sign(off) * h * 0.6), add(B, nv, Math.sign(off) * h * 0.8))}`;
  const tk = h * 0.55; const diag = unit(add(u, nv)); const tick = (c: Pt) => line(add(c, diag, -tk), add(c, diag, tk));
  const dl = line(add(A, u, -h * 0.6), add(B, u, h * 0.6));
  // Text reads left-to-right or bottom-to-top (never upside down), centered just above the dimension line.
  const ang = readable(u); const r = (ang * Math.PI) / 180; const up = { x: Math.sin(r), y: -Math.cos(r) };
  const m = { x: (A.x + B.x) / 2, y: -(A.y + B.y) / 2 }; const tp = { x: m.x + up.x * h * 0.75, y: m.y + up.y * h * 0.75 };
  return { prims: [{ layer: 'A-ANNO-DIMS', lw: 0.13, d: ext + dl + tick(A) + tick(B), tone, obj }], texts: [{ layer: 'A-ANNO-DIMS', x: tp.x, y: tp.y, h, s: text, anchor: 'middle', rot: ang, tone, obj, mid: true }] };
}

/** A local frame on a wall: u runs along the wall from `o`, v points into the room. */
interface Frame { at: (u: number, v: number) => Pt }
const frame = (o: Pt, du: Pt, dv: Pt): Frame => ({ at: (u, v) => ({ x: o.x + du.x * u + dv.x * v, y: o.y + du.y * u + dv.y * v }) });
const fRect = (F: Frame, u0: number, v0: number, w: number, d: number) => ring([F.at(u0, v0), F.at(u0 + w, v0), F.at(u0 + w, v0 + d), F.at(u0, v0 + d)]);
const fEllipse = (F: Frame, cu: number, cv: number, ru: number, rv: number, n = 28) => ring(Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return F.at(cu + Math.cos(t) * ru, cv + Math.sin(t) * rv); }));
const fCircle = (F: Frame, cu: number, cv: number, r: number) => fEllipse(F, cu, cv, r, r, 24);

/** Plumbing fixtures and appliances for a room, placed along its longest wall from what the room is used for. */
export function fixtures(p: Project, r: Room, waterHeater: boolean): { prims: Prim[]; texts: Txt[] } {
  const prims: Prim[] = []; const texts: Txt[] = []; if (r.use !== 'bath' && r.use !== 'kitchen' && !waterHeater) return { prims, texts };
  const pl = roomAbs(p, applyTape(r)); const b = bbox(pl); const W = b.maxX - b.minX, D = b.maxY - b.minY;
  // Back wall = the longer side, on the side away from the street (max y); u runs left to right along it.
  const along = W >= D ? W : D; const depth = W >= D ? D : W;
  const F = W >= D ? frame({ x: b.minX, y: b.maxY }, { x: 1, y: 0 }, { x: 0, y: -1 }) : frame({ x: b.maxX, y: b.minY }, { x: 0, y: 1 }, { x: -1, y: 0 });
  const P = (layer: LayerId, d: string) => prims.push({ layer, lw: 0.18, d, obj: 'room:' + r.id });
  const label = (layer: LayerId, q: Pt, s: string) => texts.push({ layer, x: q.x, y: -q.y, h: inch(3), s, anchor: 'middle', obj: 'room:' + r.id });
  let u = inch(2);
  const fits = (w: number, d: number) => u + w <= along - inch(2) && d <= depth - inch(18);
  if (r.use === 'bath') {
    if (fits(inch(36), inch(36))) { P('P-FIXT', fRect(F, u, 0, inch(36), inch(36)) + fRect(F, u + inch(2), inch(2), inch(32), inch(32)) + fCircle(F, u + inch(18), inch(18), inch(1.5)) + `M${S(F.at(u + inch(2), inch(2)))}L${S(F.at(u + inch(16.9), inch(16.9)))}M${S(F.at(u + inch(34), inch(2)))}L${S(F.at(u + inch(19.1), inch(16.9)))}`); label('P-FIXT', F.at(u + inch(18), inch(28)), 'SHWR'); u += inch(36) + inch(4); }
    if (fits(inch(30), inch(28))) { const c = u + inch(15); P('P-FIXT', fRect(F, c - inch(10), 0, inch(20), inch(8)) + fEllipse(F, c, inch(18.5), inch(7.5), inch(10.5)) + fEllipse(F, c, inch(19), inch(5.5), inch(8))); u += inch(30) + inch(2); }
    if (fits(inch(24), inch(20))) { const c = u + inch(12); P('P-FIXT', fRect(F, u, 0, inch(24), inch(20)) + fEllipse(F, c, inch(11), inch(8), inch(6)) + fCircle(F, c, inch(3), inch(1))); label('P-FIXT', F.at(c, inch(25)), 'LAV'); u += inch(26); }
  }
  if (r.use === 'kitchen') {
    const run0 = u;
    if (fits(inch(36), inch(30))) { P('A-EQPM', fRect(F, u, 0, inch(36), inch(30)) + `M${S(F.at(u, inch(28)))}L${S(F.at(u + inch(36), inch(28)))}`); label('A-EQPM', F.at(u + inch(18), inch(16)), 'REF'); u += inch(37); }
    const c0 = u;
    if (fits(inch(33), inch(25))) { P('P-FIXT', fRect(F, u + inch(1.5), inch(2), inch(14.5), inch(16)) + fRect(F, u + inch(17), inch(2), inch(14.5), inch(16)) + fCircle(F, u + inch(16.5), inch(20.5), inch(1))); label('P-FIXT', F.at(u + inch(16.5), inch(-0.1) + inch(31)), 'SINK'); u += inch(36); }
    if (fits(inch(30), inch(25))) { P('A-EQPM', fRect(F, u, 0, inch(30), inch(25)) + fCircle(F, u + inch(8), inch(7), inch(4.5)) + fCircle(F, u + inch(22), inch(7), inch(3.5)) + fCircle(F, u + inch(8), inch(18), inch(3.5)) + fCircle(F, u + inch(22), inch(18), inch(4.5))); label('A-EQPM', F.at(u + inch(15), inch(31)), 'RANGE'); u += inch(30); }
    if (u > c0) P('A-EQPM', `M${S(F.at(c0, inch(25)))}L${S(F.at(Math.min(along - inch(2), u + inch(24)), inch(25)))}L${S(F.at(Math.min(along - inch(2), u + inch(24)), 0))}`);
    void run0;
  }
  // Water heater: in the back corner when there is room, else in the opposite corner on the front wall.
  if (waterHeater) { const back = along - u >= inch(26) && depth >= inch(40); const front = !back && depth >= inch(64) && along >= inch(30);
    if (back || front) { const c = along - inch(13), v = back ? inch(13) : depth - inch(13); P('P-FIXT', fCircle(F, c, v, inch(11)) + fCircle(F, c, v, inch(9.5))); label('P-FIXT', F.at(c, v + inch(1.2)), 'WH'); } }
  return { prims, texts };
}

export interface DraftOpts { /** Model mm per paper inch (annotation scale), e.g. 96 * 25.4 for 1/8" = 1'-0". */ anno: number; es?: boolean; garageDoorFor?: boolean }
const EXT_WALL = inch(6), INT_WALL = inch(4.5);

/** The garage door edge: the footprint edge whose midpoint is closest to the street lot edge. */
export function garageDoorEdge(p: Project): number {
  const lot = p.site.lot, fp = p.adu.footprint; const a = lot[p.site.streetEdge], b = lot[(p.site.streetEdge + 1) % lot.length];
  let best = 0, bd = Infinity; fp.forEach((v, i) => { const w = fp[(i + 1) % fp.length]; const m = { x: (v.x + w.x) / 2, y: (v.y + w.y) / 2 }; const d = clearanceToEdge([m, m], [a, b], 0); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** The whole drawing: site, walls, openings, fixtures, tags, dimensions, symbols. */
export function draft(p: Project, o: DraftOpts): Drawing {
  const prims: Prim[] = []; const texts: Txt[] = []; const h = o.anno * (3 / 32); const es = !!o.es;
  const T = (t: Txt) => texts.push(t);
  const lot = p.site.lot; const lb = bbox(lot); const fp = p.adu.footprint; const conv = p.adu.mode === 'conversion';
  const streets = new Set([p.site.streetEdge, ...(p.site.streetEdges ?? [])]);

  // Property lines (phantom), with each line's length outside it.
  prims.push({ layer: 'C-PROP', lw: 0.5, d: ring(lot), dash: 'phantom', obj: 'lot' });
  lot.forEach((a, i) => { const b = lot[(i + 1) % lot.length]; const nv = inward(lot, i); const m = add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, nv, -h * 1.1);
    T({ layer: 'C-PROP', x: m.x, y: -m.y, h: h * 0.9, s: fmtArch(len(sub(b, a))), anchor: 'middle', rot: readable(sub(b, a)), obj: 'lot', mid: true }); });
  // Street label.
  { const a = lot[p.site.streetEdge], b = lot[(p.site.streetEdge + 1) % lot.length]; const m = add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, inward(lot, p.site.streetEdge), -h * 4);
    T({ layer: 'A-ANNO-TEXT', x: m.x, y: -m.y, h: h * 1.2, s: es ? 'CALLE' : 'STREET', anchor: 'middle', bold: true }); }
  // Setbacks: 4 ft inside side and rear lines (dashed).
  const sb = offsetInward(lot, i => (streets.has(i) ? 0 : ft(4)));
  lot.forEach((_, i) => { if (streets.has(i)) return; prims.push({ layer: 'C-PROP-SBCK', lw: 0.18, d: line(sb[i], sb[(i + 1) % lot.length]), dash: 'hidden' }); });
  { const rear = (p.site.streetEdge + 2) % lot.length; if (lot.length === 4 && !streets.has(rear)) { const a = sb[rear], b = sb[(rear + 1) % 4]; const m = add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, inward(lot, rear), h * 0.9);
    T({ layer: 'C-PROP-SBCK', x: m.x, y: -m.y, h: h * 0.8, s: es ? `RETIRO 4'-0"` : `4'-0" SETBACK`, anchor: 'middle' }); } }

  // Existing house (gray, existing convention).
  const hs = p.site.primary; const hb = bbox(hs);
  prims.push({ layer: 'A-BLDG-EXST', lw: 0.35, d: ring(hs), fill: 'exst', tone: 'exst', obj: 'house' });
  T({ layer: 'A-ANNO-TEXT', x: (hb.minX + hb.maxX) / 2, y: -(hb.minY + hb.maxY) / 2, h: h * 1.1, s: es ? '(E) VIVIENDA' : '(E) RESIDENCE', anchor: 'middle', tone: 'exst', bold: true, obj: 'house' });
  T({ layer: 'A-ANNO-TEXT', x: (hb.minX + hb.maxX) / 2, y: -(hb.minY + hb.maxY) / 2 + h * 1.6, h: h * 0.85, s: es ? 'FUERA DEL ALCANCE' : 'NOT IN SCOPE', anchor: 'middle', tone: 'exst', obj: 'house' });

  // Exterior walls at true thickness. Conversion: existing (gray fill, medium); new ADU: new (poché, heavy).
  const inner = offsetInward(fp, EXT_WALL); const n = fp.length;
  const door = conv ? garageDoorEdge(p) : -1; const de = door >= 0 ? len(sub(fp[(door + 1) % n], fp[door])) : 0;
  const gw = door >= 0 ? Math.min(ft(16), Math.max(0, de - ft(2))) : 0; const g0 = (de - gw) / 2;
  const wallLayer: LayerId = conv ? 'A-WALL-EXST' : 'A-WALL'; const tone = conv ? 'exst' as const : 'ink' as const;
  for (let i = 0; i < n; i++) {
    const a = fp[i], b = fp[(i + 1) % n], ai = inner[i], bi = inner[(i + 1) % n];
    prims.push({ layer: 'A-WALL-PATT', lw: 0.09, d: ring([a, b, bi, ai]), fill: conv ? 'exst' : 'poche', stroke: false, obj: 'adu' });
  }
  const faceLines = (pl: Poly) => { let d = ''; for (let i = 0; i < n; i++) { const a = pl[i], b = pl[(i + 1) % n];
    if (i === door && gw > 0) { const u = unit(sub(b, a)); const L = len(sub(b, a)); const k = L / de; d += line(a, add(a, u, g0 * k)) + line(add(a, u, (g0 + gw) * k), b); } else d += line(a, b); } return d; };
  prims.push({ layer: wallLayer, lw: conv ? 0.35 : 0.5, d: faceLines(fp) + faceLines(inner), tone, obj: 'adu' });
  if (door >= 0 && gw > 0) {
    const a = fp[door], b = fp[(door + 1) % n], ai = inner[door], bi = inner[(door + 1) % n]; const u = unit(sub(b, a)); const ui = unit(sub(bi, ai)); const Li = len(sub(bi, ai));
    const o0 = add(a, u, g0), o1 = add(a, u, g0 + gw); const i0 = add(ai, ui, g0 * Li / de), i1 = add(ai, ui, (g0 + gw) * Li / de);
    if (p.adu.removesGarageDoorWall === 'yes') {
      // New infill wall (heavy, poché) where the garage door was; the removed door is dashed (demolition).
      prims.push({ layer: 'A-WALL-PATT', lw: 0.09, d: ring([o0, o1, i1, i0]), fill: 'poche', stroke: false, obj: 'adu' });
      prims.push({ layer: 'A-WALL', lw: 0.5, d: ring([o0, o1, i1, i0]), obj: 'adu' });
      const nv = inward(fp, door); const panel = [add(i0, nv, inch(1)), add(i1, nv, inch(1)), add(i1, nv, inch(3)), add(i0, nv, inch(3))];
      prims.push({ layer: 'A-WALL-DEMO', lw: 0.25, d: ring(panel), dash: 'demo', obj: 'adu' });
      const m = add({ x: (i0.x + i1.x) / 2, y: (i0.y + i1.y) / 2 }, nv, inch(3) + h * 1.2);
      T({ layer: 'A-WALL-DEMO', x: m.x, y: -m.y, h: h * 0.75, s: es ? '(D) PUERTA DE GARAJE' : '(D) GARAGE DOOR', anchor: 'middle', tone: 'exst' });
    } else {
      // Garage door stays (existing): jambs and the door panel in gray.
      const nv = inward(fp, door);
      prims.push({ layer: 'A-WALL-EXST', lw: 0.35, d: line(o0, i0) + line(o1, i1), tone: 'exst', obj: 'adu' });
      prims.push({ layer: 'A-DOOR', lw: 0.18, d: ring([add(o0, nv, inch(2)), add(o1, nv, inch(2)), add(o1, nv, inch(4)), add(o0, nv, inch(4))]), tone: 'exst', obj: 'adu' });
    }
  }

  // Interior partitions (new), openings, fixtures and tags.
  const local = (q: Pt) => q; void local;
  const seen = new Set<string>(); const key = (a: Pt, b: Pt) => { const r = (v: number) => Math.round(v / inch(3)); const k1 = `${r(a.x)},${r(a.y)}`, k2 = `${r(b.x)},${r(b.y)}`; return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1; };
  const nearOutline = (q: Pt) => onOutline(q, fp, inch(10));
  const wh = p.adu.rooms.find(r => r.use === 'kitchen') ?? p.adu.rooms.find(r => r.use === 'bath');
  for (const r of p.adu.rooms) {
    const pl = roomAbs(p, applyTape(r));
    pl.forEach((a, i) => { const b = pl[(i + 1) % pl.length]; const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; if (nearOutline(m)) return; const k = key(a, b); if (seen.has(k)) return; seen.add(k);
      const out = inward(pl, i); const a2 = add(a, out, -INT_WALL), b2 = add(b, out, -INT_WALL);
      prims.push({ layer: 'A-WALL-PATT', lw: 0.09, d: ring([a, b, b2, a2]), fill: 'poche', stroke: false, obj: 'room:' + r.id });
      prims.push({ layer: 'A-WALL', lw: 0.5, d: line(a, b) + line(a2, b2), obj: 'room:' + r.id }); });
  }
  for (const r of p.adu.rooms) {
    const pl = roomAbs(p, applyTape(r));
    for (const op of r.openings) {
      if (op.wall >= pl.length) continue;
      const a = pl[op.wall], b = pl[(op.wall + 1) % pl.length]; const u = unit(sub(b, a)); const nin = inward(pl, op.wall);
      const s0 = add(a, u, op.offsetMm), s1 = add(a, u, op.offsetMm + op.widthMm); const m = add(s0, u, op.widthMm / 2);
      // Wall depth behind the opening: to the garage's outer face on an outside wall, else a partition.
      const ext = nearOutline(m); let span = INT_WALL;
      if (ext) { let best = Infinity; fp.forEach((v, j) => { const w = fp[(j + 1) % n]; best = Math.min(best, clearanceToEdge([m, m], [v, w], 0)); }); span = Math.min(ft(2), best); }
      const o0 = add(s0, nin, -span), o1 = add(s1, nin, -span);
      const obj = `open:${r.id}:${op.id}`;
      prims.push({ layer: op.kind === 'door' ? 'A-DOOR' : 'A-GLAZ', lw: 0.09, d: ring([add(s0, nin, inch(0.3)), add(s1, nin, inch(0.3)), add(o1, nin, -inch(0.3)), add(o0, nin, -inch(0.3))]), fill: 'bg', stroke: false, obj });
      if (op.kind === 'window') {
        const mid0 = add(s0, nin, -span / 2), mid1 = add(s1, nin, -span / 2);
        prims.push({ layer: 'A-GLAZ', lw: 0.18, d: line(s0, s1) + line(o0, o1) + line(add(mid0, nin, inch(0.75)), add(mid1, nin, inch(0.75))) + line(add(mid0, nin, -inch(0.75)), add(mid1, nin, -inch(0.75))) + line(s0, o0) + line(s1, o1), obj });
      } else {
        const W = op.widthMm; const tip = add(s0, nin, W); const leaf = [s0, add(s0, u, inch(1.5)), add(tip, u, inch(1.5)), tip];
        const arc: Pt[] = []; for (let k = 0; k <= 18; k++) { const t = (k / 18) * Math.PI / 2; arc.push(add(add(s0, nin, Math.cos(t) * W), u, Math.sin(t) * W)); }
        prims.push({ layer: 'A-DOOR', lw: 0.25, d: ring(leaf) + line(s0, o0) + line(s1, o1), obj });
        prims.push({ layer: 'A-DOOR', lw: 0.13, d: ring(arc, false), obj });
      }
    }
    const fx = fixtures(p, r, r === wh); prims.push(...fx.prims); texts.push(...fx.texts);
    // Room tag: name and area (and size for rectangles).
    const b = bbox(pl); const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; const th = inch(4.5);
    const nm = (r.name.trim() || (es ? 'CUARTO' : 'ROOM')).toUpperCase();
    T({ layer: 'A-AREA-IDEN', x: c.x, y: -c.y, h: th, s: nm, anchor: 'middle', bold: true, obj: 'room:' + r.id });
    T({ layer: 'A-AREA-IDEN', x: c.x, y: -c.y + th * 1.45, h: th * 0.8, s: `${Math.round(toSqFt(roomArea(r)))} ${es ? 'P²' : 'SF'}`, anchor: 'middle', obj: 'room:' + r.id });
  }

  // ADU label when no rooms are drawn.
  const fb = bbox(fp);
  if (!p.adu.rooms.length) {
    T({ layer: 'A-ANNO-TEXT', x: (fb.minX + fb.maxX) / 2, y: -(fb.minY + fb.maxY) / 2, h: h * 1.1, s: conv ? (es ? '(E) GARAJE A ADU' : '(E) GARAGE TO ADU') : (es ? '(N) ADU' : '(N) ADU'), anchor: 'middle', bold: true, obj: 'adu' });
    T({ layer: 'A-ANNO-TEXT', x: (fb.minX + fb.maxX) / 2, y: -(fb.minY + fb.maxY) / 2 + h * 1.6, h: h * 0.85, s: `${Math.round(toSqFt(area(fp)))} ${es ? 'P² BRUTOS' : 'SF GROSS'}`, anchor: 'middle', obj: 'adu' });
  }

  // Dimensions: ADU overall size, and ADU to every side and rear line (in the fix color when under 4'-0").
  const dimOff = h * 3;
  if (fp.length === 4) {
    const top = [{ x: fb.minX, y: fb.maxY }, { x: fb.maxX, y: fb.maxY }] as const; const left = [{ x: fb.minX, y: fb.minY }, { x: fb.minX, y: fb.maxY }] as const;
    const d1 = dimension(top[0], top[1], dimOff, h, fmtArch(fb.maxX - fb.minX), 'ink', 'adu'); const d2 = dimension(left[0], left[1], dimOff, h, fmtArch(fb.maxY - fb.minY), 'ink', 'adu');
    prims.push(...d1.prims, ...d2.prims); texts.push(...d1.texts, ...d2.texts);
  }
  lot.forEach((a, i) => { if (streets.has(i)) return; const b = lot[(i + 1) % lot.length]; const [q0, q1] = closestPair(fp, a, b); const d = len(sub(q1, q0)); if (d < 1 || d > ft(60)) return;
    const dd = dimension(q0, q1, 0, h, fmtArch(d), d < ft(4) - 0.5 ? 'fix' : 'ink', 'adu'); prims.push(...dd.prims); texts.push(...dd.texts); });

  // North arrow (from northDeg) and a graphic scale bar.
  const R = ft(3.5); const na = { x: lb.maxX + R + ft(6), y: lb.maxY - R - ft(2) };
  if (p.site.northDeg != null) {
    const t = (p.site.northDeg * Math.PI) / 180; const dir = { x: Math.sin(t), y: Math.cos(t) }; const perp = { x: dir.y, y: -dir.x };
    const tip = add(na, dir, R * 1.25), tail = add(na, dir, -R * 0.9);
    prims.push({ layer: 'A-ANNO-SYMB', lw: 0.25, d: ring(Array.from({ length: 36 }, (_, k) => add(na, { x: Math.cos(k / 36 * Math.PI * 2), y: Math.sin(k / 36 * Math.PI * 2) }, R))) });
    prims.push({ layer: 'A-ANNO-SYMB', lw: 0.25, d: ring([tip, add(tail, perp, R * 0.45), add(na, dir, -R * 0.35), add(tail, perp, -R * 0.45)]), fill: 'ink' });
    const lt = add(na, dir, R * 1.25 + h * 1.6); T({ layer: 'A-ANNO-SYMB', x: lt.x, y: -lt.y + h * 0.45, h: h * 1.25, s: 'N', anchor: 'middle', bold: true });
  } else {
    prims.push({ layer: 'A-ANNO-SYMB', lw: 0.25, d: ring(Array.from({ length: 36 }, (_, k) => add(na, { x: Math.cos(k / 36 * Math.PI * 2), y: Math.sin(k / 36 * Math.PI * 2) }, R))), dash: 'hidden' });
    T({ layer: 'A-ANNO-SYMB', x: na.x, y: -na.y + h * 0.4, h: h * 1.1, s: 'N ?', anchor: 'middle', bold: true });
    T({ layer: 'A-ANNO-SYMB', x: na.x, y: -na.y + R + h * 1.6, h: h * 0.75, s: es ? 'NORTE SIN FIJAR' : 'NORTH NOT SET', anchor: 'middle', tone: 'exst' });
  }
  const sbY = lb.minY - h * 7;
  {
    const steps = [ft(1), ft(2), ft(5), ft(10), ft(20), ft(50)]; const unitL = steps.find(s => s * 4 >= Math.min(o.anno * 1.5, (lb.maxX - lb.minX) * 0.6)) ?? ft(50); const sbx = lb.minX, sby = sbY; const bh = Math.min(o.anno * 0.06, ft(1.5));
    let d = ''; const fills: string[] = [];
    for (let k = 0; k < 4; k++) { const x0 = sbx + k * unitL; const box = ring([{ x: x0, y: sby }, { x: x0 + unitL, y: sby }, { x: x0 + unitL, y: sby + bh }, { x: x0, y: sby + bh }]); d += box; if (k % 2 === 0) fills.push(box);
      T({ layer: 'A-ANNO-SYMB', x: x0, y: -(sby) + h * 1.3, h: h * 0.75, s: fmtArch(k * unitL).replace(/-0"$/, ''), anchor: 'middle' }); }
    T({ layer: 'A-ANNO-SYMB', x: sbx + 4 * unitL, y: -(sby) + h * 1.3, h: h * 0.75, s: fmtArch(4 * unitL).replace(/-0"$/, ''), anchor: 'middle' });
    prims.push({ layer: 'A-ANNO-SYMB', lw: 0.18, d }); fills.forEach(f => prims.push({ layer: 'A-ANNO-SYMB', lw: 0.09, d: f, fill: 'ink', stroke: false }));
  }

  const pad = ft(8);
  return { prims, texts, extents: { minX: lb.minX - pad, minY: -(lb.maxY + pad), maxX: na.x + R + ft(2), maxY: -(lb.minY - ft(16)) } };
}

/** Standard architectural scales: label and model inches per paper inch. */
export const SCALES = [
  { label: '1" = 1\'-0"', k: 12 }, { label: '3/4" = 1\'-0"', k: 16 }, { label: '1/2" = 1\'-0"', k: 24 }, { label: '3/8" = 1\'-0"', k: 32 },
  { label: '1/4" = 1\'-0"', k: 48 }, { label: '3/16" = 1\'-0"', k: 64 }, { label: '1/8" = 1\'-0"', k: 96 }, { label: '3/32" = 1\'-0"', k: 128 },
  { label: '1/16" = 1\'-0"', k: 192 }, { label: '1/32" = 1\'-0"', k: 384 },
] as const;
/** Annotation scale for the model view: the largest scale at which 3/32" text is still at least `minPx` tall on screen. */
export function annoScaleFor(pxPerMm: number, minPx = 11) { return SCALES.find(s => (3 / 32) * s.k * 25.4 * pxPerMm >= minPx && s.k <= 192) ?? SCALES[8]; }
/** Largest standard scale at which a box of w x h mm fits in paper inches pw x ph. */
export function fitScale(wMm: number, hMm: number, pw: number, ph: number) { return SCALES.find(s => wMm / 25.4 / s.k <= pw && hMm / 25.4 / s.k <= ph) ?? SCALES[SCALES.length - 1]; }
