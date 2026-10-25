// r6logic-01: code-minimum wording ("NOT LESS THAN", "NOT MORE THAN", "SHALL NOT BE") and "NOT REQUIRED" answers are read as "not provided".
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
const st = (line: string, id: string) => analyze([{ page: 1, lines: ['A1.0 FLOOR PLAN', line] }]).items.find(i => i.id === id)!.state;
it.each([
  ['ANCHOR BOLTS 5/8" DIA @ 48" O.C., NOT MORE THAN 12" FROM ENDS', 'III.J.18'],
  ['VAPOR RETARDER: NOT LESS THAN 10 MIL UNDER SLAB', 'III.J.1'],
  ['TEMPERED GLASS AT ALL GLAZING WITHIN 24" OF DOORS, NOT LESS THAN CAT II', 'III.H.2'],
  ['EXHAUST FAN 50 CFM MIN, NOT LESS THAN 50 CFM, DUCTED TO OUTSIDE', 'III.G.4'],
  ['SMOKE ALARMS SHALL NOT BE BATTERY ONLY: HARDWIRED WITH BATTERY BACKUP, INTERCONNECTED', 'III.E.2'],
  ['NOT NON-RATED: 1-HOUR RATED WALL ASSEMBLY', 'III.D.1'],
  ['FIRE SPRINKLERS NOT REQUIRED (PRIMARY DWELLING NOT SPRINKLERED)', 'III.E.4'],
])('%s is a mention, not "not provided"', (line, id) => { expect(st(line, id)).toBe('addressed'); });
it('real negations still negate', () => {
  expect(st('SMOKE ALARMS: NOT PROVIDED', 'III.E.1')).toBe('negated');
  expect(st('VAPOR RETARDER: N/A', 'III.J.1')).toBe('negated');
  expect(st('SMOKE ALARMS: NO', 'III.E.1')).toBe('negated');
});
