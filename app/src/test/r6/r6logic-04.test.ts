// r6logic-04: MAY_STAY_OPEN holds critical rules (ENG-01, EGR-01). Leaving the answer blank gives "Likely yes"; answering it gives "Not as entered".
import { it, expect } from 'vitest';
import { base } from '../../../../qa/golden/golden_base';
import { getVerdict } from '../../core/verdict';
const T = new Date('2026-10-24T12:00:00');
it('unknown garage wall material (could be unreinforced brick) is not "Likely yes"', () => {
  const p = base(); p.adu.garageConstruction = 'unknown' as never; expect(getVerdict(p, T).plain.verdict).not.toBe('likely-yes');
});
it('a bedroom with no escape window entered is not "Likely yes"', () => {
  const p = base(); p.adu.windows = []; expect(getVerdict(p, T).plain.verdict).not.toBe('likely-yes');
  const q = base(); q.adu.bedrooms = 2; expect(getVerdict(q, T).plain.verdict).not.toBe('likely-yes');
});
