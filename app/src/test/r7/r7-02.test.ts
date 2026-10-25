// r7-02 (regression of r6logic-02): "conflict only when every egress size fails" hides a real too-small escape window
// whenever any other egress-tagged size on the sheet passes (second bedroom, rough opening, a window being removed).
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
const f1 = (lines: string[]) => analyze([{ page: 1, lines: ['A2.0 FLOOR PLAN', ...lines] }]).items.find(i => i.id === 'III.F.1')!.state;
it('bedroom 2 escape window 18x20 conflicts even if bedroom 1 passes', () => {
  expect(f1(['BEDROOM 1 EGRESS WINDOW 36" X 48" NET CLEAR', 'BEDROOM 2 EGRESS WINDOW 18" X 20" NET CLEAR'])).toBe('conflict');
});
it('a new 18x20 escape window conflicts even when the (E) window being removed is large', () => {
  expect(f1(['EGRESS WINDOW: NEW 18" X 20". (E) WINDOW 3\'-0" X 4\'-0" TO BE REMOVED'])).toBe('conflict');
});
it('net clear 18x20 conflicts even with a larger rough opening on the line', () => {
  expect(f1(['EGRESS WINDOW AT BEDROOM: 18" X 20" NET CLEAR (36" X 48" ROUGH OPENING)'])).toBe('conflict');
});
