// r6logic-03: plain answer says "1 sheet item to fix" while the score line under it says "0 to fix" (Math.max(1, rd.failing)).
import { it, expect } from 'vitest';
import { base } from '../../../../qa/golden/golden_base';
import { getVerdict } from '../../core/verdict';
it('R5-09: card and score line give the same number to fix', () => {
  const p = base(); p.adu.mode = 'youadu' as never; p.site.existingAdus = 1; p.site.existingAduAttached = 'no';
  const v = getVerdict(p, new Date('2026-10-24T12:00:00'));
  const m = v.plain.en.match(/(\d+) sheet items? to fix/);
  const n = Number(v.score.en.match(/(\d+) to fix/)?.[1] ?? -1);
  expect(v.plain.verdict).toBe('likely-no');
  expect(n).toBeGreaterThan(0); // the failing MIX-01 rule must count as a sheet item to fix
  expect(m && Number(m[1])).toBe(n);
});
