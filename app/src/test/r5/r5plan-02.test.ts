// @ts-nocheck -- vendored seat test (round 5)
// r5plan-02: 'hers' is matched inside WASHERS / OTHERS, so Title 24 (III.H.9) is 'Appears addressed' High on sets with no energy notes.
// Seen on the real City of South Gate approved ADU set (p.8 'USE MALLEABLE IRON WASHERS ...').
import { describe, it, expect } from 'vitest';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
import { planSet, goodSet, TITLE, type SheetSpec } from './fixtures/r5plan_gen';
const read = async (s: SheetSpec[], st = {}) => analyze((await extractPages(await planSet(s, TITLE, st), pdfjs as any)).pages);
const it_ = (c: any, id: string) => c.items.find((i: any) => i.id === id);
const floor = (notes: string[]): SheetSpec[] => [{ id: 'A0.0', title: 'TITLE SHEET', notes: [] }, { id: 'A2.1', title: 'FLOOR PLAN', scale: 'SCALE: 1/4" = 1\'-0"', notes }];

it('r5plan-02 WASHERS is not HERS', async () => {
  const c = await read(floor(['USE MALLEABLE IRON WASHERS UNDER HEAD AND NUT', 'BY OTHERS']));
  expect(it_(c, 'III.H.9').state).toBe('missing');
});
