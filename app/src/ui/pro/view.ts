// Viewport math for the Pro workspace: camera, adaptive grid, object snaps, ortho and hit testing. Pure and unit-tested.
import type { Project } from '../../core/model';
import { bbox, inside, translate, type Poly, type Pt } from '../../core/geom';
import { ft, inch } from '../../core/units';
import { roomAbs, applyTape } from '../../core/rooms';
import { entSnaps, entSegs, segX } from '../../core/cad';

/** Camera: center in view units (screen-oriented model mm, or paper inches) and zoom k in px per unit. */
export interface Cam { cx: number; cy: number; k: number }
export interface Box { minX: number; minY: number; maxX: number; maxY: number }
export const viewBox = (c: Cam, w: number, h: number) => ({ x: c.cx - w / 2 / c.k, y: c.cy - h / 2 / c.k, w: w / c.k, h: h / c.k });
/** Fit a box into a w x h px viewport with a margin (px). */
export function fit(b: Box, w: number, h: number, margin = 32): Cam {
  const bw = Math.max(1e-6, b.maxX - b.minX), bh = Math.max(1e-6, b.maxY - b.minY);
  const k = Math.max(1e-6, Math.min((w - margin * 2) / bw, (h - margin * 2) / bh));
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, k };
}
/** Zoom by factor f about screen point (sx, sy) so that point stays put. */
export function zoomAt(c: Cam, f: number, sx: number, sy: number, w: number, h: number, kMin: number, kMax: number): Cam {
  const k = Math.min(kMax, Math.max(kMin, c.k * f)); const ux = c.cx + (sx - w / 2) / c.k, uy = c.cy + (sy - h / 2) / c.k;
  return { k, cx: ux - (sx - w / 2) / k, cy: uy - (sy - h / 2) / k };
}
export const toUnits = (c: Cam, sx: number, sy: number, w: number, h: number) => ({ x: c.cx + (sx - w / 2) / c.k, y: c.cy + (sy - h / 2) / c.k });

/** Grid spacing (mm) that keeps minor lines at least `minPx` apart; major lines every 5 or 10 minors. */
const STEPS = [inch(1), inch(3), inch(6), ft(1), ft(2), ft(5), ft(10), ft(20), ft(50), ft(100), ft(200), ft(500)];
export function gridStep(k: number, minPx = 9): { minor: number; major: number } {
  const i = STEPS.findIndex(s => s * k >= minPx); const minor = STEPS[i < 0 ? STEPS.length - 1 : i];
  // Major lines on round feet a drafter counts by: every 10' at plan scales, then 50', 100', 500'.
  const MAJ = [ft(1), ft(5), ft(10), ft(50), ft(100), ft(500), ft(1000)];
  const major = MAJ.find(s => s >= minor * 4 - 1e-6 && s >= ft(10) - 1e-6 && s * k >= minPx * 4) ?? MAJ.find(s => s >= minor * 4 - 1e-6 && s * k >= minPx * 4) ?? minor * 10; return { minor, major };
}
/** Grid lines covering a view box (screen-oriented units), as two path strings. */
export function gridPaths(vb: { x: number; y: number; w: number; h: number }, k: number): { minor: string; major: string; step: number } {
  const { minor, major } = gridStep(k); let mi = '', ma = '';
  const x0 = Math.floor(vb.x / minor) * minor, y0 = Math.floor(vb.y / minor) * minor; let n = 0;
  for (let x = x0; x <= vb.x + vb.w && n < 600; x += minor, n++) { const isMa = Math.abs(Math.round(x / major) * major - x) < 1e-3; const s = `M${x.toFixed(1)} ${vb.y.toFixed(1)}V${(vb.y + vb.h).toFixed(1)}`; if (isMa) ma += s; else mi += s; }
  for (let y = y0; y <= vb.y + vb.h && n < 1200; y += minor, n++) { const isMa = Math.abs(Math.round(y / major) * major - y) < 1e-3; const s = `M${vb.x.toFixed(1)} ${y.toFixed(1)}H${(vb.x + vb.w).toFixed(1)}`; if (isMa) ma += s; else mi += s; }
  return { minor: mi, major: ma, step: minor };
}

export type SnapKind = 'end' | 'mid' | 'int' | 'cen' | 'perp' | 'near' | 'grid' | 'polar' | 'none';
export interface Snap { pt: Pt; kind: SnapKind }
export interface SnapSet { end: Pt[]; mid: Pt[]; cen: Pt[]; segs: [Pt, Pt][] }
/** Model outlines that snaps can find: lot, house, ADU, rooms. Model units (mm, y up). */
export function snapGeometry(p: Project): Poly[] {
  return [p.site.lot, p.site.primary, p.adu.footprint, ...p.adu.rooms.map(r => roomAbs(p, applyTape(r)))];
}
/** Every snap candidate: model outlines (closed) plus drafting entities, minus `skip` (what is being moved). */
export function snapSet(p: Project, skipPolys: Poly[] = [], skipEnts: Set<string> = new Set()): SnapSet {
  const s: SnapSet = { end: [], mid: [], cen: [], segs: [] };
  for (const pl of snapGeometry(p)) { if (skipPolys.includes(pl)) continue; pl.forEach((a, i) => { const b = pl[(i + 1) % pl.length]; s.end.push(a); s.mid.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); s.segs.push([a, b]); }); }
  for (const e of p.cad?.ents ?? []) { if (skipEnts.has(e.id)) continue; const k = entSnaps(e); s.end.push(...k.end); s.mid.push(...k.mid); s.cen.push(...k.cen); s.segs.push(...entSegs(e)); }
  return s;
}
/** Object snap: endpoint > intersection > midpoint > center > perpendicular (from `from`) > nearest, within `ap` mm; then the snap grid, else the raw point. */
export function snapPoint(q: Pt, set: SnapSet | Poly[], ap: number, o: { from?: Pt | null; osnap: boolean; grid: number | null; skip?: Poly[] }): Snap {
  const S: SnapSet = Array.isArray(set) ? (() => { const x: SnapSet = { end: [], mid: [], cen: [], segs: [] }; for (const pl of set) { if (o.skip?.includes(pl)) continue; pl.forEach((a, i) => { const b = pl[(i + 1) % pl.length]; x.end.push(a); x.mid.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); x.segs.push([a, b]); }); } return x; })() : set;
  if (o.osnap) {
    const near = (pt: Pt) => Math.hypot(pt.x - q.x, pt.y - q.y);
    const pick = (pts: Pt[], kind: SnapKind): Snap | null => { let b: Snap | null = null, bd = ap; for (const pt of pts) { const d = near(pt); if (d <= bd) { bd = d; b = { pt, kind }; } } return b; };
    const segD = ([a, b]: [Pt, Pt]) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L ? ((q.x - a.x) * dx + (q.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return { d: Math.hypot(q.x - a.x - dx * t, q.y - a.y - dy * t), p: { x: a.x + dx * t, y: a.y + dy * t } }; };
    const close = S.segs.filter(sg => segD(sg).d <= ap);
    const ints: Pt[] = []; for (let i = 0; i < close.length && i < 60; i++) for (let j = i + 1; j < close.length && j < 60; j++) { const x = segX(close[i][0], close[i][1], close[j][0], close[j][1]); if (x) ints.push(x.p); }
    const r = pick(S.end, 'end') ?? pick(ints, 'int') ?? pick(S.mid, 'mid') ?? pick(S.cen, 'cen');
    if (r) return r;
    if (o.from) { const perps: Pt[] = []; for (const [a, b] of close) { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; if (!L) continue; const t = ((o.from.x - a.x) * dx + (o.from.y - a.y) * dy) / L; if (t > 0.001 && t < 0.999) perps.push({ x: a.x + dx * t, y: a.y + dy * t }); } const pp = pick(perps, 'perp'); if (pp) return pp; }
    if (close.length) { let best = close[0], bd = Infinity; for (const sg of close) { const d = segD(sg).d; if (d < bd) { bd = d; best = sg; } } if (bd <= ap * 0.5) return { pt: segD(best).p, kind: 'near' }; }
  }
  if (o.grid) return { pt: { x: Math.round(q.x / o.grid) * o.grid, y: Math.round(q.y / o.grid) * o.grid }, kind: 'grid' };
  return { pt: q, kind: 'none' };
}
/** Polar tracking: when the direction from `from` is within `tolDeg` of a multiple of `stepDeg`, lock to it (distance kept). */
export function polar(from: Pt, q: Pt, stepDeg = 15, tolDeg = 4): Pt | null {
  const a = Math.atan2(q.y - from.y, q.x - from.x) * 180 / Math.PI; const k = Math.round(a / stepDeg) * stepDeg; if (Math.abs(a - k) > tolDeg) return null;
  const d = Math.hypot(q.x - from.x, q.y - from.y); const r = (k * Math.PI) / 180; return { x: from.x + Math.cos(r) * d, y: from.y + Math.sin(r) * d };
}
/** Ortho: keep the point on the horizontal or vertical through `from`, whichever is closer. */
export const ortho = (from: Pt, q: Pt): Pt => (Math.abs(q.x - from.x) >= Math.abs(q.y - from.y) ? { x: q.x, y: from.y } : { x: from.x, y: q.y });

export type Sel = { kind: 'ents'; ids: string[] } | { kind: 'adu' } | { kind: 'room'; id: string } | { kind: 'opening'; room: string; id: string } | { kind: 'house' } | { kind: 'lot' } | { kind: 'pin'; id: string } | { kind: 'issue'; id: string };
export const selKey = (s: Sel | null) => (!s ? '' : s.kind === 'ents' ? 'ents:' + s.ids.join(',') : s.kind === 'room' ? 'room:' + s.id : s.kind === 'opening' ? `open:${s.room}:${s.id}` : s.kind === 'pin' ? 'pin:' + s.id : s.kind === 'issue' ? 'issue:' + s.id : s.kind);
/** What is under a model point. Openings beat rooms beat the ADU beat the house beat the lot. `locked` lists locked layers. */
export function hitTest(p: Project, q: Pt, tolMm: number, locked: Set<string> = new Set()): Sel | null {
  const fp = p.adu.footprint;
  if (!locked.has('A-DOOR') || !locked.has('A-GLAZ')) for (const r of p.adu.rooms) { const pl = roomAbs(p, applyTape(r));
    for (const o of r.openings) { if (locked.has(o.kind === 'door' ? 'A-DOOR' : 'A-GLAZ')) continue; const a = pl[o.wall], b = pl[(o.wall + 1) % pl.length]; if (!a || !b) continue; const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
      const t = (q.x - a.x) * ux + (q.y - a.y) * uy; const d = Math.abs((q.x - a.x) * -uy + (q.y - a.y) * ux); if (t >= o.offsetMm - tolMm && t <= o.offsetMm + o.widthMm + tolMm && d <= Math.max(tolMm, inch(8))) return { kind: 'opening', room: r.id, id: o.id }; } }
  if (!locked.has('A-WALL') && !locked.has('A-AREA-IDEN')) for (const r of [...p.adu.rooms].reverse()) if (inside(q, roomAbs(p, applyTape(r)))) return { kind: 'room', id: r.id };
  const wallLayer = p.adu.mode === 'conversion' ? 'A-WALL-EXST' : 'A-WALL';
  if (!locked.has(wallLayer) && inside(q, fp)) return { kind: 'adu' };
  if (!locked.has('A-BLDG-EXST') && inside(q, p.site.primary)) return { kind: 'house' };
  if (!locked.has('C-PROP')) { const lot = p.site.lot; const near = lot.some((a, i) => { const b = lot[(i + 1) % lot.length]; const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L ? ((q.x - a.x) * dx + (q.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy) <= tolMm; }); if (near) return { kind: 'lot' }; }
  return null;
}
/** The locked layer of whatever is under q (a drafting entity or a model object), so a click on it can say so instead of doing nothing. */
export function lockedLayerAt(p: Project, q: Pt, tolMm: number, locked: Set<string>, ents: { layer: string; dist: number }[] = []): string | null {
  const e = ents.find(x => x.dist <= tolMm && locked.has(x.layer)); if (e) return e.layer;
  const h = hitTest(p, q, tolMm); if (!h) return null;
  const opening = h.kind === 'opening' ? p.adu.rooms.find(r => r.id === h.room)?.openings.find(o => o.id === h.id) : undefined;
  const layers = h.kind === 'opening' ? [opening?.kind === 'window' ? 'A-GLAZ' : 'A-DOOR'] : h.kind === 'room' ? ['A-WALL', 'A-AREA-IDEN'] : h.kind === 'adu' ? [p.adu.mode === 'conversion' ? 'A-WALL-EXST' : 'A-WALL'] : h.kind === 'house' ? ['A-BLDG-EXST'] : h.kind === 'lot' ? ['C-PROP'] : [];
  return layers.find(l => locked.has(l)) ?? null;
}
/** Outline (model) of a selection, for grips and zoom-to-selection. */
export function selOutline(p: Project, s: Sel | null): Poly | null {
  if (!s) return null;
  if (s.kind === 'adu') return p.adu.footprint; if (s.kind === 'house') return p.site.primary; if (s.kind === 'lot') return p.site.lot;
  if (s.kind === 'room') { const r = p.adu.rooms.find(x => x.id === s.id); return r ? roomAbs(p, applyTape(r)) : null; }
  if (s.kind === 'opening') { const r = p.adu.rooms.find(x => x.id === s.room); const o = r?.openings.find(x => x.id === s.id); if (!r || !o) return null; const pl = roomAbs(p, applyTape(r)); const a = pl[o.wall], b = pl[(o.wall + 1) % pl.length]; if (!a || !b) return null; const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    return [{ x: a.x + u.x * o.offsetMm, y: a.y + u.y * o.offsetMm }, { x: a.x + u.x * (o.offsetMm + o.widthMm), y: a.y + u.y * (o.offsetMm + o.widthMm) }]; }
  if (s.kind === 'pin') { const x = p.markup.pins.find(y => y.id === s.id); return x ? [{ x: x.x - ft(6), y: x.y - ft(6) }, { x: x.x + ft(6), y: x.y + ft(6) }] : null; }
  return null;
}
/** Is the polygon an axis-aligned rectangle (so corner grips resize it)? */
export const isAxisRect = (pl: Poly) => pl.length === 4 && pl.every((a, i) => { const b = pl[(i + 1) % 4]; return Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5; });
/** Resize an axis-aligned rectangle by dragging corner `i` to q (the opposite corner stays). Minimum 1 ft. */
export function dragCorner(pl: Poly, i: number, q: Pt): Poly {
  const o = pl[(i + 2) % 4]; const minX = Math.min(o.x, q.x), maxX = Math.max(o.x, q.x), minY = Math.min(o.y, q.y), maxY = Math.max(o.y, q.y);
  const w = Math.max(ft(1), maxX - minX), h = Math.max(ft(1), maxY - minY); const x0 = q.x < o.x ? o.x - w : o.x, y0 = q.y < o.y ? o.y - h : o.y;
  return [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }];
}
export { translate, bbox };
