// r6logic-02: III.F.1 "Conflicts with code" fires on any small window on the same page as an egress note.
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
const f1 = (lines: string[]) => analyze([{ page: 1, lines: ['A2.0 FLOOR PLAN', ...lines] }]).items.find(i => i.id === 'III.F.1')!;
it('a bathroom window in the schedule is not the escape window', () => {
  expect(f1(['EGRESS WINDOW AT BEDROOM: 36" X 48" NET CLEAR', 'WINDOW SCHEDULE: W2 BATH 24" X 18" OBSCURE']).state).not.toBe('conflict');
});
it('a window being removed is not the escape window', () => {
  expect(f1(['EGRESS WINDOW: NEW 3\'-0" X 4\'-0". (E) WINDOW 2\'-0" X 1\'-6" TO BE REMOVED']).state).not.toBe('conflict');
});
it('a small escape window still conflicts', () => { expect(f1(['EGRESS WINDOW AT BEDROOM: 18" X 20" NET CLEAR']).state).toBe('conflict'); });
