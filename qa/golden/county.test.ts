/**
 * OUT-15: golden cases for the LA County (unincorporated) BETA pack. Hand-derived from the sources, opened 2026-10-25:
 *  N  = DPW Garage Conversion to ADU & JADU Standard Notes and Details (rev. 01/06/2023, 03/20/23): Fire-Rated Walls; Fire Access and Flow
 *  CL = DPW Expedited ADU Checklist "Updated: 8/6/2019.V4.2"
 *  HG = DPW Homeowner Guide to Garage Conversion to ADU & JADU (no date printed)
 *  G  = Gov. Code §66314, §66323 (current as of 1/1/2026)
 * Each expected status was worked out by hand from the cited numbers before running the engine.
 * The County pack is a beta: no case may reach "Likely yes", and export stays blocked.
 * Base lot (golden_base): detached 20x20 ft garage, 6 ft from side and rear lines, house 59 ft away, no sprinklers anywhere.
 */
import { describe, it, expect } from 'vitest';
import { base, ft } from './golden_base';
import { evaluate, exportBlockers } from '../../app/src/rules/engine';
import { packFor, packForProject } from '../../app/src/rules/registry';
import { readiness, plainAnswer } from '../../app/src/rules/readiness';
import { blankCounty, type Project } from '../../app/src/core/model';

/** A County lot that answers every County question inside the limits (N: 1000 GPM unsprinklered, hydrant <450, access <150, road 20, path 5). */
function county(): Project {
  const p = base(); p.site.jurisdiction = 'la-county'; p.site.address = '1234 E Example St, Altadena, CA 91001'; p.site.zone = 'R-1';
  p.site.county = { ...blankCounty(), betaOptIn: true, fireFlowGpm: 1500, hydrantFt: 300, vehicleAccessFt: 100, roadWidthFt: 24, roadGradeOk: 'yes', pathWidthFt: 6, pathGradeOk: 'yes', faultZone: 'no' };
  p.adu.newUpperFloor = 'no';
  return p;
}
const run = (p: Project) => { const k = packForProject(p); const rep = evaluate(p, k.rules, k.id, new Date('2026-10-25T12:00:00')); return { rep, st: (id: string) => rep.results.find(r => r.rule.id === id)?.status ?? 'NA' }; };

interface Case { id: string; why: string; make: () => Project; exp: Record<string, string>; overall?: string }
const CASES: Case[] = [
  { id: 'C01', why: 'All County answers inside the limits: every fire access rule passes (N Fire Access and Flow).', make: county,
    exp: { 'CJUR-01': 'PASS', 'CFF-01': 'PASS', 'CHYD-01': 'PASS', 'CACC-01': 'PASS', 'CROAD-01': 'PASS', 'CPATH-01': 'PASS', 'CFIR-01': 'PASS', 'CSPR-01': 'PASS', 'CGAR-01': 'PASS' } },
  { id: 'C02', why: 'Unsprinklered, not in a fire zone: needs 1000 GPM; 900 fails (N).', make: () => { const p = county(); p.site.county!.fireFlowGpm = 900; return p; }, exp: { 'CFF-01': 'FAIL' }, overall: 'FIX_ISSUES' },
  { id: 'C03', why: 'Sprinklered (house and ADU), not in a fire zone: 500 GPM is enough (N).', make: () => { const p = county(); p.site.flags.primarySprinklered = 'yes'; p.adu.sprinklered = 'yes'; p.site.county!.fireFlowGpm = 600; return p; }, exp: { 'CFF-01': 'PASS', 'CSPR-01': 'PASS' } },
  { id: 'C04', why: 'Fire zone: 1250 GPM needed even with 1100 (N); zone is a note (CL A8).', make: () => { const p = county(); p.site.flags.vhfhsz = 'yes'; p.site.county!.fireFlowGpm = 1100; return p; }, exp: { 'CFF-01': 'FAIL', 'CFHZ-01': 'INFO' } },
  { id: 'C05', why: 'Hydrant at exactly 450 ft: the source says "less than 450 feet", so it fails (N).', make: () => { const p = county(); p.site.county!.hydrantFt = 450; return p; }, exp: { 'CHYD-01': 'FAIL' } },
  { id: 'C06', why: 'Unsprinklered ADU 200 ft from the road: over 150 (N, CL A7).', make: () => { const p = county(); p.site.county!.vehicleAccessFt = 200; return p; }, exp: { 'CACC-01': 'FAIL' } },
  { id: 'C07', why: 'Sprinklered ADU 200 ft from the road: under 300 (N).', make: () => { const p = county(); p.site.flags.primarySprinklered = 'yes'; p.adu.sprinklered = 'yes'; p.site.county!.vehicleAccessFt = 200; return p; }, exp: { 'CACC-01': 'PASS' } },
  { id: 'C08', why: 'Road 16 ft wide: under 20 ft (N).', make: () => { const p = county(); p.site.county!.roadWidthFt = 16; return p; }, exp: { 'CROAD-01': 'FAIL' } },
  { id: 'C09', why: 'Walking path 4 ft at its narrowest: under 5 ft (N Fire Access note).', make: () => { const p = county(); p.site.county!.pathWidthFt = 4; return p; }, exp: { 'CPATH-01': 'FAIL' } },
  { id: 'C10', why: 'Unsprinklered, wall 4 ft from side line, rated wall planned: 3-5 ft needs 1-hour (N Fire-Rated Walls).', make: () => { const p = county(); p.adu.footprint = p.adu.footprint.map(q => ({ ...q, x: q.x + ft(2) })); p.adu.ratedWallPlanned = 'yes'; return p; }, exp: { 'CFIR-01': 'PASS' } },
  { id: 'C11', why: 'Same 4 ft wall, no rating planned: fails (N).', make: () => { const p = county(); p.adu.footprint = p.adu.footprint.map(q => ({ ...q, x: q.x + ft(2) })); p.adu.ratedWallPlanned = 'no'; return p; }, exp: { 'CFIR-01': 'FAIL' } },
  { id: 'C12', why: 'Sprinklered, 4 ft from the line: over 3 ft so no protection (N; LA City would need 5 ft).', make: () => { const p = county(); p.site.flags.primarySprinklered = 'yes'; p.adu.sprinklered = 'yes'; p.adu.footprint = p.adu.footprint.map(q => ({ ...q, x: q.x + ft(2) })); p.adu.ratedWallPlanned = 'no'; return p; }, exp: { 'CFIR-01': 'PASS' } },
  { id: 'C13', why: 'Unsprinklered, 2.5 ft from the line with openings: none allowed under 3 ft (N, CL B7).', make: () => { const p = county(); p.adu.footprint = p.adu.footprint.map(q => ({ ...q, x: q.x + ft(3.5) })); p.adu.openingsNearLine = 'yes'; p.adu.ratedWallPlanned = 'yes'; p.adu.eaveDepthMm = 0; return p; }, exp: { 'CFIR-01': 'FAIL' } },
  { id: 'C14', why: 'House sprinklered, ADU not: ADU needs sprinklers (CL A6, G 66314(d)(12)).', make: () => { const p = county(); p.site.flags.primarySprinklered = 'yes'; p.adu.sprinklered = 'no'; return p; }, exp: { 'CSPR-01': 'FAIL' } },
  { id: 'C15', why: '1,250 sq ft livable: the program is for ADUs under 1,200 (HG).', make: () => { const p = county(); p.adu.interiorLivableSqFt = 1250; return p; }, exp: { 'CSIZ-01': 'FAIL' } },
  { id: 'C16', why: '160 sq ft added: over the 150 sq ft state limit (G 66323(a)(1)(A)).', make: () => { const p = county(); p.adu.addedAreaSqFt = 160; p.adu.addedForIngressOnly = 'yes'; p.adu.addedSetbackMm = ft(5); return p; }, exp: { 'CADD-01': 'FAIL', 'CGAR-01': 'INFO' } },
  { id: 'C17', why: 'Added entry area 3 ft from the line: new area needs 4 ft (G 66314(d)(7)).', make: () => { const p = county(); p.adu.addedAreaSqFt = 100; p.adu.addedForIngressOnly = 'yes'; p.adu.addedSetbackMm = ft(3); return p; }, exp: { 'CSET-01': 'FAIL', 'CADD-01': 'PASS' } },
  { id: 'C18', why: 'Unpermitted garage: the program says "NO unpermitted construction" (HG, CL A2).', make: () => { const p = county(); p.adu.existingStructurePermitted = 'no'; return p; }, exp: { 'CGAR-01': 'FAIL' } },
  { id: 'C19', why: 'Fire zone, no transit: County asks 1 space unless exempt (Title 22 as amended 2025).', make: () => { const p = county(); p.site.flags.vhfhsz = 'yes'; p.site.flags.transitHalfMile = 'no'; p.site.county!.fireFlowGpm = 1300; return p; }, exp: { 'CPRK-01': 'UNKNOWN' } },
  { id: 'C20', why: 'Fault zone: outside the expedited checklist (CL A4).', make: () => { const p = county(); p.site.county!.faultZone = 'yes'; return p; }, exp: { 'CSLP-01': 'INFO' } },
  { id: 'C21', why: 'County questions left blank: every fire access rule asks, none passes.', make: () => { const p = county(); p.site.county = { ...blankCounty(), betaOptIn: true }; return p; },
    exp: { 'CFF-01': 'UNKNOWN', 'CHYD-01': 'UNKNOWN', 'CACC-01': 'UNKNOWN', 'CROAD-01': 'UNKNOWN', 'CPATH-01': 'UNKNOWN', 'CSLP-01': 'UNKNOWN' }, overall: 'INCOMPLETE' },
  { id: 'C22', why: 'Ceiling 6 ft 10 in: under 7 ft (N).', make: () => { const p = county(); p.adu.ceilingHeightMm = ft(6) + 254; return p; }, exp: { 'CCEI-01': 'FAIL' } },
];

describe('LA County beta golden cases (hand-derived)', () => {
  for (const c of CASES) it(`${c.id}: ${c.why}`, () => {
    const p = c.make(); const { rep, st } = run(p);
    expect(rep.pack).toMatch(/^la-county@/);
    for (const [id, s] of Object.entries(c.exp)) expect(st(id), id).toBe(s);
    if (c.overall) expect(rep.overall).toBe(c.overall);
    // Beta guards hold in every case.
    expect(plainAnswer(p, rep).verdict).not.toBe('likely-yes');
    expect(exportBlockers(p, rep).join(' ')).toMatch(/beta/i);
  });

  it('opt-in gate: a County lot without the beta checkbox gets LA City rules and "not supported"', () => {
    const p = county(); p.site.county!.betaOptIn = false; const { rep } = run(p);
    expect(rep.pack).toMatch(/^la-city@/); expect(rep.overall).toBe('NOT_SUPPORTED');
    expect(plainAnswer(p, rep).en).toMatch(/Beta: LA County/);
    expect(packFor('la-county')).toBeNull(); expect(packFor('la-county', { beta: true })?.id).toMatch(/^la-county@/);
  });

  it('a clean County lot says "Maybe", never "Likely yes", in both languages, and scores against the County checklist', () => {
    const p = county(); const { rep } = run(p); const a = plainAnswer(p, rep);
    expect(a.verdict).toBe('unsure'); expect(a.en).toMatch(/^Maybe/); expect(a.es).toMatch(/^Tal vez/); expect(a.en).not.toMatch(/Likely yes/);
    expect(readiness(p, rep).sheet.en).toMatch(/County/); expect(readiness(p, rep).items.every(i => !i.item.id.includes('.'))).toBe(true);
  });

  it('every County rule cites a source with an edition and a URL', () => {
    for (const r of packFor('la-county', { beta: true })!.rules) for (const ct of r.cites) { if (/Data check|review date/.test(ct.code)) continue; expect(ct.url, r.id).toMatch(/^https:\/\//); expect(ct.edition, r.id).toBeTruthy(); }
  });
});
