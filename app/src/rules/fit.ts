import type { Project } from '../core/model';
import { bbox, clearanceToEdge, gap, polyInside, translate } from '../core/geom';
import { ft } from '../core/units';

/** Auto-fit the ADU footprint: keeps 4 ft + map error from side/rear lines (uncertainty wins, PR/UU311),
 *  >= 10 ft from the house, and prefers the rear. Returns null if it can't fit or hazards block auto-fit. */
export function autoFit(p: Project): { footprint: Project['adu']['footprint']; why: string } | { footprint: null; why: string } {
  const f = p.site.flags;
  if (f.hillside === 'yes' || f.slopeOver10 === 'yes') return { footprint: null, why: 'Automatic fitting is off on hillside or sloped lots. An engineer places the ADU.' };
  if (f.fireRebuild === 'yes') return { footprint: null, why: 'Automatic fitting is off in 2025 burn areas. Use the official rebuild path.' };
  const lot = p.site.lot, lb = bbox(lot), fb = bbox(p.adu.footprint); const w = fb.maxX - fb.minX, d = fb.maxY - fb.minY;
  const need = ft(4) + p.site.lotUncertaintyMm; const span = Math.max(lb.maxX - lb.minX, lb.maxY - lb.minY); const step = Math.max(ft(0.5), span / 240);
  if (span > ft(3000)) return { footprint: null, why: 'This lot is too large for automatic fitting. Place the ADU by hand.' };
  let best: { fp: typeof p.adu.footprint; score: number } | null = null;
  for (let x = lb.minX; x <= lb.maxX - w; x += step) for (let y = lb.minY; y <= lb.maxY - d; y += step) {
    const fp = translate(p.adu.footprint, x - fb.minX, y - fb.minY); if (!polyInside(fp, lot)) continue;
    let ok = true; let minSide = Infinity;
    lot.forEach((_, i) => { if (i === p.site.streetEdge) return; const c = clearanceToEdge(fp, lot, i); minSide = Math.min(minSide, c); if (c < need) ok = false; });
    if (!ok || gap(fp, p.site.primary) < ft(10)) continue;
    const score = y * 2 + Math.min(minSide, ft(10)); // prefer rear, then extra margin
    if (!best || score > best.score) best = { fp, score };
  }
  return best ? { footprint: best.fp, why: 'Placed toward the rear with 4 ft plus map error from side and rear lines, and 10 ft from the house.' } : { footprint: null, why: 'It does not fit with 4 ft setbacks plus map error and 10 ft from the house. A survey may free up room.' };
}
