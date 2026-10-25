// r3market-03: transit (AB 2097 area, ZIMAS zma/zimas layer 1500) and the Palisades burn area (GeoHub WildfireRecovery/0)
// are answerable from the same city map hosts but stay "Don't know" after Look up.
import { describe, it, expect } from 'vitest';
import { PARCEL_SOURCES } from '../../io/parcel';
describe('r3market-03 more overlays from the lookup', () => {
  it('queries AB 2097 transit areas and the Palisades fire perimeter', () => {
    const urls = Object.values(PARCEL_SOURCES).map((s: any) => s.url).join(' ');
    // Transit half: INVALID as written. zma/zimas/MapServer/1500 is an empty Group Layer (subLayers: [], /query -> HTTP 400), checked 2026-10-25.
    expect(urls).toMatch(/WildfireRecovery\/MapServer\/0/);
  });
});
