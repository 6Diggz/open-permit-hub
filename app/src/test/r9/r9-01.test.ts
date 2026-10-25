// r9-01: "(E)" / "existing" that belongs to ANOTHER size or word in the same sentence still skips the proposed escape window.
// Relative import note: run from /home/claude/opa/app with  npx vitest run --root /home/claude/stress/r9/tests r9-01
// (tests/node_modules is a symlink to opa/app/node_modules).
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
const rows = [
  'BEDROOM 2 EGRESS WINDOW 18" X 22" REPLACES (E) 36" X 48"',
  'EGRESS WINDOW 18" X 22" AT (E) WALL',
  'EGRESS WINDOW 18" X 22" IN EXISTING OPENING ENLARGED',
  'EGRESS WINDOW 18" X 22" NET CLEAR (REMOVE (E) SASH)',
  'EGRESS WINDOW 18" X 22" WHERE (E) WINDOW WAS',
];
it.each(rows)('undersized proposed escape window conflicts: %s', l => {
  const i = analyze([{ page: 1, lines: ['A1.0 FLOOR PLAN', 'EMERGENCY ESCAPE AND RESCUE OPENING PER R310', l] }]).items.find(x => x.id === 'III.F.1')!;
  expect(i.state).toBe('conflict');
});
