// Check-pin layout for the Pro workspace: every pin sits on the non-plotting markup layer, off to the side of its object
// with a short leader, placed so it never covers drawing text, linework, symbols or another pin. Pure and unit-tested.
// Works in screen pixels (view units times zoom), so the layout is the same at any zoom.
import type { Drawing, Txt } from './drafting';

export interface PxRect { x0: number; y0: number; x1: number; y1: number }
export interface PinIn { key: string; ax: number; ay: number }
export interface PinOut { key: string; ax: number; ay: number; x: number; y: number }

/** Axis-aligned box of a drawing text in view units (screen-oriented model mm), rotation included. */
export function textBox(t: Txt): PxRect {
  const w = Math.max(1, t.s.length) * t.h * (t.bold ? 0.74 : 0.68) + t.h * 0.3, hh = t.h * 1.15;
  const x0 = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0; const y0 = t.mid ? -hh / 2 : -hh * 0.8;
  const cs = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + hh], [x0, y0 + hh]]; const r = ((t.rot ?? 0) * Math.PI) / 180; const c = Math.cos(r), s = Math.sin(r);
  const pts = cs.map(([x, y]) => [t.x + x * c - y * s, t.y + x * s + y * c]);
  return { x0: Math.min(...pts.map(q => q[0])), y0: Math.min(...pts.map(q => q[1])), x1: Math.max(...pts.map(q => q[0])), y1: Math.max(...pts.map(q => q[1])) };
}
/** Line segments of an SVG path made of M, L and Z commands (what drafting.ts writes). */
export function pathSegs(d: string): [number, number, number, number][] {
  const out: [number, number, number, number][] = []; const re = /([MLZ])\s*(-?[\d.]+)?\s+(-?[\d.]+)?/g; let m: RegExpExecArray | null; let cx = 0, cy = 0, sx = 0, sy = 0;
  while ((m = re.exec(d))) { if (m[1] === 'Z') { out.push([cx, cy, sx, sy]); cx = sx; cy = sy; continue; } const x = +m[2], y = +m[3]; if (m[1] === 'M') { sx = cx = x; sy = cy = y; } else { out.push([cx, cy, x, y]); cx = x; cy = y; } }
  return out;
}
const segDist = (px: number, py: number, s: [number, number, number, number]) => { const [x0, y0, x1, y1] = s; const dx = x1 - x0, dy = y1 - y0; const L = dx * dx + dy * dy; let t = L ? ((px - x0) * dx + (py - y0) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)); };
const rectDist = (px: number, py: number, r: PxRect) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));

/** Obstacles in px from a drawing at zoom k: visible text boxes and stroked linework. `on` says whether a layer is shown. */
export function obstacles(d: Drawing, k: number, on: (layer: string) => boolean, minTextPx: number, extra: { rects?: PxRect[]; segs?: [number, number, number, number][] } = {}) {
  const rects: PxRect[] = [...(extra.rects ?? [])]; const segs: [number, number, number, number][] = [...(extra.segs ?? [])];
  for (const t of d.texts) if (on(t.layer) && t.h * k >= minTextPx) { const b = textBox(t); rects.push({ x0: b.x0 * k, y0: b.y0 * k, x1: b.x1 * k, y1: b.y1 * k }); }
  for (const p of d.prims) if (on(p.layer) && p.layer !== 'A-WALL-PATT') for (const s of pathSegs(p.d)) segs.push([s[0] * k, s[1] * k, s[2] * k, s[3] * k]);
  return { rects, segs };
}

/** Place pins of radius r (px) around their anchors: the first spot (nearest first, up-right preferred) that clears text,
 * lines and earlier pins by `gap`; if none is fully clear, the spot with the most room. */
export function layoutPins(pins: PinIn[], obs: { rects: PxRect[]; segs: [number, number, number, number][] }, r: number, gap = 3): PinOut[] {
  const placed: PinOut[] = []; const RADII = [30, 40, 52, 66, 82, 100, 122, 148, 178, 214, 256]; const ANG = Array.from({ length: 24 }, (_, i) => -Math.PI / 4 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12));
  for (const p of pins) {
    const near = (R: number) => ({ rects: obs.rects.filter(b => rectDist(p.ax, p.ay, b) < R + r + gap), segs: obs.segs.filter(s => segDist(p.ax, p.ay, s) < R + r + gap) });
    const local = near(RADII[RADII.length - 1]); let best: { x: number; y: number; room: number } | null = null;
    outer: for (const R of RADII) for (const a of ANG) {
      const x = p.ax + Math.cos(a) * R, y = p.ay + Math.sin(a) * R; let room = Infinity;
      for (const b of local.rects) { room = Math.min(room, Math.max(b.x0 - (x + r), (x - r) - b.x1, b.y0 - (y + r), (y - r) - b.y1)); /* pin's square box vs text box */ if (room < gap && best && room <= best.room) break; }
      for (const s of local.segs) { room = Math.min(room, segDist(x, y, s) - r); if (room < gap && best && room <= best.room) break; }
      for (const q of placed) room = Math.min(room, Math.max(Math.abs(q.x - x), Math.abs(q.y - y)) - 2 * r); /* boxes, not just circles, stay apart */
      if (!best || room > best.room) best = { x, y, room };
      if (room >= gap) break outer;
    }
    placed.push({ key: p.key, ax: p.ax, ay: p.ay, x: best!.x, y: best!.y });
  }
  return placed;
}
