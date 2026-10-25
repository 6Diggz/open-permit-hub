// @ts-nocheck -- vendored seat test (round 5)
// r5plan-03: titles listed in the cover-sheet SHEET INDEX are counted as if those sheets exist (I.C.5 / I.C.6 'addressed').
import { describe, it, expect } from 'vitest';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
import { planSet, goodSet, TITLE, type SheetSpec } from './fixtures/r5plan_gen';
const read = async (s: SheetSpec[], st = {}) => analyze((await extractPages(await planSet(s, TITLE, st), pdfjs as any)).pages);
const it_ = (c: any, id: string) => c.items.find((i: any) => i.id === id);
const floor = (notes: string[]): SheetSpec[] => [{ id: 'A0.0', title: 'TITLE SHEET', notes: [] }, { id: 'A2.1', title: 'FLOOR PLAN', scale: 'SCALE: 1/4" = 1\'-0"', notes }];

it('r5plan-03 sheet index is not the sheets', async () => {
  const s: SheetSpec[] = [{ id: 'A0.0', title: 'TITLE SHEET', notes: ['SHEET INDEX', 'A2.1 FLOOR PLAN', 'A3.1 ELEVATIONS', 'A4.1 BUILDING SECTIONS', 'T24.1 TITLE 24 ENERGY COMPLIANCE', 'S1 FOUNDATION PLAN', 'S2 ROOF FRAMING PLAN', 'A2.0 EXISTING FLOOR PLAN'] },
    { id: 'A2.1', title: 'FLOOR PLAN', notes: [] }];
  const c = await read(s);
  expect(it_(c, 'I.C.5').state).not.toBe('addressed'); expect(it_(c, 'I.C.6').state).not.toBe('addressed');
  expect(c.sheets[0].kinds).not.toContain('elevation');
});
