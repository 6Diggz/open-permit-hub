// @ts-nocheck -- vendored seat test (round 5)
// r5plan-07: weak words alone mark items addressed: 'MUDSILL'/'SILL PLATE' or 'ANCHOR BOLTS: SEE ENGINEER' -> III.J.18; 'EXISTING ENTRY DOOR' -> III.F.2.
import { describe, it, expect } from 'vitest';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
import { planSet, goodSet, TITLE, type SheetSpec } from './fixtures/r5plan_gen';
const read = async (s: SheetSpec[], st = {}) => analyze((await extractPages(await planSet(s, TITLE, st), pdfjs as any)).pages);
const it_ = (c: any, id: string) => c.items.find((i: any) => i.id === id);
const floor = (notes: string[]): SheetSpec[] => [{ id: 'A0.0', title: 'TITLE SHEET', notes: [] }, { id: 'A2.1', title: 'FLOOR PLAN', scale: 'SCALE: 1/4" = 1\'-0"', notes }];

it('r5plan-07a sill plate is not anchor bolts', async () => { const c = await read(floor(['MUDSILL: EXISTING', '2X SILL PLATE'])); expect(it_(c, 'III.J.18').state).not.toBe('addressed'); });
it('r5plan-07b see engineer is not addressed', async () => { const c = await read(floor(['ANCHOR BOLTS: SEE ENGINEER'])); expect(it_(c, 'III.J.18').state).not.toBe('addressed'); });
it('r5plan-07c door without size is not addressed', async () => { const c = await read(floor(['EXISTING ENTRY DOOR TO REMAIN'])); expect(it_(c, 'III.F.2').state).not.toBe('addressed'); });
