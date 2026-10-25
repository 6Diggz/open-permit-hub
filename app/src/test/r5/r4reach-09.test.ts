// r4reach-09: HTML report prints cleanly: print styles, a dated header line, a print button hidden in print.
import { it, expect } from 'vitest';
import { base, run } from '../r3/golden_base';
import { reportHTML } from '../../out/reporthtml';
it('report has print rules, date line and print button', () => {
  const p = base(); const h = reportHTML(p, run(p).rep, 'en');
  expect(h).toMatch(/@media print\{.*li\{break-inside:avoid/); expect(h).toMatch(/@page\{margin:/);
  expect(h).toMatch(/window\.print\(\)/); expect(h).toMatch(/class="noprint"/);
  expect(h).toMatch(/\d{4}-\d{2}-\d{2}/);
});
