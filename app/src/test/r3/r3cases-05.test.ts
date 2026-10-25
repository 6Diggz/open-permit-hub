// Sev 3: a legal nonconforming garage built ON the side line (0 ft) is "drawn outside the lot" (GEO-01 FAIL) because polyInside rejects the boundary.
import { it, expect } from 'vitest'; import { base, run, ft, rect } from './golden_base';
it('garage touching the lot line is inside the lot and gets the 0 ft fire checks', () => {
  const p = base(); p.adu.footprint = rect(ft(30), ft(124), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.floorPlanSideSetbackMm = 0;
  const r = run(p); expect(r.st('GEO-01')).toBe('PASS'); expect(r.st('FIR-01')).toBe('PASS'); expect(r.rep.overall).toBe('READY_FOR_PREPARER');
  p.adu.eaveDepthMm = ft(1); expect(run(p).st('FIR-01')).toBe('FAIL'); // any eave at 0 ft is a projection under 2 ft
});
