// r4juris-02: typed street suffix (Blvd) is ignored; "500 W Manchester Blvd" accepts "500 W MANCHESTER AVE" (a different street).
import { it, expect } from 'vitest';
import { lookupParcel, type FetchLike } from '../../io/parcel';
const f: FetchLike = async url => ({ ok: true, status: 200, json: async () => url.includes('findAddressCandidates')
  ? { candidates: [{ address: '500 W MANCHESTER AVE, 90044', score: 90, location: { x: -118.28, y: 33.96 } }] } : { features: [] } });
it('r4juris-02 suffix mismatch is refused', async () => {
  const r = await lookupParcel('500 W Manchester Blvd, Inglewood, CA 90301'.replace(', CA 90301', ''), { fetch: f, timeoutMs: 5000 });
  expect(r.ok).toBe(false);
});
