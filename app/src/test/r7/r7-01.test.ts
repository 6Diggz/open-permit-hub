// r7-01 (regression of r6logic-01): removing the bare "not" made common "not provided" wording read as "Mentioned".
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
const st = (line: string, id: string) => analyze([{ page: 1, lines: ['A1.0 FLOOR PLAN', line] }]).items.find(i => i.id === id)!.state;
it.each([
  ['SMOKE ALARMS NOT INSTALLED', 'III.E.1'], ['SMOKE ALARMS: NOT APPLICABLE', 'III.E.1'], ['SMOKE ALARMS DO NOT APPLY', 'III.E.1'],
  ['SMOKE ALARMS: NOT YET DESIGNED', 'III.E.1'], ['SMOKE ALARMS SHALL NOT BE PROVIDED', 'III.E.1'], ['SMOKE ALARMS - NO', 'III.E.1'],
  ['THERE ARE NO SMOKE ALARMS', 'III.E.1'], ['SMOKE ALARMS: PENDING', 'III.E.1'], ['CARBON MONOXIDE ALARM NOT REQUIRED', 'III.E.3'],
  ['VAPOR RETARDER OMITTED', 'III.J.1'], ['VAPOR RETARDER: EXCLUDED', 'III.J.1'], ['VAPOR RETARDER - DEFERRED SUBMITTAL', 'III.J.1'],
  ['VAPOR RETARDER TO BE PROVIDED LATER', 'III.J.1'], ['VAPOR RETARDER BY OWNER', 'III.J.1'], ['VAPOR RETARDER N.I.C.', 'III.J.1'],
  ['VAPOR RETARDER NOT IN CONTRACT', 'III.J.1'],
])('%s is not "Mentioned"', (line, id) => { expect(st(line, id)).not.toBe('addressed'); });
it.each([
  ['SMOKE ALARMS PROVIDED IN EACH BEDROOM; NONE REMOVED', 'III.E.1'], ['NOTE: SMOKE ALARMS PROVIDED, TBD LOCATION BY INSPECTOR', 'III.E.1'],
  ['NON-COMBUSTIBLE SIDING. SMOKE ALARMS PROVIDED', 'III.E.1'], ['SMOKE ALARMS: HARDWIRED, NOT LESS THAN 3 FT FROM BATH DOOR', 'III.E.1'],
])('%s is a mention', (line, id) => { expect(st(line, id)).toBe('addressed'); });
