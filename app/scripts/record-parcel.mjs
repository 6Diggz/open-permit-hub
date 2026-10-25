// Records live answers from the city's map services into test fixtures (run by hand; tests never call live APIs).
// node --experimental-strip-types scripts/record-parcel.mjs
import { writeFileSync } from 'node:fs';
import { lookupParcel } from '../src/io/parcel.ts';
const CASES = { atwater: '4305 Edenhurst Ave, Los Angeles, CA 90039', venice: '510 E Venice Blvd, Venice, CA 90291', nichols: '2816 Nichols Canyon Rd, Los Angeles, CA 90046', zipwrong: '4305 Edenhurst Ave, Los Angeles, CA 90001', hpoz: '1300 Carroll Ave, Los Angeles, CA 90026', notfound: '99999 Nowhere Blvd, Los Angeles, CA 90001' };
for (const [name, addr] of Object.entries(CASES)) {
  const calls = {};
  const rec = async (u, i) => { const r = await fetch(u, i); const j = await r.json(); calls[u] = { status: r.status, body: j }; return { ok: r.ok, status: r.status, json: async () => j }; };
  const out = await lookupParcel(addr, { fetch: rec });
  writeFileSync(new URL(`../src/test/fixtures/parcel/${name}.json`, import.meta.url), JSON.stringify({ address: addr, recordedAt: new Date().toISOString(), calls }));
  console.log(name, JSON.stringify(out.ok ? { ...out.fill, lot: out.fill.lot?.length } : out));
}
