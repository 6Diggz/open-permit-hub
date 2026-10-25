// Shared fake city services for r3parcel tests. Shapes copied from real GeoHub/ZIMAS answers on 2026-10-25.
import type { FetchLike } from '../../io/parcel';
export const sq = (lon: number, lat: number, dw = 0.00015, dh = 0.0004) => [[lon, lat], [lon + dw, lat], [lon + dw, lat + dh], [lon, lat + dh], [lon, lat]];
export interface MockOpts { candidate: string; score?: number; parcels?: { tip: string; bpp: string; ring?: number[][] }[]; zone1102?: string; zone1101?: string; hang?: RegExp }
export function mockFetch(o: MockOpts): FetchLike {
  return (url, init) => {
    const ok = (j: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => j });
    if (o.hang && o.hang.test(url)) return new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (url.includes('findAddressCandidates')) return ok({ candidates: [{ address: o.candidate, score: o.score ?? 100, location: { x: -118.3, y: 34.0 } }] });
    if (url.includes('Landbase_Information/MapServer/5/')) return ok({ features: (o.parcels ?? []).map((p, i) => ({ attributes: { TOOLTIP: `${p.tip} \\nAPN: ${p.bpp}`, BPP: p.bpp, PIND: `100A100-${i}` }, geometry: { rings: [p.ring ?? sq(-118.3, 34.0)] } })) });
    if (url.includes('Boundaries/MapServer/7/')) return ok({ features: [{ attributes: {} }] });
    if (url.includes('/zoning/MapServer/1102/')) return ok({ features: o.zone1102 ? [{ attributes: { ZONE_CMPLT: o.zone1102 } }] : [] });
    if (url.includes('/zoning/MapServer/1101/')) return ok({ features: o.zone1101 ? [{ attributes: { ZONE_CMPLT: o.zone1101 } }] : [] });
    return ok({ features: [] });
  };
}

/** Replays real answers recorded on 2026-10-25 (fixtures/r3parcel-*.json). Unknown URLs (e.g. layers a fix adds) answer "no features". */
import { readFileSync } from 'node:fs';
export function replay(name: string): { address: string; fetch: FetchLike } {
  const j = JSON.parse(readFileSync(new URL(`./fixtures/r3parcel-${name}.json`, import.meta.url), 'utf8')) as { address: string; responses: Record<string, unknown> };
  const byPath: Record<string, unknown> = {}; for (const [u, v] of Object.entries(j.responses)) byPath[u.split('?')[0]] = v;
  return { address: j.address, fetch: async url => ({ ok: true, status: 200, json: async () => j.responses[url] ?? byPath[url.split('?')[0]] ?? { features: [], candidates: [] } }) };
}
