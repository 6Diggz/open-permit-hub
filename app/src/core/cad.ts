// General drafting entities (lines, polylines, circles, arcs, text, leaders, revision clouds, dimensions) that the drafter
// adds on top of the parametric model. Model units are mm with y up, like the rest of the project. Pure and unit-tested.
import type { Pt } from './geom';
import { isNum, MAX_LEN_MM } from './units';

export type EntType = 'line' | 'pline' | 'circle' | 'arc' | 'text' | 'leader' | 'cloud' | 'dim';
export interface Ent {
  id: string; t: EntType; layer: string; pts: Pt[];
  /** pline / cloud */ closed?: boolean;
  /** circle / arc radius; arc angles in radians, counter-clockwise from a0 to a1 */ r?: number; a0?: number; a1?: number;
  /** text / leader / dim override */ text?: string; /** text height (mm) */ h?: number; /** text rotation (radians) */ rot?: number;
  /** dim: offset of the dimension line from a->b (mm, + is left of a->b) */ off?: number;
}
export interface CadLayer { name: string; color: number; on: boolean; locked: boolean }
export interface Cad { ents: Ent[]; layers: CadLayer[]; current: string }
export const MAX_ENTS = 5000, MAX_ENT_PTS = 500, MAX_LAYERS = 100;
export const DEFAULT_CAD = (): Cad => ({ ents: [], layers: [{ name: 'A-ANNO-NOTE', color: 7, on: true, locked: false }, { name: 'A-DETL', color: 7, on: true, locked: false }], current: 'A-DETL' });
/** Layers for entity types when the drafter has not picked one (NCS-style names). */
export const LAYER_FOR: Partial<Record<EntType, string>> = { text: 'A-ANNO-NOTE', leader: 'A-ANNO-NOTE', dim: 'A-ANNO-DIMS', cloud: 'G-ANNO-REDL' };

const okPt = (q: any) => q && isNum(q.x) && isNum(q.y) && Math.abs(q.x) <= MAX_LEN_MM * 4 && Math.abs(q.y) <= MAX_LEN_MM * 4;
const LAYER_RE = /^[A-Za-z0-9_\-$ ]{1,40}$/;
/** Repair drafting data from a file or storage: known types, finite points, caps on counts and text. */
export function sanitizeCad(raw: any): Cad | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const layers: CadLayer[] = (Array.isArray(raw.layers) ? raw.layers : []).filter((l: any) => l && typeof l.name === 'string' && LAYER_RE.test(l.name)).slice(0, MAX_LAYERS)
    .map((l: any) => ({ name: l.name, color: Number.isInteger(l.color) && l.color >= 1 && l.color <= 255 ? l.color : 7, on: l.on !== false, locked: !!l.locked }));
  const T: EntType[] = ['line', 'pline', 'circle', 'arc', 'text', 'leader', 'cloud', 'dim'];
  const ents: Ent[] = (Array.isArray(raw.ents) ? raw.ents : []).slice(0, MAX_ENTS).filter((e: any) => e && T.includes(e.t) && Array.isArray(e.pts) && e.pts.length >= 1 && e.pts.length <= MAX_ENT_PTS && e.pts.every(okPt))
    .map((e: any): Ent => { const o: Ent = { id: typeof e.id === 'string' ? e.id.slice(0, 60) : Math.random().toString(36).slice(2), t: e.t, layer: typeof e.layer === 'string' && LAYER_RE.test(e.layer) ? e.layer : '0', pts: e.pts.map((q: any) => ({ x: q.x, y: q.y })) };
      if (e.closed) o.closed = true; if (isNum(e.r) && e.r > 0 && e.r <= MAX_LEN_MM) o.r = e.r; if (isNum(e.a0)) o.a0 = e.a0; if (isNum(e.a1)) o.a1 = e.a1;
      if (typeof e.text === 'string') o.text = e.text.slice(0, 2000); if (isNum(e.h) && e.h > 0 && e.h < 10000) o.h = e.h; if (isNum(e.rot)) o.rot = e.rot; if (isNum(e.off) && Math.abs(e.off) <= MAX_LEN_MM) o.off = e.off; return o; })
    .filter((e: Ent) => (e.t === 'circle' || e.t === 'arc' ? !!e.r : true) && (e.t === 'line' || e.t === 'dim' ? e.pts.length === 2 : true));
  const current = typeof raw.current === 'string' && LAYER_RE.test(raw.current) ? raw.current : 'A-DETL';
  return { ents, layers: layers.length ? layers : DEFAULT_CAD().layers, current };
}

// ---------- geometry ----------
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const arcPt = (c: Pt, r: number, a: number): Pt => ({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
const norm = (a: number) => { const t = Math.PI * 2; return ((a % t) + t) % t; };
/** Is angle a on the ccw sweep from a0 to a1? */
export const onSweep = (a: number, a0: number, a1: number) => { const s = norm(a1 - a0), d = norm(a - a0); return d <= s + 1e-9; };
/** Arc through three points (start, any point on it, end). Null when the points are in a line. */
export function arc3(p1: Pt, p2: Pt, p3: Pt): { c: Pt; r: number; a0: number; a1: number } | null {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)); if (Math.abs(d) < 1e-9) return null;
  const s1 = p1.x * p1.x + p1.y * p1.y, s2 = p2.x * p2.x + p2.y * p2.y, s3 = p3.x * p3.x + p3.y * p3.y;
  const c = { x: (s1 * (p2.y - p3.y) + s2 * (p3.y - p1.y) + s3 * (p1.y - p2.y)) / d, y: (s1 * (p3.x - p2.x) + s2 * (p1.x - p3.x) + s3 * (p2.x - p1.x)) / d };
  const r = dist(c, p1); let a0 = Math.atan2(p1.y - c.y, p1.x - c.x), a1 = Math.atan2(p3.y - c.y, p3.x - c.x); const am = Math.atan2(p2.y - c.y, p2.x - c.x);
  if (!onSweep(am, a0, a1)) [a0, a1] = [a1, a0];
  return { c, r, a0, a1 };
}
/** Segments that make up an entity (arcs and circles as short chords), for snaps, hit tests and selection. */
export function entSegs(e: Ent): [Pt, Pt][] {
  if (e.t === 'line' || e.t === 'dim') return [[e.pts[0], e.pts[1]]];
  if (e.t === 'pline' || e.t === 'cloud' || e.t === 'leader') { const s: [Pt, Pt][] = []; for (let i = 0; i + 1 < e.pts.length; i++) s.push([e.pts[i], e.pts[i + 1]]); if (e.closed && e.pts.length > 2) s.push([e.pts[e.pts.length - 1], e.pts[0]]); return s; }
  if (e.t === 'circle' || e.t === 'arc') { const c = e.pts[0], r = e.r ?? 0; const a0 = e.t === 'arc' ? e.a0 ?? 0 : 0; const sw = e.t === 'arc' ? norm((e.a1 ?? 0) - a0) || Math.PI * 2 : Math.PI * 2; const n = Math.max(8, Math.ceil(sw / (Math.PI / 24)));
    const pts = Array.from({ length: n + 1 }, (_, i) => arcPt(c, r, a0 + (sw * i) / n)); return pts.slice(1).map((q, i) => [pts[i], q] as [Pt, Pt]); }
  return [];
}
/** Key points: endpoints, midpoints (lines and polyline segments), centers and quadrant-free arc ends. */
export function entSnaps(e: Ent): { end: Pt[]; mid: Pt[]; cen: Pt[] } {
  if (e.t === 'circle') return { end: [], mid: [], cen: [e.pts[0]] };
  if (e.t === 'arc') { const c = e.pts[0], r = e.r ?? 0; const m = (e.a0 ?? 0) + norm((e.a1 ?? 0) - (e.a0 ?? 0)) / 2; return { end: [arcPt(c, r, e.a0 ?? 0), arcPt(c, r, e.a1 ?? 0)], mid: [arcPt(c, r, m)], cen: [c] }; }
  if (e.t === 'text') return { end: [e.pts[0]], mid: [], cen: [] };
  const segs = entSegs(e); return { end: e.pts, mid: segs.map(([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })), cen: [] };
}
/** Intersection of segments ab and cd (or of their infinite lines when `inf`). Returns the point and params. */
export function segX(a: Pt, b: Pt, c: Pt, d: Pt, inf = false): { p: Pt; t: number; u: number } | null {
  const r = sub(b, a), s = sub(d, c); const den = r.x * s.y - r.y * s.x; if (Math.abs(den) < 1e-12) return null;
  const w = sub(c, a); const t = (w.x * s.y - w.y * s.x) / den, u = (w.x * r.y - w.y * r.x) / den;
  if (!inf && (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9)) return null;
  return { p: { x: a.x + r.x * t, y: a.y + r.y * t }, t, u };
}
/** Points where an infinite line a->b meets a circle; params t along a->b. */
export function lineCircle(a: Pt, b: Pt, c: Pt, r: number): { p: Pt; t: number }[] {
  const d = sub(b, a), f = sub(a, c); const A = d.x * d.x + d.y * d.y, B = 2 * (f.x * d.x + f.y * d.y), C = f.x * f.x + f.y * f.y - r * r; const D = B * B - 4 * A * C;
  if (A < 1e-12 || D < 0) return []; const s = Math.sqrt(D); return [(-B - s) / (2 * A), (-B + s) / (2 * A)].map(t => ({ t, p: { x: a.x + d.x * t, y: a.y + d.y * t } }));
}
/** Params (along a->b, infinite) where the line a->b crosses entity e. */
export function crossParams(a: Pt, b: Pt, e: Ent): number[] {
  if (e.t === 'circle' || e.t === 'arc') return lineCircle(a, b, e.pts[0], e.r ?? 0).filter(h => e.t === 'circle' || onSweep(Math.atan2(h.p.y - e.pts[0].y, h.p.x - e.pts[0].x), e.a0 ?? 0, e.a1 ?? 0)).map(h => h.t);
  if (e.t === 'text' || e.t === 'dim') return [];
  return entSegs(e).map(([c, d]) => { const x = segX(a, b, c, d, true); return x && x.u >= -1e-9 && x.u <= 1 + 1e-9 ? x.t : null; }).filter((t): t is number => t != null);
}
/** Distance from q to the entity's drawn geometry. */
export function entDist(e: Ent, q: Pt): number {
  if (e.t === 'text') { const h = e.h ?? 150; const L = (e.text?.length ?? 1) * h * 0.6; const lines = (e.text ?? '').split('\n').length; const p0 = e.pts[0];
    return q.x >= p0.x - h * 0.3 && q.x <= p0.x + L && q.y <= p0.y + h * 1.2 && q.y >= p0.y - h * 1.4 * (lines - 1) - h * 0.3 ? 0 : Math.min(dist(q, p0), Infinity); }
  let best = Infinity; for (const [a, b] of entSegs(e)) { const d = sub(b, a); const L = d.x * d.x + d.y * d.y; let t = L ? ((q.x - a.x) * d.x + (q.y - a.y) * d.y) / L : 0; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(q.x - a.x - d.x * t, q.y - a.y - d.y * t)); }
  return best;
}
export function entBox(e: Ent): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts = e.t === 'circle' ? [{ x: e.pts[0].x - (e.r ?? 0), y: e.pts[0].y - (e.r ?? 0) }, { x: e.pts[0].x + (e.r ?? 0), y: e.pts[0].y + (e.r ?? 0) }] : e.t === 'arc' ? entSegs(e).flat() : e.t === 'text' ? [e.pts[0], { x: e.pts[0].x + (e.text?.length ?? 1) * (e.h ?? 150) * 0.6, y: e.pts[0].y + (e.h ?? 150) }] : e.pts;
  return { minX: Math.min(...pts.map(q => q.x)), minY: Math.min(...pts.map(q => q.y)), maxX: Math.max(...pts.map(q => q.x)), maxY: Math.max(...pts.map(q => q.y)) };
}
/** Window selection (fully inside) or crossing selection (inside or touching the box). */
export function inWindow(e: Ent, b: { minX: number; minY: number; maxX: number; maxY: number }, crossing: boolean): boolean {
  const eb = entBox(e); const inside = eb.minX >= b.minX && eb.maxX <= b.maxX && eb.minY >= b.minY && eb.maxY <= b.maxY; if (inside || !crossing) return inside;
  if (eb.maxX < b.minX || eb.minX > b.maxX || eb.maxY < b.minY || eb.minY > b.maxY) return false;
  const c = [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }];
  const edges: [Pt, Pt][] = c.map((q, i) => [q, c[(i + 1) % 4]]);
  return entSegs(e).some(([p, q]) => (p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY) || edges.some(([u, v]) => segX(p, q, u, v)) ) || (e.t === 'text');
}

/** An affine map applied to an entity. `rot` is the rotation it adds (radians); `flip` mirrors (reverses arc direction). `k` scales radii and text. */
export function mapEnt(e: Ent, f: (q: Pt) => Pt, o: { rot?: number; flip?: boolean; k?: number } = {}): Ent {
  const k = o.k ?? 1; const n: Ent = { ...e, pts: e.pts.map(f) };
  if (e.r) n.r = e.r * k; if (e.h) n.h = e.h * k;
  if (e.t === 'arc') { const c = e.pts[0]; const s = f(arcPt(c, e.r ?? 0, e.a0 ?? 0)), t = f(arcPt(c, e.r ?? 0, e.a1 ?? 0)); const nc = n.pts[0]; let a0 = Math.atan2(s.y - nc.y, s.x - nc.x), a1 = Math.atan2(t.y - nc.y, t.x - nc.x); if (o.flip) [a0, a1] = [a1, a0]; n.a0 = a0; n.a1 = a1; }
  if (e.t === 'text') { const r = (e.rot ?? 0) + (o.rot ?? 0); n.rot = o.flip ? -(e.rot ?? 0) : r; }
  if (e.t === 'dim') { if (e.off != null) n.off = (o.flip ? -e.off : e.off) * k;
    if (e.rot != null) { const a = e.pts[0]; const fa = f(a), fb = f({ x: a.x + Math.cos(e.rot), y: a.y + Math.sin(e.rot) }); n.rot = Math.atan2(fb.y - fa.y, fb.x - fa.x); if (o.flip) n.off = -(n.off ?? 0); } }
  return n;
}
export const moveF = (dx: number, dy: number) => (q: Pt): Pt => ({ x: q.x + dx, y: q.y + dy });
export const rotF = (c: Pt, a: number) => { const co = Math.cos(a), si = Math.sin(a); return (q: Pt): Pt => ({ x: c.x + (q.x - c.x) * co - (q.y - c.y) * si, y: c.y + (q.x - c.x) * si + (q.y - c.y) * co }); };
export const scaleF = (c: Pt, k: number) => (q: Pt): Pt => ({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k });
/** Mirror across the line through a and b. */
export const mirrorF = (a: Pt, b: Pt) => { const d = sub(b, a); const L = d.x * d.x + d.y * d.y || 1; return (q: Pt): Pt => { const t = ((q.x - a.x) * d.x + (q.y - a.y) * d.y) / L; const p = { x: a.x + d.x * t, y: a.y + d.y * t }; return { x: 2 * p.x - q.x, y: 2 * p.y - q.y }; }; };

/** Offset a line, polyline, circle or arc by distance d toward the side of point `side`. Null for other types. */
export function offsetEnt(e: Ent, d: number, side: Pt, id: string): Ent | null {
  if (e.t === 'circle' || e.t === 'arc') { const out = dist(side, e.pts[0]) > (e.r ?? 0); const r = (e.r ?? 0) + (out ? d : -d); return r > 0 ? { ...e, id, r } : null; }
  if (e.t !== 'line' && e.t !== 'pline') return null;
  const pts = e.pts; if (pts.length < 2) return null;
  // Side: sign of the cross product against the nearest segment.
  let bi = 0, bd = Infinity; entSegs(e).forEach(([a, b], i) => { const dd = entDist({ ...e, t: 'line', pts: [a, b] }, side); if (dd < bd) { bd = dd; bi = i; } });
  const [sa, sb] = entSegs(e)[bi]; const sgn = Math.sign((sb.x - sa.x) * (side.y - sa.y) - (sb.y - sa.y) * (side.x - sa.x)) || 1;
  const n = pts.length; const closed = !!e.closed && e.t === 'pline';
  const lines = entSegs(e).map(([a, b]) => { const L = dist(a, b) || 1; const nx = -(b.y - a.y) / L * d * sgn, ny = (b.x - a.x) / L * d * sgn; return [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }] as [Pt, Pt]; });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? lines[i - 1] : closed ? lines[lines.length - 1] : null; const cur = i < lines.length ? lines[i] : null;
    if (prev && cur) { const x = segX(prev[0], prev[1], cur[0], cur[1], true); out.push(x ? x.p : cur[0]); } else if (cur) out.push(cur[0]); else if (prev) out.push(prev[1]);
  }
  return { ...e, id, pts: out };
}
/** Trim the part of line e around point q that lies between its nearest crossings with `others`. Returns replacement lines (0, 1 or 2). */
export function trimLine(e: Ent, q: Pt, others: Ent[], newId: () => string): Ent[] | null {
  if (e.t !== 'line') return null; const [a, b] = e.pts; const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; if (!L2) return null;
  const tq = ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / L2;
  const ts = others.filter(o => o.id !== e.id).flatMap(o => crossParams(a, b, o)).filter(t => t > 1e-6 && t < 1 - 1e-6).sort((x, y) => x - y);
  const lo = [...ts].reverse().find(t => t < tq), hi = ts.find(t => t > tq);
  if (lo == null && hi == null) return [];
  const at = (t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const out: Ent[] = []; if (lo != null) out.push({ ...e, pts: [a, at(lo)] }); if (hi != null) out.push({ ...e, id: lo != null ? newId() : e.id, pts: [at(hi), b] });
  return out;
}
/** Extend the end of line e nearest q to the closest crossing with `others` beyond it. Null when nothing is in the way. */
export function extendLine(e: Ent, q: Pt, others: Ent[]): Ent | null {
  if (e.t !== 'line') return null; const endB = dist(q, e.pts[1]) <= dist(q, e.pts[0]); const [a, b] = endB ? e.pts : [e.pts[1], e.pts[0]];
  const ts = others.filter(o => o.id !== e.id).flatMap(o => crossParams(a, b, o)).filter(t => t > 1 + 1e-6).sort((x, y) => x - y);
  if (!ts.length) return null; const p = { x: a.x + (b.x - a.x) * ts[0], y: a.y + (b.y - a.y) * ts[0] };
  return { ...e, pts: endB ? [a, p] : [p, a] };
}
/** Revision cloud outline: arcs along each edge, about `arc` long, bulging out. Returns an SVG-ready point list in model units. */
export function cloudPts(pts: Pt[], arc: number): Pt[] {
  const out: Pt[] = []; const n = pts.length; let area = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % n]; area += p.x * q.y - q.x * p.y; }); const ccw = area > 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; const L = dist(a, b); const k = Math.max(1, Math.round(L / arc));
    for (let j = 0; j < k; j++) { const s = { x: a.x + (b.x - a.x) * j / k, y: a.y + (b.y - a.y) * j / k }, e = { x: a.x + (b.x - a.x) * (j + 1) / k, y: a.y + (b.y - a.y) * (j + 1) / k };
      const m = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }; const r = dist(s, e) / 2; const nx = (e.y - s.y) / (2 * r || 1), ny = -(e.x - s.x) / (2 * r || 1); const sg = ccw ? 1 : -1;
      for (let t = 0; t < 8; t++) { const th = Math.PI * t / 8; const ux = (s.x - m.x) / (r || 1), uy = (s.y - m.y) / (r || 1); out.push({ x: m.x + (ux * Math.cos(th) + nx * sg * Math.sin(th)) * r, y: m.y + (uy * Math.cos(th) + ny * sg * Math.sin(th)) * r }); } } }
  return out;
}
