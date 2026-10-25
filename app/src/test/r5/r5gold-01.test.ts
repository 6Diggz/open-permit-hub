// r5gold-01: plain answer says "Likely yes" while a critical check that can block the project is still UNKNOWN.
import { describe, it, expect } from 'vitest';
import { base, run, ft, rect } from '../r3/golden_base';
import { plainAnswer } from '../../rules/readiness';
const cases: [string, () => ReturnType<typeof base>][] = [
  ['SCP-01 new story unknown (22 ft garage, 760 sf)', () => { const p = base(); p.adu.heightMm = ft(22); p.adu.interiorLivableSqFt = 760; return p; }],
  ['ACC-01 hose pull 180 ft unsprinklered', () => { const p = base(); p.adu.hosePullFt = 180; return p; }],
  ['FIR-01 house wall rating unanswered at 4 ft gap', () => { const p = base(); p.adu.footprint = rect(ft(15), ft(69), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.houseFacingOpenings = 'no'; p.adu.hosePullFt = 90; p.adu.floorPlanSideSetbackMm = ft(15); p.adu.floorPlanRearSetbackMm = ft(61); return p; }],
];
describe('r5gold-01 no "Likely yes" with a critical UNKNOWN', () => {
  for (const [n, mk] of cases) it(n, () => { const p = mk(); const { rep } = run(p);
    expect(rep.results.some(r => r.status === 'UNKNOWN')).toBe(true); // fixer: ACC-01 is severity major, not critical
    expect(plainAnswer(p, rep).verdict).not.toBe('likely-yes'); });
});
