// r5plan-11: Simpson hardware callouts (A35, A34) are not sheet ids; overprinted (doubled) text is evidence once.
import { it, expect } from 'vitest';
import { analyze, hardwareCallout } from '../../io/plancheck';
it('A35 / A34 callouts are not read as the sheet id', () => {
  const c = analyze([{ page: 1, lines: ['FRAMING PLAN', 'A35', 'TYP. AT EA. RAFTER', 'A34', 'S2.1'] }]);
  expect(c.sheets[0].id).toBe('S2.1');
  const r = analyze([{ page: 1, lines: ['ROOF FRAMING', 'S7', 'S7', 'A2'] }]); expect(r.sheets[0].id).toBe('A2');
});
it('real sheet ids still count', () => {
  expect(hardwareCallout('A3.5', ['A3.5'])).toBe(false); expect(hardwareCallout('A2', ['A2'])).toBe(false); expect(hardwareCallout('A35', ['A35'])).toBe(true);
  expect(analyze([{ page: 1, lines: ['FLOOR PLAN', 'A2.1'] }]).sheets[0].id).toBe('A2.1');
});
it('doubled overprinted text appears once in evidence', () => {
  const c = analyze([{ page: 1, lines: ['SITE PLAN', 'SITE PLAN', 'SETBACK 5\'-0"', 'SETBACK 5\'-0"', 'A1'] }]);
  for (const i of c.items) { const ev = i.evidence.map(h => `${h.page}|${h.text}`); expect(ev.length, i.id).toBe(new Set(ev).size); }
});
