import type { Project } from '../core/model';
import { toFt } from '../core/units';
import { area } from '../core/geom';

export interface Line { item: string; qty: number; unit: string; basis: string; itemEs: string; unitEs: string; basisEs: string }
/** Materials for a garage conversion interior. Waste factors are editable presets (UU fixes). */
export function takeoff(p: Project, waste = 0.12): Line[] {
  const fp = p.adu.footprint;
  let per = 0; fp.forEach((a, i) => { const b = fp[(i + 1) % fp.length]; per += Math.hypot(b.x - a.x, b.y - a.y); });
  const perFt = toFt(per), hFt = toFt(p.adu.ceilingHeightMm ?? 2438.4), floorSf = area(fp) / 92903.04;
  const winSf = p.adu.windows.reduce((s, w) => s + ((w.clearWidthMm ?? 0) * (w.clearHeightMm ?? 0)) / 92903.04, 0) + 21; // + one 3x7 door
  const wallSf = perFt * hFt - winSf;
  const r = (n: number) => Math.ceil(n);
  const w = Math.round(waste * 100);
  return [
    { item: 'Drywall 4x8 sheets (walls + ceiling)', itemEs: 'Placas de yeso 4x8 (muros + techo)', qty: r(((wallSf + floorSf) * (1 + waste)) / 32), unit: 'sheets', unitEs: 'placas', basis: `${Math.round(wallSf)} sf walls + ${Math.round(floorSf)} sf ceiling, ${w}% waste`, basisEs: `${Math.round(wallSf)} pies² de muros + ${Math.round(floorSf)} pies² de techo, ${w}% de desperdicio` },
    { item: 'Wall insulation', itemEs: 'Aislamiento de muros', qty: r(wallSf * 1.05), unit: 'sq ft', unitEs: 'pies²', basis: 'exterior wall area less openings', basisEs: 'área de muros exteriores menos aberturas' },
    { item: 'Ceiling insulation', itemEs: 'Aislamiento de techo', qty: r(floorSf * 1.05), unit: 'sq ft', unitEs: 'pies²', basis: 'ceiling area', basisEs: 'área del techo' },
    { item: 'Studs for furring/infill (8 ft)', itemEs: 'Montantes para relleno (8 pies)', qty: r(perFt / 1.333 + 12), unit: 'pcs', unitEs: 'piezas', basis: '16" on center + corners', basisEs: 'a 16" de centro + esquinas' },
    { item: 'Joint compound', itemEs: 'Compuesto para juntas', qty: r(((wallSf + floorSf) / 32) / 8), unit: 'buckets (4.5 gal)', unitEs: 'cubetas (4.5 gal)', basis: '~1 bucket per 8 sheets', basisEs: '~1 cubeta por 8 placas' },
    { item: 'Interior paint', itemEs: 'Pintura interior', qty: r(((wallSf + floorSf) * 2) / 350), unit: 'gallons', unitEs: 'galones', basis: '2 coats, 350 sf/gal', basisEs: '2 manos, 350 pies²/gal' },
    { item: 'Flooring', itemEs: 'Piso', qty: r(floorSf * 1.1), unit: 'sq ft', unitEs: 'pies²', basis: 'floor area + 10%', basisEs: 'área del piso + 10%' },
  ];
}
/** RFC 4180 cell: always quoted, inner quotes doubled; a leading = + - @ is prefixed so spreadsheets don't run it as a formula. */
export const csvCell = (v: string | number) => { const s = String(v); return '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'; };
export const takeoffCSV = (rows: Line[], es = false) => [[es ? 'Artículo' : 'Item', es ? 'Cantidad' : 'Qty', es ? 'Unidad' : 'Unit', es ? 'Base' : 'Basis'].map(csvCell).join(','),
  ...rows.map(r => [es ? r.itemEs : r.item, r.qty, es ? r.unitEs : r.unit, es ? r.basisEs : r.basis].map(csvCell).join(','))].join('\r\n');
