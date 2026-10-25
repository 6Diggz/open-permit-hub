// @ts-nocheck -- vendored seat test (round 5)
// r5plan-04: a value read from the sheet that FAILS the rule still gives 'Appears addressed' (ceiling 6'-8\" at High; 18\"x22\" escape window).
import { describe, it, expect } from 'vitest';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
import { planSet, goodSet, TITLE, type SheetSpec } from './fixtures/r5plan_gen';
const read = async (s: SheetSpec[], st = {}) => analyze((await extractPages(await planSet(s, TITLE, st), pdfjs as any)).pages);
const it_ = (c: any, id: string) => c.items.find((i: any) => i.id === id);
const floor = (notes: string[]): SheetSpec[] => [{ id: 'A0.0', title: 'TITLE SHEET', notes: [] }, { id: 'A2.1', title: 'FLOOR PLAN', scale: 'SCALE: 1/4" = 1\'-0"', notes }];

it('r5plan-04a low ceiling is not addressed/high', async () => { const c = await read(floor(["CEILING HEIGHT 6'-8\""])); const i = it_(c, 'III.G.1');
  expect(i.state).not.toBe('addressed'); expect(i.confidence).not.toBe('high'); });
it('r5plan-04b undersized escape window is not addressed', async () => { const c = await read(floor(['EGRESS WINDOW 18\" X 22\"'])); expect(it_(c, 'III.F.1').state).not.toBe('addressed'); });
