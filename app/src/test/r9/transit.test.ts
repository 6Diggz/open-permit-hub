// r3market-03: half-mile transit (AB 2097 / Gov. Code §66321(b)(4)(B)) from the LA County HQTA and SCAG TPA layers.
// Only "no" is filled (outside every straight-line half-mile area); inside one, the walk is still the user's to check.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lookupParcel, PARCEL_SOURCES, type FetchLike } from '../../io/parcel';
import { applyParcel } from '../../io/parcel-apply';
import { blankProject } from '../../core/model';

type Rec = { address: string; calls: Record<string, { status: number; body: unknown }> };
const fx = (n: string): Rec => JSON.parse(readFileSync(new URL(`../fixtures/parcel/${n}.json`, import.meta.url), 'utf8'));
const replay = (rec: Rec, fail?: (u: string) => boolean): FetchLike & { urls: string[] } => { const urls: string[] = [];
  const f = (async (u: string) => { urls.push(u); if (fail?.(u)) throw new TypeError('Failed to fetch'); const hit = rec.calls[u]; if (!hit) throw new Error('unrecorded URL ' + u); return { ok: hit.status < 400, status: hit.status, json: async () => hit.body }; }) as FetchLike & { urls: string[] };
  f.urls = urls; return f; };
const run = async (n: string, fail?: (u: string) => boolean) => { const r = fx(n); const f = replay(r, fail); const o = await lookupParcel(r.address, { fetch: f }); if (!o.ok) throw new Error(o.error); return { fill: o.fill, urls: f.urls }; };

describe('r3market-03 transit layer', () => {
  it('Nichols Canyon (hillside, far from transit): outside both maps -> transit "no" is filled', async () => {
    const { fill } = await run('nichols'); expect(fill.transit).toBe('no');
    const p = blankProject(); p.site.address = fx('nichols').address; const { next, filled } = applyParcel(p, fill);
    expect(next.site.flags.transitHalfMile).toBe('no'); expect(filled).toContain('transit');
  });
  it('Atwater, Venice, Angelino Heights: inside a half-mile map -> "near", the question stays unanswered', async () => {
    for (const n of ['atwater', 'venice', 'hpoz']) { const { fill } = await run(n); expect(fill.transit).toBe('near');
      const { next, filled } = applyParcel(blankProject(), fill); expect(next.site.flags.transitHalfMile).toBe('unknown'); expect(filled).not.toContain('transit'); }
  });
  it('a transit map that does not answer leaves it unknown and is listed as failed', async () => {
    const { fill } = await run('nichols', u => u.startsWith(PARCEL_SOURCES.tpa.url)); expect(fill.transit).toBe('unknown'); expect(fill.failed).toContain('tpa');
  });
  it('a user answer is never overwritten', async () => { const { fill } = await run('nichols'); const p = blankProject(); p.site.flags.transitHalfMile = 'yes'; expect(applyParcel(p, fill).next.site.flags.transitHalfMile).toBe('yes'); });
  it('the transit maps get the lot outline only, never the address', async () => {
    const { urls } = await run('atwater'); const t = urls.filter(u => !u.includes('lacity.org')); expect(t.length).toBe(2);
    for (const u of t) { const d = decodeURIComponent(u); expect(d).not.toMatch(/Edenhurst|4305|Street=/); expect(d).toMatch(/esriGeometryPolygon|esriGeometryPoint/); }
  });
});
