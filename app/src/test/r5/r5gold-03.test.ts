// r5gold-03: 5-8 ft between house and ADU, ADU wall rated WITH openings, house wall blank: no line position lets the
// house wall stay unrated (house unrated needs 5 ft to the line, ADU openings need 3 ft), yet FIR-01 PASSes.
import { describe, it, expect } from 'vitest';
import { base, run, ft, rect } from '../r3/golden_base';
describe('r5gold-03 house wall rating for 5-8 ft gaps with ADU openings', () => {
  for (const g of [7, 7.5]) it(`gap ${g} ft: FIR-01 asks about (or fails) the house wall`, () => {
    const p = base(); p.adu.footprint = rect(ft(15), ft(65 + g), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'yes';
    p.adu.houseFacingOpenings = 'no'; p.adu.hosePullFt = 90; p.adu.floorPlanSideSetbackMm = ft(15); p.adu.floorPlanRearSetbackMm = ft(65 - g);
    expect(run(p).st('FIR-01')).not.toBe('PASS');
    p.adu.houseWallRated = 'yes'; expect(run(p).st('FIR-01')).toBe('PASS'); });
  it('gap 8 ft: line 3 ft from ADU, 5 ft from house: PASS without a house rating', () => {
    const p = base(); p.adu.footprint = rect(ft(15), ft(73), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'yes';
    p.adu.houseFacingOpenings = 'no'; p.adu.hosePullFt = 90; p.adu.floorPlanSideSetbackMm = ft(15); p.adu.floorPlanRearSetbackMm = ft(57);
    expect(run(p).st('FIR-01')).toBe('PASS'); });
});
