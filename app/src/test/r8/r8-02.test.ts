// r8-02: a real proposed escape window that fails size must still conflict, even when its sentence mentions bath / existing / R.O.
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
const rows = [
  'BEDROOM 2 EGRESS WINDOW 18" X 20" NET CLEAR, ACROSS FROM BATH',
  'EGRESS WINDOW 18" X 20" NET CLEAR REPLACES EXISTING WINDOW',
  'EGRESS WINDOW 18" X 20" NET CLEAR, R.O. 20" X 22"',
  'EGRESS WINDOW 18" X 20" NET CLEAR AT BEDROOM (NEW) - DEMO EXISTING GARAGE DOOR',
  'EGRESS WINDOW W/ OBSCURE GLASS NOT ALLOWED; 18" X 20" NET CLEAR',
  'NEW EGRESS WINDOW 18" X 20" IN MASTER BATHROOM-ADJACENT BEDROOM',
];
it.each(rows)('%s -> conflict', l => {
  const it_ = analyze([{ page: 1, lines: ['A2.0 FLOOR PLAN', l] }]).items.find(i => i.id === 'III.F.1')!;
  expect(it_.state).toBe('conflict');
});
it.each([
  ['EGRESS WINDOW (E) 18" X 20" TO REMAIN; NEW EGRESS WINDOW 36" X 48" NET CLEAR', 'addressed'],
  ['EGRESS WINDOW 36" X 48" NET CLEAR, R.O. 20" X 22"', 'addressed'],
  ['EGRESS WINDOW 36" X 48" NET CLEAR. EXISTING 18" X 20" WINDOW TO BE REMOVED', 'addressed'],
])('own-token marks still drop a size: %s', (l, want) => {
  expect(analyze([{ page: 1, lines: ['A2.0 FLOOR PLAN', l] }]).items.find(i => i.id === 'III.F.1')!.state).toBe(want);
});
