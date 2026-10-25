import { useRef, useState } from 'react';
import type { Project } from '../core/model';
import { bbox, clearanceToEdge, translate } from '../core/geom';
import { fmtFtIn, ft, inch } from '../core/units';

export function Plan({ p, onMove, es = false }: { p: Project; es?: boolean; onMove: (dx: number, dy: number, commit: boolean) => void }) {
  const svg = useRef<SVGSVGElement>(null); const drag = useRef<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState('');
  const lot = p.site.lot; const b = bbox(lot); const pad = ft(14);
  const vb = { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + pad * 2, h: b.maxY - b.minY + pad * 2 };
  // y up in model -> flip for SVG
  const Y = (y: number) => b.maxY + b.minY - y;
  const pts = (pl: { x: number; y: number }[]) => pl.map(q => `${q.x},${Y(q.y)}`).join(' ');
  const s = Math.max(vb.w, vb.h) / 520; // stroke/text unit tuned to on-screen size
  const toModel = (e: React.PointerEvent) => { const m = svg.current!.getScreenCTM()!.inverse(); const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return { x: pt.x, y: Y(pt.y) }; };
  const fp = p.adu.footprint; const fb = bbox(fp); const fs = Math.min(s * 13, (fb.maxX - fb.minX) / 8);
  const dims = lot.map((a, i) => ({ i, d: clearanceToEdge(fp, lot, i), a, b: lot[(i + 1) % lot.length] }));
  const say = () => setLive(dims.filter(d => d.i !== p.site.streetEdge).map(d => fmtFtIn(d.d)).join(', '));
  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? ft(1) : inch(6); const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (m[e.key]) { e.preventDefault(); onMove(m[e.key][0], m[e.key][1], true); say(); }
  };
  return (
    <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="group" aria-label={es ? 'Plano del lote. El ADU se puede mover con las flechas cuando está seleccionado.' : 'Site plan. The ADU can be moved with arrow keys when focused.'}>
      <defs><pattern id="hatch" width={ft(1.2)} height={ft(1.2)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2={ft(1.2)} stroke="currentColor" strokeWidth={s * 0.8} opacity=".35" /></pattern></defs>
      <g color="var(--ink)">
        {/* setback band 4 ft inside side/rear lines */}
        {lot.map((a, i) => { if (i === p.site.streetEdge) return null; const c = lot[(i + 1) % lot.length]; const dx = c.x - a.x, dy = c.y - a.y, L = Math.hypot(dx, dy), nx = -dy / L * ft(4), ny = dx / L * ft(4);
          return <polygon key={i} points={pts([a, c, { x: c.x + nx, y: c.y + ny }, { x: a.x + nx, y: a.y + ny }])} fill="var(--faint)" stroke="none" />; })}
        <polygon points={pts(lot)} fill="none" stroke="var(--ink)" strokeWidth={s * 2.2} strokeDasharray={`${s * 18} ${s * 5} ${s * 3} ${s * 5}`} />
        <polygon points={pts(p.site.primary)} fill="url(#hatch)" stroke="var(--pencil)" strokeWidth={s * 1.4} />
        <text x={(bbox(p.site.primary).minX + bbox(p.site.primary).maxX) / 2} y={Y((bbox(p.site.primary).minY + bbox(p.site.primary).maxY) / 2)} fontSize={s * 13} textAnchor="middle" fill="var(--pencil)" fontWeight="600">{es ? 'Casa existente' : 'Existing house'}</text>
        {(() => { const a = lot[p.site.streetEdge], c = lot[(p.site.streetEdge + 1) % lot.length]; return <text x={(a.x + c.x) / 2} y={Y((a.y + c.y) / 2) + s * 30} fontSize={s * 12} textAnchor="middle" fill="var(--pencil)">{es ? 'Calle' : 'Street'}</text>; })()}
        {dims.filter(d => d.i !== p.site.streetEdge).map(d => {
          const mx = (d.a.x + d.b.x) / 2, my = (d.a.y + d.b.y) / 2; const ok = d.d >= ft(4);
          return <g key={d.i}><text x={mx} y={Y(my)} fontSize={s * 12} textAnchor="middle" dy={-s * 6} fill={ok ? 'var(--pencil)' : 'var(--fix)'} fontWeight="700" paintOrder="stroke" stroke="var(--sheet)" strokeWidth={s * 4}>{fmtFtIn(d.d)} {es ? 'al lindero' : 'to line'}</text></g>;
        })}
        <polygon points={pts(fp)} fill="var(--card)" fillOpacity=".55" stroke="var(--ink)" strokeWidth={s * 3} tabIndex={0} role="button"
          aria-label={es ? `Huella del ADU. Distancias a los linderos laterales y trasero: ${dims.filter(d => d.i !== p.site.streetEdge).map(d => fmtFtIn(d.d)).join(', ')}. Las flechas mueven 6 pulgadas, Mayús mueve 1 pie.` : `ADU footprint. Distances to side and rear lines: ${dims.filter(d => d.i !== p.site.streetEdge).map(d => fmtFtIn(d.d)).join(', ')}. Arrow keys move 6 inches, Shift moves 1 foot.`}
          style={{ cursor: 'grab' }} onKeyDown={key}
          onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = toModel(e); }}
          onPointerMove={e => { if (!drag.current) return; const m = toModel(e); onMove(m.x - drag.current.x, m.y - drag.current.y, false); drag.current = m; }}
          onPointerUp={() => { if (drag.current) { onMove(0, 0, true); say(); } drag.current = null; }} />
        <text x={(fb.minX + fb.maxX) / 2} y={Y((fb.minY + fb.maxY) / 2)} fontSize={fs} textAnchor="middle" fontWeight="800" fill="var(--ink)" pointerEvents="none">ADU</text>
        <text x={(fb.minX + fb.maxX) / 2} y={Y((fb.minY + fb.maxY) / 2) + fs * 1.3} fontSize={fs * 0.8} textAnchor="middle" fill="var(--ink)" pointerEvents="none">{fmtFtIn(fb.maxX - fb.minX)} x {fmtFtIn(fb.maxY - fb.minY)}</text>
      </g>
      <desc aria-live="polite">{live}</desc>
    </svg>
  );
}
export { translate };
