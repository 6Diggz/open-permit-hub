// r3data-09: RFC 5545 3.1: content lines over 75 octets must be folded.
import { it, expect } from 'vitest';
import { deadlinesICS } from '../../out/ics';
import { demoProject } from '../../core/model';
it('folds long lines', () => {
  const lines = deadlinesICS(demoProject(), '2026-03-08', 0, '2026-11-01').split('\r\n');
  expect(lines.filter(l => new TextEncoder().encode(l).length > 75)).toEqual([]);
});
