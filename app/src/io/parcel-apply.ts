import type { Project } from '../core/model';
import { bbox, rect, polyInside, area, type Poly } from '../core/geom';
import { ft } from '../core/units';
import type { ParcelFill } from './parcel';

/** Field keys tagged "from parcel map, verify on site" until the user edits them. */
export type MapField = 'lot' | 'apn' | 'zone' | 'jurisdiction' | 'hillside' | 'vhfhsz' | 'coastal' | 'hpoz' | 'house' | 'garage' | 'burn';

/** The user changed a field: it is theirs now, not the map's. */
export function unmark(d: Project, k: MapField) { if (d.site.parcel) d.site.parcel.fromMap = d.site.parcel.fromMap.filter(x => x !== k); }
export const fromMap = (p: Project, k: MapField) => !!p.site.parcel?.fromMap.includes(k);

/** Shrink a placeholder shape toward the lot's middle until it is inside (lots are often not rectangles). */
function fitInside(shape: Poly, lot: Poly): Poly {
  const lb = bbox(lot); const cx = (lb.minX + lb.maxX) / 2, cy = (lb.minY + lb.maxY) / 2; let s = shape;
  for (let i = 0; i < 30 && !polyInside(s, lot); i++) { const b = bbox(s); const mx = (b.minX + b.maxX) / 2, my = (b.minY + b.maxY) / 2; const nx = mx + (cx - mx) * 0.15, ny = my + (cy - my) * 0.15;
    s = s.map(q => ({ x: nx + (q.x - mx) * 0.93, y: ny + (q.y - my) * 0.93 })); }
  return s;
}

/**
 * Put a lookup into the project. Only values the map actually answered are written; everything else keeps what the user had.
 * Placeholder house and garage positions are moved inside the new lot so the drawing is not broken by a narrow lot.
 */
export function applyParcel(p: Project, f: ParcelFill): { next: Project; filled: MapField[] } {
  const d: Project = structuredClone(p); const filled: MapField[] = [];
  if (f.lot && f.lot.length >= 3) {
    d.site.lot = f.lot; d.site.streetEdge = 0; d.site.lotSource = 'gis'; d.site.lotUncertaintyMm = ft(2); d.confirmed.lot = true; filled.push('lot');
    const b = bbox(f.lot); const W = b.maxX - b.minX, D = b.maxY - b.minY;
    if (!d.confirmed.house || !polyInside(d.site.primary, f.lot)) { const w = Math.max(ft(8), Math.min(ft(40), W - ft(10))); d.site.primary = rect(b.minX + (W - w) / 2, b.minY + Math.min(ft(20), D * 0.15), w, Math.max(ft(8), Math.min(ft(45), D * 0.35))); d.site.primary = fitInside(d.site.primary, f.lot); }
    if (!d.confirmed.adu || !polyInside(d.adu.footprint, f.lot)) { const fb = bbox(d.adu.footprint); const w = Math.min(fb.maxX - fb.minX, Math.max(ft(8), W - ft(8))), h = Math.min(fb.maxY - fb.minY, Math.max(ft(8), D * 0.3));
      d.adu.footprint = fitInside(rect(b.minX + (W - w) / 2, b.maxY - h - Math.min(ft(5), D * 0.04), w, h), f.lot); }
  }
  if (f.lot && f.lot.length >= 3 && typeof f.northDeg === 'number' && Number.isFinite(f.northDeg)) d.site.northDeg = f.northDeg;
  // Building outlines from the city map (LARIAC aerial survey): the largest is the house; the garage is the largest
  // remaining outline of garage size (150-1,000 sq ft). Values the user already typed are kept.
  const bl = (f.lot ? f.buildings ?? [] : []).filter(b => b.length >= 3 && polyInside(b, d.site.lot));
  const sq = (b: Poly) => area(b) / 92903.04;
  const house = bl.find(b => sq(b) >= 300); const garage = bl.find(b => b !== house && sq(b) >= 150 && sq(b) <= 1000);
  if (house && !p.confirmed.house) { d.site.primary = house; filled.push('house'); }
  if (garage && !p.confirmed.adu) { d.adu.footprint = garage; filled.push('garage'); }
  if (f.palisades === 'yes' || (f.palisades === 'no' && f.jurisdiction === 'la-city')) { d.site.flags.fireRebuild = f.palisades; filled.push('burn'); }
  if (f.apn) { d.site.apn = f.apn; filled.push('apn'); }
  if (f.zone) { d.site.zone = f.zone; filled.push('zone'); }
  if (f.jurisdiction !== 'unknown') { d.site.jurisdiction = f.jurisdiction; filled.push('jurisdiction'); }
  // The real city boundary answers the "is this really LA City?" question that a mailing-address city name raises.
  if (f.jurisdiction === 'la-city') d.site.jurisdictionConfirmed = true;
  for (const k of ['hillside', 'vhfhsz', 'coastal', 'hpoz'] as const) if (f.flags[k] !== 'unknown') { d.site.flags[k] = f.flags[k]; filled.push(k); }
  d.site.parcel = { at: f.at, matched: f.matched, cityName: f.cityName, fromMap: filled, failed: f.failed, pin: f.zimasPin };
  return { next: d, filled };
}
