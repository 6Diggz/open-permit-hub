// r6logic-06: a metric non-ceiling length ("1.5 m" fan) next to the keyword hides the real ceiling height.
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
it('reads 8 ft past a 1.5 m fan size', () => {
  const r = analyze([{ page: 1, lines: ['A2.0 FLOOR PLAN', 'CEILING FAN 1.5 m DIA, CEILING HEIGHT 8\'-0"'] }]);
  expect(r.dims.ceilings.map(c => c.inches)).toContain(96);
});
