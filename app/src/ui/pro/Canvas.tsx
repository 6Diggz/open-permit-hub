// Model-space viewport (and paper-space sheets) for the Pro workspace: SVG with a viewBox camera, adaptive grid, object
// snaps with glyphs, ortho and polar, window/crossing selection with grips, drafting entities, command points, check pins.
import { memo, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import type { Project } from '../../core/model';
import { bbox, translate, type Poly, type Pt } from '../../core/geom';
import { ft, inch } from '../../core/units';
import { footLocal, clampMove, roomFits } from '../../core/rooms';
import { type Ent, entDist, inWindow, arcPt, cloudPts, entSnaps, entSegs } from '../../core/cad';
import { draft, annoScaleFor, fmtArch, readable, lwPx, MIN_TEXT_PX, DIMSTY, PEN, LAYERS, SCALES } from './drafting';
import { layoutPins, obstacles, type PinOut } from './pins';
import { Graphics, lwDisp } from './graphics';
import { screenSheet, labelDrawing, type Sheet, type Marker } from '../../out/sheet';
import { lockedLayerAt, fit, zoomAt, viewBox, gridPaths, snapPoint, snapSet, ortho, polar, hitTest, selOutline, selKey, isAxisRect, dragCorner, toUnits, type Cam, type Sel, type Snap } from './view';
import { dimGeom } from './cmd';
import type { Issue } from './issues';
import { L } from '../lang';

export type Tool = 'select' | 'pan' | 'cmd';
export type SheetId = 'model' | 'a1' | 'a2' | 'g2';
export interface LayerState { on: boolean; locked: boolean }
export interface CanvasApi { fit: () => void; zoomAdu: () => void; zoomSel: () => void; zoomTo: (q: Pt, spanMm?: number) => void; zoomBy: (f: number) => void; zoomWindow: () => void }
export interface CanvasProps {
  p: Project; es: boolean; sheet: SheetId; layers: Record<string, LayerState>; lwt: boolean; dark: boolean; tool: Tool; units: string;
  osnap: boolean; orthoOn: boolean; polarOn: boolean; gridOn: boolean; snapOn: boolean; snapInc: number;
  sel: Sel | null; onSel: (s: Sel | null) => void; issues: Issue[]; activeIssue: string | null; onIssue: (id: string) => void;
  onCursor: (q: Pt | null) => void; onScale: (label: string, annoMm: number) => void; say: (msg: string) => void;
  preview: (next: Project) => void; commit: (start: Project, next: Project) => void;
  /** Command in progress: clicks become points; `base` drives ortho, polar and the rubber band. */ cmd: { active: boolean; selecting: boolean; base: Pt | null; ghost: Ent[]; cursorSet: (q: Pt | null) => void; pick: (q: Pt) => void };
}

const LW = (lw: number, on: boolean, disp = 1.4) => lwPx(lw, on, disp);
/** Layer colors (index colors 1-6, 8; 7 = drawing ink, which flips with the theme). */
const ACI: Record<number, string> = { 1: '#e5484d', 2: '#d6a000', 3: '#2f9e44', 4: '#1c9fb5', 5: '#3b6fe0', 6: '#b44fc4', 8: '#8a9099' };
export const layerColor = (c: number) => ACI[c];

const P = (q: Pt) => `${q.x.toFixed(1)} ${(-q.y).toFixed(1)}`;
/** Zoom bucket (1/8 octave), so layouts that depend on zoom recompute a few times per doubling, not every wheel tick. */
const kBucketOf = (k: number) => Math.pow(2, Math.round(Math.log2(k) * 8) / 8);
/** One drafting entity as SVG (model y-up, drawn flipped). `h` is the annotation text height for dims and clouds. */
export function EntSvg({ e, h, lwt, cls = '', color, k = Infinity }: { e: Ent; h: number; lwt: boolean; cls?: string; color?: string; /** px per mm: text smaller than MIN_TEXT_PX on screen is left out */ k?: number }) {
  const sw = LW(e.t === 'dim' ? PEN['A-ANNO-DIMS'] : e.t === 'text' || e.t === 'leader' ? PEN['A-ANNO-TEXT'] : 0.25, lwt); const st = { stroke: color, fill: 'none' } as const; const tf = { fill: color };
  const common = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: sw, className: `ent t-ink ${cls}`, 'data-ent': e.id, 'data-t': e.t };
  if (e.t === 'line' || e.t === 'pline') return <path d={`M${e.pts.map(P).join('L')}${e.closed ? 'Z' : ''}`} {...common} style={st} />;
  if (e.t === 'circle') return <circle cx={e.pts[0].x} cy={-e.pts[0].y} r={e.r} {...common} style={st} />;
  if (e.t === 'arc') { const c = e.pts[0], r = e.r ?? 0; const a0 = e.a0 ?? 0, a1 = e.a1 ?? 0; const sw2 = ((a1 - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); const s = arcPt(c, r, a0), t = arcPt(c, r, a1);
    return <path d={`M${P(s)}A${r} ${r} 0 ${sw2 > Math.PI ? 1 : 0} 1 ${P(t)}`} {...common} style={st} />; }
  if (e.t === 'cloud') { const pts = cloudPts(e.pts, Math.max(h * 3, ft(0.75))); return <path d={`M${pts.map(P).join('L')}Z`} {...common} style={st} />; }
  if (e.t === 'text') { const lines = (e.text ?? '').split('\n'); const th = e.h ?? h; if (th * k < MIN_TEXT_PX) return null; const deg = -((e.rot ?? 0) * 180) / Math.PI; const x = e.pts[0].x, y = -e.pts[0].y;
    return <text x={x} y={y} fontSize={th} transform={deg ? `rotate(${deg.toFixed(2)} ${x} ${y})` : undefined} className={`tx ent t-ink mk ${cls}`} strokeWidth={th * 0.5} data-ent={e.id} data-t="text" style={tf}>{lines.map((s, i) => <tspan key={i} x={x} dy={i ? th * 1.45 : 0}>{s}</tspan>)}</text>; }
  if (e.t === 'leader') { const a = e.pts[0], b = e.pts[1] ?? a; const L0 = Math.hypot(b.x - a.x, b.y - a.y) || 1; const u = { x: (b.x - a.x) / L0, y: (b.y - a.y) / L0 }; const ah = (e.h ?? h) * 0.9; const w = ah * 0.33;
    const head = [a, { x: a.x + u.x * ah - u.y * w, y: a.y + u.y * ah + u.x * w }, { x: a.x + u.x * ah + u.y * w, y: a.y + u.y * ah - u.x * w }];
    const last = e.pts[e.pts.length - 1]; const prev = e.pts[e.pts.length - 2] ?? a; const right = last.x >= prev.x; const th = e.h ?? h;
    return <g className={`ent ${cls}`} data-ent={e.id} data-t="leader"><path d={`M${e.pts.map(P).join('L')}L${P({ x: last.x + (right ? th : -th), y: last.y })}`} {...common} style={st} />
      <path d={`M${head.map(P).join('L')}Z`} className={`t-ink f-ink ${cls}`} vectorEffect="non-scaling-stroke" strokeWidth={sw} style={{ fill: color, stroke: color }} />
      {th * k >= MIN_TEXT_PX && <text x={last.x + (right ? th * 1.3 : -th * 1.3)} y={-last.y} fontSize={th} dominantBaseline="central" textAnchor={right ? 'start' : 'end'} className={`tx t-ink mk ${cls}`} strokeWidth={th * 0.5} style={tf}>{e.text}</text>}</g>; }
  if (e.t === 'dim') { const g = dimGeom(e); const [a, b] = e.pts; const tk = h * 0.55; const di = { x: (g.u.x + g.n.x) / Math.SQRT2, y: (g.u.y + g.n.y) / Math.SQRT2 };
    // Same dimension style as the drawing (DIMSTY), in units of the 3/32" text height h.
    const gap = h * (DIMSTY.gap / DIMSTY.text), over = h * (DIMSTY.over / DIMSTY.text);
    const sgn = Math.sign(e.off ?? 1) || 1; const ext = (from: Pt, to: Pt) => { const dx = to.x - from.x, dy = to.y - from.y, L0 = Math.hypot(dx, dy); if (L0 < gap) return ''; const ux = dx / L0, uy = dy / L0; return `M${P({ x: from.x + ux * gap, y: from.y + uy * gap })}L${P({ x: to.x + ux * over, y: to.y + uy * over })}`; };
    const tick = (q: Pt) => `M${P({ x: q.x - di.x * tk, y: q.y - di.y * tk })}L${P({ x: q.x + di.x * tk, y: q.y + di.y * tk })}`;
    const d = `${ext(a, g.A)}${ext(b, g.B)}M${P({ x: g.A.x - g.u.x * gap, y: g.A.y - g.u.y * gap })}L${P({ x: g.B.x + g.u.x * gap, y: g.B.y + g.u.y * gap })}${tick(g.A)}${tick(g.B)}`;
    const lift = h * 0.5 + h * (DIMSTY.textGap / DIMSTY.text);
    const ang = readable(g.u); const r = (ang * Math.PI) / 180; const m = { x: (g.A.x + g.B.x) / 2, y: -(g.A.y + g.B.y) / 2 }; const tx = m.x + Math.sin(r) * lift, ty = m.y - Math.cos(r) * lift; void sgn;
    return <g className={`ent ${cls}`} data-ent={e.id} data-t="dim" data-dim={`${a.x.toFixed(0)},${a.y.toFixed(0)},${b.x.toFixed(0)},${b.y.toFixed(0)}`} data-src="user"><path d={d} {...common} style={st} /><text x={tx} y={ty} fontSize={h} textAnchor="middle" dominantBaseline="central" transform={`rotate(${ang.toFixed(2)} ${tx} ${ty})`} className={`tx t-ink mk ${cls}`} strokeWidth={h * 0.5} style={tf}>{e.text ?? fmtArch(g.len)}</text></g>; }
  return null;
}
const CadGraphics = memo(function CadGraphics({ ents, layers, colors, lwt, h, k = Infinity }: { ents: Ent[]; layers: Record<string, LayerState>; colors: Record<string, number>; lwt: boolean; h: number; k?: number }) {
  return <g className="cad">{ents.map(e => layers[e.layer]?.on === false ? null : <EntSvg key={e.id} e={e} h={h} k={k} lwt={lwt} color={layerColor(colors[e.layer] ?? 7)} />)}</g>;
});

/** Snap glyphs: endpoint square, midpoint triangle, intersection X, center circle, perpendicular mark, nearest hourglass, grid cross. */
function Glyph({ s, k }: { s: Snap; k: number }) {
  const r = 7 / k; const x = s.pt.x, y = -s.pt.y;
  const d = s.kind === 'end' ? `M${x - r} ${y - r}h${2 * r}v${2 * r}h${-2 * r}Z` : s.kind === 'mid' ? `M${x} ${y - r * 1.15}L${x + r} ${y + r * 0.7}L${x - r} ${y + r * 0.7}Z` : s.kind === 'int' ? `M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`
    : s.kind === 'perp' ? `M${x - r} ${y - r}V${y + r}H${x + r}M${x - r} ${y}H${x}V${y + r}` : s.kind === 'near' ? `M${x - r} ${y - r}H${x + r}L${x - r} ${y + r}H${x + r}Z` : s.kind === 'grid' || s.kind === 'polar' ? `M${x - r * 0.6} ${y}H${x + r * 0.6}M${x} ${y - r * 0.6}V${y + r * 0.6}` : '';
  return <g className="snapg" aria-hidden>{s.kind === 'cen' ? <circle cx={x} cy={y} r={r} vectorEffect="non-scaling-stroke" strokeWidth={2} fill="none" /> : <path d={d} vectorEffect="non-scaling-stroke" strokeWidth={2} fill="none" />}</g>;
}

/** The SVG is drawn this many px past each edge, so a pan can slide it with a GPU transform and settle the camera when it ends. */
const OVER = 360;
const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
type Drag = { kind: 'pan'; sx: number; sy: number; c: Cam } | { kind: 'move'; start: Project; from: Pt; what: Sel; moved: boolean } | { kind: 'grip'; start: Project; i: number; what: Sel } | { kind: 'box'; a: Pt; sx: number; sy: number; zoom: boolean };

export const Canvas = forwardRef<CanvasApi, CanvasProps>(function Canvas(P0, ref) {
  const { p, es, sheet, layers, lwt, dark, tool, sel, cmd } = P0;
  const host = useRef<HTMLDivElement>(null); const svg = useRef<SVGSVGElement>(null); const layer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const cams = useRef<Record<string, Cam>>({}); const touched = useRef(false); const [cam, setCamRaw] = useState<Cam | null>(null);
  const setCam = (c: Cam) => { cams.current[sheet] = c; setCamRaw(c); };
  /** A view change the user made: stop auto-fitting. */
  const setCamU = (c: Cam) => { touched.current = true; setCam(c); };
  const [hover, setHover] = useState<Snap | null>(null); const [cursor, setCursor] = useState<Pt | null>(null);
  const [box, setBox] = useState<{ a: Pt; b: Pt; zoom: boolean } | null>(null); const zoomWin = useRef(false);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>()); const pinch = useRef<null | { d: number; c: Cam; mx: number; my: number }>(null);
  const space = useRef(false); const pendingSel = useRef<{ s: Sel | null } | null>(null);
  const flushSel = () => { const q = pendingSel.current; pendingSel.current = null; if (q) P0.onSel(q.s); };
  const cadLayers = useMemo(() => p.cad?.layers ?? [], [p.cad?.layers]);
  const allLayers = useMemo(() => ({ ...layers, ...Object.fromEntries(cadLayers.map(l => [l.name, { on: l.on, locked: l.locked }])) }), [layers, cadLayers]);
  const colors = useMemo(() => Object.fromEntries(cadLayers.map(l => [l.name, l.color])), [cadLayers]);
  const locked = useMemo(() => new Set(Object.entries(allLayers).filter(([, v]) => v.locked || !v.on).map(([k]) => k)), [allLayers]);
  const ents = useMemo(() => p.cad?.ents ?? [], [p.cad?.ents]);

  useEffect(() => { const el = host.current; if (!el) return; const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height }); }); ro.observe(el); return () => ro.disconnect(); }, []);

  const paper = sheet !== 'model';
  const anno = useMemo(() => (cam && !paper ? annoScaleFor(cam.k) : SCALES[6]), [cam?.k, paper]); // eslint-disable-line react-hooks/exhaustive-deps
  const userDims = useMemo(() => ents.filter(e => e.t === 'dim' && e.pts.length >= 2).map(e => ({ a: e.pts[0], b: e.pts[1] })), [ents]);
  const site = useMemo(() => labelDrawing(draft(p, { anno: anno.k * 25.4, es, userDims }), anno.k * 25.4), [p, anno.k, es, P0.units, userDims]); // eslint-disable-line react-hooks/exhaustive-deps
  const sheetModel = useMemo(() => (paper ? screenSheet(p, sheet as 'a1' | 'a2' | 'g2', { es, userDims, markers: P0.issues.filter(i => i.at && i.n).map((i): Marker => ({ key: 'issue:' + i.id, n: String(i.n), at: i.at!, tone: i.status === 'FAIL' ? 'fix' as const : 'need' as const, text: `${i.r.rule.id} ${i.r.rule.title[es ? 'es' : 'en']}` }))
    .concat(p.markup.pins.map(x => ({ key: 'pin:' + x.id, n: 'R' + x.n, at: { x: x.x, y: x.y }, tone: x.status === 'open' ? 'rev' as const : 'done' as const, text: x.comment || '(no text)' }))) }) : null), [paper, sheet, p, es, P0.units, userDims, P0.issues]); // eslint-disable-line react-hooks/exhaustive-deps
  const extents = useMemo(() => { if (paper) return { minX: 0, minY: 0, maxX: sheetModel?.w ?? 36, maxY: sheetModel?.h ?? 24 }; const e = { ...site.extents }; for (const x of ents) for (const q of x.pts) { e.minX = Math.min(e.minX, q.x - ft(2)); e.maxX = Math.max(e.maxX, q.x + ft(2)); e.minY = Math.min(e.minY, -q.y - ft(2)); e.maxY = Math.max(e.maxY, -q.y + ft(2)); } return e; }, [paper, site.extents, ents, sheetModel?.w]);
  /** Zoom extents: the whole drawing with a margin (px) so dims at the edge are never cut off. */
  const fitCam = () => fit(extents, size.w, size.h, paper ? 20 : isTouch() ? 36 : 32);
  /** Zoom to the ADU with its dimensions: the default model view, since that is the work. */
  const aduCam = () => fit(site.focus, size.w, size.h, isTouch() ? 28 : 40);
  const auto = useRef<'adu' | 'extents'>('adu');
  const autoCam = () => (paper || auto.current === 'extents' ? fitCam() : aduCam());

  useEffect(() => { setCamRaw(cams.current[sheet] ?? (cams.current[sheet] = autoCam())); }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  // Until the user moves the view, it keeps fitting as the window or panels change size.
  useEffect(() => { if (!touched.current && size.w !== 800) setCam(autoCam()); }, [size, extents, site.focus.minX, site.focus.maxY]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = cam ?? fitCam(); const vb = viewBox(c, size.w + 2 * OVER, size.h + 2 * OVER);
  const kMin = paper ? 2 : 0.002, kMax = paper ? 400 : 3;
  const annoMm = anno.k * 25.4 * (3 / 32);

  const zoomTo = (q: Pt, span = ft(30)) => { if (paper) return; const k = Math.min(size.w, size.h) / span; setCamU({ cx: q.x, cy: -q.y, k: Math.min(kMax, k) }); };
  useImperativeHandle(ref, () => ({
    fit: () => { touched.current = false; auto.current = 'extents'; setCam(fitCam()); },
    zoomAdu: () => { touched.current = false; auto.current = 'adu'; setCam(paper ? fitCam() : aduCam()); },
    zoomSel: () => { const o = selPoly(); if (!o || paper) { setCamU(fitCam()); return; } const b = bbox(o); const m = ft(4); setCamU(fit({ minX: b.minX - m, maxX: b.maxX + m, minY: -b.maxY - m, maxY: -b.minY + m }, size.w, size.h, 48)); },
    zoomTo, zoomBy: f => setCamU(zoomAt(c, f, size.w / 2, size.h / 2, size.w, size.h, kMin, kMax)),
    zoomWindow: () => { zoomWin.current = true; P0.say(L('Drag a window to zoom to.')); },
  }));
  useEffect(() => { P0.onScale(paper && sheetModel ? (sheetModel.vps[0]?.scale.label ?? '') : anno.label, annoMm); }, [anno.label, paper, sheetModel]); // eslint-disable-line react-hooks/exhaustive-deps

  const hostRect = useRef<DOMRect | null>(null);
  const local = (e: { clientX: number; clientY: number }) => { const r = (drag.current?.kind === 'pan' && hostRect.current) || host.current!.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  const raf = useRef(0); const pend = useRef<[number, number]>([0, 0]);
  /** Slide the drawing layer on the GPU, at most once per frame. */
  const slide = (dx: number, dy: number, now = false) => { pend.current = [dx, dy]; const apply = () => { raf.current = 0; const el = layer.current; const [x, y] = pend.current; if (el) el.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : ''; }; if (now || !(dx || dy)) { if (raf.current) cancelAnimationFrame(raf.current); apply(); } else if (!raf.current) raf.current = requestAnimationFrame(apply); };
  const toModel = (sx: number, sy: number): Pt => { const u = toUnits(c, sx, sy, size.w, size.h); return { x: u.x, y: -u.y }; };
  const aperture = (isTouch() ? 22 : 12) / c.k;
  const selIds = useMemo(() => (sel?.kind === 'ents' ? sel.ids : []), [sel]);
  const snaps = useMemo(() => snapSet(p), [p]);
  const snapAt = (raw: Pt, from: Pt | null, moving?: { polys?: Poly[]; ids?: string[] }): Snap => {
    const set = moving ? snapSet(p, moving.polys ?? [], new Set(moving.ids ?? [])) : snaps;
    let s = snapPoint(raw, set, aperture, { from, osnap: P0.osnap, grid: P0.snapOn ? P0.snapInc : null });
    if (from && s.kind !== 'end' && s.kind !== 'mid' && s.kind !== 'int' && s.kind !== 'cen') {
      if (P0.orthoOn) s = { pt: ortho(from, s.pt), kind: s.kind };
      else if (P0.polarOn) { const q = polar(from, s.pt); if (q) s = { pt: q, kind: 'polar' }; }
    }
    return s;
  };

  // Check pins: on the non-plotting markup layer, each set off its object with a leader, laid out so no pin covers drawing text,
  // linework or another pin (see pins.ts). Layout is in px, recomputed when the zoom or drawing changes.
  const pinR = isTouch() ? 13 : 11;
  const pinsShown = useMemo(() => {
    if (paper && sheet !== 'g2') return [] as (PinOut & { mx: number; my: number; n: string; cls: string; label: string })[];
    const out: { key: string; at: Pt; n: string; cls: string; label: string }[] = [];
    if (layers['G-ANNO-REDL']?.on !== false) {
      P0.issues.forEach(i => { if (i.at && i.n) out.push({ key: 'issue:' + i.id, at: i.at, n: String(i.n), cls: i.status === 'FAIL' ? 'pin fix' : 'pin need', label: `${L('Check')} ${i.n}: ${i.r.rule.title[es ? 'es' : 'en']}` }); });
      p.markup.pins.forEach(x => out.push({ key: 'pin:' + x.id, at: { x: x.x, y: x.y }, n: 'R' + x.n, cls: x.status === 'open' ? 'pin rev' : 'pin done', label: `${L('Review note')} ${x.n}: ${x.comment || L('no text')}` }));
    }
    if (!out.length) return [];
    const on = (l: string) => allLayers[l]?.on !== false;
    const entSeg = ents.filter(e => on(e.layer)).flatMap(e => entSegs(e).map(([a, b]) => [a.x * c.k, -a.y * c.k, b.x * c.k, -b.y * c.k] as [number, number, number, number]));
    const entTxt = ents.filter(e => on(e.layer) && (e.t === 'text' || e.t === 'leader' || e.t === 'dim')).map(e => { const q = e.t === 'leader' ? e.pts[e.pts.length - 1] : e.pts[0]; const th = (e.h ?? annoMm) * c.k; const w = Math.max(1, (e.text ?? '00000000').length) * th * 0.62; return { x0: q.x * c.k - (e.t === 'leader' ? 0 : 0), y0: -q.y * c.k - th * 1.2, x1: q.x * c.k + w + th * 1.5, y1: -q.y * c.k + th * 1.2 }; ; }).concat(ents.filter(e => on(e.layer) && e.t === 'dim' && e.pts.length >= 2).map(e => { const g = dimGeom(e); const th = annoMm * c.k; const w = (e.text ?? fmtArch(g.len)).length * th * 0.7 + th; const mx = ((g.A.x + g.B.x) / 2) * c.k, my = (-(g.A.y + g.B.y) / 2) * c.k; const r = Math.max(w / 2, th * 1.6); return { x0: mx - r, y0: my - r, x1: mx + r, y1: my + r }; }));
    const obs = obstacles(site, c.k, on, MIN_TEXT_PX, { segs: entSeg, rects: entTxt });
    const placed = layoutPins(out.map(o => ({ key: o.key, ax: o.at.x * c.k, ay: -o.at.y * c.k })), obs, pinR);
    return placed.map((q, i) => ({ ...q, mx: out[i].at.x, my: out[i].at.y, n: out[i].n, cls: out[i].cls, label: out[i].label }));
  }, [P0.issues, p.markup.pins, layers, allLayers, paper, sheet, kBucketOf(c.k), es, site, ents]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinHit = (sx: number, sy: number): string | null => { for (const x of pinsShown) { const px = (x.mx - vb.x) * c.k + (x.x - x.ax) - OVER, py = (-x.my - vb.y) * c.k + (x.y - x.ay) - OVER; if (Math.hypot(px - sx, py - sy) <= pinR + (isTouch() ? 6 : 2)) return x.key; } return null; };

  function selPoly(): Poly | null { if (sel?.kind === 'ents') { const es2 = ents.filter(e => sel.ids.includes(e.id)); if (!es2.length) return null; const pts = es2.flatMap(e => e.t === 'circle' || e.t === 'arc' ? [{ x: e.pts[0].x - (e.r ?? 0), y: e.pts[0].y - (e.r ?? 0) }, { x: e.pts[0].x + (e.r ?? 0), y: e.pts[0].y + (e.r ?? 0) }] : e.pts); return pts; } return selOutline(p, sel); }
  // Grips: the single selected entity's points (circle: center and a radius grip), or the selected model object's corners.
  const grips: Pt[] = useMemo(() => {
    if (paper || !sel) return [];
    if (sel.kind === 'ents') { if (sel.ids.length !== 1) return []; const e = ents.find(x => x.id === sel.ids[0]); if (!e) return []; if (e.t === 'circle') return [e.pts[0], { x: e.pts[0].x + (e.r ?? 0), y: e.pts[0].y }]; if (e.t === 'arc') return [e.pts[0], ...entSnaps(e).end]; return e.pts; }
    if (sel.kind === 'pin' || sel.kind === 'issue' || sel.kind === 'lot' || sel.kind === 'house') return [];
    return selOutline(p, sel) ?? [];
  }, [p, sel, paper, ents]);

  const fbMin = () => { const b = bbox(p.adu.footprint); return { x: b.minX, y: b.minY }; };
  const moved = (base: Project, what: Sel, dx: number, dy: number): Project => {
    if (what.kind === 'ents') { const ids = new Set(what.ids); return { ...base, cad: base.cad ? { ...base.cad, ents: base.cad.ents.map(e => (ids.has(e.id) ? { ...e, pts: e.pts.map(q => ({ x: q.x + dx, y: q.y + dy })) } : e)) } : base.cad }; }
    if (what.kind === 'adu') return { ...base, adu: { ...base.adu, footprint: translate(base.adu.footprint, dx, dy) }, confirmed: { ...base.confirmed, adu: true } };
    if (what.kind === 'room') { const foot = footLocal(base); return { ...base, adu: { ...base.adu, rooms: base.adu.rooms.map(r => (r.id === what.id ? { ...r, poly: clampMove(r.poly, foot, dx, dy) } : r)) } }; }
    if (what.kind === 'opening') return { ...base, adu: { ...base.adu, rooms: base.adu.rooms.map(r => { if (r.id !== what.room) return r; return { ...r, openings: r.openings.map(o => { if (o.id !== what.id) return o; const a = r.poly[o.wall], b = r.poly[(o.wall + 1) % r.poly.length]; const L0 = Math.hypot(b.x - a.x, b.y - a.y) || 1; const t = (dx * (b.x - a.x) + dy * (b.y - a.y)) / L0; return { ...o, offsetMm: Math.max(0, Math.min(L0 - o.widthMm, o.offsetMm + t)) }; }) }; }) } };
    if (what.kind === 'pin') return { ...base, markup: { ...base.markup, pins: base.markup.pins.map(x => (x.id === what.id ? { ...x, x: x.x + dx, y: x.y + dy } : x)) } };
    return base;
  };
  const gripped = (base: Project, what: Sel, i: number, q: Pt): Project => {
    if (what.kind === 'ents') { const id = what.ids[0]; return { ...base, cad: base.cad ? { ...base.cad, ents: base.cad.ents.map(e => { if (e.id !== id) return e;
      if (e.t === 'circle') return i === 0 ? { ...e, pts: [q] } : { ...e, r: Math.max(1, Math.hypot(q.x - e.pts[0].x, q.y - e.pts[0].y)) };
      if (e.t === 'arc') { if (i === 0) return { ...e, pts: [q] }; const a = Math.atan2(q.y - e.pts[0].y, q.x - e.pts[0].x); return i === 1 ? { ...e, a0: a } : { ...e, a1: a }; }
      return { ...e, pts: e.pts.map((v, j) => (j === i ? q : v)) }; }) } : base.cad }; }
    if (what.kind === 'adu') { const fp = base.adu.footprint; const next = isAxisRect(fp) ? dragCorner(fp, i, q) : fp.map((v, j) => (j === i ? q : v));
      const b0 = bbox(fp), b1 = bbox(next); const rooms = base.adu.rooms.map(r => ({ ...r, poly: translate(r.poly, b0.minX - b1.minX, b0.minY - b1.minY) }));
      return { ...base, adu: { ...base.adu, footprint: next, rooms }, confirmed: { ...base.confirmed, adu: true } }; }
    if (what.kind === 'room') { const o = fbMin(); const lq = { x: q.x - o.x, y: q.y - o.y }; return { ...base, adu: { ...base.adu, rooms: base.adu.rooms.map(r => { if (r.id !== what.id) return r; const np = isAxisRect(r.poly) ? dragCorner(r.poly, i, lq) : r.poly.map((v, j) => (j === i ? lq : v)); return roomFits(np, footLocal(base)) ? { ...r, poly: np, tape: { w: null, d: null } } : r; }) } }; }
    if (what.kind === 'opening') { const r = base.adu.rooms.find(x => x.id === what.room); const o0 = r?.openings.find(x => x.id === what.id); if (!r || !o0) return base; const o = fbMin(); const a = r.poly[o0.wall], b = r.poly[(o0.wall + 1) % r.poly.length]; const L0 = Math.hypot(b.x - a.x, b.y - a.y) || 1; const t = ((q.x - o.x - a.x) * (b.x - a.x) + (q.y - o.y - a.y) * (b.y - a.y)) / L0;
      const end = o0.offsetMm + o0.widthMm; const op = i === 0 ? (() => { const s = Math.max(0, Math.min(end - inch(12), t)); return { offsetMm: s, widthMm: end - s }; })() : { widthMm: Math.max(inch(12), Math.min(L0 - o0.offsetMm, t - o0.offsetMm)) };
      return { ...base, adu: { ...base.adu, rooms: base.adu.rooms.map(x => (x.id !== r.id ? x : { ...x, openings: x.openings.map(y => (y.id === o0.id ? { ...y, ...op } : y)) })) } }; }
    return base;
  };
  /** Top-most thing under a point: drafting entity, then the model objects. */
  const hitAt = (q: Pt): Sel | null => { const tol = (isTouch() ? 14 : 6) / c.k; for (let i = ents.length - 1; i >= 0; i--) { const e = ents[i]; if (locked.has(e.layer)) continue; if (entDist(e, q) <= tol) return { kind: 'ents', ids: [e.id] }; } return hitTest(p, q, tol, locked); };

  const onDown = (e: React.PointerEvent) => {
    svg.current?.focus({ preventScroll: true });
    (e.target as Element).setPointerCapture?.(e.pointerId); const { sx, sy } = local(e); pointers.current.set(e.pointerId, { x: sx, y: sy });
    if (pointers.current.size === 2) { pendingSel.current = null; slide(0, 0); const [a, b] = [...pointers.current.values()]; pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), c, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag.current = null; setBox(null); return; }
    const raw = toModel(sx, sy);
    if (zoomWin.current && !paper) { zoomWin.current = false; drag.current = { kind: 'box', a: raw, sx, sy, zoom: true }; return; }
    if (e.button === 1 || tool === 'pan' || space.current || paper) { e.preventDefault(); hostRect.current = host.current!.getBoundingClientRect(); drag.current = { kind: 'pan', sx, sy, c }; return; }
    if (e.button !== 0) return;
    if (cmd.active && !cmd.selecting) { cmd.pick(snapAt(raw, cmd.base).pt); return; }
    const ph = pinHit(sx, sy);
    if (ph && !cmd.selecting) { if (ph.startsWith('issue:')) P0.onIssue(ph.slice(6)); else { const id = ph.slice(4); P0.onSel({ kind: 'pin', id }); drag.current = { kind: 'move', start: p, from: raw, what: { kind: 'pin', id }, moved: false }; } return; }
    const gi = cmd.selecting ? -1 : grips.findIndex(g => Math.hypot((g.x - raw.x) * c.k, (g.y - raw.y) * c.k) <= (isTouch() ? 18 : 8));
    if (gi >= 0 && sel) { drag.current = { kind: 'grip', start: p, i: gi, what: sel }; return; }
    const hit = hitAt(raw);
    if (!hit) { const lk = new Set(Object.entries(allLayers).filter(([, v]) => v.locked && v.on).map(([k2]) => k2)); const tol = (isTouch() ? 14 : 6) / c.k;
      const ln = lk.size ? lockedLayerAt(p, raw, tol, lk, ents.map(x => ({ layer: x.layer, dist: entDist(x, raw) }))) : null; if (ln) { P0.say(`${L('Layer is locked')}: ${ln}`); return; } }
    if (cmd.selecting) { if (hit) { if (hit.kind === 'ents') { const ids = [...new Set([...selIds, ...hit.ids])]; P0.onSel({ kind: 'ents', ids }); } else if (hit.kind === 'room') P0.onSel(hit); } else drag.current = { kind: 'box', a: raw, sx, sy, zoom: false }; return; }
    if (hit && hit.kind === 'ents' && e.shiftKey && sel?.kind === 'ents') { const has = sel.ids.includes(hit.ids[0]); P0.onSel({ kind: 'ents', ids: has ? sel.ids.filter(x => x !== hit.ids[0]) : [...sel.ids, hit.ids[0]] }); return; }
    if (hit && hit.kind === 'ents' && sel?.kind === 'ents' && sel.ids.includes(hit.ids[0])) { drag.current = { kind: 'move', start: p, from: snapAt(raw, null).pt, what: sel, moved: false }; return; }
    // On touch, a tap selects on lift (or once a drag starts), so the first finger of a pinch never selects what it lands on.
    if (e.pointerType === 'touch') pendingSel.current = { s: hit }; else P0.onSel(hit);
    if (hit && (hit.kind === 'adu' || hit.kind === 'room' || hit.kind === 'opening' || hit.kind === 'ents')) { drag.current = { kind: 'move', start: p, from: snapAt(raw, null).pt, what: hit, moved: false }; return; }
    // Empty space: a mouse drag is a window (left to right) or crossing (right to left) selection; a finger drag pans.
    hostRect.current = host.current!.getBoundingClientRect(); drag.current = e.pointerType === 'mouse' || e.pointerType === 'pen' ? { kind: 'box', a: raw, sx, sy, zoom: false } : { kind: 'pan', sx, sy, c };
  };
  const onMove = (e: React.PointerEvent) => {
    const { sx, sy } = local(e); if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: sx, y: sy });
    if (pinch.current && pointers.current.size >= 2) { const [a, b] = [...pointers.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const pc = pinch.current; const z = zoomAt(pc.c, d / pc.d, pc.mx, pc.my, size.w, size.h, kMin, kMax); const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; setCamU({ ...z, cx: z.cx - (mx - pc.mx) / z.k, cy: z.cy - (my - pc.my) / z.k }); return; }
    const raw = toModel(sx, sy); const dr = drag.current;
    if (dr?.kind === 'pan') { const dx = sx - dr.sx, dy = sy - dr.sy; if (Math.abs(dx) < OVER - 20 && Math.abs(dy) < OVER - 20) { slide(dx, dy); return; } slide(0, 0); const nc = { ...dr.c, cx: dr.c.cx - dx / dr.c.k, cy: dr.c.cy - dy / dr.c.k }; setCamU(nc); drag.current = { kind: 'pan', sx, sy, c: nc }; return; }
    if (dr?.kind === 'box') { if (Math.hypot(sx - dr.sx, sy - dr.sy) > 4) setBox({ a: dr.a, b: raw, zoom: dr.zoom }); return; }
    if (paper) { setCursor(null); P0.onCursor(null); return; }
    const mv = dr && (dr.kind === 'move' || dr.kind === 'grip') ? { polys: dr.what.kind === 'adu' ? [dr.start.adu.footprint] : [], ids: dr.what.kind === 'ents' ? dr.what.ids : [] } : undefined;
    const s = snapAt(raw, dr?.kind === 'move' ? dr.from : cmd.active ? cmd.base : null, mv); setHover(s.kind === 'none' ? null : s); setCursor(s.pt); P0.onCursor(s.pt); cmd.cursorSet(s.pt);
    if (dr?.kind === 'move') { const q = s.pt; const dx = q.x - dr.from.x, dy = q.y - dr.from.y; if (!dr.moved && Math.hypot(dx, dy) * c.k < 3) return; if (!dr.moved) flushSel(); dr.moved = true; P0.preview(moved(dr.start, dr.what, dx, dy)); }
    if (dr?.kind === 'grip') P0.preview(gripped(dr.start, dr.what, dr.i, s.pt));
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null;
    const dr = drag.current; drag.current = null; if (!pinch.current && pointers.current.size === 0) flushSel();
    if (dr?.kind === 'pan') { const { sx, sy } = local(e); slide(0, 0); if (sx !== dr.sx || sy !== dr.sy) setCamU({ ...dr.c, cx: dr.c.cx - (sx - dr.sx) / dr.c.k, cy: dr.c.cy - (sy - dr.sy) / dr.c.k }); }
    if (dr?.kind === 'move' && dr.moved) { P0.commit(dr.start, p); P0.say(L('Moved.')); }
    if (dr?.kind === 'grip') { P0.commit(dr.start, p); P0.say(L('Edited.')); }
    if (dr?.kind === 'box') { const b = box; setBox(null); if (!b) { if (!cmd.selecting) P0.onSel(null); return; }
      const bb = { minX: Math.min(b.a.x, b.b.x), maxX: Math.max(b.a.x, b.b.x), minY: Math.min(b.a.y, b.b.y), maxY: Math.max(b.a.y, b.b.y) };
      if (b.zoom) { setCamU(fit({ minX: bb.minX, maxX: bb.maxX, minY: -bb.maxY, maxY: -bb.minY }, size.w, size.h, 8)); return; }
      const crossing = b.b.x < b.a.x; const ids = ents.filter(x => !locked.has(x.layer) && inWindow(x, bb, crossing)).map(x => x.id);
      const all = cmd.selecting ? [...new Set([...selIds, ...ids])] : ids;
      if (!all.length) { const r = p.adu.rooms.find(rr => { const pl = selOutline(p, { kind: 'room', id: rr.id }); return pl && pl.every(q => q.x >= bb.minX && q.x <= bb.maxX && q.y >= bb.minY && q.y <= bb.maxY); }); P0.onSel(r ? { kind: 'room', id: r.id } : null); P0.say(r ? L('Room selected.') : L('Nothing selected.')); return; }
      P0.onSel({ kind: 'ents', ids: all }); P0.say(`${all.length} ${L('selected')}${crossing ? ` (${L('crossing')})` : ''}.`); }
  };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = host.current!.getBoundingClientRect(); const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)); setCamU(zoomAt(cams.current[sheet] ?? c, f, e.clientX - r.left, e.clientY - r.top, size.w, size.h, kMin, kMax)); };
  const wheelRef = useRef(onWheel); wheelRef.current = onWheel;
  useEffect(() => { const el = svg.current; if (!el) return; const h = (e: WheelEvent) => wheelRef.current(e); el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h); }, []);
  useEffect(() => { const d = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) space.current = e.type === 'keydown'; }; window.addEventListener('keydown', d); window.addEventListener('keyup', d); return () => { window.removeEventListener('keydown', d); window.removeEventListener('keyup', d); }; }, []);

  // Keyboard on the canvas: arrows nudge the selection by the snap increment (Shift: 1 ft) or pan the view; +/- zoom; [ ] cycle objects.
  const onKey = (e: React.KeyboardEvent) => {
    const m: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (m[e.key]) { e.preventDefault(); const st = e.shiftKey ? ft(1) : P0.snapInc;
      if (sel && !paper && (sel.kind === 'adu' || sel.kind === 'room' || sel.kind === 'opening' || sel.kind === 'pin' || sel.kind === 'ents')) { P0.commit(p, moved(p, sel, m[e.key][0] * st, m[e.key][1] * st)); P0.say(`${L('Moved')} ${fmtArch(st)}.`); }
      else setCamU({ ...c, cx: c.cx + m[e.key][0] * 60 / c.k, cy: c.cy - m[e.key][1] * 60 / c.k });
      return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setCamU(zoomAt(c, 1.25, size.w / 2, size.h / 2, size.w, size.h, kMin, kMax)); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); setCamU(zoomAt(c, 0.8, size.w / 2, size.h / 2, size.w, size.h, kMin, kMax)); }
    if (e.key === ']' || e.key === '[') { e.preventDefault(); const all: Sel[] = [{ kind: 'adu' }, ...p.adu.rooms.map(r => ({ kind: 'room', id: r.id }) as Sel), ...ents.map(x => ({ kind: 'ents', ids: [x.id] }) as Sel), { kind: 'house' }, { kind: 'lot' }]; const i = all.findIndex(x => selKey(x) === selKey(sel)); const n = all.length; const next = i < 0 ? (e.key === ']' ? 0 : n - 1) : (i + (e.key === ']' ? 1 : n - 1)) % n; P0.onSel(all[next]); }
    if (e.key === 'Enter' && cmd.active && !cmd.selecting && cursor) { e.preventDefault(); e.stopPropagation(); cmd.pick(cursor); }
  };

  // Grid: off when zoomed out past 1/16" = 1'-0" (it would only compete with the setbacks).
  const k = c.k; const gp = useMemo(() => (P0.gridOn && !paper && anno.k <= 192 ? gridPaths(vb, k) : null), [P0.gridOn, paper, vb.x, vb.y, vb.w, vb.h, k, anno.k]); // eslint-disable-line react-hooks/exhaustive-deps
  const kBucket = Math.pow(2, Math.floor(Math.log2(k) * 2) / 2); // never above k, so the minimum text size holds
  const selOut = !paper && sel && sel.kind !== 'ents' ? selOutline(p, sel) : null;
  const selEnts = useMemo(() => ents.filter(x => selIds.includes(x.id)), [ents, selIds]);
  const desc = es ? 'Lienzo de dibujo. Flechas: mover la selección (Mayús: 1 pie) o desplazar la vista. Más y menos: zoom. Corchetes: cambiar de objeto. Barra: línea de comandos.' : 'Drawing canvas. Arrows move the selection (Shift: 1 ft) or pan the view. Plus and minus zoom. Brackets cycle objects. Slash opens the command line.';
  const rubber = cmd.active && cmd.base && cursor ? { a: cmd.base, b: cursor } : null;

  return <div ref={host} className={`ms msd ${dark ? 'ms-dark' : 'ms-light'}${paper ? ' ms-paper' : ''} tool-${tool}${cmd.active ? ' tool-cmd' : ''}`} data-testid="viewport">
    <div ref={layer} className="ms-layer" style={{ left: -OVER, top: -OVER, width: size.w + 2 * OVER, height: size.h + 2 * OVER }}>
    <svg ref={svg} width={size.w + 2 * OVER} height={size.h + 2 * OVER} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" tabIndex={0} role="application" aria-roledescription={es ? 'lienzo CAD' : 'CAD canvas'}
      aria-label={`${L('Drawing')}: ${sheet === 'model' ? L('Model') : sheet.toUpperCase()}`} aria-description={desc}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { setCursor(null); setHover(null); P0.onCursor(null); }} onKeyDown={onKey} onContextMenu={e => e.preventDefault()}
      data-k={k.toFixed(5)} data-cx={c.cx.toFixed(1)} data-cy={c.cy.toFixed(1)}>
      {paper && sheetModel ? <SheetSvg sh={sheetModel} k={kBucket} /> : <>
        {gp && <g aria-hidden className="grid"><path d={gp.minor} className="g-mi" vectorEffect="non-scaling-stroke" /><path d={gp.major} className="g-ma" vectorEffect="non-scaling-stroke" /></g>}
        <Graphics d={site} layers={layers} lwt={lwt} k={kBucket} disp={lwDisp(anno.k)} />
        <CadGraphics ents={ents} layers={allLayers} colors={colors} lwt={lwt} h={annoMm} k={kBucket} />
      </>}
      {selEnts.map(x => <EntSvg key={'s' + x.id} e={x} h={annoMm} lwt={lwt} cls="hl" />)}
      {cmd.ghost.map((x, i) => <EntSvg key={'g' + i} e={x} h={annoMm} lwt={lwt} cls="ghost" />)}
      {rubber && <path aria-hidden className="rubberline" d={`M${rubber.a.x} ${-rubber.a.y}L${rubber.b.x} ${-rubber.b.y}`} vectorEffect="non-scaling-stroke" />}
      {selOut && <path aria-hidden className="selo" d={`M${selOut.map(q => `${q.x} ${-q.y}`).join('L')}${selOut.length > 2 ? 'Z' : ''}`} vectorEffect="non-scaling-stroke" />}
      {grips.map((g, i) => <rect key={i} aria-hidden className="grip" x={g.x - 5 / k} y={-g.y - 5 / k} width={10 / k} height={10 / k} vectorEffect="non-scaling-stroke" />)}
      {box && (() => { const x = Math.min(box.a.x, box.b.x), y = Math.min(-box.a.y, -box.b.y), w = Math.abs(box.b.x - box.a.x), h = Math.abs(box.b.y - box.a.y); const cross = !box.zoom && box.b.x < box.a.x; return <rect aria-hidden className={box.zoom ? 'zbox' : cross ? 'xbox' : 'wbox'} x={x} y={y} width={w} height={h} vectorEffect="non-scaling-stroke" />; })()}
      {pinsShown.length > 0 && <g className="markup" data-layer="G-ANNO-REDL" data-plot="no">{pinsShown.map(x => { const r = pinR / k; const ax = x.mx, ay = -x.my, cx = ax + (x.x - x.ax) / k, cy = ay + (x.y - x.ay) / k; /* offsets stay in px between layout passes */ const act = x.key === 'issue:' + P0.activeIssue || x.key === 'pin:' + (sel?.kind === 'pin' ? sel.id : '');
        const L0 = Math.hypot(cx - ax, cy - ay) || 1; const ex = cx - (cx - ax) / L0 * r, ey = cy - (cy - ay) / L0 * r;
        return <g key={x.key} className={x.cls + (act ? ' act' : '')} data-pin={x.key}><title>{x.label}</title><path className="pin-ld" d={`M${ax} ${ay}L${ex} ${ey}`} vectorEffect="non-scaling-stroke" /><circle className="pin-at" cx={ax} cy={ay} r={2.5 / k} /><circle cx={cx} cy={cy} r={act ? r * 1.15 : r} vectorEffect="non-scaling-stroke" /><text x={cx} y={cy} fontSize={(x.n.length > 2 ? 9 : 11) / k} textAnchor="middle" dominantBaseline="central">{x.n}</text></g>; })}</g>}
      {hover && !paper && <Glyph s={hover} k={k} />}
      {cursor && !paper && !isTouch() && <g aria-hidden className="xhair"><path d={`M${vb.x} ${-cursor.y}H${vb.x + vb.w}M${cursor.x} ${vb.y}V${vb.y + vb.h}`} vectorEffect="non-scaling-stroke" /><rect x={cursor.x - 4 / k} y={-cursor.y - 4 / k} width={8 / k} height={8 / k} vectorEffect="non-scaling-stroke" /></g>}
    </svg></div>
    <ul className="sr">{pinsShown.map(x => <li key={x.key}><button type="button" onClick={() => (x.key.startsWith('issue:') ? P0.onIssue(x.key.slice(6)) : P0.onSel({ kind: 'pin', id: x.key.slice(4) }))}>{x.label}</button></li>)}</ul>
  </div>;
});

const SH_TONE: Record<string, string> = { ink: '#16181b', exst: '#737a84', fix: '#c0261a', mute: '#5c6066', red: '#c0261a', green: '#1a7340', amber: '#ad7300' };
const SH_FILL: Record<string, string> = { poche: '#4a4f57', exst: '#e4e6e9', bg: '#ffffff', ink: '#16181b', red: '#c0261a', green: '#1a7340', amber: '#ad7300' };
const SH_DASH: Record<string, number[]> = { phantom: [0.3, 0.06, 0.06, 0.06, 0.06, 0.06], hidden: [0.1, 0.05], demo: [0.06, 0.04] };
/** Paper space: the sheet model (out/sheet.ts) drawn as is, in paper inches: the same geometry the PDF prints. Paper is always white. */
const SheetSvg = memo(function SheetSvg({ sh, k }: { sh: Sheet; k: number }) {
  return <g className="paper" data-sheet={sh.no} data-w={sh.w} data-h={sh.h} data-scale={sh.vps[0]?.scale.label ?? ''}>
    <rect x={0} y={0} width={sh.w} height={sh.h} className="pp-sheet" />
    {sh.items.map((it, i) => it.k === 'p'
      ? (it.stroke === false && (!it.fill || it.fill === 'none') ? null : <path key={i} d={it.d} data-layer={it.layer} data-g={it.g} fill={it.fill && it.fill !== 'none' ? SH_FILL[it.fill] : 'none'} stroke={it.stroke === false ? 'none' : SH_TONE[it.tone ?? 'ink']}
        strokeWidth={Math.max(0.6, (it.lw / 25.4) * k)} vectorEffect="non-scaling-stroke" strokeDasharray={it.dash ? SH_DASH[it.dash].map(v => v * k).join(' ') : undefined} strokeLinecap="round" strokeLinejoin="round" />)
      : <text key={i} x={it.x} y={it.y} fontSize={it.h} textAnchor={it.anchor ?? 'start'} transform={it.rot ? `rotate(${it.rot.toFixed(2)} ${it.x} ${it.y})` : undefined} className="sh-tx" fontWeight={it.bold ? 700 : 400}
        fill={it.white ? '#fff' : SH_TONE[it.tone ?? 'ink']} data-layer={it.layer} data-g={it.g} data-field={it.field}>{it.s}</text>)}
    {sh.dims.map((x, i) => <g key={'d' + i} data-dim={`${x.a.x.toFixed(0)},${x.a.y.toFixed(0)},${x.b.x.toFixed(0)},${x.b.y.toFixed(0)}`} data-src="sheet" />)}
  </g>;
});
export { LAYERS };
