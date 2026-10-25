/**
 * GOLDEN CASES: 12 realistic LA garage conversions (+1 variant), with the result every rule SHOULD give,
 * worked out from the primary sources (not from the engine):
 *  - LADBS PC/STR/Corr.Lst.20A Rev 10/01/2025 (II-C, II-G, III-A.5, III-D.1/.2/.4, III-E, III-F.1, III-G.1, III-J.1)
 *  - CRC/LARC R202 (fire separation distance is measured to the lot line, the CENTERLINE of a street, or an assumed line
 *    between two buildings on the lot), R302.1 + Tables R302.1(1)/(2), R305.1, R310.2, R314, R315, R337 (wildfire)
 *  - LABC 705.3 (assumed line between buildings on one lot: the EXISTING building's wall and openings must also comply)
 *  - Gov. Code 66314(d)(7)/(d)(11)/(d)(12), 66321(b)(4), 66323(a)(1)(A) (inside existing space + max 150 sf ingress/egress),
 *    66332 (AB 2533), B&P 5537/6737.1
 * Every `expect` row is "what the code/sheet requires". A failing row = an engine finding.
 * Run: cd /home/claude/opa/app && npx vitest run /home/claude/stress/r3/tests/golden_cases.test.ts --root /
 */
import { describe, it, expect } from 'vitest';
import { evaluate, type Status, type Report } from '/home/claude/opa/app/src/rules/engine';
import { RULES, PACK_ID } from '/home/claude/opa/app/src/rules/la-city';
import { readiness } from '/home/claude/opa/app/src/rules/readiness';
import { rect } from '/home/claude/opa/app/src/core/geom';
import { ft, inch } from '/home/claude/opa/app/src/core/units';

import { base } from './golden_base';
import type { Project } from '/home/claude/opa/app/src/core/model';
export { base };
const TODAY = new Date('2026-10-24T12:00:00');
type Exp = Status | 'NA';
type Overall = Report['overall'];

/** Expected rule results for the base case (from the sources above). */
const BASE: Record<string, Exp> = {
  'GEO-01': 'PASS', 'INP-01': 'PASS', 'JUR-01': 'PASS', 'REV-01': 'PASS', 'GAR-01': 'PASS', 'MIX-01': 'PASS', 'SCP-01': 'PASS',
  'SET-01': 'PASS', // Gov. Code 66314(d)(7): no setback for a permitted existing structure converted in place
  'ADD-01': 'NA', 'SET-02': 'NA', 'SEP-01': 'NA', 'HGT-01': 'NA', 'ROM-01': 'NA', 'LEG-01': 'NA', 'OWN-01': 'NA', 'RSO-01': 'NA',
  'CEI-01': 'PASS', 'EGR-01': 'PASS', 'ALM-01': 'PASS', 'ALM-02': 'PASS',
  'FIR-01': 'PASS', // 6 ft to every line, 6" eave leaves 5.5 ft: Table R302.1(1) no rating
  'FIR-02': 'PASS', 'SPK-01': 'PASS', 'ACC-01': 'PASS',
  'ENG-01': 'INFO', // garage door wall infill: engineer for that wall only (B&P 6737.1)
  'HAZ-01': 'PASS', 'HAZ-02': 'PASS', 'HAZ-03': 'PASS', 'HAZ-04': 'PASS', 'HAZ-05': 'PASS', 'ESM-01': 'PASS', 'FEE-01': 'INFO', 'NRG-01': 'PASS',
  'VAP-01': 'PASS', 'SET-03': 'PASS', 'PRK-01': 'PASS', 'DWP-01': 'PASS', 'PNL-01': 'INFO', 'GAS-01': 'PASS', 'CLK-01': 'INFO',
};

interface Case { id: string; title: string; why: string; make: () => Project; exp: Record<string, Exp>; overall: Overall;
  /** Sheet items whose readiness state is checked: expected state. */ items?: Record<string, string>;
  /** Extra assertions (code requirement the engine has no rule for). */ extra?: (p: Project, rep: Report) => void }

const CASES: Case[] = [
  { id: 'C01', title: 'Detached 20x20 garage, standard 50x150 lot, 6 ft yards, 12" eave', why: 'Sheet II-C path. 6 ft wall minus 12" eave = exactly 5 ft: Table R302.1(1) needs a rated underside only from 2 ft to LESS than 5 ft.', make: () => { const p = base(); p.adu.eaveDepthMm = ft(1); return p; }, exp: {}, overall: 'READY_FOR_PREPARER' },

  { id: 'C02', title: 'Attached garage sharing a wall with the house', why: 'Sheet II-G path (GC 66323(a)(1)); unit separation III-D.5 is an ask item; II-C items do not apply.',
    make: () => { const p = base(); p.site.primary = rect(ft(5), ft(20), ft(20), ft(45)); p.adu.footprint = rect(ft(25), ft(30), ft(19), ft(20));
      p.adu.garageAttachment = 'attached'; p.adu.hosePullFt = 50; p.adu.floorPlanSideSetbackMm = ft(6); p.adu.floorPlanRearSetbackMm = ft(100); return p; },
    exp: {}, overall: 'READY_FOR_PREPARER', items: { 'II.C.2': 'covered', 'II.G.2': 'autoPassed' } },

  { id: 'C03', title: 'Garage on the side line at 0 ft (legal nonconforming, permitted)', why: 'GC 66314(d)(7) keeps it; III-A.5/III-D.1: 1-hr wall, no openings; Table R302.1(1): no projection under 2 ft.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(30), ft(124), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no';
      p.adu.floorPlanSideSetbackMm = 0; return p; },
    exp: {}, overall: 'READY_FOR_PREPARER' },

  { id: 'C04', title: 'Detached garage 3 ft from the house', why: 'Assumed line halfway = 1.5 ft: ADU wall 1-hr, no openings (<3 ft). LABC 705.3 / R302.1: the house wall facing it is also 1.5 ft from that line, so its windows and eave must be checked (or the line moved). Nothing asks about the house wall, so this cannot be an automatic PASS.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(15), ft(68), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no';
      p.adu.hosePullFt = 90; p.adu.floorPlanSideSetbackMm = ft(15); p.adu.floorPlanRearSetbackMm = ft(62); return p; },
    exp: { 'FIR-01': 'UNKNOWN' }, overall: 'INCOMPLETE' },

  { id: 'C05', title: 'Corner lot: garage 3 ft from the side-STREET lot line, windows on that wall', why: 'R202: fire separation distance is measured to the street centerline, so a 3 ft street-side yard on a 30+ ft street is >5 ft: no rating, openings allowed. Only the interior lines count as property lines.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(3), ft(124), ft(20), ft(20)); p.adu.ratedWallPlanned = 'no'; p.adu.openingsNearLine = 'yes';
      p.adu.eaveDepthMm = ft(1); p.adu.floorPlanSideSetbackMm = ft(3); p.adu.floorPlanRearSetbackMm = ft(6);
      // Edge 3 of rect() is the x=0 side: on this corner lot it is the side street. The model has no way to say so (finding).
      (p.site as unknown as { streetEdges: number[] }).streetEdges = [0, 3]; return p; },
    exp: {}, overall: 'READY_FOR_PREPARER' },

  { id: 'C06', title: 'Hillside lot in a Very High Fire Hazard Severity Zone', why: 'GC 66323(a): conversion is ministerial (LAMC 12.22 A.33 hillside limit targets new ADUs) -> HAZ-01 INFO. VHFHSZ also brings CRC R337 / LABC Ch. 7A wildfire construction and LAFD brush clearance: must be surfaced.',
    make: () => { const p = base(); p.site.flags.hillside = 'yes'; p.site.flags.vhfhsz = 'yes'; p.site.flags.slopeOver10 = 'yes'; return p; },
    exp: { 'HAZ-01': 'INFO' }, overall: 'READY_FOR_PREPARER', items: { 'II.K.14': 'needsAnswer' },
    extra: (_p, rep) => { expect(rep.results.some(r => r.rule.cites.some(c => /R337|7A/.test(c.code))), 'a wildfire-construction (R337 / Ch. 7A) item is surfaced').toBe(true); } },

  { id: 'C07', title: 'Coastal zone lot', why: 'Sheet I-B.9: Coastal Development Permit clearance for change of use/density (garage -> dwelling). An ask item: until the user answers it (clearance obtained or exempt), I.B.9 is not done; a HAZ-03 note must not mark it done.',
    make: () => { const p = base(); p.site.flags.coastal = 'yes'; delete p.sheet['I.B.9']; return p; },
    exp: { 'HAZ-03': 'INFO' }, overall: 'READY_FOR_PREPARER', items: { 'I.B.9': 'needsAnswer' } },

  { id: 'C08', title: 'HPOZ (historic district) lot', why: 'HPOZ review of the exterior change (garage door infill); I-C.4 agency stamps are a document: not attached = not done.',
    make: () => { const p = base(); p.site.flags.hpoz = 'yes'; p.docs['I.C.4'] = false; return p; },
    exp: { 'HAZ-02': 'INFO' }, overall: 'READY_FOR_PREPARER', items: { 'I.C.4': 'docsMissing' } },

  { id: 'C09', title: 'Masonry (CMU/brick) garage, plans by a licensed architect', why: 'B&P 5537 exemption is wood-frame only, so a licensed architect/engineer must prepare. Here one does: the requirement is met (note URM seismic review), not a FAIL.',
    make: () => { const p = base(); p.adu.garageConstruction = 'masonry'; p.people.preparerRole = 'architect'; p.people.preparerLicense = 'C-12345'; p.people.preparerName = 'Test Architect'; return p; },
    exp: { 'ENG-01': 'INFO' }, overall: 'READY_FOR_PREPARER' },

  { id: 'C10', title: 'Unpermitted pre-2020 conversion, lived in before 2020 (AB 2533), 2 ft from side line', why: 'GC 66332: deny only for health and safety (HSC 17920.3). Setbacks become a note; fire wall/egress still enforced and satisfied.',
    make: () => { const p = base(); p.adu.existingStructurePermitted = 'no'; p.adu.builtBefore2020 = 'yes'; p.adu.usedAsHomeBefore2020 = 'yes'; p.adu.legalization = true;
      p.adu.footprint = rect(ft(28), ft(124), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.removesGarageDoorWall = 'no';
      p.adu.floorPlanSideSetbackMm = ft(2); return p; },
    exp: { 'SET-01': 'INFO', 'LEG-01': 'INFO', 'ENG-01': 'PASS' }, overall: 'READY_FOR_PREPARER' },

  { id: 'C11', title: '2-bedroom conversion with a 100 sq ft entry addition', why: 'GC 66323(a)(1)(A): up to 150 sf for ingress/egress; sheet II-D.4 standard 4 ft for the addition (here 6 ft). Two sleeping rooms, each with an R310.2 window.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(22), ft(120), ft(22), ft(24)); p.adu.bedrooms = 2; p.adu.interiorLivableSqFt = 560;
      p.adu.addedAreaSqFt = 100; p.adu.addedForIngressOnly = 'yes'; p.adu.addedSetbackMm = ft(6); p.adu.floorPlanSideSetbackMm = ft(6); p.adu.floorPlanRearSetbackMm = ft(6);
      p.adu.windows = [1, 2].map(n => ({ id: 'w' + n, room: `Bedroom ${n}`, sleeping: true, clearWidthMm: inch(24), clearHeightMm: inch(36), sillMm: inch(40), gradeFloor: false })); return p; },
    exp: { 'ADD-01': 'PASS' }, overall: 'READY_FOR_PREPARER' },

  { id: 'C12', title: 'Garage with a 400 sq ft second-story addition (entered as added area)', why: 'Out of scope: not inside existing space and over 150 sf (GC 66323(a)(1)(A)); this is a new/ordinance ADU (II-A/II-D), which the conversion pack does not cover -> NOT_SUPPORTED.',
    make: () => { const p = base(); p.adu.addedAreaSqFt = 400; p.adu.addedForIngressOnly = 'no'; p.adu.heightMm = ft(22); p.adu.addedSetbackMm = ft(6); p.adu.interiorLivableSqFt = 760; return p; },
    exp: { 'SCP-01': 'FAIL', 'ADD-01': 'PASS' }, overall: 'NOT_SUPPORTED' },

  { id: 'C12b', title: 'Same second story, but the user leaves "added area" at 0 (the footprint did not grow)', why: 'Nothing in the model asks about a new floor above. A 22 ft garage with a new upper floor must never read READY on the conversion path.',
    make: () => { const p = base(); p.adu.heightMm = ft(22); p.adu.interiorLivableSqFt = 760; return p; },
    exp: {}, overall: 'NOT_SUPPORTED' },
];

const run = (p: Project) => { const rep = evaluate(p, RULES, PACK_ID, TODAY); return { rep, rd: readiness(p, rep) }; };

describe('golden LA garage-conversion cases', () => {
  for (const c of CASES) describe(`${c.id} ${c.title}`, () => {
    const exp = { ...BASE, ...c.exp };
    for (const [id, want] of Object.entries(exp)) it(`${id} -> ${want}`, () => {
      const { rep } = run(c.make()); const r = rep.results.find(x => x.rule.id === id);
      expect(r ? r.status : 'NA', `${c.id} ${id}: ${r?.msg.en ?? 'not applied'} | ${c.why}`).toBe(want);
    });
    it(`overall -> ${c.overall}`, () => { const { rep } = run(c.make()); expect(rep.overall, c.why).toBe(c.overall); });
    if (c.items) for (const [item, state] of Object.entries(c.items)) it(`sheet ${item} -> ${state}`, () => {
      const { rd } = run(c.make()); expect(rd.items.find(x => x.item.id === item)?.state, c.why).toBe(state);
    });
    if (c.overall === 'READY_FOR_PREPARER') it('no sheet item is failing', () => { const { rd } = run(c.make()); expect(rd.items.filter(x => x.state === 'failing').map(x => x.item.id)).toEqual([]); });
    if (c.extra) it('extra code requirement', () => { const p = c.make(); c.extra!(p, run(p).rep); });
  });
});
