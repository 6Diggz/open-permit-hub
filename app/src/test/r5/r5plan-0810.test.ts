// r5plan-08: bare view scale lines are read. r5plan-10: missing items say which pages were not read.
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
it('bare 1/4" = 1\'-0" line is a scale', () => {
  const c = analyze([{ page: 1, lines: ['SITE PLAN', '1/8" = 1\'-0"', 'SHEET', 'A1.1'] }]); expect(c.sheets[0].scales.length).toBe(1);
});
it('missing items name the unread pages', () => {
  const c = analyze([{ page: 1, lines: ['FLOOR PLAN'] }], 200); expect(c.items.find(i => i.id === 'III.H.9')!.why.en).toMatch(/Pages 2 to 200 were not read/);
});
