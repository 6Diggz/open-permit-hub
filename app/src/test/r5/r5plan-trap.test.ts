// Coordinator: the trap set (negated notes, failing values, index-only sheets, WASHERS) must give zero false "addressed".
import { it, expect } from 'vitest';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
import { planSet, trapSet, goodSet, TITLE } from './fixtures/r5plan_gen';
it('trap set: no item is addressed except the ones really shown', async () => {
  const c = analyze((await extractPages(await planSet(trapSet(), TITLE), pdfjs as any)).pages);
  const bad = c.items.filter(i => i.state === 'addressed' && !['I.C.2', 'N.4'].includes(i.id)).map(i => i.id + ' ' + i.evidence.map(e => e.text).join('|'));
  expect(bad).toEqual([]);
  expect(c.items.find(i => i.id === 'III.G.1')!.state).toBe('conflict'); expect(c.items.find(i => i.id === 'III.F.1')!.state).toBe('conflict');
  expect(c.items.find(i => i.id === 'III.E.1')!.state).toBe('negated');
});
it('good set still reads as addressed', async () => {
  const c = analyze((await extractPages(await planSet(goodSet(), TITLE), pdfjs as any)).pages);
  for (const id of ['III.G.1', 'III.F.1', 'III.E.1', 'I.C.5', 'III.H.9']) expect(c.items.find(i => i.id === id)!.state, id).toBe('addressed');
});
