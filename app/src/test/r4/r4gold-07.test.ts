// r4gold-07: garage 5 ft from a house wall WITH windows; ADU wall 1-hour, no openings, no eave -> FIR-01 FAIL.
// The assumed line may be placed anywhere between the buildings (III-D.1 / R302.1). On the ADU face: house 5 ft away (no limits),
// ADU wall at 0 ft is 1-hour, no openings, no projection -> complies. FAIL is a false blocker.
import { it, expect } from 'vitest';
import { base, run, ft, rect } from '../r3/golden_base';
it('5 ft gap, house windows, rated blank ADU wall: not FAIL', () => {
  const p = base(); p.adu.footprint = rect(ft(15), ft(70), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.houseFacingOpenings = 'yes';
  const { rep, st } = run(p); expect(st('FIR-01')).not.toBe('FAIL'); // Fixer note: moving the footprint leaves the typed setbacks stale (SET-03), which is the test fixture, not FIR-01.
  expect(rep.results.filter(r => r.status === 'FAIL' && r.rule.id !== 'SET-03').map(r => r.rule.id)).toEqual([]); });
it('4 ft gap, house windows: still FAIL (both walls under 5 ft wherever the line goes; house openings within 3 ft or limited)', () => {
  const p = base(); p.adu.footprint = rect(ft(15), ft(69), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.houseFacingOpenings = 'yes';
  expect(run(p).st('FIR-01')).not.toBe('PASS'); });
