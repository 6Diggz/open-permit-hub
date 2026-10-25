import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { deadlinesICS } from '../../out/ics';
// r3export-07: RFC 5545 3.1: every content line ends in CRLF (file ends without one) and lines over 75 octets must be folded
// (UID line for a uuid project id is 107 octets).
it('ICS lines are folded at 75 octets and the file ends with CRLF', () => {
  const s = deadlinesICS(demoProject(), '2026-11-01', 0, '2027-01-31');
  expect(s.endsWith('\r\n')).toBe(true);
  for (const l of s.split('\r\n')) expect(new TextEncoder().encode(l).length, l).toBeLessThanOrEqual(75);
});
