// Sev 5: a garage getting a new second story reads READY when "added area" stays 0 (no question about a vertical addition).
import { it, expect } from 'vitest'; import { base, run, ft } from './golden_base';
it('second-story addition over the garage is never READY on the conversion path', () => {
  const p = base(); p.adu.heightMm = ft(22); p.adu.interiorLivableSqFt = 760; // 400 sf ground + new upper floor
  expect(run(p).rep.overall).not.toBe('READY_FOR_PREPARER');
});
