import { describe, it, expect } from 'vitest';
import { parseLength, fmtFtIn, ft, inch } from '../core/units';
import { rect, area, clearanceToEdge } from '../core/geom';
import { blankProject, demoProject } from '../core/model';
import { evaluate, exportBlockers, validateCitations } from '../rules/engine';
import { RULES, PACK_ID } from '../rules/la-city';
import { migrate, serialize } from '../core/permitpack';

describe('units', () => {
  it('parses many formats', () => {
    expect(parseLength(`20' 6 1/2"`)).toBeCloseTo(ft(20) + inch(6.5));
    expect(parseLength('20ft 6in')).toBeCloseTo(ft(20) + inch(6));
    expect(parseLength('20-6')).toBeCloseTo(ft(20) + inch(6));
    expect(parseLength('20.5')).toBeCloseTo(ft(20.5));
    expect(parseLength('6.25m')).toBeCloseTo(6250);
    expect(parseLength('18"')).toBeCloseTo(inch(18));
    expect(parseLength('1/2"')).toBeCloseTo(inch(0.5));
    expect(parseLength('abc')).toBeNull();
  });
  it('formats', () => { expect(fmtFtIn(ft(20) + inch(6.5))).toBe(`20' 6 1/2"`); expect(fmtFtIn(ft(4) - 0.01)).toBe(`4' 0"`); });
});
describe('geom precision near setback line (no f32 drift)', () => {
  it('4 ft exactly at large offsets', () => {
    const big = 2_000_000_000; const lot = rect(big, big, ft(50), ft(100)); const fp = rect(big + ft(4), big + ft(10), ft(20), ft(20));
    expect(clearanceToEdge(fp, lot, 3)).toBeCloseTo(ft(4), 6);
    expect(area(rect(0, 0, ft(20), ft(20))) / (304.8 ** 2)).toBeCloseTo(400, 9);
  });
});
const byId = (r: ReturnType<typeof evaluate>, id: string) => r.results.find(x => x.rule.id === id)!;
describe('rules (golden cases)', () => {
  it('demo conversion: escape window passes, fire wall flagged', () => {
    const r = evaluate(demoProject(), RULES, PACK_ID, new Date('2026-10-24'));
    expect(byId(r, 'EGR-01').status).toBe('PASS'); // 24x36 = 6 sq ft >= 5.0 grade floor
    expect(byId(r, 'SET-01').status).toBe('PASS');
    expect(byId(r, 'JUR-01').status).toBe('PASS');
  });
  it('slider that fails egress', () => {
    const p = demoProject(); p.adu.windows[0] = { ...p.adu.windows[0], clearWidthMm: inch(30), clearHeightMm: inch(22), gradeFloor: false };
    expect(byId(evaluate(p, RULES, PACK_ID), 'EGR-01').status).toBe('FAIL');
  });
  it('module off -> NOT_CHECKED and INCOMPLETE, never green (PR51)', () => {
    const p = demoProject(); p.modules.egress = false;
    const r = evaluate(p, RULES, PACK_ID);
    expect(byId(r, 'EGR-01').status).toBe('NOT_CHECKED');
    expect(r.overall).not.toBe('READY_FOR_PREPARER');
    expect(exportBlockers(p, r).some(s => s.includes('egress'))).toBe(true);
  });
  it('unknown jurisdiction -> incomplete; outside -> not supported', () => {
    const p = blankProject(); const r0 = evaluate(p, RULES, PACK_ID); expect(r0.overall).not.toBe('READY_FOR_PREPARER'); expect(byId(r0,'JUR-01').status).toBe('UNKNOWN');
    p.site.jurisdiction = 'other'; expect(evaluate(p, RULES, PACK_ID).overall).toBe('NOT_SUPPORTED');
  });
  it('new ADU setback: 3.9 ft fails, near-line within map error is UNKNOWN', () => {
    const p = demoProject(); p.adu.mode = 'youadu'; p.site.lotUncertaintyMm = ft(2);
    p.adu.footprint = rect(ft(3.9), ft(100), ft(20), ft(20));
    expect(byId(evaluate(p, RULES, PACK_ID), 'SET-02').status).toBe('FAIL');
    p.adu.footprint = rect(ft(5), ft(100), ft(20), ft(20));
    expect(byId(evaluate(p, RULES, PACK_ID), 'SET-02').status).toBe('UNKNOWN');
    p.adu.footprint = rect(ft(8), ft(100), ft(20), ft(20));
    expect(byId(evaluate(p, RULES, PACK_ID), 'SET-02').status).toBe('PASS');
  });
  it('sprinklers only if main house has them (Gov 66314(d)(12))', () => {
    const p = demoProject(); p.site.flags.primarySprinklered = 'no';
    expect(byId(evaluate(p, RULES, PACK_ID), 'SPK-01').status).toBe('PASS');
    p.site.flags.primarySprinklered = 'yes'; p.adu.sprinklered = 'no';
    expect(byId(evaluate(p, RULES, PACK_ID), 'SPK-01').status).toBe('FAIL');
  });
  it('hillside + VHFHSZ is a contested FAIL', () => {
    const p = demoProject(); p.site.flags.hillside = 'yes'; p.site.flags.vhfhsz = 'yes';
    expect(byId(evaluate(p, RULES, PACK_ID), 'HAZ-01').status).toBe('FAIL');
  });
  it('fee line uses interior livable sq ft and flags the 750 band', () => {
    const p = demoProject(); p.adu.interiorLivableSqFt = 755;
    const r = byId(evaluate(p, RULES, PACK_ID), 'FEE-01'); expect(r.msg.en).toContain('Impact fee: estimate, verify with LADBS'); expect(r.next?.en).toContain('750');
  });
  it('demo lot cannot export', () => { const p = demoProject(); expect(exportBlockers(p, evaluate(p, RULES, PACK_ID)).length).toBeGreaterThan(0); });
  it('rules vest on application date', () => { const p = demoProject(); p.applicationDate = '2025-06-01'; expect(evaluate(p, RULES, PACK_ID).results.length).toBe(0); });
  it('AI citation guard rejects invented rule ids', () => { expect(validateCitations('See EGR-01 and ZZZ-99', RULES)).toEqual(['ZZZ-99']); });
  it('every rule has a citation', () => { RULES.forEach(r => expect(r.cites.length).toBeGreaterThan(0)); });
});
describe('permit pack', () => {
  it('round-trips and rejects newer versions', () => {
    const p = demoProject(); expect(migrate(JSON.parse(serialize(p))).site.apn).toBe(p.site.apn);
    expect(() => migrate({ ...p, version: 99 })).toThrow(/newer/);
    expect(() => migrate({ foo: 1 })).toThrow();
  });
});
import { autoFit } from '../rules/fit';
describe('auto-fit', () => {
  it('fits a 20x20 on a 50x130 lot with margin, and refuses hillside', () => {
    const p = demoProject(); p.adu.mode = 'youadu'; const r = autoFit(p); expect(r.footprint).not.toBeNull();
    p.adu.footprint = r.footprint!; const res = evaluate(p, RULES, PACK_ID).results.find(x => x.rule.id === 'SET-02')!; expect(res.status).toBe('PASS');
    p.site.flags.hillside = 'yes'; expect(autoFit(p).footprint).toBeNull();
  });
});
describe('QA regressions', () => {
  it('F01 old/garbage application date never READY', () => { const p = demoProject(); p.applicationDate = '2025-01-01'; expect(evaluate(p, RULES, PACK_ID).overall).toBe('NOT_SUPPORTED'); p.applicationDate = 'garbage'; expect(evaluate(p, RULES, PACK_ID).results.length).toBeGreaterThan(0); });
  it('F02 zoning off cannot unlock outside-LA export', () => { const p = demoProject(); p.site.apn = '1111-111-111'; p.site.jurisdiction = 'other'; p.modules.zoning = false; const r = evaluate(p, RULES, PACK_ID); expect(r.overall).toBe('NOT_SUPPORTED'); expect(exportBlockers(p, r).length).toBeGreaterThan(0); });
  it('F04/F05 burn area unknown is UNKNOWN; yes removes auto passes', () => { const p = demoProject(); p.site.flags.fireRebuild = 'unknown'; expect(byId(evaluate(p, RULES, PACK_ID), 'HAZ-05').status).toBe('UNKNOWN'); p.site.flags.fireRebuild = 'yes'; const r = evaluate(p, RULES, PACK_ID); expect(r.results.filter(x => x.status === 'PASS' && x.rule.module !== 'core').length).toBe(0); expect(r.overall).not.toBe('READY_FOR_PREPARER'); });
  it('F06 transit height is 18 ft unless roof pitch matches', () => { const p = demoProject(); p.adu.mode = 'youadu'; p.site.flags.transitHalfMile = 'yes'; p.adu.heightMm = ft(19); p.adu.roofPitchMatches = 'no'; expect(byId(evaluate(p, RULES, PACK_ID), 'HGT-01').status).toBe('FAIL'); p.adu.roofPitchMatches = 'yes'; expect(byId(evaluate(p, RULES, PACK_ID), 'HGT-01').status).toBe('PASS'); });
  it('F07/F08 nonsense numbers and off-lot geometry block READY', () => { const p = demoProject(); p.adu.hosePullFt = -5; expect(byId(evaluate(p, RULES, PACK_ID), 'GEO-01').status).toBe('UNKNOWN'); const q = demoProject(); q.adu.footprint = rect(ft(100), ft(100), ft(20), ft(20)); const r = evaluate(q, RULES, PACK_ID); expect(byId(r, 'GEO-01').status).toBe('FAIL'); expect(r.overall).toBe('FIX_ISSUES'); });
  it('F11 exactly 750 sq ft is not exempt', () => { const p = demoProject(); p.adu.interiorLivableSqFt = 750; expect(byId(evaluate(p, RULES, PACK_ID), 'FEE-01').msg.en).toContain('Impact fee: estimate, verify with LADBS'); });
  it('F14 unsupported old version gives a clear error', () => { expect(() => migrate({ ...demoProject(), version: 0 })).toThrow(/unsupported version/); });
  it('F18 citation guard catches lowercase and long ids', () => { expect(validateCitations('per ADU-123 and set-02', RULES)).toEqual(['ADU-123']); });
});
