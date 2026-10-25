// @ts-nocheck -- vendored seat test (round 5)
// r5plan-06: vertical (rotated 90 deg) title block, common on 24x36 sheets: owner is read as the address and preparer as the owner,
// yet I.C.2 says 'Appears addressed' High; sheet numbers are not read.
import { describe, it, expect } from 'vitest';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
import { planSet, goodSet, TITLE, type SheetSpec } from './fixtures/r5plan_gen';
const read = async (s: SheetSpec[], st = {}) => analyze((await extractPages(await planSet(s, TITLE, st), pdfjs as any)).pages);
const it_ = (c: any, id: string) => c.items.find((i: any) => i.id === id);
const floor = (notes: string[]): SheetSpec[] => [{ id: 'A0.0', title: 'TITLE SHEET', notes: [] }, { id: 'A2.1', title: 'FLOOR PLAN', scale: 'SCALE: 1/4" = 1\'-0"', notes }];

it('r5plan-06 rotated title block', async () => {
  const c = await read(goodSet(), { rotateTitle: true });
  expect(c.title.owner?.text).toBe('MARIA LOPEZ'); expect(c.sheets[1].id).toBe('A1.1');
});
