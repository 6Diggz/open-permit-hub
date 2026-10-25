// Lane B extras: r3parcel-08 address cleanup, r3parcel-09 alias retry + closest match, r3people-07 DXF north arrow.
import { it, expect } from 'vitest';
import { splitAddress, lookupParcel, type FetchLike } from '../../io/parcel';
import { sitePlanSpec } from '../../out/dxf';
import { demoProject } from '../../core/model';
it('r3parcel-08: ", USA" keeps the ZIP; a street named Suite is kept; unit words are cut', () => {
  expect(splitAddress('1300 W Carroll Ave Apt 2, Los Angeles, CA 90026, USA')).toEqual({ street: '1300 W Carroll Ave', zip: '90026' });
  expect(splitAddress('1300 Suite Ave 90026').street).toBe('1300 Suite Ave');
  expect(splitAddress('1100 Wilshire Blvd #2001, 90017').street).toBe('1100 Wilshire Blvd');
});
it('r3parcel-09: Avenida Cesar Chavez is retried as the official name; a weak match is offered, not used', async () => {
  const seen: string[] = [];
  const f: FetchLike = async url => { seen.push(decodeURIComponent(url)); const official = /CESAR E CHAVEZ/i.test(decodeURIComponent(url));
    return { ok: true, status: 200, json: async () => url.includes('findAddressCandidates') ? { candidates: [{ address: official ? '1300 E CESAR E CHAVEZ AVE, 90033' : '1300 E CESAR E CHAVEZ AVE, 90033', score: official ? 100 : 74, location: { x: -118.2, y: 34.05 } }] } : { features: [] } }; };
  const r = await lookupParcel('1300 E Avenida Cesar Chavez 90033', { fetch: f });
  expect(seen.some(u => /Cesar E Chavez Ave/.test(u))).toBe(true); expect(r.ok).toBe(true);
  const weak: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ address: '1300 W TEMPLE ST, 90012', score: 72, location: { x: -118.2, y: 34.05 } }] }) });
  expect(await lookupParcel('1300 Templ St 90012', { fetch: weak })).toEqual({ ok: false, error: 'not-found', detail: '1300 W TEMPLE ST, 90012' });
});
it('r3people-07: the DXF has a north arrow that turns with the project north', () => {
  const a = demoProject(), b = demoProject(); a.site.northDeg = 0; b.site.northDeg = 90;
  const arrow = (p: typeof a) => sitePlanSpec(p).texts.find(t => t.text === 'N')!;
  expect(arrow(a)).toBeTruthy(); expect(arrow(a).x).not.toBeCloseTo(arrow(b).x, 0);
  const c = demoProject(); c.site.northDeg = null; expect(sitePlanSpec(c).texts.some(t => /NORTH NOT SET/.test(t.text))).toBe(true);
});
