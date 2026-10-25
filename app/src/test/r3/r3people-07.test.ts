import { describe, it, expect } from 'vitest';
import { lookupParcel } from '../../io/parcel';
import { applyParcel } from '../../io/parcel-apply';
import { blankProject } from '../../core/model';
// Lot fronts a north-south street to its EAST. ringToLot rotates the street edge to the bottom of the sheet,
// so "up" on the sheet is WEST. The PDF north arrow (out/pdf.ts:67) is always drawn straight up -> wrong by 90 deg.
const lon0 = -118.30, lat0 = 34.05, dLon = 40 / 92500, dLat = 15 / 111000; // ~40 m deep (E-W), 15 m wide (N-S)
const ring = [[lon0, lat0], [lon0 + dLon, lat0], [lon0 + dLon, lat0 + dLat], [lon0, lat0 + dLat], [lon0, lat0]];
const streetPt = { x: lon0 + dLon + 8 / 92500, y: lat0 + dLat / 2 };
const fakeFetch = async (u: string) => {
  const body = /findAddressCandidates/.test(u) ? { candidates: [{ address: '4302 N EDENHURST AVE, 90039', score: 100, location: streetPt }] }
    : /Landbase_Information\/MapServer\/5/.test(u) ? { features: [{ attributes: { TOOLTIP: '4302 N EDENHURST AVE \\nAPN: 5590001001', BPP: '5590001001' }, geometry: { rings: [ring] } }] }
    : /Boundaries\/MapServer\/7/.test(u) ? { features: [{ attributes: {} }] } : { features: [] };
  return { ok: true, status: 200, json: async () => body } as any;
};
describe('r3people-07 north arrow follows the real parcel orientation', () => {
  it('stores which way is north after a parcel lookup rotates the lot', async () => {
    const r: any = await lookupParcel('4302 N Edenhurst Ave, Los Angeles, CA 90039', { fetch: fakeFetch as any });
    expect(r.ok).toBe(true);
    const { next } = applyParcel(blankProject(), r.fill) as any;
    const deg = next.site.northDeg ?? r.fill.northDeg; // degrees clockwise from sheet-up to true north
    expect(typeof deg).toBe('number');
    expect(Math.abs(Math.sin((deg * Math.PI) / 180))).toBeGreaterThan(0.9); // street to the east => north is sideways on the sheet
  });
});
