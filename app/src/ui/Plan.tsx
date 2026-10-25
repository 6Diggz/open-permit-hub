import { useEffect, useRef, useState } from 'react';
import type { Project } from '../core/model';
import { bbox, clearanceToEdge, translate } from '../core/geom';
import { ft, inch } from '../core/units';
import { draft, annoScaleFor, fmtArch as fmtFtIn } from './pro/drafting';
import { Graphics, lwDisp } from './pro/graphics';

export interface PinView { sel: string | null; onSelect: (id: string | null) => void; placing: string | false; onPlace: (x: number, y: number) => void; zoom: boolean }
export function Plan({ p, onMove, es = false, pins }: { p: Project; es?: boolean; onMove: (dx: number, dy: number, commit: boolean) => void; pins?: PinView }) {
  const svg = useRef<SVGSVGElement>(null); const drag = useRef<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState('');
  const lot = p.site.lot; const b = bbox(lot); const pad = ft(14);
  // Same renderer, pen table and dimension style as the Pro workspace (Guided = the same drawing with the tools hidden).
  const [pxW, setPxW] = useState(560);
  useEffect(() => { const el = svg.current; if (!el || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(() => { if (el.clientWidth > 0) setPxW(el.clientWidth); }); ro.observe(el); return () => ro.disconnect(); }, []);
  const roughK = pxW / (b.maxX - b.minX + ft(60)); const anno = annoScaleFor(roughK, 11);
  const dr = draft(p, { anno: anno.k * 25.4, es, detail: 'site', sheetAnno: true });
  const ex = dr.extents; const full = { x: ex.minX, y: ex.minY, w: ex.maxX - ex.minX, h: ex.maxY - ex.minY };
  // y up in model -> flip for SVG (the drawing's screen frame)
  const Y = (y: number) => -y;
  // Zoom to the selected review pin (a 30 ft window), so a long comment list maps back to one spot.
  const zp = pins?.zoom && pins.sel ? p.markup.pins.find(x => x.id === pins.sel) : undefined;
  const vb = zp ? { x: zp.x - ft(15), y: Y(zp.y) - ft(15), w: ft(30), h: ft(30) } : full;
  const pts = (pl: { x: number; y: number }[]) => pl.map(q => `${q.x},${Y(q.y)}`).join(' ');
  const s = Math.max(vb.w, vb.h) / 520; const ps = s; // stroke/text unit tuned to on-screen size
  const toModel = (e: React.PointerEvent) => { const m = svg.current!.getScreenCTM()!.inverse(); const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return { x: pt.x, y: Y(pt.y) }; };
  const fp = p.adu.footprint; const fb = bbox(fp); 
  const dims = lot.map((a, i) => ({ i, d: clearanceToEdge(fp, lot, i), a, b: lot[(i + 1) % lot.length] }));
  // Keyboard placing (WCAG 2.1.1): while a note is being placed, arrows move a crosshair (1 ft, Shift 10 ft) and Enter drops it.
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null);
  const placing = pins?.placing ?? false;
  useEffect(() => {
    if (!placing || !pins) { setCur(null); return; }
    const from = typeof placing === 'string' && placing !== 'new' ? p.markup.pins.find(x => x.id === placing) : undefined;
    let c = from ? { x: from.x, y: from.y } : { x: (fb.minX + fb.maxX) / 2, y: (fb.minY + fb.maxY) / 2 }; setCur(c);
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const st = e.shiftKey ? ft(10) : ft(1); const m: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
      if (m[e.key]) { e.preventDefault(); e.stopPropagation(); c = { x: Math.max(b.minX - pad, Math.min(b.maxX + pad, c.x + m[e.key][0])), y: Math.max(b.minY - pad, Math.min(b.maxY + pad, c.y + m[e.key][1])) }; setCur(c); setLive(es ? 'Marca movida. Pulse Enter para colocar la nota.' : 'Marker moved. Press Enter to put the note here.'); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pins.onPlace(c.x, c.y); }
    };
    document.addEventListener('keydown', on, true); return () => document.removeEventListener('keydown', on, true);
  }, [placing]); // eslint-disable-line react-hooks/exhaustive-deps
  const say = () => setLive(dims.filter(d => d.i !== p.site.streetEdge).map(d => fmtFtIn(d.d)).join(', '));
  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? ft(1) : inch(6); const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (m[e.key]) { e.preventDefault(); onMove(m[e.key][0], m[e.key][1], true); say(); }
  };
  return (
    <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="group" aria-label={es ? 'Plano del lote. El ADU se puede mover con las flechas cuando está seleccionado.' : 'Site plan. The ADU can be moved with arrow keys when focused.'}
      style={{ userSelect: 'none', ...(pins?.placing ? { cursor: 'crosshair' } : {}) }}
      onPointerDown={e => { if (!pins?.placing) return; e.preventDefault(); const m = toModel(e); pins.onPlace(m.x, m.y); }}>
      <defs><pattern id="hatch" width={ft(1.2)} height={ft(1.2)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2={ft(1.2)} stroke="currentColor" strokeWidth={s * 0.8} opacity=".35" /></pattern></defs>
      <g color="var(--ink)">
        <g className="msd ms-light"><Graphics d={dr} layers={{}} lwt k={Math.pow(2, Math.floor(Math.log2(pxW / full.w) * 2) / 2)} disp={lwDisp(anno.k)} /></g>
        <polygon points={pts(fp)} fill="var(--acc, #1559d6)" fillOpacity=".06" stroke="var(--acc, #1559d6)" strokeWidth={s * 1.6} strokeDasharray={`${s * 6} ${s * 4}`} tabIndex={0} role="button"
          aria-label={es ? `Huella del ADU. Distancias a los linderos laterales y trasero: ${dims.filter(d => d.i !== p.site.streetEdge).map(d => fmtFtIn(d.d)).join(', ')}. Las flechas mueven 6 pulgadas, Mayús mueve 1 pie.` : `ADU footprint. Distances to side and rear lines: ${dims.filter(d => d.i !== p.site.streetEdge).map(d => fmtFtIn(d.d)).join(', ')}. Arrow keys move 6 inches, Shift moves 1 foot.`}
          style={{ cursor: 'grab' }} onKeyDown={key}
          onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = toModel(e); }}
          onPointerMove={e => { if (!drag.current) return; const m = toModel(e); onMove(m.x - drag.current.x, m.y - drag.current.y, false); drag.current = m; }}
          onPointerUp={() => { if (drag.current) { onMove(0, 0, true); say(); } drag.current = null; }} />
        {cur && <g pointerEvents="none" aria-hidden><circle cx={cur.x} cy={Y(cur.y)} r={ps * 12} fill="none" stroke="var(--fix)" strokeWidth={ps * 2.5} /><line x1={cur.x - ps * 18} y1={Y(cur.y)} x2={cur.x + ps * 18} y2={Y(cur.y)} stroke="var(--fix)" strokeWidth={ps * 2} /><line x1={cur.x} y1={Y(cur.y) - ps * 18} x2={cur.x} y2={Y(cur.y) + ps * 18} stroke="var(--fix)" strokeWidth={ps * 2} /></g>}
        {pins && p.markup.pins.map(x => { const sel = x.id === pins.sel; const r = ps * (sel ? 13 : 10);
          return <g key={x.id} role="button" tabIndex={0} aria-pressed={sel} aria-label={`${es ? 'Nota' : 'Note'} ${x.n}, ${x.status === 'open' ? (es ? 'abierta' : 'open') : (es ? 'resuelta' : 'resolved')}: ${x.comment || (es ? 'sin texto' : 'no text')}`}
            style={{ cursor: 'pointer' }} onPointerDown={e => { if (pins.placing) return; e.stopPropagation(); pins.onSelect(sel ? null : x.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pins.onSelect(sel ? null : x.id); } }}>
            <circle cx={x.x} cy={Y(x.y)} r={r} fill={x.status === 'open' ? 'var(--fix)' : 'var(--pass)'} stroke={sel ? 'var(--focus)' : 'var(--sheet)'} strokeWidth={ps * (sel ? 4 : 2)} />
            <text x={x.x} y={Y(x.y) + r * 0.38} fontSize={r * 1.1} textAnchor="middle" fill="#fff" fontWeight="800" pointerEvents="none">{x.n}</text></g>; })}
      </g>
      <desc aria-live="polite">{live}</desc>
    </svg>
  );
}
export { translate };
