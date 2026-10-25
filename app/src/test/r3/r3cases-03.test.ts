// Sev 4: garage 3 ft from the house: the HOUSE wall is also 1.5 ft from the assumed line (LABC 705.3); nothing asks about it, yet FIR-01 PASSes.
import { it, expect } from 'vitest'; import { base, run, ft, rect } from './golden_base';
it('house-facing wall within 5 ft of the assumed line is not an automatic PASS', () => {
  const p = base(); p.adu.footprint = rect(ft(15), ft(68), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no';
  p.adu.floorPlanSideSetbackMm = ft(15); p.adu.floorPlanRearSetbackMm = ft(62); p.adu.hosePullFt = 90;
  const r = run(p); expect(r.st('FIR-01')).not.toBe('PASS'); expect(r.rep.overall).not.toBe('READY_FOR_PREPARER');
});
