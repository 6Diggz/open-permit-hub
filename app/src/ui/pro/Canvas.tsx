// Model-space viewport (and paper-space sheets) for the Pro workspace: SVG with a viewBox camera, adaptive grid, object
// snaps with glyphs, ortho and polar, window/crossing selection with grips, drafting entities, command points, check pins.
import { memo, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import type { Project } from '../../core/model';
import { bbox, translate, type Poly, type Pt } from '../../core/geom';
import { ft, inch } from '../../core/units';
import { footLocal, clampMove, roomFits } from '../../core/rooms';
import { type Ent, entDist, inWindow, arcPt, cloudPts, entSnaps } from '../../core/cad';
import { draft, annoScaleFor, fitScale, fmtArch, readable, type Drawing, type LayerId, LAYERS, SCALES } from './drafting';
import { fit, zoomAt, viewBox, gridPaths, snapPoint, snapSet, ortho, polar, hitTest, selOutline, selKey, isAxisRect, dragCorner, toUnits, type Cam, type Sel, type Snap } from './view';
import { dimGeom } from './cmd';
import type { Issue } from './issues';
import { L } from '../lang';

export type Tool = 'select' | 'pan' | 'cmd';
export type SheetId = 'model' | 'a1' | 'a2' | 'g2';
export interface LayerState { on: boolean; locked: boolean }
export interface CanvasApi { fit: () => void; zoomSel: () => void; zoomTo: (q: Pt, spanMm?: number) => void; zoomBy: (f: number) => void; zoomWindow: () => void }
export interface CanvasProps {
  p: Project; es: boolean; sheet: SheetId; layers: Record<string, LayerState>; lwt: boolean; dark: boolean; tool: Tool; units: string;
  osnap: boolean; orthoOn: boolean; polarOn: boolean; gridOn: boolean; snapOn: boolean; snapInc: number;
  sel: Sel | null; onSel: (s: Sel | null) => void; issues: Issue[]; activeIssue: string | null; onIssue: (id: string) => void;
  onCursor: (q: Pt | null) => void; onScale: (label: string, annoMm: number) => void; say: (msg: string) => void;
  preview: (next: Project) => void; commit: (start: Project, next: Project) => void;
  /** Command in progress: clicks become points; `base` drives ortho, polar and the rubber band. */ cmd: { active: boolean; selecting: boolean; base: Pt | null; ghost: Ent[]; cursorSet: (q: Pt | null) => void; pick: (q: Pt) => void };
}

const LW = (lw: number, on: boolean) => (on ? 0.5 + lw * 3 : 1);
const DASH: Record<string, string> = { phantom: '22 4 4 4 4 4', hidden: '7 4', demo: '5 3' };
/** Layer colors (index colors 1-6, 8; 7 = drawing ink, which flips with the theme). */
const ACI: Record<number, string> = { 1: '#e5484d', 2: '#d6a000', 3: '#2f9e44', 4: '#1c9fb5', 5: '#3b6fe0', 6: '#b44fc4', 8: '#8a9099' };
export const layerColor = (c: number) => ACI[c];

/** The drafting graphics, memoized on the model and display settings so panning never re-renders them. */
const Graphics = memo(function Graphics({ d, layers, lwt, k }: { d: Drawing; layers: Record<string, LayerState>; lwt: boolean; k: number }) {
  const on = (l: LayerId) => layers[l]?.on !== false;
  return <g className="gfx">
    {d.prims.map((x, i) => on(x.layer) ? <path key={i} d={x.d} className={`t-${x.tone ?? 'ink'} f-${x.fill ?? 'none'}`} strokeWidth={x.stroke === false ? 0 : LW(x.lw, lwt)} strokeDasharray={x.dash ? DASH[x.dash] : undefined} vectorEffect="non-scaling-stroke" fillRule="evenodd" data-layer={x.layer} /> : null)}
    {d.texts.map((t, i) => on(t.layer) && t.h * k >= 3.2 ? <text key={'t' + i} x={t.x} y={t.y} fontSize={t.h} textAnchor={t.anchor ?? 'start'} dominantBaseline={t.mid ? 'central' : undefined} transform={t.rot ? `rotate(${t.rot.toFixed(2)} ${t.x} ${t.y})` : undefined} className={`tx t-${t.tone ?? 'ink'}${t.bold ? ' b' : ''}`} data-layer={t.layer}>{t.s}</text> : null)}
  </g>;
});

const P = (q: Pt) => `${q.x.toFixed(1)} ${(-q.y).toFixed(1)}`;
/** One drafting entity as SVG (model y-up, drawn flipped). `h` is the annotation text height for dims and clouds. */
export function EntSvg({ e, h, lwt, cls = '', color }: { e: Ent; h: number; lwt: boolean; cls?: string; color?: string }) {
  const sw = LW(e.t === 'dim' ? 0.13 : e.t === 'text' ? 0.18 : 0.25, lwt); const st = { stroke: color, fill: 'none' } as const; const tf = { fill: color };
  const common = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: sw, className: `ent t-ink ${cls}`, 'data-ent': e.id, 'data-t': e.t };
  if (e.t === 'line' || e.t === 'pline') return <path d={`M${e.pts.map(P).join('L')}${e.closed ? 'Z' : ''}`} {...common} style={st} />;
  if (e.t === 'circle') return <circle cx={e.pts[0].x} cy={-e.pts[0].y} r={e.r} {...common} style={st} />;
  if (e.t === 'arc') { const c = e.pts[0], r = e.r ?? 0; const a0 = e.a0 ?? 0, a1 = e.a1 ?? 0; const sw2 = ((a1 - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); const s = arcPt(c, r, a0), t = arcPt(c, r, a1);
    return <path d={`M${P(s)}A${r} ${r} 0 ${sw2 > Math.PI ? 1 : 0} 1 ${P(t)}`} {...common} style={st} />; }
  if (e.t === 'cloud') { const pts = cloudPts(e.pts, Math.max(h * 3, ft(0.75))); return <path d={`M${pts.map(P).join('L')}Z`} {...common} style={st} />; }
  if (e.t === 'text') { const lines = (e.text ?? '').split('\n'); const th = e.h ?? h; const deg = -((e.rot ?? 0) * 180) / Math.PI; const x = e.pts[0].x, y = -e.pts[0].y;
    return <text x={x} y={y} fontSize={th} transform={deg ? `rotate(${deg.toFixed(2)} ${x} ${y})` : undefined} className={`tx ent t-ink ${cls}`} data-ent={e.id} data-t="text" style={tf}>{lines.map((s, i) => <tspan key={i} x={x} dy={i ? th * 1.45 : 0}>{s}</tspan>)}</text>; }
  if (e.t === 'leader') { const a = e.pts[0], b = e.pts[1] ?? a; const L0 = Math.hypot(b.x - a.x, b.y - a.y) || 1; const u = { x: (b.x - a.x) / L0, y: (b.y - a.y) / L0 }; const ah = (e.h ?? h) * 0.9; const w = ah * 0.33;
    const head = [a, { x: a.x + u.x * ah - u.y * w, y: a.y + u.y * ah + u.x * w }, { x: a.x + u.x * ah + u.y * w, y: a.y + u.y * ah - u.x * w }];
    const last = e.pts[e.pts.length - 1]; const prev = e.pts[e.pts.length - 2] ?? a; const right = last.x >= prev.x; const th = e.h ?? h;
    return <g className={`ent ${cls}`} data-ent={e.id} data-t="leader"><path d={`M${e.pts.map(P).join('L')}L${P({ x: last.x + (right ? th : -th), y: last.y })}`} {...common} style={st} />
      <path d={`M${head.map(P).join('L')}Z`} className={`t-ink f-ink ${cls}`} vectorEffect="non-scaling-stroke" strokeWidth={sw} style={{ fill: color, stroke: color }} />
      <text x={last.x + (right ? th * 1.3 : -th * 1.3)} y={-last.y} fontSize={th} dominantBaseline="central" textAnchor={right ? 'start' : 'end'} className={`tx t-ink ${cls}`} style={tf}>{e.text}</text></g>; }
  if (e.t === 'dim') { const g = dimGeom(e); const [a, b] = e.pts; const tk = h * 0.55; const di = { x: (g.u.x + g.n.x) / Math.SQRT2, y: (g.u.y + g.n.y) / Math.SQRT2 };
    const sgn = Math.sign(e.off ?? 1) || 1; const ext = (from: Pt, to: Pt) => { const dx = to.x - from.x, dy = to.y - from.y, L0 = Math.hypot(dx, dy); if (L0 < h * 0.7) return ''; const ux = dx / L0, uy = dy / L0; return `M${P({ x: from.x + ux * h * 0.6, y: from.y + uy * h * 0.6 })}L${P({ x: to.x + ux * h * 0.8, y: to.y + uy * h * 0.8 })}`; };
    const tick = (q: Pt) => `M${P({ x: q.x - di.x * tk, y: q.y - di.y * tk })}L${P({ x: q.x + di.x * tk, y: q.y + di.y * tk })}`;
    const d = `${ext(a, g.A)}${ext(b, g.B)}M${P({ x: g.A.x - g.u.x * h * 0.6, y: g.A.y - g.u.y * h * 0.6 })}L${P({ x: g.B.x + g.u.x * h * 0.6, y: g.B.y + g.u.y * h * 0.6 })}${tick(g.A)}${tick(g.B)}`;
    const ang = readable(g.u); const r = (ang * Math.PI) / 180; const m = { x: (g.A.x + g.B.x) / 2, y: -(g.A.y + g.B.y) / 2 }; const tx = m.x + Math.sin(r) * h * 0.75, ty = m.y - Math.cos(r) * h * 0.75; void sgn;
    return <g className={`ent ${cls}`} data-ent={e.id} data-t="dim"><path d={d} {...common} style={st} /><text x={tx} y={ty} fontSize={h} textAnchor="middle" dominantBaseline="central" transform={`rotate(${ang.toFixed(2)} ${tx} ${ty})`} className={`tx t-ink ${cls}`} style={tf}>{e.text ?? fmtArch(g.len)}</text></g>; }
  return null;
}
const CadGraphics = memo(function CadGraphics({ ents, layers, colors, lwt, h }: { ents: Ent[]; layers: Record<string, LayerState>; colors: Record<string, number>; lwt: boolean; h: number }) {
  return <g className="cad">{ents.map(e => layers[e.layer]?.on === false ? null : <EntSvg key={e.id} e={e} h={h} lwt={lwt} color={layerColor(colors[e.layer] ?? 7)} />)}</g>;
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
  const space = useRef(false);
  const cadLayers = useMemo(() => p.cad?.layers ?? [], [p.cad?.layers]);
  const allLayers = useMemo(() => ({ ...layers, ...Object.fromEntries(cadLayers.map(l => [l.name, { on: l.on, locked: l.locked }])) }), [layers, cadLayers]);
  const colors = useMemo(() => Object.fromEntries(cadLayers.map(l => [l.name, l.color])), [cadLayers]);
  const locked = useMemo(() => new Set(Object.entries(allLayers).filter(([, v]) => v.locked || !v.on).map(([k]) => k)), [allLayers]);
  const ents = useMemo(() => p.cad?.ents ?? [], [p.cad?.ents]);

  useEffect(() => { const el = host.current; if (!el) return; const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height }); }); ro.observe(el); return () => ro.disconnect(); }, []);

  const paper = sheet !== 'model';
  const anno = useMemo(() => (cam && !paper ? annoScaleFor(cam.k) : SCALES[6]), [cam?.k, paper]); // eslint-disable-line react-hooks/exhaustive-deps
  const site = useMemo(() => draft(p, { anno: anno.k * 25.4, es }), [p, anno.k, es, P0.units]); // eslint-disable-line react-hooks/exhaustive-deps
  const sheetDef = useMemo(() => {
    if (!paper) return null;
    const fb = bbox(p.adu.footprint); const pad = ft(6);
    const win = sheet === 'a2' ? { minX: fb.minX - pad, maxX: fb.maxX + pad, minY: -(fb.maxY + pad), maxY: -(fb.minY - pad) } : site.extents;
    const vw = 28, vh = 21; const sc = fitScale(win.maxX - win.minX, win.maxY - win.minY, vw, vh);
    const mmPerIn = sc.k * 25.4; const cx = (win.minX + win.maxX) / 2, cy = (win.minY + win.maxY) / 2;
    return { sc, model: { x: cx - (vw / 2) * mmPerIn, y: cy - (vh / 2) * mmPerIn, w: vw * mmPerIn, h: vh * mmPerIn }, vp: { x: 1, y: 1.5, w: vw, h: vh } };
  }, [paper, sheet, p, site.extents]);
  const sheetDraw = useMemo(() => (sheetDef ? draft(p, { anno: sheetDef.sc.k * 25.4, es }) : null), [sheetDef, p, es, P0.units]); // eslint-disable-line react-hooks/exhaustive-deps
  const extents = useMemo(() => { if (paper) return { minX: 0, minY: 0, maxX: 36, maxY: 24 }; const e = { ...site.extents }; for (const x of ents) for (const q of x.pts) { e.minX = Math.min(e.minX, q.x - ft(2)); e.maxX = Math.max(e.maxX, q.x + ft(2)); e.minY = Math.min(e.minY, -q.y - ft(2)); e.maxY = Math.max(e.maxY, -q.y + ft(2)); } return e; }, [paper, site.extents, ents]);
  const fitCam = () => fit(extents, size.w, size.h, paper ? 20 : 28);

  useEffect(() => { setCamRaw(cams.current[sheet] ?? (cams.current[sheet] = fitCam())); }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  // Until the user moves the view, it keeps fitting the drawing as the window or panels change size.
  useEffect(() => { if (!touched.current && size.w !== 800) setCam(fitCam()); }, [size, extents]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = cam ?? fitCam(); const vb = viewBox(c, size.w + 2 * OVER, size.h + 2 * OVER);
  const kMin = paper ? 2 : 0.002, kMax = paper ? 400 : 3;
  const annoMm = anno.k * 25.4 * (3 / 32);

  const zoomTo = (q: Pt, span = ft(30)) => { if (paper) return; const k = Math.min(size.w, size.h) / span; setCamU({ cx: q.x, cy: -q.y, k: Math.min(kMax, k) }); };
  useImperativeHandle(ref, () => ({
    fit: () => { touched.current = false; setCam(fitCam()); },
    zoomSel: () => { const o = selPoly(); if (!o || paper) { setCamU(fitCam()); return; } const b = bbox(o); const m = ft(4); setCamU(fit({ minX: b.minX - m, maxX: b.maxX + m, minY: -b.maxY - m, maxY: -b.minY + m }, size.w, size.h, 48)); },
    zoomTo, zoomBy: f => setCamU(zoomAt(c, f, size.w / 2, size.h / 2, size.w, size.h, kMin, kMax)),
    zoomWindow: () => { zoomWin.current = true; P0.say(L('Drag a window to zoom to.')); },
  }));
  useEffect(() => { P0.onScale(paper && sheetDef ? sheetDef.sc.label : anno.label, annoMm); }, [anno.label, paper, sheetDef]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const pinsShown = useMemo(() => {
    if (paper && sheet !== 'g2') return [];
    const out: { key: string; at: Pt; n: string; cls: string; label: string; dx: number }[] = [];
    if (layers['G-ANNO-REDL']?.on !== false) {
      P0.issues.forEach(i => { if (i.at && i.n) out.push({ key: 'issue:' + i.id, at: i.at, n: String(i.n), cls: i.status === 'FAIL' ? 'pin fix' : 'pin need', label: `${L('Check')} ${i.n}: ${i.r.rule.title[es ? 'es' : 'en']}`, dx: 0 }); });
      p.markup.pins.forEach(x => out.push({ key: 'pin:' + x.id, at: { x: x.x, y: x.y }, n: 'R' + x.n, cls: x.status === 'open' ? 'pin rev' : 'pin done', label: `${L('Review note')} ${x.n}: ${x.comment || L('no text')}`, dx: 0 }));
    }
    const seen = new Map<string, number>(); const cell = 26 / c.k;
    out.forEach(o => { const k = `${Math.round(o.at.x / cell)},${Math.round(o.at.y / cell)}`; const n = seen.get(k) ?? 0; seen.set(k, n + 1); o.dx = n * 24; });
    return out;
  }, [P0.issues, p.markup.pins, layers, paper, sheet, c.k, es]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinHit = (sx: number, sy: number): string | null => { for (const x of pinsShown) { const px = (x.at.x - vb.x) * c.k + x.dx - OVER, py = (-x.at.y - vb.y) * c.k - OVER; if (Math.hypot(px - sx, py - sy) <= (isTouch() ? 18 : 13)) return x.key; } return null; };

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
    if (pointers.current.size === 2) { slide(0, 0); const [a, b] = [...pointers.current.values()]; pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), c, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag.current = null; setBox(null); return; }
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
    if (cmd.selecting) { if (hit) { if (hit.kind === 'ents') { const ids = [...new Set([...selIds, ...hit.ids])]; P0.onSel({ kind: 'ents', ids }); } else if (hit.kind === 'room') P0.onSel(hit); } else drag.current = { kind: 'box', a: raw, sx, sy, zoom: false }; return; }
    if (hit && hit.kind === 'ents' && e.shiftKey && sel?.kind === 'ents') { const has = sel.ids.includes(hit.ids[0]); P0.onSel({ kind: 'ents', ids: has ? sel.ids.filter(x => x !== hit.ids[0]) : [...sel.ids, hit.ids[0]] }); return; }
    if (hit && hit.kind === 'ents' && sel?.kind === 'ents' && sel.ids.includes(hit.ids[0])) { drag.current = { kind: 'move', start: p, from: snapAt(raw, null).pt, what: sel, moved: false }; return; }
    P0.onSel(hit);
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
    if (dr?.kind === 'move') { const q = s.pt; const dx = q.x - dr.from.x, dy = q.y - dr.from.y; if (!dr.moved && Math.hypot(dx, dy) * c.k < 3) return; dr.moved = true; P0.preview(moved(dr.start, dr.what, dx, dy)); }
    if (dr?.kind === 'grip') P0.preview(gripped(dr.start, dr.what, dr.i, s.pt));
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null;
    const dr = drag.current; drag.current = null;
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

  const k = c.k; const gp = useMemo(() => (P0.gridOn && !paper ? gridPaths(vb, k) : null), [P0.gridOn, paper, vb.x, vb.y, vb.w, vb.h, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const kBucket = Math.pow(2, Math.round(Math.log2(k) * 2) / 2);
  const selOut = !paper && sel && sel.kind !== 'ents' ? selOutline(p, sel) : null;
  const selEnts = useMemo(() => ents.filter(x => selIds.includes(x.id)), [ents, selIds]);
  const desc = es ? 'Lienzo de dibujo. Flechas: mover la selección (Mayús: 1 pie) o desplazar la vista. Más y menos: zoom. Corchetes: cambiar de objeto. Barra: línea de comandos.' : 'Drawing canvas. Arrows move the selection (Shift: 1 ft) or pan the view. Plus and minus zoom. Brackets cycle objects. Slash opens the command line.';
  const rubber = cmd.active && cmd.base && cursor ? { a: cmd.base, b: cursor } : null;

  return <div ref={host} className={`ms ${dark ? 'ms-dark' : 'ms-light'}${paper ? ' ms-paper' : ''} tool-${tool}${cmd.active ? ' tool-cmd' : ''}`} data-testid="viewport">
    <div ref={layer} className="ms-layer" style={{ left: -OVER, top: -OVER, width: size.w + 2 * OVER, height: size.h + 2 * OVER }}>
    <svg ref={svg} width={size.w + 2 * OVER} height={size.h + 2 * OVER} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" tabIndex={0} role="application" aria-roledescription={es ? 'lienzo CAD' : 'CAD canvas'}
      aria-label={`${L('Drawing')}: ${sheet === 'model' ? L('Model') : sheet.toUpperCase()}`} aria-description={desc}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { setCursor(null); setHover(null); P0.onCursor(null); }} onKeyDown={onKey} onContextMenu={e => e.preventDefault()}
      data-k={k.toFixed(5)} data-cx={c.cx.toFixed(1)} data-cy={c.cy.toFixed(1)}>
      {paper && sheetDef && sheetDraw ? <SheetFrame p={p} es={es} sheet={sheet} def={sheetDef} d={sheetDraw} layers={allLayers} colors={colors} lwt={lwt} k={k} issues={P0.issues} /> : <>
        {gp && <g aria-hidden className="grid"><path d={gp.minor} className="g-mi" vectorEffect="non-scaling-stroke" /><path d={gp.major} className="g-ma" vectorEffect="non-scaling-stroke" /></g>}
        <Graphics d={site} layers={layers} lwt={lwt} k={kBucket} />
        <CadGraphics ents={ents} layers={allLayers} colors={colors} lwt={lwt} h={annoMm} />
      </>}
      {selEnts.map(x => <EntSvg key={'s' + x.id} e={x} h={annoMm} lwt={lwt} cls="hl" />)}
      {cmd.ghost.map((x, i) => <EntSvg key={'g' + i} e={x} h={annoMm} lwt={lwt} cls="ghost" />)}
      {rubber && <path aria-hidden className="rubberline" d={`M${rubber.a.x} ${-rubber.a.y}L${rubber.b.x} ${-rubber.b.y}`} vectorEffect="non-scaling-stroke" />}
      {selOut && <path aria-hidden className="selo" d={`M${selOut.map(q => `${q.x} ${-q.y}`).join('L')}${selOut.length > 2 ? 'Z' : ''}`} vectorEffect="non-scaling-stroke" />}
      {grips.map((g, i) => <rect key={i} aria-hidden className="grip" x={g.x - 5 / k} y={-g.y - 5 / k} width={10 / k} height={10 / k} vectorEffect="non-scaling-stroke" />)}
      {box && (() => { const x = Math.min(box.a.x, box.b.x), y = Math.min(-box.a.y, -box.b.y), w = Math.abs(box.b.x - box.a.x), h = Math.abs(box.b.y - box.a.y); const cross = !box.zoom && box.b.x < box.a.x; return <rect aria-hidden className={box.zoom ? 'zbox' : cross ? 'xbox' : 'wbox'} x={x} y={y} width={w} height={h} vectorEffect="non-scaling-stroke" />; })()}
      {pinsShown.map(x => { const r = (isTouch() ? 13 : 11) / k; const cx = x.at.x + x.dx / k, cy = -x.at.y; const act = x.key === 'issue:' + P0.activeIssue || x.key === 'pin:' + (sel?.kind === 'pin' ? sel.id : '');
        return <g key={x.key} className={x.cls + (act ? ' act' : '')} data-pin={x.key}><title>{x.label}</title><circle cx={cx} cy={cy} r={act ? r * 1.2 : r} vectorEffect="non-scaling-stroke" /><text x={cx} y={cy} fontSize={(x.n.length > 2 ? 9 : 11) / k} textAnchor="middle" dominantBaseline="central">{x.n}</text></g>; })}
      {hover && !paper && <Glyph s={hover} k={k} />}
      {cursor && !paper && !isTouch() && <g aria-hidden className="xhair"><path d={`M${vb.x} ${-cursor.y}H${vb.x + vb.w}M${cursor.x} ${vb.y}V${vb.y + vb.h}`} vectorEffect="non-scaling-stroke" /><rect x={cursor.x - 4 / k} y={-cursor.y - 4 / k} width={8 / k} height={8 / k} vectorEffect="non-scaling-stroke" /></g>}
    </svg></div>
    <ul className="sr">{pinsShown.map(x => <li key={x.key}><button type="button" onClick={() => (x.key.startsWith('issue:') ? P0.onIssue(x.key.slice(6)) : P0.onSel({ kind: 'pin', id: x.key.slice(4) }))}>{x.label}</button></li>)}</ul>
  </div>;
});

/** Paper space: a 36" x 24" sheet with border, title block and a scaled viewport onto the model. Paper is always white. */
function SheetFrame({ p, es, sheet, def, d, layers, colors, lwt, issues }: { p: Project; es: boolean; sheet: SheetId; def: { sc: { label: string; k: number }; model: { x: number; y: number; w: number; h: number }; vp: { x: number; y: number; w: number; h: number } }; d: Drawing; layers: Record<string, LayerState>; colors: Record<string, number>; lwt: boolean; k?: number; issues: Issue[] }) {
  const title = sheet === 'a1' ? (es ? 'PLANO DEL SITIO' : 'SITE PLAN') : sheet === 'a2' ? (es ? 'PLANTA' : 'FLOOR PLAN') : (es ? 'MARCAS DE REVISIÓN' : 'REVIEW MARKUP');
  const no = sheet === 'a1' ? 'A-1' : sheet === 'a2' ? 'A-2' : 'G-2'; const h = def.sc.k * 25.4 * (3 / 32);
  const tb = 30; const row = (y: number, label: string, value: string) => <g><line x1={tb} y1={y - 0.3} x2={35.5} y2={y - 0.3} className="pp-thin" vectorEffect="non-scaling-stroke" /><text x={tb + 0.2} y={y} fontSize={0.13} className="pp-l">{label}</text><text x={tb + 0.2} y={y + 0.42} fontSize={0.24} className="pp-v">{value}</text></g>;
  const open = issues.filter(i => i.n);
  return <g className="paper">
    <rect x={0} y={0} width={36} height={24} className="pp-sheet" />
    <rect x={0.5} y={0.5} width={35} height={23} className="pp-border" vectorEffect="non-scaling-stroke" />
    <line x1={tb} y1={0.5} x2={tb} y2={23.5} className="pp-border" vectorEffect="non-scaling-stroke" />
    <svg x={def.vp.x} y={def.vp.y} width={def.vp.w} height={def.vp.h} viewBox={`${def.model.x} ${def.model.y} ${def.model.w} ${def.model.h}`} className="pp-vp">
      <Graphics d={d} layers={sheet === 'g2' ? layers : { ...layers, 'G-ANNO-REDL': { on: false, locked: false } }} lwt={lwt} k={Infinity} />
      <CadGraphics ents={p.cad?.ents ?? []} layers={layers} colors={colors} lwt={lwt} h={h} />
      {sheet === 'g2' && open.map(i => i.at && <g key={i.id} className={i.status === 'FAIL' ? 'pin fix' : 'pin need'}><circle cx={i.at.x} cy={-i.at.y} r={def.sc.k * 25.4 * 0.16} /><text x={i.at.x} y={-i.at.y} fontSize={def.sc.k * 25.4 * 0.17} textAnchor="middle" dominantBaseline="central">{i.n}</text></g>)}
      {sheet === 'g2' && p.markup.pins.map(x => <g key={x.id} className={x.status === 'open' ? 'pin rev' : 'pin done'}><circle cx={x.x} cy={-x.y} r={def.sc.k * 25.4 * 0.16} /><text x={x.x} y={-x.y} fontSize={def.sc.k * 25.4 * 0.14} textAnchor="middle" dominantBaseline="central">R{x.n}</text></g>)}
    </svg>
    <circle cx={def.vp.x + 0.35} cy={def.vp.y + def.vp.h + 0.55} r={0.3} className="pp-border" vectorEffect="non-scaling-stroke" /><text x={def.vp.x + 0.35} y={def.vp.y + def.vp.h + 0.55} fontSize={0.22} textAnchor="middle" dominantBaseline="central" className="pp-v b">1</text>
    <text x={def.vp.x + 0.85} y={def.vp.y + def.vp.h + 0.55} fontSize={0.3} className="pp-v b">{title}</text>
    <text x={def.vp.x + 0.85} y={def.vp.y + def.vp.h + 0.9} fontSize={0.18} className="pp-l">{(es ? 'ESCALA: ' : 'SCALE: ') + def.sc.label}</text>
    {row(1.1, es ? 'PROYECTO' : 'PROJECT', (p.name || '').slice(0, 34))}
    {row(2.0, es ? 'DIRECCIÓN' : 'ADDRESS', (p.site.address || (es ? 'Sin dirección' : 'No address yet')).slice(0, 34))}
    {row(2.9, 'APN', p.site.apn || '—')}
    {row(3.8, es ? 'ZONA' : 'ZONE', p.site.zone || '—')}
    {row(4.7, es ? 'PREPARADO POR' : 'PREPARED BY', p.people.preparerName || (es ? 'Sin nombre' : 'Not named yet'))}
    {sheet === 'g2' && <g>{[...open.slice(0, 18).map(i => `${i.n}. ${i.r.rule.id} ${i.r.rule.title[es ? 'es' : 'en']}`), ...p.markup.pins.slice(0, 12).map(x => `R${x.n}. ${x.comment || '—'}`)].map((s, i) => <text key={i} x={tb + 0.2} y={6 + i * 0.36} fontSize={0.16} className="pp-v">{s.slice(0, 44)}</text>)}</g>}
    <text x={tb + 0.2} y={20.7} fontSize={0.15} className="pp-l">{es ? 'BORRADOR. REVISIÓN POR SOFTWARE, NO DE LA CIUDAD.' : 'DRAFT. SOFTWARE CHECK, NOT A CITY REVIEW.'}</text>
    <line x1={tb} y1={21.2} x2={35.5} y2={21.2} className="pp-border" vectorEffect="non-scaling-stroke" />
    <text x={tb + 0.2} y={21.6} fontSize={0.13} className="pp-l">{es ? 'HOJA' : 'SHEET'}</text>
    <text x={tb + 0.15} y={23.1} fontSize={1.2} className="pp-v b">{no}</text>
  </g>;
}
export { LAYERS };
