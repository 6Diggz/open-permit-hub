import type { Project, Room, Opening, Window, RoomUse } from './model';
import { area, bbox, inside, rect, segmentsCross, translate, type Poly, type Pt } from './geom';
import { ft, inch, isNum } from './units';

export const MAX_ROOMS = 40, MAX_OPENINGS = 30, MAX_ROOM_PTS = 64;
/** Habitable rooms (ceiling 7' 0"); bathrooms may be 6' 8" (R305.1 exception). */
export const HABITABLE: RoomUse[] = ['sleeping', 'living', 'kitchen'];

/** Footprint outline relative to its own lower-left corner (the frame rooms are stored in). */
export const footLocal = (p: Project): Poly => { const b = bbox(p.adu.footprint); return translate(p.adu.footprint, -b.minX, -b.minY); };
/** A room's outline in site-plan coordinates. */
export const roomAbs = (p: Project, r: Room): Poly => { const b = bbox(p.adu.footprint); return translate(r.poly, b.minX, b.minY); };

/** Size used everywhere: tape-measured sizes win over the drawing (rectangle rooms). */
export function roomSize(r: Room): { w: number; d: number; taped: boolean } {
  const b = bbox(r.poly); const w = b.maxX - b.minX, d = b.maxY - b.minY;
  if (r.shape !== 'rect') return { w, d, taped: false };
  return { w: isNum(r.tape.w) && r.tape.w > 0 ? r.tape.w : w, d: isNum(r.tape.d) && r.tape.d > 0 ? r.tape.d : d, taped: isNum(r.tape.w) || isNum(r.tape.d) };
}
export function roomArea(r: Room): number { if (r.shape === 'rect') { const s = roomSize(r); return s.w * s.d; } return area(r.poly); }
/** Smallest horizontal size (for the 7 ft minimum dimension rule). Polygons: the smaller bbox side, a fair first check. */
export const roomMinDim = (r: Room) => { const s = roomSize(r); return Math.min(s.w, s.d); };

/** True when the room lies inside the footprint; touching the outline (sharing a wall) is fine. */
export function roomFits(room: Poly, foot: Poly, tol = 3): boolean {
  const near = (q: Pt) => foot.some((a, i) => { const b = foot[(i + 1) % foot.length]; const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L ? ((q.x - a.x) * dx + (q.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy) <= tol; });
  if (!room.every(q => inside(q, foot) || near(q))) return false;
  for (let i = 0; i < room.length; i++) for (let j = 0; j < foot.length; j++) if (segmentsCross(room[i], room[(i + 1) % room.length], foot[j], foot[(j + 1) % foot.length])) return false;
  return true;
}
/** Move a room by (dx, dy), clamped so its box stays inside the footprint's box. */
export function clampMove(room: Poly, foot: Poly, dx: number, dy: number): Poly {
  const r = bbox(room), f = bbox(foot);
  const cx = Math.max(f.minX - r.minX, Math.min(f.maxX - r.maxX, dx)), cy = Math.max(f.minY - r.minY, Math.min(f.maxY - r.maxY, dy));
  return translate(room, cx, cy);
}
export const snap = (v: number, to = inch(1)) => Math.round(v / to) * to;

/** Wall names in plain words: rectangles get front/right/back/left (front = street side), polygons get numbers. */
export function wallName(r: Room, i: number, es: boolean): string {
  if (r.shape === 'rect' && r.poly.length === 4) return (es ? ['Muro del frente (lado de la calle)', 'Muro derecho', 'Muro de atrás', 'Muro izquierdo'] : ['Front wall (street side)', 'Right wall', 'Back wall', 'Left wall'])[i] ?? `${es ? 'Muro' : 'Wall'} ${i + 1}`;
  return `${es ? 'Muro' : 'Wall'} ${i + 1}`;
}
export const wallLength = (r: Room, i: number) => { const a = r.poly[i], b = r.poly[(i + 1) % r.poly.length]; if (!a || !b) return 0; if (r.shape === 'rect') { const s = roomSize(r); return i % 2 === 0 ? s.w : s.d; } return Math.hypot(b.x - a.x, b.y - a.y); };

/** A new room: fills the footprint for the first room, otherwise a 10' x 10' room (or what fits) at the lower-left. */
export function newRoom(p: Project, id: string, name: string, use: RoomUse): Room {
  const f = bbox(footLocal(p)); const W = f.maxX - f.minX, D = f.maxY - f.minY; const inset = inch(4);
  const first = p.adu.rooms.length === 0;
  const w = first ? W - inset * 2 : Math.min(ft(10), W - inset * 2), d = first ? D - inset * 2 : Math.min(ft(10), D - inset * 2);
  const off = first ? 0 : Math.min(p.adu.rooms.length * ft(1), Math.max(0, W - w - inset * 2));
  return { id, name, use, shape: 'rect', poly: rect(inset + off, inset + off * 0.5, Math.max(w, ft(3)), Math.max(d, ft(3))), tape: { w: null, d: null }, ceilingMm: null, openings: [] };
}
/** Apply a tape-measured size: the drawing is resized to it from the lower-left corner. */
export function applyTape(r: Room): Room {
  if (r.shape !== 'rect') return r; const b = bbox(r.poly); const s = roomSize(r);
  return { ...r, poly: rect(b.minX, b.minY, s.w, s.d) };
}
/** Turn a rectangle into an editable polygon, or add a corner in the middle of the longest wall of a polygon. */
export function addCorner(r: Room): Room {
  let i = 0, L = -1; r.poly.forEach((a, k) => { const b = r.poly[(k + 1) % r.poly.length]; const l = Math.hypot(b.x - a.x, b.y - a.y); if (l > L) { L = l; i = k; } });
  if (r.poly.length >= MAX_ROOM_PTS) return r;
  const a = r.poly[i], b = r.poly[(i + 1) % r.poly.length]; const m = { x: snap((a.x + b.x) / 2), y: snap((a.y + b.y) / 2) };
  const poly = [...r.poly.slice(0, i + 1), m, ...r.poly.slice(i + 1)];
  // Openings on walls after the split shift by one.
  const openings = r.openings.map(o => (o.wall > i ? { ...o, wall: o.wall + 1 } : o));
  return { ...r, shape: 'poly', tape: { w: null, d: null }, poly, openings };
}

/** Escape-window facts from drawn rooms. A studio (no sleeping room) counts as one main room (LADBS III-F.1, R310.1). */
export function roomWindows(p: Project): { bedrooms: number; windows: Window[] } {
  const rooms = p.adu.rooms; const sleeping = rooms.filter(r => r.use === 'sleeping');
  const studio = sleeping.length === 0;
  const windows: Window[] = []; const seen = new Map<string, number>();
  const label = (r: Room, ri: number) => { const base = r.name.trim() || `Room ${ri + 1}`; const k = base.toLowerCase(); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return n > 1 ? `${base} (${n})` : base; };
  const labels = rooms.map(label);
  rooms.forEach((r, ri) => r.openings.filter(o => o.kind === 'window').forEach(o => {
    // Studio: the main room is treated as a sleeping room even if the user says nobody sleeps there (EGR-01 decides).
    const isSleep = studio ? r.use !== 'bath' : r.use === 'sleeping';
    windows.push({ id: o.id, room: studio ? 'Main room' : labels[ri], sleeping: isSleep, clearWidthMm: o.widthMm, clearHeightMm: o.heightMm, sillMm: o.sillMm, gradeFloor: true });
  }));
  // A sleeping room drawn with no window still has to show up as "missing".
  return { bedrooms: sleeping.length, windows };
}

/**
 * The project as the rules see it: when rooms are drawn they are the source for bedrooms and escape windows,
 * so the drawing and the checks can never disagree.
 */
export function withRooms(p: Project): Project {
  if (!p.adu.rooms?.length) return p;
  const f = roomWindows(p);
  return { ...p, adu: { ...p.adu, bedrooms: f.bedrooms, windows: f.windows } };
}
/** Room ceiling: its own measurement, else the garage's finished ceiling height. */
export const roomCeiling = (p: Project, r: Room) => (isNum(r.ceilingMm) && r.ceilingMm > 0 ? r.ceilingMm : p.adu.ceilingHeightMm);
/** Point on a wall at `offsetMm` from the wall's start corner, and the wall's unit direction. */
export function wallPoint(poly: Poly, wall: number, offsetMm: number) {
  const a = poly[wall % poly.length], b = poly[(wall + 1) % poly.length]; const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L; return { x: a.x + ux * offsetMm, y: a.y + uy * offsetMm, ux, uy, L };
}
/** Openings that run past the end of their wall or overlap another opening on the same wall. */
export function openingProblems(r: Room): string[] {
  const out: string[] = [];
  r.openings.forEach((o, i) => {
    const L = wallLength(r, o.wall); if (o.wall >= r.poly.length) out.push(o.id);
    else if (o.offsetMm < 0 || o.offsetMm + o.widthMm > L + 1) out.push(o.id);
    else if (r.openings.some((x, j) => j !== i && x.wall === o.wall && x.offsetMm < o.offsetMm + o.widthMm && o.offsetMm < x.offsetMm + x.widthMm)) out.push(o.id);
  });
  return [...new Set(out)];
}
export type { Opening };
