// r3sec-01 / r3sec-02: a hostile/compromised ZIMAS or GeoHub response is written to the
// project with NO length cap and NO coordinate-magnitude cap on the LIVE apply path.
// migrate() caps these on reload (str(...,40), okPoly <1e12) but lookupParcel+applyParcel do not,
// so the running session stores unbounded strings and enormous geometry straight from the network.
import { describe, it, expect } from 'vitest';
import { lookupParcel, type FetchLike } from '../../io/parcel';
import { applyParcel } from '../../io/parcel-apply';
import { blankProject } from '../../core/model';
import { bbox } from '../../core/geom';

const ring = [[-118.2801, 34.0001], [-118.2799, 34.0001], [-118.2799, 34.0003], [-118.2801, 34.0003], [-118.2801, 34.0001]];
const BIG = 'X'.repeat(100000);

function mockFetch(opts: { zone?: string; apn?: string; rings?: number[][][] }): FetchLike {
  return async (url: string) => {
    const j = (o: unknown) => ({ ok: true, status: 200, json: async () => o });
    if (url.includes('GeocodeServer'))
      return j({ candidates: [{ address: '1234 W 52ND ST, LOS ANGELES, CA 90037', score: 100, location: { x: -118.28, y: 34.0002 } }] });
    if (url.includes('Landbase_Information/MapServer/5'))
      return j({ features: [{ attributes: { TOOLTIP: '1234 W 52ND ST\\nLos Angeles', BPP: opts.apn ?? '4235023010', PIND: 'PIN123' }, geometry: { rings: opts.rings ?? [ring] } }] });
    if (url.includes('zma/zoning'))
      return j({ features: [{ attributes: { ZONE_CMPLT: opts.zone ?? 'R1-1' } }] });
    return j({ features: [] }); // city, adjacent, overlays: empty
  };
}

describe('r3sec-01 unbounded parcel strings', () => {
  it('caps a 100k-char zone from a hostile ZIMAS response', async () => {
    const r = await lookupParcel('1234 W 52nd St, Los Angeles, CA 90037', { fetch: mockFetch({ zone: BIG }), online: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // A real LA zone string is < 40 chars. Anything much larger is a hostile/garbage response.
    expect(r.fill.zone.length).toBeLessThanOrEqual(64);
  });

  it('caps a 100k-char APN from a hostile response', async () => {
    const r = await lookupParcel('1234 W 52nd St, Los Angeles, CA 90037', { fetch: mockFetch({ apn: 'A'.repeat(100000) }), online: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fill.apn.length).toBeLessThanOrEqual(64);
  });
});

describe('r3sec-02 unbounded parcel geometry', () => {
  it('rejects a finite-but-enormous lot ring (coords ~1e12 mm)', async () => {
    // Finite coordinates far apart: passes the Number.isFinite() filter but is astronomically large.
    const huge = [[-118, 34], [8000, 34], [8000, 9000], [-118, 9000], [-118, 34]];
    const r = await lookupParcel('1234 W 52nd St, Los Angeles, CA 90037', { fetch: mockFetch({ rings: [huge] }), online: true });
    expect(r.ok).toBe(true);
    if (!r.ok || !r.fill.lot) { expect(r.ok && r.fill.lot === null).toBe(true); return; }
    const { next } = applyParcel(blankProject(), r.fill);
    const b = bbox(next.site.lot);
    const spanMm = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    // A real lot is under ~1000 ft (~305000 mm). okPoly in permitpack rejects coords >= 1e12;
    // the live path should not accept a lot larger than any real parcel.
    expect(Number.isFinite(spanMm)).toBe(true);
    expect(spanMm).toBeLessThan(1e9);
  });
});
