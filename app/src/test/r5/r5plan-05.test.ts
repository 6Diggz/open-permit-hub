// @ts-nocheck -- vendored seat test (round 5)
// r5plan-05: I.C.8 says confidence High while the state is Partial (any 6 of 7 fields, even when the 'value' is the next unrelated line).
import { describe, it, expect } from 'vitest';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
import { planSet, goodSet, TITLE, type SheetSpec } from './fixtures/r5plan_gen';
const read = async (s: SheetSpec[], st = {}) => analyze((await extractPages(await planSet(s, TITLE, st), pdfjs as any)).pages);
const it_ = (c: any, id: string) => c.items.find((i: any) => i.id === id);
const floor = (notes: string[]): SheetSpec[] => [{ id: 'A0.0', title: 'TITLE SHEET', notes: [] }, { id: 'A2.1', title: 'FLOOR PLAN', scale: 'SCALE: 1/4" = 1\'-0"', notes }];

it('r5plan-05 partial is never high', async () => {
  const s: SheetSpec[] = [{ id: 'A0.0', title: 'TITLE SHEET', notes: ['OCCUPANCY: R-3', 'TYPE V-B', '1 STORY', 'LOT AREA: 5,600 SQ FT', '380 SQ FT LIVABLE ADU', `HEIGHT: 12'-0"`] }];
  const c = await read(s); const i = it_(c, 'I.C.8'); expect(i.state).toBe('partial'); expect(i.confidence).not.toBe('high');
});
