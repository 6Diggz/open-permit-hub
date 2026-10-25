import { it, expect } from 'vitest';
import { parseLetter } from '../../core/markup';
const L = `CITY OF LOS ANGELES - DEPARTMENT OF BUILDING AND SAFETY
PLAN CHECK CORRECTION SHEET
Plan Check No.: B26LA12345   Job Address: 123 W MAIN ST
Page 1 of 3

1. Provide a fully dimensioned floor plan.
2. Bedroom egress windows shall comply with LARC R310:
   a. Minimum net clear opening 5.7 sq ft.
   b. Sill height not more than 44" above floor.
3) Show smoke alarms per R314.
PLAN CHECK CORRECTION SHEET
Plan Check No.: B26LA12345   Job Address: 123 W MAIN ST
Page 2 of 3
4. Ceiling height shall be min 7'-0".
   • Provide section through garage.
   • Note: 2 layers of 5/8" Type X.
5. Fire separation: provide 1-hour wall.
-- Page 3 --
Plan Checker: J. Smith    Date: 10/20/2026
`;
it('sub-items keep their parent number and bullets never get fake item numbers', () => {
  const it2 = parseLetter(L); const refs = it2.map(i => i.ref);
  expect(refs).not.toContain('a'); expect(refs.some(r => /^2\s*\.?\s*\(?a\)?$/i.test(r))).toBe(true); // "2a" / "2.a" / "2(a)"
  // bullets under item 4 must not be numbered 7 and 8 (there is no item 7 or 8 in the letter)
  expect(refs).not.toContain('7'); expect(refs).not.toContain('8');
});
it('repeated page headers, "-- Page 3 --" and signature lines are not glued into items', () => {
  const t = parseLetter(L).map(i => i.text).join(' | ');
  expect(t).not.toMatch(/PLAN CHECK CORRECTION SHEET|Plan Check No|Page 3|Plan Checker/);
});
