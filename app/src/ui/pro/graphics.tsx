// The drafting graphics renderer shared by the Pro canvas, its paper sheets and the Guided lot sketch: one renderer,
// one dimension style, one pen table. Pure presentational; the geometry comes from drafting.ts.
import { memo } from 'react';
import { lwPx, MIN_TEXT_PX, type Drawing, type LayerId } from './drafting';
import './drawing.css';

export interface LayerVis { on: boolean; locked?: boolean }
const LW = (lw: number, on: boolean, disp = 1.4) => lwPx(lw, on, disp);
/** LWDISPSCALE for an annotation scale (model inches per paper inch): heavier when zoomed in, lighter far out. */
export const lwDisp = (annoK: number) => Math.max(0.9, Math.min(1.7, 1.4 * Math.sqrt(96 / annoK)));
const DASH: Record<string, string> = { phantom: '22 4 4 4 4 4', hidden: '7 4', demo: '5 3' };

/** The drafting graphics, memoized on the model and display settings so panning never re-renders them. */
export const Graphics = memo(function Graphics({ d, layers, lwt, k, disp = 1.4 }: { d: Drawing; layers: Record<string, LayerVis>; lwt: boolean; k: number; disp?: number }) {
  const on = (l: LayerId) => layers[l]?.on !== false;
  return <g className="gfx">
    {d.prims.map((x, i) => on(x.layer) ? <path key={i} d={x.d} className={`t-${x.tone ?? 'ink'} f-${x.fill ?? 'none'}`} strokeWidth={x.stroke === false ? 0 : LW(x.lw, lwt, disp)} strokeDasharray={x.dash ? DASH[x.dash] : undefined} vectorEffect="non-scaling-stroke" fillRule="evenodd" data-layer={x.layer} /> : null)}
    {d.dims.map((x, i) => <g key={'d' + i} data-dim={`${x.a.x.toFixed(0)},${x.a.y.toFixed(0)},${x.b.x.toFixed(0)},${x.b.y.toFixed(0)}`} data-src="auto" />)}
    {d.texts.map((t, i) => on(t.layer) && t.h * k >= MIN_TEXT_PX ? <text key={'t' + i} x={t.x} y={t.y} fontSize={t.h} textAnchor={t.anchor ?? 'start'} dominantBaseline={t.mid ? 'central' : undefined} transform={t.rot ? `rotate(${t.rot.toFixed(2)} ${t.x} ${t.y})` : undefined}
      className={`tx t-${t.tone ?? 'ink'}${t.bold ? ' b' : ''}${t.mask ? ' mk' : ''}`} strokeWidth={t.mask ? t.h * 0.5 : undefined} data-layer={t.layer}>{t.s}</text> : null)}
  </g>;
});

