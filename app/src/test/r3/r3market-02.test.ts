// r3market-02: lookup must also ask ZIMAS building outlines (LARIAC 2023) so the house and garage are drawn from the map,
// not left as example sizes. Live check 2026-10-24: APN 5006-010-011 returns 2 outlines (2067 sq ft house, 453 sq ft garage).
import { describe, it, expect } from 'vitest';
import { PARCEL_SOURCES } from '../../io/parcel';
import { applyParcel } from '../../io/parcel-apply';
import { blankProject } from '../../core/model';
import { rect } from '../../core/geom';
import { ft } from '../../core/units';

describe('r3market-02 building outlines from the parcel map', () => {
  it('has a building-outline source on zimas.lacity.org (already allowed by the CSP)', () => {
    expect(Object.values(PARCEL_SOURCES).some((s: any) => /zma\/bldgoutlines\/MapServer\/163/.test(s.url))).toBe(true);
  });
  it('applyParcel places house and garage from fill.buildings and marks them as from the map (verify on site)', () => {
    const fill: any = { matched: 'x', zip: '', at: '2026-10-24T00:00:00Z', lot: rect(0, 0, ft(50), ft(135)), widthMm: ft(50), depthMm: ft(135), apn: '', zone: '', jurisdiction: 'la-city', cityName: 'Los Angeles',
      flags: { hillside: 'no', vhfhsz: 'no', coastal: 'no', hpoz: 'no' }, failed: [], zimasPin: '', multiPiece: false,
      buildings: [rect(ft(10), ft(20), ft(30), ft(69)), rect(ft(25), ft(105), ft(21), ft(21.5))] };
    const { next, filled } = applyParcel(blankProject(), fill);
    expect(filled).toEqual(expect.arrayContaining(['house', 'garage']));
    expect(Math.round(next.site.primary.reduce((m, p) => Math.max(m, p.y), 0))).toBe(Math.round(ft(89)));
    expect(Math.round(next.adu.footprint.reduce((m, p) => Math.max(m, p.x), 0))).toBe(Math.round(ft(46)));
  });
});
