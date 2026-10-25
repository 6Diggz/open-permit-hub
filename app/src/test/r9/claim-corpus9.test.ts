// r9-02: one claim corpus across r7 + r8 + p9 (48 compliant notes). "Says not provided" precision and recall stay >= 95%.
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
import { C7 } from '../r7/corpus7';
import { C8 } from '../r8/corpus8';
import { P9 } from './fixtures/p9';
const ALL: [string, string, string][] = [...C7, ...C8, ...P9.map(([l, id]) => [l, id, 'P'] as [string, string, string])];
const run = (line: string, id: string) => analyze([{ page: 1, lines: ['A1.0 FLOOR PLAN', line] }]).items.find(i => i.id === id)!;
it('corpus has 200+ rows', () => { expect(ALL.length).toBeGreaterThanOrEqual(200); });
it('precision and recall of "Says not provided" >= 95% over r7+r8+p9', () => {
  let tp = 0, fp = 0, fn = 0; const miss: string[] = [];
  for (const [l, id, w] of ALL) { const neg = run(l, id).state === 'negated'; if (w === 'N') { if (neg) tp++; else { fn++; miss.push('FN ' + l); } } else if (neg) { fp++; miss.push('FP ' + l); } }
  const p = tp / (tp + fp), r = tp / (tp + fn);
  console.log(`CORPUS rows=${ALL.length} tp=${tp} fp=${fp} fn=${fn} precision=${(p * 100).toFixed(1)} recall=${(r * 100).toFixed(1)}`, miss.join(' | '));
  expect(p).toBeGreaterThanOrEqual(0.95); expect(r).toBeGreaterThanOrEqual(0.95);
});
// r9-01: existence/removal marks bind only to the size they sit next to.
const esc = (l: string) => analyze([{ page: 1, lines: ['A1.0 FLOOR PLAN', 'EMERGENCY ESCAPE AND RESCUE OPENING PER R310', l] }]).items.find(x => x.id === 'III.F.1')!.state;
it.each([
  ['BEDROOM 2 EGRESS WINDOW 18" X 22" REPLACES (E) 36" X 48"', 'conflict'],
  ['EGRESS WINDOW 18" X 22" AT (E) WALL', 'conflict'],
  ['EGRESS WINDOW 18" X 22" IN EXISTING OPENING ENLARGED', 'conflict'],
  ['EGRESS WINDOW 18" X 22" NET CLEAR (REMOVE (E) SASH)', 'conflict'],
  ['EGRESS WINDOW 18" X 22" WHERE (E) WINDOW WAS', 'conflict'],
  ['EGRESS WINDOW 18" X 22" NEW, (E) 36"X48" TO BE REMOVED', 'conflict'],
  ['EGRESS WINDOW 18" X 22" (NEW) NEXT TO (E) DOOR', 'conflict'],
  ['EGRESS WINDOW 18" X 22" EXISTING WALL REMOVED', 'conflict'],
  ['EGRESS WINDOW (E) 18" X 20" TO REMAIN; NEW EGRESS WINDOW 36" X 48" NET CLEAR', 'addressed'],
  ['EGRESS WINDOW 36" X 48" NET CLEAR, R.O. 20" X 22"', 'addressed'],
  ['EGRESS WINDOW 36" X 48" NET CLEAR. EXISTING 18" X 20" WINDOW TO BE REMOVED', 'addressed'],
  ['EGRESS WINDOW 36" X 48" NET CLEAR, 18" X 20" (E)', 'addressed'],
  ['EGRESS WINDOW 36" X 48" NET CLEAR, 18" X 20" (EXISTING)', 'addressed'],
  ['EGRESS WINDOW 36" X 48" NET CLEAR, ROUGH OPENING 20" X 22"', 'addressed'],
  ['EGRESS WINDOW: NEW 36" X 48". (E) WINDOW 18" X 20" TO BE REMOVED', 'addressed'],
])('escape size binding: %s -> %s', (l, want) => { expect(esc(l)).toBe(want); });
