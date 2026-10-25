// @ts-nocheck -- vendored seat test (round 5)
// r5plan-01: a note that says the thing is NOT there makes the item 'Appears addressed' (often High).
import { describe, it, expect } from 'vitest';
import * as pdfjs from '../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analyze, extractPages } from '../../io/plancheck';
import { planSet, goodSet, TITLE, type SheetSpec } from './fixtures/r5plan_gen';
const read = async (s: SheetSpec[], st = {}) => analyze((await extractPages(await planSet(s, TITLE, st), pdfjs as any)).pages);
const it_ = (c: any, id: string) => c.items.find((i: any) => i.id === id);
const floor = (notes: string[]): SheetSpec[] => [{ id: 'A0.0', title: 'TITLE SHEET', notes: [] }, { id: 'A2.1', title: 'FLOOR PLAN', scale: 'SCALE: 1/4" = 1\'-0"', notes }];

describe('r5plan-01 negated notes', () => {
  for (const [id, note] of [['III.E.1', 'SMOKE ALARMS: NOT PROVIDED'], ['III.E.3', 'CARBON MONOXIDE ALARM: N/A'], ['III.G.4', 'NO BATHROOM EXHAUST FAN (WINDOW VENT)'],
    ['III.H.2', 'NO TEMPERED GLASS REQUIRED'], ['III.I.1', 'NOT ALL-ELECTRIC: GAS RANGE AND GAS WATER HEATER'], ['III.J.1', 'VAPOR RETARDER: N/A'], ['III.E.4', 'FIRE SPRINKLERS: TBD']] as const)
    it(id + ' is not addressed by: ' + note, async () => { const c = await read(floor([note])); expect(it_(c, id).state).not.toBe('addressed'); });
});
