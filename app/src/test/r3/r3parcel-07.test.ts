// Sev 3: 207 E Horizon Ave (APN 4238-010-016) is split-zoned C1-1-O + RD1.5-1-O in ZIMAS; the point probe fills only "RD1.5-1-O".
import { it, expect } from 'vitest'; import { lookupParcel, type FetchLike } from '../../io/parcel'; import { replay } from './_r3parcel_mock';
it('a lot touching two zones reports both', async () => {
  const { address, fetch: base } = replay('horizon');
  const fetch: FetchLike = async (url, init) => {
    if (url.includes('/zoning/MapServer/1102/') && url.includes('esriGeometryPolygon')) return { ok: true, status: 200, json: async () => ({ features: [{ attributes: { ZONE_CMPLT: 'C1-1-O' } }, { attributes: { ZONE_CMPLT: 'RD1.5-1-O' } }] }) };
    if (url.includes('/zoning/MapServer/1102/') && url.includes('esriGeometryEnvelope')) return { ok: true, status: 200, json: async () => ({ features: [{ attributes: { ZONE_CMPLT: 'C1-1-O' } }, { attributes: { ZONE_CMPLT: 'RD1.5-1-O' } }] }) };
    return base(url, init);
  };
  const r = await lookupParcel(address, { fetch });
  expect(r.ok && r.fill.zone).toMatch(/C1-1-O/); expect(r.ok && r.fill.zone).toMatch(/RD1\.5-1-O/);
});
