import { describe, it, expect } from 'vitest';
import { demoProject, blankProject, type Project } from '../core/model';
import { evaluate } from '../rules/engine';
import { RULES, PACK_ID, feeEstimate } from '../rules/la-city';
import { CATALOG, CATALOG_COUNT, RULE_ITEMS } from '../rules/ladbs-adu-2025';
import { readiness, scoreLine } from '../rules/readiness';
import { ES } from '../ui/es';
import { ft, inch } from '../core/units';
import appSrc from '../ui/App.tsx?raw';

const st = (p: Project, id: string) => evaluate(p, RULES, PACK_ID, new Date('2026-10-24')).results.find(r => r.rule.id === id)?.status;
const demo = () => { const p = demoProject(); p.site.apn = '1111-111-111'; return p; };

describe('LADBS catalog', () => {
  it('has unique ids and a sane size', () => {
    const ids = CATALOG.map(i => i.id); expect(new Set(ids).size).toBe(ids.length);
    expect(CATALOG_COUNT).toBeGreaterThanOrEqual(200);
    CATALOG.forEach(i => { expect(i.summary.en.length).toBeGreaterThan(5); expect(i.summary.es.length).toBeGreaterThan(5); expect(i.section).toBeTruthy(); });
  });
  it('every rule is mapped to real sheet items', () => {
    const ids = new Set(CATALOG.map(i => i.id));
    RULES.forEach(r => { expect(RULE_ITEMS[r.id], r.id).toBeTruthy(); RULE_ITEMS[r.id].forEach(x => expect(ids.has(x), `${r.id}->${x}`).toBe(true)); });
    Object.keys(RULE_ITEMS).forEach(k => expect(RULES.some(r => r.id === k), k).toBe(true));
  });
  it('every auto item is linked to a rule', () => {
    const linked = new Set(Object.values(RULE_ITEMS).flat());
    CATALOG.filter(i => i.mode === 'auto').forEach(i => expect(linked.has(i.id), i.id).toBe(true));
  });
  it('garage routing: II-C for detached, II-G for attached', () => {
    const p = demo(); p.adu.garageAttachment = 'attached';
    const r = readiness(p, evaluate(p, RULES, PACK_ID));
    expect(r.items.find(x => x.item.id === 'II.C.1')!.why).toBe('does not apply');
    expect(r.items.find(x => x.item.id === 'II.G.1')!.why).not.toBe('does not apply');
    expect(r.total).toBe(CATALOG_COUNT);
    expect(scoreLine(r)).toMatch(new RegExp(`of ${CATALOG_COUNT} sheet items checked`));
  });
  it('answering items raises the score', () => {
    const p = demo(); const a = readiness(p, evaluate(p, RULES, PACK_ID)).checked;
    p.sheet['III.G.5'] = 'yes'; p.docs['II.K.1'] = true;
    expect(readiness(p, evaluate(p, RULES, PACK_ID)).checked).toBeGreaterThan(a);
  });
});

describe('new auto checks (pass / fail / unknown)', () => {
  it('CEI-01 ceiling 7 ft', () => { const p = demo(); p.adu.ceilingHeightMm = inch(84); expect(st(p, 'CEI-01')).toBe('PASS'); p.adu.ceilingHeightMm = inch(83); expect(st(p, 'CEI-01')).toBe('FAIL'); p.adu.ceilingHeightMm = null; expect(st(p, 'CEI-01')).toBe('UNKNOWN'); });
  it('EGR-01 escape window', () => { const p = demo(); expect(st(p, 'EGR-01')).toBe('PASS'); p.adu.windows[0].sillMm = inch(45); expect(st(p, 'EGR-01')).toBe('FAIL'); p.adu.windows[0].sillMm = null; expect(st(p, 'EGR-01')).toBe('UNKNOWN'); });
  it('EGR-01 width and height minimums', () => { const p = demo(); p.adu.windows[0] = { ...p.adu.windows[0], clearWidthMm: inch(19), clearHeightMm: inch(60) }; expect(st(p, 'EGR-01')).toBe('FAIL'); p.adu.windows[0] = { ...p.adu.windows[0], clearWidthMm: inch(40), clearHeightMm: inch(23) }; expect(st(p, 'EGR-01')).toBe('FAIL'); });
  it('VAP-01 slab vapor barrier', () => { const p = demo(); expect(st(p, 'VAP-01')).toBe('UNKNOWN'); p.adu.slabVaporBarrier = 'yes'; expect(st(p, 'VAP-01')).toBe('PASS'); p.adu.slabVaporBarrier = 'no'; expect(st(p, 'VAP-01')).toBe('FAIL'); });
  it('FIR-01 1-hour wall under 5 ft', () => { const p = demo(); p.adu.footprint = p.adu.footprint.map(q => ({ ...q })); const lot = p.site.lot;
    p.adu.footprint = [{ x: ft(2), y: ft(100) }, { x: ft(22), y: ft(100) }, { x: ft(22), y: ft(120) }, { x: ft(2), y: ft(120) }]; void lot;
    p.adu.ratedWallPlanned = 'no'; expect(st(p, 'FIR-01')).toBe('FAIL'); p.adu.ratedWallPlanned = 'yes'; expect(st(p, 'FIR-01')).toBe('PASS');
    p.adu.footprint = [{ x: ft(10), y: ft(100) }, { x: ft(30), y: ft(100) }, { x: ft(30), y: ft(120) }, { x: ft(10), y: ft(120) }]; p.adu.ratedWallPlanned = 'no'; expect(st(p, 'FIR-01')).toBe('PASS'); });
  it('FIR-02 openings near the line', () => { const p = demo();
    p.adu.footprint = [{ x: ft(2), y: ft(100) }, { x: ft(22), y: ft(100) }, { x: ft(22), y: ft(120) }, { x: ft(2), y: ft(120) }];
    expect(st(p, 'FIR-02')).toBe('UNKNOWN'); p.adu.openingsNearLine = 'yes'; expect(st(p, 'FIR-02')).toBe('FAIL'); p.adu.openingsNearLine = 'no'; expect(st(p, 'FIR-02')).toBe('PASS');
    p.adu.footprint = [{ x: ft(4), y: ft(100) }, { x: ft(24), y: ft(100) }, { x: ft(24), y: ft(120) }, { x: ft(4), y: ft(120) }]; p.adu.openingsNearLine = 'yes'; expect(st(p, 'FIR-02')).toBe('UNKNOWN'); });
  it('ALM-01 / ALM-02 smoke and CO', () => { const p = demo(); expect(st(p, 'ALM-01')).toBe('PASS'); p.adu.smokeCoPlanned = 'unknown'; expect(st(p, 'ALM-01')).toBe('UNKNOWN');
    expect(st(p, 'ALM-02')).toBe('PASS'); p.adu.smokeHardwired = 'unknown'; expect(st(p, 'ALM-02')).toBe('UNKNOWN'); p.adu.mode = 'youadu'; p.adu.smokeHardwired = 'no'; expect(st(p, 'ALM-02')).toBe('FAIL'); });
  it('NRG-01 Title 24 CF1R and HERS docs', () => { const p = demo(); expect(st(p, 'NRG-01')).toBe('UNKNOWN'); p.docs['NRG.CF1R'] = true; expect(st(p, 'NRG-01')).toBe('UNKNOWN'); p.docs['NRG.HERS'] = true; expect(st(p, 'NRG-01')).toBe('PASS'); });
  it('SET-03 site plan vs floor plan setbacks', () => { const p = demo(); expect(st(p, 'SET-03')).toBe('UNKNOWN');
    p.adu.floorPlanSideSetbackMm = ft(2); p.adu.floorPlanRearSetbackMm = ft(2); expect(st(p, 'SET-03')).toBe('PASS');
    p.adu.floorPlanRearSetbackMm = ft(5); expect(st(p, 'SET-03')).toBe('FAIL'); });
  it('PRK-01 no replacement parking', () => { const p = demo(); expect(st(p, 'PRK-01')).toBe('PASS'); p.adu.mode = 'youadu'; expect(st(p, 'PRK-01')).toBeUndefined(); });
  it('GAR-01 garage path', () => { const p = demo(); expect(st(p, 'GAR-01')).toBe('PASS'); p.adu.garageAttachment = 'unknown'; expect(st(p, 'GAR-01')).toBe('UNKNOWN'); p.adu.garageAttachment = 'attached'; p.adu.staysInsideWalls = 'no'; expect(st(p, 'GAR-01')).toBe('FAIL'); });
  it('SCP-01 150 sf ingress-only addition', () => { const p = demo(); p.adu.addedAreaSqFt = 100; expect(st(p, 'SCP-01')).toBe('UNKNOWN'); p.adu.addedForIngressOnly = 'yes'; expect(st(p, 'SCP-01')).toBe('PASS'); p.adu.addedForIngressOnly = 'no'; expect(st(p, 'SCP-01')).toBe('FAIL'); p.adu.addedAreaSqFt = 151; expect(st(p, 'SCP-01')).toBe('FAIL'); });
  it('DWP-01, PNL-01, GAS-01 early warnings', () => { const p = demo(); p.site.flags.dwpEasement10ft = 'unknown'; expect(st(p, 'DWP-01')).toBe('UNKNOWN'); p.site.flags.dwpEasement10ft = 'yes'; expect(st(p, 'DWP-01')).toBe('INFO'); p.site.flags.dwpEasement10ft = 'no'; expect(st(p, 'DWP-01')).toBe('PASS');
    expect(st(p, 'PNL-01')).toBe('NOT_CHECKED'); p.adu.panelAmps = 100; expect(st(p, 'PNL-01')).toBe('INFO');
    expect(st(p, 'GAS-01')).toBe('PASS'); p.adu.allElectric = 'no'; expect(st(p, 'GAS-01')).toBe('NOT_CHECKED'); p.adu.separateGasMeter = 'yes'; expect(st(p, 'GAS-01')).toBe('INFO'); });
});

describe('fees (2026) and AB 2533', () => {
  it('school $0 under 500, impact $0 under 750, never an invented amount', () => {
    const p = demo(); p.adu.interiorLivableSqFt = 499; let f = feeEstimate(p); expect(f.school.en).toContain('$0'); expect(f.impact.en).toContain('$0');
    p.adu.interiorLivableSqFt = 600; f = feeEstimate(p); expect(f.school.en).toBe('estimate, verify with LADBS'); expect(f.impact.en).toContain('$0');
    p.adu.interiorLivableSqFt = 800; f = feeEstimate(p); expect(f.impact.en).toBe('estimate, verify with LADBS');
    expect(f.outcome.msg.en).not.toMatch(/\$[1-9]/);
    p.adu.interiorLivableSqFt = null; expect(feeEstimate(p).outcome.status).toBe('UNKNOWN');
  });
  it('legalization keeps safety rules, turns zoning into notes', () => {
    const p = demo(); p.adu.existingStructurePermitted = 'no'; p.adu.builtBefore2020 = 'yes'; p.adu.usedAsHomeBefore2020 = 'yes'; p.adu.staysInsideWalls = 'no'; p.adu.slabVaporBarrier = 'no';
    expect(st(p, 'GAR-01')).toBe('FAIL'); p.adu.legalization = true;
    expect(st(p, 'GAR-01')).toBe('INFO'); expect(st(p, 'VAP-01')).toBe('FAIL'); expect(st(p, 'LEG-01')).toBe('INFO');
    p.adu.builtBefore2020 = 'no'; expect(st(p, 'LEG-01')).toBe('FAIL');
  });
  it('old packs open with new fields defaulted', () => { const b = blankProject(); expect(b.sheet).toEqual({}); expect(b.adu.garageAttachment).toBe('unknown'); });
});

describe('Spanish strings', () => {
  it('every L("...") label in the app has a Spanish entry', () => {
    const src: string = appSrc;
    const keys = [...src.matchAll(/\bL\("((?:[^"\\]|\\.)*)"\)/g)].map(m => JSON.parse(`"${m[1]}"`));
    // single-quoted L('...') too (round 1: these were not checked, so Spanish mode leaked English)
    keys.push(...[...src.matchAll(/\bL\('((?:[^'\\]|\\.)*)'\)/g)].map(m => m[1].replace(/\\'/g, "'")));
    const missing = keys.filter(k => !(k in ES)); expect(missing).toEqual([]);
  });
});
