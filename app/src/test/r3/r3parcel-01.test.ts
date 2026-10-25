// Sev 4: the user typed W 52nd St, the locator answered E 52nd St (a different house ~2.5 mi away) and the app filled its lot, APN and zone.
import { it, expect } from 'vitest'; import { lookupParcel } from '../../io/parcel'; import { mockFetch } from './_r3parcel_mock';
it('a different street direction than the one typed is not accepted as this address', async () => {
  const fetch = mockFetch({ candidate: '1232 E 52ND ST, 90011', score: 92, parcels: [{ tip: '1232 E 52ND ST', bpp: '5104012034' }] });
  const r = await lookupParcel('1232 W 52nd St, Los Angeles, CA 90011', { fetch });
  expect(r.ok && r.fill.apn).toBeFalsy();
});
it('no direction typed is still fine (Carroll Ave -> W CARROLL AVE)', async () => {
  const fetch = mockFetch({ candidate: '1300 W CARROLL AVE, 90026', parcels: [{ tip: '1300 W CARROLL AVE', bpp: '5405016001' }] });
  const r = await lookupParcel('1300 Carroll Ave 90026', { fetch });
  expect(r.ok && r.fill.apn).toBe('5405-016-001');
});
