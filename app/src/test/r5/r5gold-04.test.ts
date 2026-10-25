// r5gold-04: jurisdiction "Not sure yet" gets the plain answer "rules cover the City of Los Angeles only" (EN and ES).
import { it, expect } from 'vitest';
import { base, run } from '../r3/golden_base';
import { plainAnswer } from '../../rules/readiness';
it('unknown jurisdiction asks to confirm the city instead of saying LA only', () => {
  const p = base(); p.site.jurisdiction = 'unknown' as never; const a = plainAnswer(p, run(p).rep);
  expect(a.verdict).toBe('unsure'); expect(a.en).not.toMatch(/Los Angeles only/); expect(a.es).not.toMatch(/solo para la Ciudad/); expect(a.en).toMatch(/city|ZIMAS/i);
});
