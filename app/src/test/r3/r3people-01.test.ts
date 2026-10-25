import { describe, it, expect } from 'vitest';
import { lookupParcel } from '../../io/parcel';
// Geocoder interpolates a house number that has no parcel (1234 W 24th St). The app must not say
// "map layers did not answer" (a network excuse) and must not say "Found"; it must flag a no-match.
const fakeFetch = async (u: string) => {
  const body = /findAddressCandidates/.test(u)
    ? { candidates: [{ address: '1234 W 24TH ST, 90007', score: 100, location: { x: -118.2874, y: 34.0343 } }] }
    : /Landbase_Information\/MapServer\/5/.test(u)
      ? { features: [{ attributes: { TOOLTIP: '1236 W 24TH ST \\nAPN: 5055016023', BPP: '5055016023' }, geometry: { rings: [[[0,0],[0,1],[1,1],[1,0],[0,0]]] } }] }
      : { features: [] };
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as any;
};
describe('r3people-01 parcel no-match is not a network failure', () => {
  it('flags the house number as not found instead of "layer did not answer"', async () => {
    const r: any = await lookupParcel('1234 W 24th St, Los Angeles, CA 90007', { fetch: fakeFetch as any });
    const noMatch = !r.ok ? r.error === 'no-parcel' : (r.fill.noParcelMatch === true && !r.fill.failed.includes('parcel'));
    expect(noMatch).toBe(true);
  });
});
