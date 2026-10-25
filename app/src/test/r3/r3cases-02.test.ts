// Sev 3: >150 sf / non-ingress addition is outside the conversion pack: overall should be NOT_SUPPORTED, not FIX_ISSUES.
import { it, expect } from 'vitest'; import { base, run, ft } from './golden_base';
it('400 sf second-story addition -> NOT_SUPPORTED', () => {
  const p = base(); p.adu.addedAreaSqFt = 400; p.adu.addedForIngressOnly = 'no'; p.adu.heightMm = ft(22); p.adu.addedSetbackMm = ft(6); p.adu.interiorLivableSqFt = 760;
  expect(run(p).rep.overall).toBe('NOT_SUPPORTED');
});
