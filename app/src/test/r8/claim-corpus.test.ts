// r8-01 root cause: text rules cannot prove an item is PROVIDED. The check only claims what it can prove:
// "Not found in the text", "Conflicts with code" (a parsed number fails) and "Says not provided" (an absence phrase).
// Anything else found is neutral: "Found on page N. Confirm it is shown as provided." (never High, always with a quote).
// This corpus (r7 + r8 rows) guards both directions.
import { it, expect } from 'vitest';
import { analyze } from '../../io/plancheck';
import { C7 } from '../r7/corpus7';
import { C8 } from './corpus8';
const ALL = [...C7, ...C8];
const run = (line: string, id: string) => analyze([{ page: 1, lines: ['A1.0 FLOOR PLAN', line] }]).items.find(i => i.id === id)!;
it('corpus has 150+ rows', () => { expect(ALL.length).toBeGreaterThanOrEqual(150); });
it.each(ALL.filter(r => r[2] === 'N'))('absence phrase never shown stronger than Found…confirm: %s [%s]', (line, id) => {
  const i = run(line, id);
  expect(['negated', 'addressed']).toContain(i.state);
  if (i.state === 'addressed') { expect(i.confidence).not.toBe('high'); expect(i.why.en).toMatch(/Confirm it is shown as provided/); }
});
it.each(ALL.filter(r => r[2] !== 'N'))('found item is neutral, medium at most, quoted: %s [%s]', (line, id) => {
  const i = run(line, id);
  if (i.state === 'addressed') { expect(i.confidence).not.toBe('high'); expect(i.evidence.length).toBeGreaterThan(0); expect(i.why.en).toMatch(/^Found .* on page 1\. Confirm it is shown as provided\./); expect(i.why.en).not.toMatch(/addressed|specific note/i); }
});
it('precision of "Says not provided" stays >= 90%, recall >= 90%', () => {
  let tp = 0, fp = 0, fn = 0;
  for (const [l, id, w] of ALL) { const neg = run(l, id).state === 'negated'; if (w === 'N') neg ? tp++ : fn++; else if (neg) fp++; }
  expect(tp / (tp + fp)).toBeGreaterThanOrEqual(0.9); expect(tp / (tp + fn)).toBeGreaterThanOrEqual(0.9);
});
