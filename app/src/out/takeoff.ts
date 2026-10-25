import type { Project } from '../core/model';
import { toFt } from '../core/units';
import { area } from '../core/geom';

export interface Line { item: string; qty: number; unit: string; basis: string }
/** Materials for a garage conversion interior. Waste factors are editable presets (UU fixes). */
export function takeoff(p: Project, waste = 0.12): Line[] {
  const fp = p.adu.footprint;
  let per = 0; fp.forEach((a, i) => { const b = fp[(i + 1) % fp.length]; per += Math.hypot(b.x - a.x, b.y - a.y); });
  const perFt = toFt(per), hFt = toFt(p.adu.ceilingHeightMm ?? 2438.4), floorSf = area(fp) / 92903.04;
  const winSf = p.adu.windows.reduce((s, w) => s + ((w.clearWidthMm ?? 0) * (w.clearHeightMm ?? 0)) / 92903.04, 0) + 21; // + one 3x7 door
  const wallSf = perFt * hFt - winSf;
  const r = (n: number) => Math.ceil(n);
  return [
    { item: 'Drywall 4x8 sheets (walls + ceiling)', qty: r(((wallSf + floorSf) * (1 + waste)) / 32), unit: 'sheets', basis: `${Math.round(wallSf)} sf walls + ${Math.round(floorSf)} sf ceiling, ${Math.round(waste * 100)}% waste` },
    { item: 'Wall insulation', qty: r(wallSf * 1.05), unit: 'sq ft', basis: 'exterior wall area less openings' },
    { item: 'Ceiling insulation', qty: r(floorSf * 1.05), unit: 'sq ft', basis: 'ceiling area' },
    { item: 'Studs for furring/infill (8 ft)', qty: r(perFt / 1.333 + 12), unit: 'pcs', basis: '16" on center + corners' },
    { item: 'Joint compound', qty: r(((wallSf + floorSf) / 32) / 8), unit: 'buckets (4.5 gal)', basis: '~1 bucket per 8 sheets' },
    { item: 'Interior paint', qty: r(((wallSf + floorSf) * 2) / 350), unit: 'gallons', basis: '2 coats, 350 sf/gal' },
    { item: 'Flooring', qty: r(floorSf * 1.1), unit: 'sq ft', basis: 'floor area + 10%' },
  ];
}
export const takeoffCSV = (rows: Line[]) => ['Item,Qty,Unit,Basis', ...rows.map(r => `"${r.item}",${r.qty},"${r.unit}","${r.basis}"`)].join('\n');
