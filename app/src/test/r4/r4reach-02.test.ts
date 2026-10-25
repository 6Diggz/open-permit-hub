// Spanish mode: the calendar file the owner adds to their phone is all English.
import { it, expect } from 'vitest';
import { base } from '../r3/golden_base';
import { deadlinesICS } from '../../out/ics';
it('ICS reminders follow the project language', () => {
  const p = base(); p.people.language = 'es';
  const ics = deadlinesICS(p, '2026-10-01', 0, '2026-11-01');
  expect(ics).not.toMatch(/Plan check expires|Start work or the permit expires|The permit is valid/);
});
