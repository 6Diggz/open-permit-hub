// Sev 4: condo "breakdown" parcels carry BPP like 5143BRKDWN / 4286025BRK. The app writes that as the APN and draws the breakdown sliver as the lot (1100 Wilshire Blvd real: 21.7 ft x 221 ft "lot").
import { it, expect } from 'vitest'; import { lookupParcel } from '../../io/parcel'; import { mockFetch } from './_r3parcel_mock';
it('a BRK breakdown parcel gives no APN and no lot shape', async () => {
  const fetch = mockFetch({ candidate: '1100 W WILSHIRE BLVD, 90017', parcels: [{ tip: '1100 W WILSHIRE BLVD', bpp: '5143BRKDWN' }] });
  const r = await lookupParcel('1100 Wilshire Blvd #2001, 90017', { fetch });
  expect(r.ok && r.fill.apn).toBeFalsy(); expect(r.ok && r.fill.lot).toBeFalsy();
});
