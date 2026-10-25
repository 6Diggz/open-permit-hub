// r4juris-06: FIR-01 hard-codes the LADBS 5 ft line with no sprinkler tier. LA County B&S (Garage Conversion Standard Notes) allows an
// unrated wall at 3 ft or more when sprinklered. The threshold must come from pack parameters, not code.
import { it, expect } from 'vitest';
const mod = '../../rules/la-city';
it('r4juris-06 fire separation tiers are pack parameters', async () => {
  const m = await import(mod) as Record<string, unknown>;
  const params = (m.PARAMS ?? (await import('../../rules/pack') as Record<string, unknown>).PARAMS) as undefined | { fireSep?: { unratedMinFt: number; unratedMinFtSprinklered: number; projectionMinFt: number } };
  expect(params?.fireSep, 'PARAMS.fireSep exported for the LA City pack').toBeTruthy();
  expect(params!.fireSep!.unratedMinFt).toBe(5); expect(params!.fireSep!.projectionMinFt).toBe(2);
});
