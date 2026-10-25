// r5field-01: the site-visit checklist must cover the trades an LA inspector signs off on a garage conversion
// (LA County DPW "ADU Inspection Checklist": rough/final electrical, rough plumbing + tests, mechanical/exhaust, insulation,
// drywall/lath, window flashing, final). Match on item wording, any language-neutral id is fine.
import { describe, it, expect } from 'vitest';
import { INSP_ITEMS } from '../../core/inspection';
const txt = INSP_ITEMS.map(i => i.id + ' ' + i.en).join('\n').toLowerCase();
describe('r5field-01 checklist coverage', () => {
  for (const [name, re] of [
    ['electrical panel / rough wiring', /panel|rough (wiring|electrical)/],
    ['GFCI or AFCI protection', /gfci|afci|ground.fault|arc.fault/],
    ['plumbing rough or pressure/top-out test', /top.out|pressure test|rough plumbing|water test/],
    ['gas test', /gas (line |pressure )?test/],
    ['insulation inspection', /insulation/],
    ['drywall / lath / nailing inspection', /drywall|lath|gypsum/],
    ['window flashing at new windows', /flashing/],
    ['garage door opening infill footing/sill', /footing|curb|sill plate|infill/],
  ] as [string, RegExp][]) it(name, () => expect(txt).toMatch(re));
  it('items carry an inspection stage so they can be ordered like the inspection card', () => {
    expect(INSP_ITEMS.every((i: any) => typeof i.stage === 'string' && i.stage.length > 0)).toBe(true);
  });
});
