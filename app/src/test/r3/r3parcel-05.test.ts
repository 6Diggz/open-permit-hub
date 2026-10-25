// Sev 4: 1232 W 52nd St (APN 5002-003-024) is 40 ft wide on 52nd St and 134 ft deep. The locator point sits ~46 m east along the block,
// so the nearest-edge-middle rule picks the east SIDE line as the street edge: the lot is drawn 134 ft wide x 40 ft deep.
// Fix idea: score edges by perpendicular distance to the edge's LINE (front line passes ~0.2 m from the point; side line ~35 m).
import { it, expect } from 'vitest'; import { lookupParcel } from '../../io/parcel'; import { replay } from './_r3parcel_mock';
it('street edge is the 40 ft 52nd St frontage, not the 134 ft side line', async () => {
  const { address, fetch } = replay('52nd'); const r = await lookupParcel(address, { fetch });
  expect(r.ok).toBe(true); if (!r.ok) return;
  expect(r.fill.widthMm! / 304.8).toBeCloseTo(40.1, 0); expect(r.fill.depthMm! / 304.8).toBeCloseTo(134, 0);
});
