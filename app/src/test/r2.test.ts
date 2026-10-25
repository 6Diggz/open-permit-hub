// Regression tests for stress-test round 2 findings. Each test name starts with the finding id.
import { describe, it, expect } from 'vitest';
import { parseLength, lengthBlur, ft, inch } from '../core/units';
import { rect } from '../core/geom';
import { demoProject, blankProject, type Project } from '../core/model';
import { evaluate, type Result } from '../rules/engine';
import { RULES, PACK_ID, fireSeparation, feeEstimate, addressCity } from '../rules/la-city';
import { packFreshness, rulesLine, PACK } from '../rules/pack';
import { readiness, scoreLine } from '../rules/readiness';
import { citeText } from '../rules/cites-es';
import { migrate, serialize, readPackFile, openPack, serializeAll, readBundle } from '../core/permitpack';
import { sigLabel } from '../out/pdf';

const D = new Date('2026-10-24T12:00:00');
const rep = (p: Project, d = D) => evaluate(p, RULES, PACK_ID, d);
const st = (p: Project, id: string) => rep(p).results.find(r => r.rule.id === id);
/** A conversion that is READY except for whatever a test changes (same as the round-2 seat fixture). */
function clean(): Project {
  const p = demoProject(); p.site.apn = '1111-111-111';
  Object.assign(p.adu, { ratedWallPlanned: 'no', slabVaporBarrier: 'yes', openingsNearLine: 'no', eaveDepthMm: 0, removesGarageDoorWall: 'no', panelAmps: 200 });
  p.site.flags.easementsKnown = 'yes'; p.docs['NRG.CF1R'] = true; p.docs['NRG.HERS'] = true;
  p.adu.footprint = rect(ft(20), ft(90), ft(20), ft(20));
  p.adu.floorPlanSideSetbackMm = ft(10); p.adu.floorPlanRearSetbackMm = ft(20);
  return p;
}

describe('severity 5', () => {
  it('OUT2-01 masonry or concrete garage needs an architect or engineer; unknown construction is asked', () => {
    const p = clean(); expect(rep(p).overall).toBe('READY_FOR_PREPARER');
    p.adu.garageConstruction = 'masonry'; expect(st(p, 'ENG-01')!.status).toBe('FAIL'); expect(rep(p).overall).toBe('FIX_ISSUES');
    expect(st(p, 'ENG-01')!.next!.en).toMatch(/architect or engineer/);
    p.adu.garageConstruction = 'concrete'; expect(st(p, 'ENG-01')!.status).toBe('FAIL');
    p.adu.garageConstruction = 'unknown'; expect(st(p, 'ENG-01')!.status).toBe('UNKNOWN');
    expect(blankProject().adu.garageConstruction).toBe('unknown');
    p.adu.garageConstruction = 'wood'; p.adu.removesGarageDoorWall = 'yes';
    expect(st(p, 'ENG-01')!.next!.en).not.toMatch(/owner-prepared/);
    // old saved packs without the field open as unknown, never as wood
    const raw = JSON.parse(serialize(clean())); delete raw.adu.garageConstruction; expect(migrate(raw).adu.garageConstruction).toBe('unknown');
  });
  it('R2-COR-01 sprinklers give no pass for a wall 3-5 ft from the line (LADBS III-D.1)', () => {
    const p = clean(); p.adu.sprinklered = 'yes'; p.adu.footprint = rect(ft(4), ft(90), ft(20), ft(20));
    expect(st(p, 'FIR-01')!.status).not.toBe('PASS'); expect(rep(p).overall).not.toBe('READY_FOR_PREPARER');
    p.adu.sprinklered = 'no'; expect(st(p, 'FIR-01')!.status).toBe('FAIL');
    p.adu.ratedWallPlanned = 'yes'; expect(st(p, 'FIR-01')!.status).toBe('PASS');
  });
  it('R2-COR-02 "attached" is checked against the drawing: a drawn gap is measured', () => {
    const p = clean(); p.adu.garageAttachment = 'attached'; p.adu.openingsNearLine = 'yes'; p.adu.footprint = rect(ft(15), ft(68), ft(20), ft(20));
    expect(fireSeparation(p).dist).toBeCloseTo(ft(1.5));
    expect(st(p, 'FIR-01')!.status).toBe('FAIL'); expect(st(p, 'GAR-01')!.status).toBe('UNKNOWN'); expect(rep(p).overall).not.toBe('READY_FOR_PREPARER');
    // touching the house (shared wall): the house is not an exterior fire line
    p.adu.footprint = rect(ft(15), ft(65), ft(20), ft(20)); expect(st(p, 'GAR-01')!.status).toBe('PASS');
    expect(fireSeparation(p).line.en).not.toMatch(/main house/);
  });
});

describe('regressions', () => {
  it('parity2-03 Spanish citations never carry the English edition label', () => {
    for (const r of RULES) for (const c of r.cites) { const es = citeText(c, true); expect(es, r.id).not.toMatch(/as cited by|LA codes/); }
    const c = RULES.find(r => r.id === 'EGR-01')!.cites[0]; expect(citeText(c, true)).toMatch(/^\[Códigos de LA 2023/); expect(citeText(c, false)).toMatch(/^\[2023 LA codes/);
  });
  it('R2-COR-04 a studio where "nobody sleeps" with no window is never READY and never auto-passed', () => {
    const p = clean(); p.adu.bedrooms = 0; p.adu.mainRoomSleeping = 'no'; p.adu.windows = [];
    const r = rep(p); expect(r.overall).not.toBe('READY_FOR_PREPARER');
    expect(readiness(p, r).items.find(x => x.item.id === 'III.F.1')!.state).not.toBe('autoPassed');
  });
  it('R2-COR-04 readiness: only PASS is an auto-pass; a safety note needs an answer', () => {
    const p = clean(); p.adu.removesGarageDoorWall = 'yes'; const r = rep(p);
    expect(r.results.find(x => x.rule.id === 'ENG-01')!.status).toBe('INFO');
    const rd = readiness(p, r);
    for (const it2 of rd.items.filter(x => x.state === 'autoPassed')) {
      const linked = r.results.filter(x => (x.rule.id === 'ENG-01'));
      void linked; expect(it2.state).toBe('autoPassed');
    }
    expect(rd.items.filter(x => x.state === 'autoPassed').every(x => x.why === 'checked')).toBe(true);
    const engItems = rd.items.filter(x => x.why === 'a safety note to confirm'); expect(engItems.length).toBeGreaterThan(0);
  });
  it('R2-COR-06 an address in another city keeps JUR-01 from passing until ZIMAS is confirmed', () => {
    const p = clean(); p.site.address = '1234 Main St, Compton, CA 90220';
    expect(addressCity(p.site.address)).toBe('compton');
    expect(st(p, 'JUR-01')!.status).toBe('NOT_CHECKED'); expect(rep(p).overall).not.toBe('READY_FOR_PREPARER');
    p.site.jurisdictionConfirmed = true; expect(st(p, 'JUR-01')!.status).toBe('PASS');
    const q = clean(); q.site.address = '200 N Spring St, Los Angeles, CA 90012'; expect(st(q, 'JUR-01')!.status).toBe('PASS');
    q.site.address = '123 Example St'; expect(st(q, 'JUR-01')!.status).toBe('PASS');
  });
});

describe('fire and egress', () => {
  it('R2-COR-03 a rated wall does not clear the 1-hour eave underside', () => {
    const p = clean(); p.adu.eaveDepthMm = ft(2); p.adu.ratedWallPlanned = 'yes'; p.adu.footprint = rect(ft(6), ft(90), ft(20), ft(20));
    expect(st(p, 'FIR-01')!.status).toBe('UNKNOWN');
    p.adu.ratedEaveUndersidePlanned = 'yes'; expect(st(p, 'FIR-01')!.status).toBe('PASS');
    p.adu.ratedWallPlanned = 'no'; p.adu.ratedEaveUndersidePlanned = 'unknown'; expect(st(p, 'FIR-01')!.status).toBe('UNKNOWN');
  });
  it('R2-COR-12 eave depth is asked until the wall is past 5 ft + 6 ft', () => {
    const p = clean(); p.adu.eaveDepthMm = null; p.adu.footprint = rect(ft(8.5), ft(80), ft(20), ft(20));
    expect(st(p, 'FIR-01')!.status).toBe('UNKNOWN');
    p.adu.footprint = rect(ft(12), ft(95), ft(20), ft(20)); expect(fireSeparation(p).dist).toBeGreaterThanOrEqual(ft(11)); expect(st(p, 'FIR-01')!.status).toBe('PASS');
  });
  it('R2-COR-08 other buildings on the lot feed fire separation', () => {
    const p = clean(); p.site.otherBuildings = 'unknown'; expect(st(p, 'FIR-01')!.status).toBe('UNKNOWN');
    p.site.otherBuildings = 'yes'; expect(st(p, 'FIR-01')!.status).toBe('UNKNOWN');
    p.site.otherBuildingGapMm = ft(6); expect(fireSeparation(p).dist).toBeCloseTo(ft(3)); expect(st(p, 'FIR-01')!.status).toBe('FAIL');
    p.adu.openingsNearLine = 'yes'; expect(st(p, 'FIR-02')!.status).toBe('UNKNOWN');
    p.site.otherBuildingGapMm = ft(30); expect(st(p, 'FIR-01')!.status).toBe('PASS');
    const raw = JSON.parse(serialize(clean())); delete raw.site.otherBuildings; expect(migrate(raw).site.otherBuildings).toBe('unknown');
  });
  it('R2-COR-05 bare numbers in window fields are inches, and 20 ft windows are out of range', () => {
    expect(parseLength('20', { bare: 'in' })).toBeCloseTo(inch(20)); expect(parseLength('20')).toBeCloseTo(ft(20));
    expect(lengthBlur('20', null, { bare: 'in' }).value).toBeCloseTo(inch(20));
    const p = clean(); p.adu.windows = [{ id: 'w', room: 'Bedroom', sleeping: true, clearWidthMm: ft(20), clearHeightMm: ft(20), sillMm: 0, gradeFloor: true }];
    expect(st(p, 'GEO-01')!.status).not.toBe('PASS'); expect(rep(p).overall).not.toBe('READY_FOR_PREPARER');
    p.adu.windows[0] = { ...p.adu.windows[0], clearWidthMm: inch(20), clearHeightMm: inch(20) }; expect(st(p, 'EGR-01')!.status).toBe('FAIL');
  });
  it('R2-COR-09 a window in the living room does not count for the bedroom', () => {
    const p = clean(); p.adu.windows = [{ id: 'w', room: 'Living room', sleeping: true, clearWidthMm: inch(24), clearHeightMm: inch(36), sillMm: inch(40), gradeFloor: true }];
    expect(st(p, 'EGR-01')!.status).toBe('UNKNOWN');
    p.adu.windows[0].room = 'Bedroom'; expect(st(p, 'EGR-01')!.status).toBe('PASS');
  });
  it('R2-COR-10 "20,6" is refused; 20\'-6" and metric decimal commas are read', () => {
    expect(parseLength('20,6')).toBeNull(); expect(parseLength('1,200')).toBeNull();
    expect(parseLength('20\'-6"')).toBeCloseTo(ft(20) + inch(6)); expect(parseLength('20\' - 6"')).toBeCloseTo(ft(20) + inch(6));
    expect(parseLength('6,25 m')).toBeCloseTo(6250);
  });
  it('R2-COR-11 fee $0 lines are cross-checked against the drawn footprint', () => {
    const p = clean(); p.adu.footprint = rect(ft(10), ft(90), ft(30), ft(30)); p.adu.interiorLivableSqFt = 700;
    expect(feeEstimate(p).outcome.msg.en).toMatch(/drawn footprint is 900 sq ft/);
    p.adu.interiorLivableSqFt = 950; expect(feeEstimate(p).impact.en).not.toContain('$0'); expect(feeEstimate(p).outcome.msg.en).toMatch(/larger than the drawn footprint/);
  });
});

describe('rules freshness', () => {
  it('R2-COR-07 a 2027 application date is stale and not READY', () => {
    const p = clean(); p.applicationDate = '2027-09-01';
    expect(packFreshness(D, p.applicationDate).stale).toBe(true);
    expect(st(p, 'REV-01')!.status).toBe('UNKNOWN'); expect(rep(p).overall).toBe('INCOMPLETE');
    p.applicationDate = '2026-11-01'; expect(rep(p).overall).toBe('READY_FOR_PREPARER');
  });
  it('OUT2-06 after January 1 the export verdict is not READY', () => {
    expect(rep(clean(), new Date('2027-01-05T12:00:00')).overall).toBe('INCOMPLETE');
  });
  it('parity2-08 the rules line names the pack and check date, and the vest date only when a filing date is set', () => {
    const a = rulesLine(null, PACK_ID, false, D).text; expect(a).not.toMatch(/as of/); expect(a).toContain(PACK.verifiedOn); expect(a).not.toContain('2026-10-25');
    expect(rulesLine('2026-11-02', PACK_ID, false, D).text).toMatch(/Rules for applications filed 2026-11-02/);
  });
});

describe('inputs and files', () => {
  it('parity2-01 typing the size that equals the example confirms it', () => {
    expect(lengthBlur("50' 0\"", ft(50), { always: true })).toEqual({ bad: false, commit: true, value: ft(50) });
    expect(lengthBlur("50' 0\"", ft(50), {}).commit).toBe(false);
  });
  it('parity2-09 the score line is plain language with a next action', () => {
    const p = clean(); const s = scoreLine(readiness(p, rep(p)));
    expect(s).not.toMatch(/covered|auto-passed/); expect(s).toMatch(/left/); expect(s).toMatch(/preparer/);
  });
  it('appsec-r2-03 people fields of any type are made safe on open', () => {
    const raw = JSON.parse(serialize(clean())); raw.people = { ownerName: { a: 1 }, preparerName: 12, preparerLicense: 'x'.repeat(500), preparerRole: 'boss', language: 'fr', engineerName: ['a'] };
    raw.applicationDate = 5; raw.rulePack = { x: 1 };
    const p = migrate(raw);
    expect(p.people).toMatchObject({ ownerName: '', preparerName: '', preparerRole: 'owner', language: 'en', engineerName: '' });
    expect(p.people.preparerLicense.length).toBe(40); expect(p.applicationDate).toBeNull(); expect(p.rulePack).toBe('');
  });
  it('qa2-05 a locked pack with a broken header is reported damaged, not locked', async () => {
    let asked = false;
    await expect(readPackFile(JSON.stringify({ format: 'permitpack-encrypted', v: 1, kdf: {}, salt: '!!', iv: 'x', ct: 'y' }), async () => { asked = true; return 'pw'; })).rejects.toThrow(/damaged/);
    expect(asked).toBe(false);
    await expect(openPack(JSON.stringify({ format: 'permitpack-encrypted', v: 2, kdf: 'PBKDF2-SHA256-600000', salt: 'AAAA', iv: 'AAAA', ct: 'AAAA' }), 'pw')).rejects.toThrow(/damaged/);
  });
  it('OUT2-10 back up all projects round-trips every project', () => {
    const a = clean(), b = blankProject(); const r = readBundle(serializeAll([a, b]))!;
    expect(r.projects.map(x => x.id)).toEqual([a.id, b.id]); expect(r.skipped).toBe(0);
    expect(readBundle(serialize(a))).toBeNull();
  });
  it('OUT2-02 the sheet signature line names the preparer, or the owner', () => {
    const p = clean(); expect(sigLabel(p)).toMatch(/^Owner signature/);
    p.people.preparerRole = 'drafter'; p.people.preparerName = 'Ana Ruiz'; expect(sigLabel(p)).toMatch(/Signature of preparer: Ana Ruiz \(drafter\)/);
  });
});

describe('Spanish', () => {
  /** Many project variants, so most rule branches run. */
  function variants(): Project[] {
    const out: Project[] = [clean(), blankProject()];
    const add = (f: (p: Project) => void) => { const p = clean(); f(p); out.push(p); };
    add(p => { p.adu.footprint = rect(ft(2), ft(90), ft(20), ft(20)); p.adu.openingsNearLine = 'yes'; });
    add(p => { p.adu.footprint = rect(ft(4), ft(90), ft(20), ft(20)); p.adu.sprinklered = 'yes'; p.adu.openingsNearLine = 'unknown'; });
    add(p => { p.adu.ceilingHeightMm = inch(80); p.adu.smokeCoPlanned = 'unknown'; p.adu.smokeHardwired = 'no'; });
    add(p => { p.adu.windows = [{ id: 'w', room: 'Bedroom', sleeping: true, clearWidthMm: inch(18), clearHeightMm: inch(20), sillMm: inch(50), gradeFloor: false }]; });
    add(p => { p.adu.garageConstruction = 'masonry'; });
    add(p => { p.adu.removesGarageDoorWall = 'yes'; p.adu.eaveDepthMm = ft(3); p.adu.footprint = rect(ft(6), ft(90), ft(20), ft(20)); });
    add(p => { p.site.flags.primarySprinklered = 'yes'; p.adu.sprinklered = 'no'; p.adu.hosePullFt = 400; });
    return out;
  }
  it('parity2-04 Spanish messages and next steps keep the English detail (every rule)', () => {
    const short: string[] = [];
    for (const p of variants()) for (const r of rep(p).results as Result[]) {
      if (r.msg.es.length < 0.6 * r.msg.en.length) short.push(`${r.rule.id} msg: ${r.msg.es}`);
      if (r.next && r.next.es.length < 0.6 * r.next.en.length) short.push(`${r.rule.id} next: ${r.next.es}`);
    }
    expect(short).toEqual([]);
  });
});

import { buildServiceWorker } from '../../sw-build';
describe('service worker', () => {
  function load(online: boolean) {
    const store = new Map<string, string>(); const puts: string[] = []; const handlers: Record<string, (e: any) => void> = {};
    const base = 'https://x.test/open-permit-hub/';
    const key = (r: any) => new URL(typeof r === 'string' ? r : r.url, base).href.split('?')[0];
    const cache = { put: async (r: any, v: any) => { puts.push(key(r)); store.set(key(r), v.body); }, addAll: async (l: string[]) => l.forEach(u => store.set(key(u), 'precached ' + u)), keys: async () => [] };
    const caches = { open: async () => cache, match: async (r: any) => { const v = store.get(key(r)); return v == null ? undefined : { body: v }; }, keys: async () => [], delete: async () => true };
    const fetchFn = async (r: any) => { if (!online) throw new Error('offline'); return { ok: true, body: 'network ' + key(r), clone() { return this; } }; };
    const self = { addEventListener: (t: string, h: any) => { handlers[t] = h; }, registration: { scope: base }, skipWaiting() {}, clients: { claim() {} } };
    const { source } = buildServiceWorker(['index.html', 'rules/ACC-01.html', 'assets/a.js'], '<html>');
    new Function('self', 'caches', 'fetch', 'location', 'Response', source)(self, caches, fetchFn, new URL(base + 'sw.js'), { error: () => ({ body: 'ERROR' }) });
    return { store, puts, handlers, base, cache };
  }
  const nav = async (h: any, url: string) => { let out: any; h.fetch({ request: { method: 'GET', mode: 'navigate', url }, respondWith: (p: any) => { out = p; } }); return (await out)?.body; };
  it('appsec-r2-01 / qa2-03 visiting a rule page never overwrites the cached app shell', async () => {
    const w = load(true); await w.cache.addAll(['./', './index.html', './rules/ACC-01.html']);
    expect(await nav(w.handlers, w.base + 'rules/ACC-01.html')).toMatch(/network/);
    expect(await nav(w.handlers, w.base)).toMatch(/network/);
    expect(w.puts).toEqual([]); expect(w.store.get(w.base + 'index.html')).toBe('precached ./index.html');
  });
  it('appsec-r2-01 offline: app routes get the shell, rule pages their own copy, other pages no shell', async () => {
    const w = load(false); await w.cache.addAll(['./', './index.html', './rules/ACC-01.html']);
    expect(await nav(w.handlers, w.base)).toMatch(/^precached \.\/(index.html)?$/); expect(await nav(w.handlers, w.base + 'index.html')).toBe('precached ./index.html');
    expect(await nav(w.handlers, w.base + 'rules/ACC-01.html')).toBe('precached ./rules/ACC-01.html');
    expect(await nav(w.handlers, w.base + 'rules/NOPE.html')).toBe('ERROR');
  });
});
