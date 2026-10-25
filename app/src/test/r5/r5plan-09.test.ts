// @ts-nocheck -- vendored seat test (round 5)
// r5plan-09: metric / decimal-feet dimensions are not read: 1220 mm setback and 2440 mm ceiling vanish, so the under-5-ft 1-hour warning is lost.
import { describe, it, expect } from 'vitest';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
import { planSet, goodSet, TITLE, type SheetSpec } from './fixtures/r5plan_gen';
const read = async (s: SheetSpec[], st = {}) => analyze((await extractPages(await planSet(s, TITLE, st), pdfjs as any)).pages);
const it_ = (c: any, id: string) => c.items.find((i: any) => i.id === id);
const floor = (notes: string[]): SheetSpec[] => [{ id: 'A0.0', title: 'TITLE SHEET', notes: [] }, { id: 'A2.1', title: 'FLOOR PLAN', scale: 'SCALE: 1/4" = 1\'-0"', notes }];

it('r5plan-09 mm dims', async () => {
  const c = await read(goodSet('mm'));
  expect(c.dims.ceilings.length).toBeGreaterThan(0); expect(c.dims.setbacks.some(s => Math.abs(s.inches - 48) < 1)).toBe(true);
  expect(it_(c, 'III.D.1').attention).toBeDefined();
});
