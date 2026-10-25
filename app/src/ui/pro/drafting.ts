// Drafting graphics generated from the model (Pro workspace). Pure: no DOM, no React, so it is unit-tested.
// Model units are mm with y up. Output is in screen-oriented model units (x right, y down = -model y), ready for an SVG viewBox.
import type { Project, Room } from '../../core/model';
import { bbox, area, clearanceToEdge, onOutline, type Poly, type Pt } from '../../core/geom';
import { ft, inch, fmtFtIn, toSqFt } from '../../core/units';
import { roomAbs, applyTape, roomArea } from '../../core/rooms';

/** NCS (US National CAD Standard) layer names used by the workspace. */
export const LAYERS = [
  { id: 'C-PROP', desc: 'Property lines', lw: 0.5 },
  { id: 'C-PROP-SBCK', desc: 'Setback lines', lw: 0.25 },
  { id: 'A-BLDG-EXST', desc: 'Existing buildings', lw: 0.35 },
  { id: 'A-WALL-EXST', desc: 'Walls, existing', lw: 0.35 },
  { id: 'A-WALL', desc: 'Walls, new', lw: 0.5 },
  { id: 'A-WALL-DEMO', desc: 'Walls and doors, demolition', lw: 0.25 },
  { id: 'A-WALL-PATT', desc: 'Wall poché', lw: 0.09 },
  { id: 'A-DOOR', desc: 'Doors', lw: 0.25 },
  { id: 'A-DOOR-IDEN', desc: 'Door tags', lw: 0.18 },
  { id: 'A-GLAZ', desc: 'Windows', lw: 0.25 },
  { id: 'A-GLAZ-IDEN', desc: 'Window tags', lw: 0.18 },
  { id: 'P-FIXT', desc: 'Plumbing fixtures', lw: 0.18 },
  { id: 'A-EQPM', desc: 'Appliances', lw: 0.18 },
  { id: 'A-AREA', desc: 'Room boundaries', lw: 0.13 },
  { id: 'A-AREA-IDEN', desc: 'Room tags', lw: 0.25 },
  { id: 'A-ANNO-DIMS', desc: 'Dimensions', lw: 0.18 },
  { id: 'A-ANNO-TEXT', desc: 'Labels', lw: 0.18 },
  { id: 'A-ANNO-KEYN', desc: 'Keynotes and leaders', lw: 0.18 },
  { id: 'A-ANNO-SYMB', desc: 'North arrow, scale bar', lw: 0.25 },
  { id: 'G-ANNO-REDL', desc: 'Check pins and review markup (does not plot)', lw: 0.35 },
] as const;
export type LayerId = typeof LAYERS[number]['id'];
/** Layers that never print (AutoCAD: plot off). Check pins and review markup live here. */
export const NO_PLOT = new Set<string>(['G-ANNO-REDL']);
/** Pen table: NCS layer to plotted line weight (mm). Every primitive takes its weight from here unless it is a thinner sub-part. */
export const PEN: Record<string, number> = Object.fromEntries(LAYERS.map(l => [l.id, l.lw]));
/** Screen width (px) for a plotted weight: AutoCAD's LWT display (mm at 96 dpi) times LWDISPSCALE; 1 px hairline when LWT is off. */
export const lwPx = (lw: number, on: boolean, disp = 1.4) => (on ? Math.max(0.6, Math.round(lw * (96 / 25.4) * disp * 100) / 100) : 1);

/** Plotted text heights (paper inches), per NCS/UDS: notes and dims 3/32", room names 1/8", titles 3/16". */
export const TEXT_IN = { note: 3 / 32, room: 1 / 8, title: 3 / 16 } as const;
/** Smallest text drawn on screen (px). Anything smaller is left out rather than drawn unreadable. */
export const MIN_TEXT_PX = 8;
/** Dimension style (paper inches): text above the line, 1/16" extension-line gap from the object, 1/8" past the dim line, tier spacing. */
export const DIMSTY = { text: 3 / 32, gap: 1 / 16, over: 1 / 8, first: 1 / 2, tier: 3 / 8, textGap: 1 / 32, tick: 3 / 64 } as const;

export type Fill = 'none' | 'poche' | 'exst' | 'bg' | 'ink';
export type Dash = 'phantom' | 'hidden' | 'demo';
/** One stroked or filled path. `tone`: ink (default), exst (existing, gray), fix (fails a check). `obj` names the model object it belongs to. */
export interface Prim { layer: LayerId; lw: number; d: string; fill?: Fill; dash?: Dash; tone?: 'ink' | 'exst' | 'fix'; obj?: string; stroke?: boolean }
export interface Txt { layer: LayerId; x: number; y: number; h: number; s: string; anchor?: 'start' | 'middle' | 'end'; rot?: number; tone?: 'ink' | 'exst' | 'fix'; bold?: boolean; obj?: string; /** Vertically centered on (x, y). */ mid?: boolean; /** Background mask behind the text where it crosses linework. */ mask?: boolean }
/** Screen angle (degrees, SVG rotate) of model direction u, turned so text never reads upside down or top-to-bottom. */
export function readable(u: { x: number; y: number }): number { let a = Math.atan2(-u.y, u.x) * 180 / Math.PI; if (a >= 89.99) a -= 180; else if (a < -90.01) a += 180; return a; }
/** One dimension: its two measured points (model mm, y up), for dedupe and tests. */
export interface DimRef { a: Pt; b: Pt; text: string }
export interface Keynote { n: number; text: string }
export interface Drawing { prims: Prim[]; texts: Txt[]; extents: { minX: number; minY: number; maxX: number; maxY: number }; dims: DimRef[]; keynotes: Keynote[]; /** The ADU plus room for its dims, for the default view (screen-oriented). */ focus: { minX: number; minY: number; maxX: number; maxY: number } }
/** Same two points (either order) within tolerance. */
export const sameDim = (a: { a: Pt; b: Pt }, b: { a: Pt; b: Pt }, tol = 25) => { const n = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) <= tol; return (n(a.a, b.a) && n(a.b, b.b)) || (n(a.a, b.b) && n(a.b, b.a)); };

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

/** Architectural dimension in the one office style (DIMSTY): extension lines start 1/16" off the object and run 1/8" past the
 * dimension line, 45° ticks, 3/32" text centered above the line with a background mask. `off` is model mm, signed (left of a->b is +).
 * `anno` is model mm per paper inch. */
export function dimension(a: Pt, b: Pt, off: number, anno: number, text: string, tone: 'ink' | 'fix' = 'ink', obj?: string): { prims: Prim[]; texts: Txt[] } {
  const h = anno * DIMSTY.text, gap = anno * DIMSTY.gap, over = anno * DIMSTY.over;
  const u = unit(sub(b, a)); const nv = { x: -u.y, y: u.x }; const A = add(a, nv, off), B = add(b, nv, off); const sg = Math.sign(off);
  const ext = Math.abs(off) <= gap ? '' : `${line(add(a, nv, sg * gap), add(A, nv, sg * over))}${line(add(b, nv, sg * gap), add(B, nv, sg * over))}`;
  const tk = anno * DIMSTY.tick; const diag = unit(add(u, nv)); const tick = (c: Pt) => line(add(c, diag, -tk), add(c, diag, tk));
  const dl = line(add(A, u, -anno * DIMSTY.gap), add(B, u, anno * DIMSTY.gap));
  // Text reads left-to-right or bottom-to-top (never upside down), centered just above the dimension line.
  const ang = readable(u); const r = (ang * Math.PI) / 180; const up = { x: Math.sin(r), y: -Math.cos(r) }; const lift = h / 2 + anno * DIMSTY.textGap;
  const m = { x: (A.x + B.x) / 2, y: -(A.y + B.y) / 2 }; const tp = { x: m.x + up.x * lift, y: m.y + up.y * lift };
  return { prims: [{ layer: 'A-ANNO-DIMS', lw: PEN['A-ANNO-DIMS'], d: ext + dl + tick(A) + tick(B), tone, obj }], texts: [{ layer: 'A-ANNO-DIMS', x: tp.x, y: tp.y, h, s: text, anchor: 'middle', rot: ang, tone, obj, mid: true, mask: true }] };
}

/** A leader in model units: filled arrowhead at `to`, a straight run to `from`, then a short horizontal landing. */
export function leaderPrims(layer: LayerId, to: Pt, from: Pt, anno: number, obj?: string): Prim[] {
  const u = unit(sub(to, from)); const ah = anno * (3 / 32), w = ah * 0.33; const base = add(to, u, -ah);
  const head = [to, add(base, { x: -u.y, y: u.x }, w), add(base, { x: u.y, y: -u.x }, w)];
  return [{ layer, lw: PEN[layer], d: line(base, from), obj }, { layer, lw: PEN[layer], d: ring(head), fill: 'ink', obj }];
}
const hexRing = (c: Pt, R: number) => ring(Array.from({ length: 6 }, (_, k) => add(c, { x: Math.cos(k * Math.PI / 3), y: Math.sin(k * Math.PI / 3) }, R)));
const circleRing = (c: Pt, R: number, n = 32) => ring(Array.from({ length: n }, (_, k) => add(c, { x: Math.cos(k / n * Math.PI * 2), y: Math.sin(k / n * Math.PI * 2) }, R)));

/** A local frame on a wall: u runs along the wall from `o`, v points into the room. */
interface Frame { at: (u: number, v: number) => Pt }
const frame = (o: Pt, du: Pt, dv: Pt): Frame => ({ at: (u, v) => ({ x: o.x + du.x * u + dv.x * v, y: o.y + du.y * u + dv.y * v }) });
const fRect = (F: Frame, u0: number, v0: number, w: number, d: number) => ring([F.at(u0, v0), F.at(u0 + w, v0), F.at(u0 + w, v0 + d), F.at(u0, v0 + d)]);
const fEllipse = (F: Frame, cu: number, cv: number, ru: number, rv: number, n = 28) => ring(Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return F.at(cu + Math.cos(t) * ru, cv + Math.sin(t) * rv); }));
const fCircle = (F: Frame, cu: number, cv: number, r: number) => fEllipse(F, cu, cv, r, r, 24);

/** Plumbing fixtures and appliances for a room, placed along its longest wall from what the room is used for. */
export function fixtures(p: Project, r: Room, waterHeater: boolean, th = inch(3)): { prims: Prim[]; texts: Txt[] } {
  const prims: Prim[] = []; const texts: Txt[] = []; if (r.use !== 'bath' && r.use !== 'kitchen' && !waterHeater) return { prims, texts };
  const pl = roomAbs(p, applyTape(r)); const b = bbox(pl); const W = b.maxX - b.minX, D = b.maxY - b.minY;
  // Back wall = the longer side, on the side away from the street (max y); u runs left to right along it.
  const along = W >= D ? W : D; const depth = W >= D ? D : W;
  const F = W >= D ? frame({ x: b.minX, y: b.maxY }, { x: 1, y: 0 }, { x: 0, y: -1 }) : frame({ x: b.maxX, y: b.minY }, { x: 0, y: 1 }, { x: -1, y: 0 });
  const P = (layer: LayerId, d: string) => prims.push({ layer, lw: PEN[layer], d, obj: 'room:' + r.id });
  const label = (layer: LayerId, q: Pt, s: string) => texts.push({ layer, x: q.x, y: -q.y, h: th, s, anchor: 'middle', obj: 'room:' + r.id, mid: true, mask: true });
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

export interface DraftOpts { /** Model mm per paper inch (annotation scale), e.g. 96 * 25.4 for 1/8" = 1'-0". */ anno: number; es?: boolean; garageDoorFor?: boolean;
  /** Display rep: 'site' (footprint, walls, openings) or 'plan' (adds fixtures, room/door/window tags). Default from the scale. */ detail?: 'site' | 'plan';
  /** Dimensions the drafter already drew (CAD entities): an automatic one on the same two points is left out. */ userDims?: { a: Pt; b: Pt }[] }
const EXT_WALL = inch(6), INT_WALL = inch(4.5);

/** The garage door edge: the footprint edge whose midpoint is closest to the street lot edge. */
export function garageDoorEdge(p: Project): number {
  const lot = p.site.lot, fp = p.adu.footprint; const a = lot[p.site.streetEdge], b = lot[(p.site.streetEdge + 1) % lot.length];
  let best = 0, bd = Infinity; fp.forEach((v, i) => { const w = fp[(i + 1) % fp.length]; const m = { x: (v.x + w.x) / 2, y: (v.y + w.y) / 2 }; const d = clearanceToEdge([m, m], [a, b], 0); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** Clearance dimension from the ADU to lot line a-b: from the middle of the facing ADU edge when it runs parallel, else the closest pair. */
export function clearancePair(fp: Poly, a: Pt, b: Pt): [Pt, Pt] {
  const [q0, q1] = closestPair(fp, a, b); const d = len(sub(q1, q0)); const u = unit(sub(b, a)); const L = len(sub(b, a));
  for (let i = 0; i < fp.length; i++) { const v = fp[i], w = fp[(i + 1) % fp.length]; const e = sub(w, v); if (len(e) < 1 || Math.abs(e.x * u.y - e.y * u.x) / len(e) > 1e-3) continue;
    const t = (q: Pt) => (q.x - a.x) * u.x + (q.y - a.y) * u.y; const dist = Math.abs((v.x - a.x) * u.y - (v.y - a.y) * u.x); if (Math.abs(dist - d) > 1) continue;
    const lo = Math.max(0, Math.min(t(v), t(w))), hi = Math.min(L, Math.max(t(v), t(w))); if (hi - lo < 1) continue;
    const mt = (lo + hi) / 2; const onLine = add(a, u, mt); const back = sub(q0, q1); const k = len(back) || 1; return [add(onLine, back, 1 / k * d), onLine]; }
  return [q0, q1];
}

/** The whole drawing: site, walls, openings, fixtures, tags, keynotes, dimensions, symbols. */
export function draft(p: Project, o: DraftOpts): Drawing {
  const prims: Prim[] = []; const texts: Txt[] = []; const dims: DimRef[] = []; const keynotes: Keynote[] = [];
  const A = o.anno; const h = A * TEXT_IN.note, hRoom = A * TEXT_IN.room; const es = !!o.es; const detail = o.detail ?? (A <= 96 * 25.4 + 1 ? 'plan' : 'site');
  const T = (t: Txt) => texts.push(t);
  const lot = p.site.lot; const lb = bbox(lot); const fp = p.adu.footprint; const conv = p.adu.mode === 'conversion';
  const streets = new Set([p.site.streetEdge, ...(p.site.streetEdges ?? [])]);
  const user = o.userDims ?? [];
  /** Add a dimension unless the same two points are already dimensioned (by the drafter or by an earlier automatic one). */
  const dim = (a: Pt, b: Pt, off: number, text: string, tone: 'ink' | 'fix' = 'ink', obj?: string) => {
    const ref = { a, b, text }; if (user.some(u => sameDim(u, ref)) || dims.some(x => sameDim(x, ref))) return; dims.push(ref);
    const dd = dimension(a, b, off, A, text, tone, obj); prims.push(...dd.prims); texts.push(...dd.texts); };
  /** Keynote: hexagon with its number at `at`, a leader with a filled arrow to `to`. */
  const keynote = (text: string, to: Pt, at: Pt, obj?: string) => { const n = keynotes.length + 1; keynotes.push({ n, text }); const R = h * 1.05;
    const u = unit(sub(to, at)); prims.push(...leaderPrims('A-ANNO-KEYN', to, add(at, u, R), A, obj)); prims.push({ layer: 'A-ANNO-KEYN', lw: PEN['A-ANNO-KEYN'], d: hexRing(at, R), fill: 'bg', obj });
    prims.push({ layer: 'A-ANNO-KEYN', lw: PEN['A-ANNO-KEYN'], d: hexRing(at, R), obj }); T({ layer: 'A-ANNO-KEYN', x: at.x, y: -at.y, h: h * 0.9, s: String(n), anchor: 'middle', mid: true, bold: true, obj }); };

  // Property lines (phantom), each dimensioned outside the lot on its own tier.
  prims.push({ layer: 'C-PROP', lw: PEN['C-PROP'], d: ring(lot), dash: 'phantom', obj: 'lot' });
  const lotOff = A * (DIMSTY.first + DIMSTY.tier);
  lot.forEach((a, i) => { const b = lot[(i + 1) % lot.length]; const u = unit(sub(b, a)); const nv = { x: -u.y, y: u.x }; const inn = inward(lot, i); const out = nv.x * inn.x + nv.y * inn.y > 0 ? -1 : 1;
    dim(a, b, out * lotOff, fmtArch(len(sub(b, a))), 'ink', 'lot'); });
  // Street label, past the street dimension.
  { const a = lot[p.site.streetEdge], b = lot[(p.site.streetEdge + 1) % lot.length]; const m = add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, inward(lot, p.site.streetEdge), -(lotOff + A * 0.45));
    T({ layer: 'A-ANNO-TEXT', x: m.x, y: -m.y, h: hRoom, s: es ? 'CALLE' : 'STREET', anchor: 'middle', bold: true, mid: true, rot: readable(sub(b, a)) }); }
  // Setbacks: 4 ft inside side and rear lines (dashed).
  const sb = offsetInward(lot, i => (streets.has(i) ? 0 : ft(4)));
  lot.forEach((_, i) => { if (streets.has(i)) return; prims.push({ layer: 'C-PROP-SBCK', lw: PEN['C-PROP-SBCK'], d: line(sb[i], sb[(i + 1) % lot.length]), dash: 'hidden' }); });

  // Existing house (gray, existing convention).
  const hs = p.site.primary; const hb = bbox(hs);
  prims.push({ layer: 'A-BLDG-EXST', lw: PEN['A-BLDG-EXST'], d: ring(hs), fill: 'exst', tone: 'exst', obj: 'house' });
  T({ layer: 'A-ANNO-TEXT', x: (hb.minX + hb.maxX) / 2, y: -(hb.minY + hb.maxY) / 2, h: Math.min(hRoom, (hb.maxX - hb.minX) * 0.86 / (13 * 0.72)), s: es ? '(E) VIVIENDA' : '(E) RESIDENCE', anchor: 'middle', tone: 'exst', bold: true, obj: 'house', mid: true });

  // Exterior walls at true thickness. Conversion: existing (gray fill, medium); new ADU: new (poché, heavy).
  const inner = offsetInward(fp, EXT_WALL); const n = fp.length;
  const door = conv ? garageDoorEdge(p) : -1; const de = door >= 0 ? len(sub(fp[(door + 1) % n], fp[door])) : 0;
  const gw = door >= 0 ? Math.min(ft(16), Math.max(0, de - ft(2))) : 0; const g0 = (de - gw) / 2;
  const wallLayer: LayerId = conv ? 'A-WALL-EXST' : 'A-WALL'; const tone = conv ? 'exst' as const : 'ink' as const;
  for (let i = 0; i < n; i++) {
    const a = fp[i], b = fp[(i + 1) % n], ai = inner[i], bi = inner[(i + 1) % n];
    prims.push({ layer: 'A-WALL-PATT', lw: PEN['A-WALL-PATT'], d: ring([a, b, bi, ai]), fill: conv ? 'exst' : 'poche', stroke: false, obj: 'adu' });
  }
  const faceLines = (pl: Poly) => { let d = ''; for (let i = 0; i < n; i++) { const a = pl[i], b = pl[(i + 1) % n];
    if (i === door && gw > 0) { const u = unit(sub(b, a)); const L = len(sub(b, a)); const k = L / de; d += line(a, add(a, u, g0 * k)) + line(add(a, u, (g0 + gw) * k), b); } else d += line(a, b); } return d; };
  prims.push({ layer: wallLayer, lw: PEN[wallLayer], d: faceLines(fp) + faceLines(inner), tone, obj: 'adu' });
  let doorKey: { to: Pt; out: Pt; text: string } | null = null;
  if (door >= 0 && gw > 0) {
    const a = fp[door], b = fp[(door + 1) % n], ai = inner[door], bi = inner[(door + 1) % n]; const u = unit(sub(b, a)); const ui = unit(sub(bi, ai)); const Li = len(sub(bi, ai));
    const o0 = add(a, u, g0), o1 = add(a, u, g0 + gw); const i0 = add(ai, ui, g0 * Li / de), i1 = add(ai, ui, (g0 + gw) * Li / de); const nv = inward(fp, door);
    const mid = add(o0, u, gw * 0.3);
    if (p.adu.removesGarageDoorWall === 'yes') {
      // New infill wall (heavy, poché) where the garage door was; the removed door is dashed (demolition).
      prims.push({ layer: 'A-WALL-PATT', lw: PEN['A-WALL-PATT'], d: ring([o0, o1, i1, i0]), fill: 'poche', stroke: false, obj: 'adu' });
      prims.push({ layer: 'A-WALL', lw: PEN['A-WALL'], d: ring([o0, o1, i1, i0]), obj: 'adu' });
      const panel = [add(i0, nv, inch(1)), add(i1, nv, inch(1)), add(i1, nv, inch(3)), add(i0, nv, inch(3))];
      prims.push({ layer: 'A-WALL-DEMO', lw: PEN['A-WALL-DEMO'], d: ring(panel), dash: 'demo', obj: 'adu' });
      doorKey = { to: mid, out: nv, text: es ? '(D) PUERTA DE GARAJE; MURO NUEVO DE RELLENO' : '(D) GARAGE DOOR; NEW INFILL WALL' };
    } else {
      // Garage door stays (existing): jambs and the door panel in gray.
      prims.push({ layer: 'A-WALL-EXST', lw: PEN['A-WALL-EXST'], d: line(o0, i0) + line(o1, i1), tone: 'exst', obj: 'adu' });
      prims.push({ layer: 'A-DOOR', lw: PEN['A-DOOR'], d: ring([add(o0, nv, inch(2)), add(o1, nv, inch(2)), add(o1, nv, inch(4)), add(o0, nv, inch(4))]), tone: 'exst', obj: 'adu' });
      doorKey = { to: mid, out: nv, text: es ? '(E) PUERTA DE GARAJE A QUEDAR' : '(E) GARAGE DOOR TO REMAIN' };
    }
  }

  // Interior partitions (new), openings, fixtures and tags.
  const seen = new Set<string>(); const key = (a: Pt, b: Pt) => { const r = (v: number) => Math.round(v / inch(3)); const k1 = `${r(a.x)},${r(a.y)}`, k2 = `${r(b.x)},${r(b.y)}`; return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1; };
  const nearOutline = (q: Pt) => onOutline(q, fp, inch(10));
  const wh = p.adu.rooms.find(r => r.use === 'kitchen') ?? p.adu.rooms.find(r => r.use === 'bath');
  for (const r of p.adu.rooms) {
    const pl = roomAbs(p, applyTape(r));
    pl.forEach((a, i) => { const b = pl[(i + 1) % pl.length]; const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; if (nearOutline(m)) return; const k = key(a, b); if (seen.has(k)) return; seen.add(k);
      const out = inward(pl, i); const a2 = add(a, out, -INT_WALL), b2 = add(b, out, -INT_WALL);
      prims.push({ layer: 'A-WALL-PATT', lw: PEN['A-WALL-PATT'], d: ring([a, b, b2, a2]), fill: 'poche', stroke: false, obj: 'room:' + r.id });
      prims.push({ layer: 'A-WALL', lw: PEN['A-WALL'], d: line(a, b) + line(a2, b2), obj: 'room:' + r.id }); });
  }
  let doorNo = 0, winNo = 0; const tagR = h * 1.05;
  p.adu.rooms.forEach((r, ri) => {
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
      // Tag on the far side of the wall from the room, clear of the swing: door = circle with a number, window = hexagon with a letter.
      const tc = add(m, nin, -(span + tagR * 1.6));
      if (op.kind === 'window') {
        const mid0 = add(s0, nin, -span / 2), mid1 = add(s1, nin, -span / 2);
        prims.push({ layer: 'A-GLAZ', lw: PEN['A-GLAZ'], d: line(s0, s1) + line(o0, o1) + line(add(mid0, nin, inch(0.75)), add(mid1, nin, inch(0.75))) + line(add(mid0, nin, -inch(0.75)), add(mid1, nin, -inch(0.75))) + line(s0, o0) + line(s1, o1), obj });
        const id = String.fromCharCode(65 + (winNo++ % 26));
        if (detail === 'plan') { prims.push({ layer: 'A-GLAZ-IDEN', lw: 0.09, d: hexRing(tc, tagR), fill: 'bg', stroke: false, obj }, { layer: 'A-GLAZ-IDEN', lw: PEN['A-GLAZ-IDEN'], d: hexRing(tc, tagR), obj }); T({ layer: 'A-GLAZ-IDEN', x: tc.x, y: -tc.y, h: h * 0.85, s: id, anchor: 'middle', mid: true, obj }); }
      } else {
        const W = op.widthMm; const tip = add(s0, nin, W); const leaf = [s0, add(s0, u, inch(1.5)), add(tip, u, inch(1.5)), tip];
        const arc: Pt[] = []; for (let k = 0; k <= 18; k++) { const t = (k / 18) * Math.PI / 2; arc.push(add(add(s0, nin, Math.cos(t) * W), u, Math.sin(t) * W)); }
        prims.push({ layer: 'A-DOOR', lw: PEN['A-DOOR'], d: ring(leaf) + line(s0, o0) + line(s1, o1), obj });
        prims.push({ layer: 'A-DOOR', lw: 0.13, d: ring(arc, false), obj });
        const id = String(++doorNo);
        if (detail === 'plan') { prims.push({ layer: 'A-DOOR-IDEN', lw: 0.09, d: circleRing(tc, tagR), fill: 'bg', stroke: false, obj }, { layer: 'A-DOOR-IDEN', lw: PEN['A-DOOR-IDEN'], d: circleRing(tc, tagR), obj }); T({ layer: 'A-DOOR-IDEN', x: tc.x, y: -tc.y, h: h * 0.85, s: id, anchor: 'middle', mid: true, obj }); }
      }
    }
    if (detail === 'plan') { const fx = fixtures(p, r, r === wh, h); prims.push(...fx.prims); texts.push(...fx.texts); }
    // Room tag: NAME (1/8"), room number in a box, area (3/32").
    // Tag in the middle, or toward the front when fixtures line the back wall, so it never sits on a fixture label.
    const b = bbox(pl); const Wd = b.maxX - b.minX, Dp = b.maxY - b.minY; const fx0 = detail === 'plan' && (r.use === 'bath' || r.use === 'kitchen' || r === wh);
    const c = !fx0 ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : Wd >= Dp ? { x: (b.minX + b.maxX) / 2, y: b.minY + Math.max(Math.min(Dp * 0.5, hRoom * 2.2), Math.min(Dp * 0.36, Dp - inch(30) - hRoom * 2.6)) } : { x: b.minX + Math.max(Math.min(Wd * 0.5, h * 3), Math.min(Wd * 0.36, Wd - inch(30) - h * 1.6)), y: (b.minY + b.maxY) / 2 };
    const nm = (r.name.trim() || (es ? 'CUARTO' : 'ROOM')).toUpperCase(); const no = String(101 + ri);
    if (detail === 'plan') {
      T({ layer: 'A-AREA-IDEN', x: c.x, y: -c.y - hRoom * 1.05, h: hRoom, s: nm, anchor: 'middle', bold: true, obj: 'room:' + r.id, mid: true, mask: true });
      const bw = h * 2.6, bh = h * 1.45; prims.push({ layer: 'A-AREA-IDEN', lw: 0.09, d: ring([{ x: c.x - bw / 2, y: c.y + bh / 2 }, { x: c.x + bw / 2, y: c.y + bh / 2 }, { x: c.x + bw / 2, y: c.y - bh / 2 }, { x: c.x - bw / 2, y: c.y - bh / 2 }]), fill: 'bg', stroke: false, obj: 'room:' + r.id });
      prims.push({ layer: 'A-AREA-IDEN', lw: PEN['A-AREA-IDEN'], d: ring([{ x: c.x - bw / 2, y: c.y + bh / 2 }, { x: c.x + bw / 2, y: c.y + bh / 2 }, { x: c.x + bw / 2, y: c.y - bh / 2 }, { x: c.x - bw / 2, y: c.y - bh / 2 }]), obj: 'room:' + r.id });
      T({ layer: 'A-AREA-IDEN', x: c.x, y: -c.y, h: h * 0.9, s: no, anchor: 'middle', obj: 'room:' + r.id, mid: true });
      T({ layer: 'A-AREA-IDEN', x: c.x, y: -c.y + bh / 2 + h * 0.85, h, s: `${Math.round(toSqFt(roomArea(r)))} ${es ? 'P²' : 'SF'}`, anchor: 'middle', obj: 'room:' + r.id, mid: true, mask: true });
    } else T({ layer: 'A-AREA-IDEN', x: c.x, y: -c.y, h: Math.min(h, (b.maxX - b.minX) * 0.86 / (nm.length * 0.72)), s: nm, anchor: 'middle', obj: 'room:' + r.id, mid: true, mask: true });
  });

  // ADU label when no rooms are drawn.
  const fb = bbox(fp);
  if (!p.adu.rooms.length) {
    const lab = conv ? (es ? '(E) GARAJE A ADU' : '(E) GARAGE TO ADU') : '(N) ADU'; const fitH = (str: string, hh: number, room: number) => Math.min(hh, room / (str.length * 0.72)); const hl = fitH(lab, hRoom, (fb.maxX - fb.minX) * 0.86);
    T({ layer: 'A-ANNO-TEXT', x: (fb.minX + fb.maxX) / 2, y: -(fb.minY + fb.maxY) / 2 - hl * 0.7, h: hl, s: conv ? (es ? '(E) GARAJE A ADU' : '(E) GARAGE TO ADU') : (es ? '(N) ADU' : '(N) ADU'), anchor: 'middle', bold: true, obj: 'adu', mid: true, mask: true });
    T({ layer: 'A-ANNO-TEXT', x: (fb.minX + fb.maxX) / 2, y: -(fb.minY + fb.maxY) / 2 + Math.min(h, hl) * 0.9, h: Math.min(h, hl), s: `${Math.round(toSqFt(area(fp)))} ${es ? 'P² BRUTOS' : 'SF GROSS'}`, anchor: 'middle', obj: 'adu', mid: true, mask: true });
  }

  // Dimensions. ADU overall size on the side with more room (outside the object, first tier), so it never runs over a
  // nearby property line; then ADU to every side and rear line (in the fix color when under 4'-0").
  const t1 = A * DIMSTY.first;
  if (fp.length === 4) {
    const up = lb.maxY - fb.maxY, down = fb.minY - lb.minY, left = fb.minX - lb.minX, right = lb.maxX - fb.maxX;
    if (up >= down) dim({ x: fb.minX, y: fb.maxY }, { x: fb.maxX, y: fb.maxY }, t1, fmtArch(fb.maxX - fb.minX), 'ink', 'adu');
    else dim({ x: fb.minX, y: fb.minY }, { x: fb.maxX, y: fb.minY }, -t1, fmtArch(fb.maxX - fb.minX), 'ink', 'adu');
    if (left >= right) dim({ x: fb.minX, y: fb.minY }, { x: fb.minX, y: fb.maxY }, t1, fmtArch(fb.maxY - fb.minY), 'ink', 'adu');
    else dim({ x: fb.maxX, y: fb.minY }, { x: fb.maxX, y: fb.maxY }, -t1, fmtArch(fb.maxY - fb.minY), 'ink', 'adu');
  }
  lot.forEach((a, i) => { if (streets.has(i)) return; const b = lot[(i + 1) % lot.length]; const [q0, q1] = clearancePair(fp, a, b); const d = len(sub(q1, q0)); if (d < 1 || d > ft(60)) return;
    dim(q0, q1, 0, fmtArch(d), d < ft(4) - 0.5 ? 'fix' : 'ink', 'adu'); });

  // Keynotes (numbered hexagons with leaders; legend below the north arrow and on each sheet).
  { const side = lot.findIndex((_, i) => !streets.has(i)); if (side >= 0) { const a = lot[side], b = lot[(side + 1) % lot.length], s0 = sb[side], s1 = sb[(side + 1) % lot.length]; const nv = inward(lot, side); const u = unit(sub(b, a));
      const pt = add(a, u, len(sub(b, a)) * 0.22); keynote(es ? 'LINDERO DE PROPIEDAD' : 'PROPERTY LINE', pt, add(add(pt, nv, ft(4) + A * 0.55), u, -A * 0.35), 'lot');
      const st = add(s0, unit(sub(s1, s0)), len(sub(s1, s0)) * 0.32); keynote(es ? `RETIRO DE 4'-0"` : `4'-0" SETBACK LINE`, st, add(add(st, nv, A * 0.55), u, -A * 0.35)); } }
  { const to = { x: hb.minX + (hb.maxX - hb.minX) * 0.2, y: hb.maxY }; keynote(es ? '(E) VIVIENDA; FUERA DEL ALCANCE' : '(E) RESIDENCE; NOT IN SCOPE', to, add(to, { x: -0.35, y: 0.94 }, A * 0.6), 'house'); }
  if (doorKey) keynote(doorKey.text, doorKey.to, add(add(doorKey.to, doorKey.out, -A * 0.75), unit(sub(fp[(door + 1) % n], fp[door])), -A * 0.3), 'adu');

  // North arrow: a standard filled half-arrow, plan north up until true north is entered. "Not set" is a Checks item, never on the sheet.
  const R = A * 0.24; const na = { x: lb.maxX + lotOff + R + A * 0.6, y: lb.maxY - R - A * 0.2 };
  { const t = ((p.site.northDeg ?? 0) * Math.PI) / 180; const dir = { x: Math.sin(t), y: Math.cos(t) }; const perp = { x: dir.y, y: -dir.x };
    const tip = add(na, dir, R * 1.15), tail = add(na, dir, -R * 0.85);
    prims.push({ layer: 'A-ANNO-SYMB', lw: PEN['A-ANNO-SYMB'], d: circleRing(na, R, 48) });
    prims.push({ layer: 'A-ANNO-SYMB', lw: PEN['A-ANNO-SYMB'], d: ring([tip, add(tail, perp, R * 0.42), add(na, dir, -R * 0.45), add(tail, perp, -R * 0.42)]) });
    prims.push({ layer: 'A-ANNO-SYMB', lw: 0.09, d: ring([tip, add(na, dir, -R * 0.45), add(tail, perp, -R * 0.42)]), fill: 'ink' });
    const lt = add(na, dir, R * 1.15 + hRoom * 0.95); T({ layer: 'A-ANNO-SYMB', x: lt.x, y: -lt.y, h: hRoom, s: 'N', anchor: 'middle', bold: true, mid: true }); }
  // Keynote legend under the north arrow.
  const lgX = na.x - R; let lgY = na.y - R - A * 0.55; let lgW = 0;
  if (keynotes.length) { T({ layer: 'A-ANNO-KEYN', x: lgX, y: -lgY, h, s: es ? 'NOTAS CLAVE' : 'KEYNOTES', bold: true, mid: true }); lgY -= h * 2;
    for (const k of keynotes) { const c = { x: lgX + h * 0.9, y: lgY }; prims.push({ layer: 'A-ANNO-KEYN', lw: PEN['A-ANNO-KEYN'], d: hexRing(c, h * 0.85) });
      T({ layer: 'A-ANNO-KEYN', x: c.x, y: -c.y, h: h * 0.8, s: String(k.n), anchor: 'middle', mid: true, bold: true }); T({ layer: 'A-ANNO-KEYN', x: lgX + h * 2.3, y: -c.y, h, s: k.text, mid: true }); lgW = Math.max(lgW, h * 2.3 + k.text.length * h * 0.62); lgY -= h * 2.1; } }

  // Graphic scale with its title.
  const sbY = lb.minY - lotOff - A * 0.9;
  {
    const steps = [ft(1), ft(2), ft(5), ft(10), ft(20), ft(50), ft(100)]; const unitL = steps.find(s => s * 4 >= A * 1.5) ?? ft(100); const sbx = lb.minX, sby = sbY; const bh = A * 0.06;
    let d = ''; const fills: string[] = [];
    for (let k = 0; k < 4; k++) { const x0 = sbx + k * unitL; const box = ring([{ x: x0, y: sby }, { x: x0 + unitL, y: sby }, { x: x0 + unitL, y: sby + bh }, { x: x0, y: sby + bh }]); d += box; if (k % 2 === 0) fills.push(box);
      T({ layer: 'A-ANNO-SYMB', x: x0, y: -(sby) + h * 1.2, h, s: fmtArch(k * unitL).replace(/-0"$/, ''), anchor: 'middle', mid: true }); }
    T({ layer: 'A-ANNO-SYMB', x: sbx + 4 * unitL, y: -(sby) + h * 1.2, h, s: fmtArch(4 * unitL).replace(/-0"$/, ''), anchor: 'middle', mid: true });
    const sc = SCALES.find(x => Math.abs(x.k * 25.4 - A) < 1); T({ layer: 'A-ANNO-SYMB', x: sbx, y: -(sby) + h * 3, h, s: `${es ? 'ESCALA GRÁFICA' : 'GRAPHIC SCALE'}${sc ? `: ${sc.label}` : ''}`, mid: true });
    prims.push({ layer: 'A-ANNO-SYMB', lw: 0.18, d }); fills.forEach(f => prims.push({ layer: 'A-ANNO-SYMB', lw: 0.09, d: f, fill: 'ink', stroke: false }));
  }

  const pad = ft(4); const fpad = ft(9);
  return { prims, texts, dims, keynotes,
    extents: { minX: lb.minX - lotOff - A * 0.6 - pad, minY: -(lb.maxY + lotOff + A * 0.6 + pad), maxX: Math.max(na.x + R, lgX + lgW) + pad, maxY: -(sbY - h * 4) + pad },
    focus: { minX: fb.minX - fpad, minY: -(fb.maxY + fpad), maxX: fb.maxX + fpad, maxY: -(fb.minY - fpad) } };
}

/** Standard architectural scales: label and model inches per paper inch. */
export const SCALES = [
  { label: '1" = 1\'-0"', k: 12 }, { label: '3/4" = 1\'-0"', k: 16 }, { label: '1/2" = 1\'-0"', k: 24 }, { label: '3/8" = 1\'-0"', k: 32 },
  { label: '1/4" = 1\'-0"', k: 48 }, { label: '3/16" = 1\'-0"', k: 64 }, { label: '1/8" = 1\'-0"', k: 96 }, { label: '3/32" = 1\'-0"', k: 128 },
  { label: '1/16" = 1\'-0"', k: 192 }, { label: '1" = 20\'', k: 240 }, { label: '1/32" = 1\'-0"', k: 384 }, { label: '1" = 40\'', k: 480 }, { label: '1" = 60\'', k: 720 },
] as const;
/** Annotation scale for the model view: the largest scale at which 3/32" text is still at least `minPx` tall on screen. */
export function annoScaleFor(pxPerMm: number, minPx = 11) { return SCALES.find(s => (3 / 32) * s.k * 25.4 * pxPerMm >= minPx) ?? SCALES[SCALES.length - 1]; }
/** Largest standard scale at which a box of w x h mm fits in paper inches pw x ph. */
export function fitScale(wMm: number, hMm: number, pw: number, ph: number) { return SCALES.filter(s => s.k <= 384).find(s => wMm / 25.4 / s.k <= pw && hMm / 25.4 / s.k <= ph) ?? SCALES[SCALES.length - 1]; }
