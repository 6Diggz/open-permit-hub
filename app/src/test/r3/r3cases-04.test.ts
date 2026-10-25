// Sev 3: corner lot. Fire separation distance to a street is measured to the street centerline (CRC R202), but every lot edge is treated as a property line.
import { it, expect } from 'vitest'; import { base, run, ft, rect } from './golden_base';
it('garage 3 ft from the side-street line needs no rated wall and may have windows', () => {
  const p = base(); p.adu.footprint = rect(ft(3), ft(124), ft(20), ft(20)); p.adu.ratedWallPlanned = 'no'; p.adu.openingsNearLine = 'yes';
  p.adu.floorPlanSideSetbackMm = ft(3); p.adu.floorPlanRearSetbackMm = ft(6);
  (p.site as any).streetEdges = [0, 3]; // proposed model field: edge 3 (x=0) is the side street
  const r = run(p); expect(r.st('FIR-01')).toBe('PASS'); expect(r.st('FIR-02')).toBe('PASS');
});
