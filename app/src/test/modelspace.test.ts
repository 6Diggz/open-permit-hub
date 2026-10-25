// Review 3 F5: model space runs the same label pass as the sheets, so labels never collide at the zoom's annotation scale.
import { describe, it, expect } from 'vitest';
import { labelDrawing, modelOverlaps } from '../out/sheet';
import { draft, SCALES } from '../ui/pro/drafting';
import { furnished } from './_sheetfix';
import { demoProject } from '../core/model';

describe('model space labels', () => {
  for (const [name, mk] of [['demo', demoProject], ['furnished', furnished]] as const) for (const sc of SCALES.filter(s => s.k >= 16 && s.k <= 192)) it(`${name} at ${sc.label}: no label on a label or on foreign linework`, () => {
    const k = sc.k * 25.4; const raw = draft(mk(), { anno: k }); const d = labelDrawing(raw, k);
    // labels that cannot sit clear at this zoom are left out (shown when zoomed in), never more than 30%
    expect(d.texts.length).toBeGreaterThanOrEqual(raw.texts.length * 0.7);
    if (sc.k <= 48) expect(d.texts.length).toBe(raw.texts.length);
    expect(modelOverlaps(d, k)).toEqual([]);
  });
  it('the unlabeled drawing does collide (the test can fail)', () => { const k = 48 * 25.4; expect(modelOverlaps(draft(furnished(), { anno: k }), k).length).toBeGreaterThan(0); });
});
