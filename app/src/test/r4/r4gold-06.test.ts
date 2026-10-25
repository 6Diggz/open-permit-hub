// r4gold-06 (regression of r3cases-03): garage 4 ft from the house, ADU wall rated, house wall without openings -> FIR-01 PASS.
// With a gap under 5 ft, wherever the assumed line goes BOTH walls are under 5 ft from it (LADBS III-D.1, LABC 705.3, LARC Table R302.1(1)):
// the existing house wall must be 1-hour too. Nothing asks, so it cannot PASS.
import { it, expect } from 'vitest';
import { base, run, ft, rect } from '../r3/golden_base';
it('4 ft gap, house wall no openings: FIR-01 asks about the house wall rating', () => {
  const p = base(); p.adu.footprint = rect(ft(15), ft(69), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.houseFacingOpenings = 'no';
  expect(run(p).st('FIR-01')).not.toBe('PASS'); });
it('8 ft gap, house wall no openings: line can sit 5 ft from the house, PASS stays', () => {
  const p = base(); p.adu.footprint = rect(ft(15), ft(73), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.houseFacingOpenings = 'no';
  expect(run(p).st('FIR-01')).toBe('PASS'); });
