// r3data-08: impossible filing dates must be refused, not rolled into a wrong deadline.
import { it, expect } from 'vitest';
import { deadlinesICS } from '../../out/ics';
import { demoProject } from '../../core/model';
it('refuses 2026-02-30 and 2026-13-01', () => {
  for (const d of ['2026-02-30', '2026-13-01', '2026-00-10', '2025-02-29']) expect(() => deadlinesICS(demoProject(), d)).toThrow();
  expect(() => deadlinesICS(demoProject(), '2024-02-29')).not.toThrow();
});
