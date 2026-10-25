// r3market-01: after an address lookup alone, the homeowner must get a plain-language answer to
// "Can I turn my garage into an ADU?" (Symbium-style), not only "Some answers are missing" + 23 Need info.
import { describe, it, expect } from 'vitest';
import { blankProject } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { applyParcel } from '../../io/parcel-apply';
import { rect } from '../../core/geom';
import { ft } from '../../core/units';
import * as readiness from '../../rules/readiness';

describe('r3market-01 plain answer after lookup', () => {
  it('exports plainAnswer(project, report) with a likely-yes/likely-no/unsure verdict in both languages', () => {
    const fill: any = { matched: '5708 S 11TH AVE, 90043', zip: '90043', at: '2026-10-24T00:00:00Z', lot: rect(0, 0, ft(50), ft(135)), widthMm: ft(50), depthMm: ft(135),
      apn: '5006-010-011', zone: 'R1-1', jurisdiction: 'la-city', cityName: 'Los Angeles', flags: { hillside: 'no', vhfhsz: 'no', coastal: 'no', hpoz: 'no' }, failed: [], zimasPin: '', multiPiece: false };
    const { next } = applyParcel(blankProject(), fill);
    const rep = evaluate(next, RULES, PACK_ID, new Date('2026-10-24'));
    const fn = (readiness as any).plainAnswer;
    expect(typeof fn).toBe('function');
    const a = fn(next, rep);
    expect(['likely-yes', 'likely-no', 'unsure']).toContain(a.verdict);
    // r4gold-02: a lookup alone leaves the permit, unit count and attachment open, so the answer is "Maybe", never "Likely yes".
    expect(a.verdict).toBe('unsure');
    expect(a.en).toMatch(/garage/i); expect(a.es.length).toBeGreaterThan(10);
    expect(a.en.split(/\s+/).length).toBeLessThan(40); // one short sentence a homeowner can read
  });
});
