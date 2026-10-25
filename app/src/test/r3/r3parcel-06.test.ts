// Sev 3: 2808 N Durand Dr (hillside, curved frontage) comes back as a 26-edge outline with twelve 1.7-2.4 ft edges.
import { it, expect } from 'vitest'; import { lookupParcel } from '../../io/parcel'; import { replay } from './_r3parcel_mock';
const area = (p: { x: number; y: number }[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2);
it('curved lot lines become a few usable edges, area kept within 1.5%', async () => {
  const { address, fetch } = replay('durand'); const r = await lookupParcel(address, { fetch });
  expect(r.ok && r.fill.lot).toBeTruthy(); if (!r.ok || !r.fill.lot) return; const lot = r.fill.lot;
  const short = lot.filter((a, i) => { const b = lot[(i + 1) % lot.length]; return Math.hypot(b.x - a.x, b.y - a.y) < 4 * 304.8; });
  expect(short.length).toBeLessThanOrEqual(1);
  expect(Math.abs(area(lot) / 92903.04 - 6954) / 6954).toBeLessThan(0.015); // ZIMAS Shape_Area 6,954 sf
});
