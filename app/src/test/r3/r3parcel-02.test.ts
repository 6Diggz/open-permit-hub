// Sev 3: no request has a time limit. A ZIMAS layer that never answers keeps "Looking up..." forever.
import { it, expect } from 'vitest'; import { lookupParcel } from '../../io/parcel'; import { mockFetch } from './_r3parcel_mock';
const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<'TIMEOUT'>(r => setTimeout(() => r('TIMEOUT'), ms))]);
it('a hung overlay layer is marked failed and the rest still fills, within 30 s', async () => {
  const fetch = mockFetch({ candidate: '3115 S GRAND AVE, 90007', parcels: [{ tip: '3115 S GRAND AVE', bpp: '5122019014' }], zone1102: 'M1-2', hang: /coastal_zones/ });
  const r = await within(lookupParcel('3115 S Grand Ave 90007', { fetch }), 30000);
  expect(r).not.toBe('TIMEOUT');
  if (r !== 'TIMEOUT') { expect(r.ok && r.fill.apn).toBe('5122-019-014'); expect(r.ok && r.fill.failed).toContain('coastalDual'); }
}, 40000);
it('a hung street locator ends as a network error within 30 s', async () => {
  const fetch = mockFetch({ candidate: 'x', hang: /findAddressCandidates/ });
  const r = await within(lookupParcel('3115 S Grand Ave 90007', { fetch }), 30000);
  expect(r).not.toBe('TIMEOUT'); if (r !== 'TIMEOUT') expect(r.ok).toBe(false);
}, 40000);
