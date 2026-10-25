import { useEffect, useRef, useState } from 'react';
import type { Project, Room } from '../core/model';
import { bbox, type Poly, type Pt } from '../core/geom';
import { fmtFtIn, fmtSqFt, ft, inch } from '../core/units';
import { clampMove, overlappingRooms, footLocal, roomArea, roomFits, roomSize, snap, wallPoint, openingProblems } from '../core/rooms';
import { L } from './lang';

const USE: Record<Room['use'], string> = { sleeping: 'Sleeping', living: 'Living', bath: 'Bath', kitchen: 'Kitchen' };
export const roomUseLabel = (u: Room['use']) => L(USE[u]);

/**
 * Floor plan editor: the garage outline with its rooms, doors and windows, at full drawing size.
 * Drag a room to move it, drag a corner to resize; keyboard: arrows move 1" (Shift 1'), Alt+arrows resize, Delete removes.
 * `onChange(rooms, key)` sends whole-room updates; the key groups a drag into one undo step.
 */
export function RoomPlan({ p, selected, onSelect, onChange, onRemove }: { p: Project; selected: string | null; onSelect: (id: string | null) => void; onChange: (id: string, poly: Poly, key: string) => void; onRemove: (id: string) => void }) {
  const svg = useRef<SVGSVGElement>(null); const drag = useRef<{ id: string; mode: 'move' | number; start: Pt; poly: Poly } | null>(null);
  const [live, setLive] = useState(''); const [blocked, setBlocked] = useState(false);
  const foot = footLocal(p); const fb = bbox(foot); const pad = ft(3);
  const vb = { x: fb.minX - pad, y: fb.minY - pad, w: fb.maxX - fb.minX + pad * 2, h: fb.maxY - fb.minY + pad * 2 };
  const Y = (y: number) => fb.maxY + fb.minY - y; // model y up -> SVG y down
  const pts = (pl: Poly) => pl.map(q => `${q.x},${Y(q.y)}`).join(' ');
  const s = Math.max(vb.w, vb.h) / 520;
  const toModel = (e: React.PointerEvent): Pt => { const m = svg.current!.getScreenCTM()!.inverse(); const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return { x: pt.x, y: Y(pt.y) }; };
  const rooms = p.adu.rooms;
  // After Delete, keyboard focus moves to the next room (or the plan itself), never to the page body.
  const refocus = useRef<number | null>(null);
  useEffect(() => { const i = refocus.current; if (i == null) return; refocus.current = null;
    const list = svg.current?.querySelectorAll<SVGElement>('polygon[role="button"]'); const el = list?.length ? list[Math.min(i, list.length - 1)] : svg.current; el?.focus(); }, [rooms.length]);
  const over = new Set(overlappingRooms(rooms).flat().map(r => r.id));
  const describe = (r: Room) => { const z = roomSize(r); return `${r.name || L('Room')}, ${roomUseLabel(r.use)}, ${fmtFtIn(z.w)} x ${fmtFtIn(z.d)}, ${fmtSqFt(roomArea(r))}${z.taped ? `, ${L('tape-measured')}` : ''}`; };
  const tryPoly = (r: Room, poly: Poly, key: string) => { if (roomFits(poly, foot)) { setBlocked(false); onChange(r.id, poly, key); return true; } setBlocked(true); return false; };

  /** New corner position for a drag of corner `i`: rectangles keep square corners (the opposite corner stays put). */
  const reshape = (r: Room, base: Poly, i: number, to: Pt): Poly => {
    const q = { x: snap(to.x), y: snap(to.y) };
    if (r.shape === 'rect' && base.length === 4) { const o = base[(i + 2) % 4]; const x0 = Math.min(o.x, q.x), x1 = Math.max(o.x, q.x), y0 = Math.min(o.y, q.y), y1 = Math.max(o.y, q.y); if (x1 - x0 < ft(2) || y1 - y0 < ft(2)) return base; return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; }
    return base.map((v, k) => (k === i ? q : v));
  };
  const key = (r: Room) => (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); refocus.current = rooms.indexOf(r); onRemove(r.id); return; }
    if (e.key === 'Escape') { onSelect(null); return; }
    const st = e.shiftKey ? ft(1) : inch(1); const m: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
    const v = m[e.key]; if (!v) return; e.preventDefault(); onSelect(r.id);
    let next: Poly;
    if (e.altKey) {
      if (r.shape !== 'rect') { setLive(L('Alt+arrows resize rectangle rooms. To change a shaped room, drag a corner, or press Tab to reach a corner and use the arrow keys.')); return; }
      if (r.tape.w != null && v[0] || r.tape.d != null && v[1]) { setLive(L('This size is tape-measured. Change it in the room details.')); return; }
      const b = bbox(r.poly); next = [{ x: b.minX, y: b.minY }, { x: b.maxX + v[0], y: b.minY }, { x: b.maxX + v[0], y: b.maxY + v[1] }, { x: b.minX, y: b.maxY + v[1] }];
      if (next[1].x - next[0].x < ft(2) || next[2].y - next[1].y < ft(2)) return;
    } else next = clampMove(r.poly, foot, v[0], v[1]);
    if (tryPoly(r, next, 'room-key-' + r.id)) setLive(describe({ ...r, poly: next })); else setLive(L('It would go outside the garage outline.'));
  };
  return (<>
    <svg ref={svg} tabIndex={-1} style={{ userSelect: 'none' }} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="group" aria-label={L('Floor plan. Each room is a button: arrow keys move it 1 inch, Shift moves 1 foot, Alt with arrows resizes, Delete removes it.')}
      onPointerDown={e => { if (e.target === svg.current) onSelect(null); }}>
      <g color="var(--ink)">
        <polygon points={pts(foot)} fill="none" stroke="var(--ink)" strokeWidth={s * 5} />
        {rooms.length === 0 && <text x={(fb.minX + fb.maxX) / 2} y={Y((fb.minY + fb.maxY) / 2)} fontSize={s * 15} textAnchor="middle" fill="var(--pencil)">{L('No rooms yet. Tap "Add a room".')}</text>}
        {rooms.map(r => {
          const z = roomSize(r); const b = bbox(r.poly); const sel = r.id === selected; const bad = !roomFits(r.poly, foot) || openingProblems(r).length > 0 || over.has(r.id);
          const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2; const fs = Math.max(s * 9, Math.min(s * 14, (b.maxX - b.minX) / 9));
          return <g key={r.id}>
            <polygon points={pts(r.poly)} fill={sel ? 'var(--faint)' : 'var(--sheet)'} stroke={bad ? 'var(--fix)' : 'var(--ink)'} strokeWidth={s * (sel ? 3 : 1.6)}
              tabIndex={0} role="button" aria-pressed={sel} aria-label={describe(r) + (bad ? `. ${L('Needs fixing: outside the garage, overlapping another room, or an opening does not fit.')}` : '')} style={{ cursor: 'move', touchAction: 'none' }}
              onFocus={() => onSelect(r.id)} onKeyDown={key(r)}
              onPointerDown={e => { e.stopPropagation(); onSelect(r.id); (e.target as Element).setPointerCapture(e.pointerId); drag.current = { id: r.id, mode: 'move', start: toModel(e), poly: r.poly }; }}
              onPointerMove={e => { const d = drag.current; if (!d || d.id !== r.id || d.mode !== 'move') return; const m = toModel(e); const next = clampMove(d.poly, foot, snap(m.x - d.start.x), snap(m.y - d.start.y)); tryPoly(r, next, 'room-drag-' + r.id); }}
              onPointerUp={() => { if (drag.current?.id === r.id) setLive(describe(r)); drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
            {r.openings.map(o => { const w = wallPoint(r.poly, o.wall, o.offsetMm); const e2 = { x: w.x + w.ux * o.widthMm, y: w.y + w.uy * o.widthMm }; const nx = -w.uy, ny = w.ux;
              return o.kind === 'window'
                ? <g key={o.id} pointerEvents="none"><line x1={w.x} y1={Y(w.y)} x2={e2.x} y2={Y(e2.y)} stroke="var(--sheet)" strokeWidth={s * 6} /><line x1={w.x + nx * s * 3} y1={Y(w.y + ny * s * 3)} x2={e2.x + nx * s * 3} y2={Y(e2.y + ny * s * 3)} stroke="var(--ink)" strokeWidth={s} /><line x1={w.x - nx * s * 3} y1={Y(w.y - ny * s * 3)} x2={e2.x - nx * s * 3} y2={Y(e2.y - ny * s * 3)} stroke="var(--ink)" strokeWidth={s} /></g>
                : <g key={o.id} pointerEvents="none"><line x1={w.x} y1={Y(w.y)} x2={e2.x} y2={Y(e2.y)} stroke="var(--sheet)" strokeWidth={s * 6} /><path d={`M ${w.x} ${Y(w.y)} L ${w.x + nx * o.widthMm} ${Y(w.y + ny * o.widthMm)} A ${o.widthMm} ${o.widthMm} 0 0 ${ny * w.ux - nx * w.uy > 0 ? 0 : 1} ${e2.x} ${Y(e2.y)}`} fill="none" stroke="var(--pencil)" strokeWidth={s} /></g>; })}
            <text x={cx} y={Y(cy) - fs * 0.4} fontSize={fs} textAnchor="middle" fontWeight="800" fill="var(--ink)" pointerEvents="none">{r.name || L('Room')}</text>
            <text x={cx} y={Y(cy) + fs * 0.85} fontSize={fs * 0.82} textAnchor="middle" fill="var(--ink)" pointerEvents="none">{fmtFtIn(z.w)} x {fmtFtIn(z.d)}</text>
            <text x={cx} y={Y(cy) + fs * 1.95} fontSize={fs * 0.82} textAnchor="middle" fill="var(--pencil)" pointerEvents="none">{fmtSqFt(roomArea(r))}{z.taped ? ` · ${L('tape')}` : ''}</text>
            {sel && r.poly.map((v, i) => <g key={i}>
              <circle cx={v.x} cy={Y(v.y)} r={s * 6} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={s * 2} pointerEvents="none" />
              <circle cx={v.x} cy={Y(v.y)} r={s * 22} fill="transparent" style={{ cursor: 'nwse-resize', touchAction: 'none' }}
                {...(r.shape !== 'rect' ? { tabIndex: 0, role: 'button', 'aria-label': `${L('Corner')} ${i + 1} / ${r.poly.length}, ${r.name || L('Room')}. ${L('Arrow keys move it 1 inch, Shift moves 1 foot.')}`,
                  onKeyDown: (e: React.KeyboardEvent) => { const st = e.shiftKey ? ft(1) : inch(1); const m: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }; const d = m[e.key]; if (!d) return; e.preventDefault(); e.stopPropagation();
                    const next = reshape(r, r.poly, i, { x: v.x + d[0], y: v.y + d[1] }); if (tryPoly(r, next, 'room-corner-key-' + r.id + '-' + i)) setLive(describe({ ...r, poly: next })); else setLive(L('It would go outside the garage outline.')); } } : { 'aria-hidden': true })}
                onPointerDown={e => { e.stopPropagation(); if (r.shape === 'rect' && (r.tape.w != null || r.tape.d != null)) { setLive(L('This size is tape-measured. Change it in the room details.')); return; } (e.target as Element).setPointerCapture(e.pointerId); drag.current = { id: r.id, mode: i, start: toModel(e), poly: r.poly }; }}
                onPointerMove={e => { const d = drag.current; if (!d || d.id !== r.id || d.mode !== i) return; tryPoly(r, reshape(r, d.poly, i, toModel(e)), 'room-corner-' + r.id); }}
                onPointerUp={() => { if (drag.current) setLive(describe(r)); drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
            </g>)}
          </g>;
        })}
      </g>
    </svg>
    <span className="sr" role="status" aria-live="polite">{blocked ? L('It would go outside the garage outline.') : live}</span>
  </>);
}
