// r4juris-03: unincorporated county lot (View Park) comes back as 'other' with an empty city name; model has 'la-county' but lookup never sets it.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookupParcel, type FetchLike } from '../../io/parcel';
it('r4juris-03 View Park is identified as unincorporated LA County', async () => {
  const j = JSON.parse(readFileSync(`${__dirname}/fixtures/r4juris-viewpark.json`, 'utf8'));
  const fetch: FetchLike = async url => ({ ok: true, status: 200, json: async () => j.responses[url] ?? { features: [], candidates: [] } });
  const r = await lookupParcel(j.address, { fetch, timeoutMs: 5000 });
  expect(r.ok && r.fill.jurisdiction).toBe('la-county');
  expect(r.ok && r.fill.cityName).toMatch(/county|unincorporated/i);
});
