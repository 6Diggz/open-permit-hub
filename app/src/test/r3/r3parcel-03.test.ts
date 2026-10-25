// Sev 3: Downtown lots use Chapter 1A zoning (ZIMAS zoning layer 1101, 2,230 areas). Only layer 1102 is asked, so the zone is silently blank (200 N Spring St real: 1101 = "[LF1-WH1-5][P2-FA][CPIO]", 1102 = nothing).
import { it, expect } from 'vitest'; import { lookupParcel } from '../../io/parcel'; import { mockFetch } from './_r3parcel_mock';
it('fills the Chapter 1A zone when the old zoning layer has none', async () => {
  const fetch = mockFetch({ candidate: '200 N SPRING ST, 90012', parcels: [{ tip: '200 N SPRING ST', bpp: '5161005906' }], zone1101: '[LF1-WH1-5][P2-FA][CPIO]' });
  const r = await lookupParcel('200 N Spring St 90012', { fetch });
  expect(r.ok && r.fill.zone).toBeTruthy();
});
