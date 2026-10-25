// r4juris-01: a non-LA city named in the address (no ZIP) is geocoded to a same-named LA City street, marked LA City + confirmed, and JUR-01 PASSes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookupParcel, type FetchLike } from '../../io/parcel';
import { applyParcel } from '../../io/parcel-apply';
import { base, run } from '../../test/r3/golden_base';
function replay(name: string): { address: string; fetch: FetchLike } {
  const j = JSON.parse(readFileSync(`${__dirname}/fixtures/${name}.json`, 'utf8')) as { address: string; responses: Record<string, unknown> };
  return { address: j.address, fetch: async url => ({ ok: true, status: 200, json: async () => j.responses[url] ?? { features: [], candidates: [] } }) };
}
describe('r4juris-01 other-city address never becomes LA City', () => {
  for (const n of ['r4juris-santamonica', 'r4juris-inglewood']) it(n, async () => {
    const { address, fetch } = replay(n);
    const r = await lookupParcel(address, { fetch, timeoutMs: 5000 });
    const p = base(); p.site.address = address; p.site.jurisdiction = 'unknown'; p.site.jurisdictionConfirmed = false;
    const next = r.ok ? applyParcel(p, r.fill).next : p;
    // Santa Monica / Inglewood are their own cities: lookup must refuse or flag, and JUR-01 must never PASS.
    expect(run(next).st('JUR-01')).not.toBe('PASS');
    expect(next.site.jurisdictionConfirmed).not.toBe(true);
  });
});
