// r7-01 root-cause fix: one labeled corpus for plan-check note wording (r5plan-01, r6logic-01, r7-01 and new rows).
// P = provided ("Mentioned"), N = not provided, A = ambiguous ("Mentioned, check wording", never High).
// Any change to noteIntent / NEG wording must keep every row green.
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
import { C7 } from './corpus7';
const C = C7;
it('corpus has 80+ rows', () => { expect(C.length).toBeGreaterThanOrEqual(80); });
it.each(C)('%s [%s] -> %s', (line, id, want) => {
  const item = analyze([{ page: 1, lines: ['A1.0 FLOOR PLAN', line] }]).items.find(i => i.id === id)!;
  if (want === 'N') expect(item.state).toBe('negated');
  else { expect(item.state).toBe('addressed'); if (want === 'A') { expect(item.confidence).not.toBe('high'); expect(item.why.en).toMatch(/check the wording/i); } }
});
