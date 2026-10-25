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
 * Run: cd app && npx vitest run --root ../qa/golden (runs in CI on every push)
 * Round 4 (seat r4gold): C12b corrected, C12c-C40 added; extra sources: LADBS sheet II-C.5a / II-D.2 / II-G.3a / II-J combination tables,
 * CRC R305.1 (2022: baths 6'-8"), CRC R302.1 exception for detached garages (4" eave) applies to U occupancy only.
 */
import { describe, it, expect } from 'vitest';
import { evaluate, type Status, type Report } from '../../app/src/rules/engine';
import { RULES, PACK_ID } from '../../app/src/rules/la-city';
import { readiness } from '../../app/src/rules/readiness';
import { rect } from '../../app/src/core/geom';
import { ft, inch } from '../../app/src/core/units';

import { base } from './golden_base';
import { plainAnswer } from '../../app/src/rules/readiness';
import type { Project } from '../../app/src/core/model';
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

interface Case { /** plainAnswer verdict that the facts support (never stronger). */ plain?: 'likely-yes' | 'likely-no' | 'unsure' | 'not-likely-yes'; /** Statuses a rule must NOT have. */ not?: Record<string, Exp[]>; /** Skip the conversion BASE expectations (other path). */ bare?: boolean; /** plainAnswer English must not match. */ plainNot?: RegExp; id: string; title: string; why: string; make: () => Project; exp: Record<string, Exp>; overall: Overall;
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
    // r4gold: the engine now asks "Is a new story being built?" (newUpperFloor). Unanswered = UNKNOWN / INCOMPLETE, which never reads READY. Correct.
    exp: { 'SCP-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },
  { id: 'C12c', title: 'Second story answered: a new story IS being built on the garage', why: 'GC 66323(a)(1)(A) / sheet II-C.2: only existing space (+150 sf entry). A new floor is a new/ordinance ADU (II-A/II-D): not covered -> NOT_SUPPORTED. Plain answer: unsure, and must not claim the lot is outside LA City.',
    make: () => { const p = base(); p.adu.heightMm = ft(22); p.adu.interiorLivableSqFt = 760; p.adu.newUpperFloor = 'yes'; return p; },
    exp: { 'SCP-01': 'FAIL' }, overall: 'NOT_SUPPORTED', plain: 'unsure', plainNot: /City of Los Angeles only/ },

  { id: 'C12d', title: 'Tall existing two-story garage (loft already permitted), no new story', why: 'Existing permitted space of any height converts in place (GC 66323(a)(1)(A)); answering "no new story" clears SCP-01.',
    make: () => { const p = base(); p.adu.heightMm = ft(22); p.adu.interiorLivableSqFt = 740; p.adu.newUpperFloor = 'no'; return p; },
    exp: {}, overall: 'READY_FOR_PREPARER', plain: 'likely-yes' },

  { id: 'C13', title: 'Flag lot: garage at the back of the flag, 180 ft hose pull', why: 'Lot lines are the flag outline; the pole end is the street. 6 ft to the flag lines, house 10.8 ft away (assumed line 5.4 ft): no rating. Hose pull over 150 ft (unsprinklered): LAFD access review, not a pass.',
    make: () => { const p = base(); p.site.lot = [{ x: 0, y: 0 }, { x: ft(12), y: 0 }, { x: ft(12), y: ft(80) }, { x: ft(60), y: ft(80) }, { x: ft(60), y: ft(150) }, { x: 0, y: ft(150) }]; p.site.streetEdge = 0;
      p.site.primary = rect(ft(2), ft(84), ft(28), ft(30)); p.adu.footprint = rect(ft(34), ft(124), ft(20), ft(20)); p.adu.hosePullFt = 180; p.adu.eaveDepthMm = 0; p.adu.floorPlanSideSetbackMm = ft(6); p.adu.floorPlanRearSetbackMm = ft(6); return p; },
    exp: { 'ACC-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },

  { id: 'C14', title: 'Alley-loaded garage on the rear lot line (0 ft to a 20 ft public alley), 12" eave', why: 'R202: fire separation is measured to the alley CENTERLINE: 0 + 10 ft. No rating, openings and eave allowed. Setback: GC 66314(d)(7) keeps the existing 0 ft.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(24), ft(130), ft(20), ft(20)); p.adu.eaveDepthMm = ft(1); p.adu.openingsNearLine = 'yes';
      p.site.streetEdges = [2]; p.adu.floorPlanRearSetbackMm = 0; return p; },
    exp: {}, overall: 'READY_FOR_PREPARER', plain: 'likely-yes' },

  { id: 'C15', title: 'Garage 2 ft from the rear (interior) line, 1-hr wall, but a 6" eave', why: 'SET-01 PASS (existing permitted structure). Table R302.1(1): projections are not allowed under 2 ft from the line; 2 ft - 6" = 1.5 ft -> FAIL (cut the eave).',
    make: () => { const p = base(); p.adu.footprint = rect(ft(24), ft(128), ft(20), ft(20)); p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.floorPlanRearSetbackMm = ft(2); return p; },
    exp: { 'FIR-01': 'FAIL' }, overall: 'FIX_ISSUES', plain: 'likely-no' },

  { id: 'C15b', title: 'Same 2 ft rear garage, eave cut to 0, 1-hr wall, no openings', why: 'III-A.5/III-D.1: 1-hr, no openings under 3 ft; no projection. Meets code.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(24), ft(128), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.floorPlanRearSetbackMm = ft(2); return p; },
    exp: {}, overall: 'READY_FOR_PREPARER', plain: 'likely-yes' },

  { id: 'C15c', title: 'Lot-line garage (0 ft) keeping its 4" garage eave', why: 'CRC R302.1 exception (4" eave within 2 ft) is for detached GARAGES (U). Once it is a dwelling, Table R302.1(1) bans projections under 2 ft -> FAIL.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(30), ft(124), ft(20), ft(20)); p.adu.eaveDepthMm = inch(4); p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.floorPlanSideSetbackMm = 0; return p; },
    exp: { 'FIR-01': 'FAIL' }, overall: 'FIX_ISSUES', plain: 'likely-no' },

  { id: 'C16', title: 'JADU already inside the house + detached garage conversion', why: 'Sheet II-C.5a: existing SFD + one detached/conversion State ADU + one attached ADU + one attached JADU is allowed.',
    make: () => { const p = base(); p.site.existingJadus = 1; return p; }, exp: {}, overall: 'READY_FOR_PREPARER', plain: 'likely-yes' },

  { id: 'C17', title: 'Existing ATTACHED ADU inside the house + detached garage conversion', why: 'Sheet II-C.5a allows one attached State or Ordinance ADU next to the detached conversion. The model cannot tell attached from detached, so the honest answer is a question, never a FAIL.',
    make: () => { const p = base(); p.site.existingAdus = 1; return p; }, exp: {}, not: { 'MIX-01': ['FAIL'] }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },

  { id: 'C18', title: 'Existing DETACHED ADU (backyard unit) + converting the garage too', why: 'Sheet II-C.5a allows only ONE detached/conversion State ADU. FAIL is right (when the existing one is detached).',
    make: () => { const p = base(); p.site.existingAdus = 1; p.site.otherBuildings = 'yes'; p.site.otherBuildingGapMm = ft(14); p.site.existingAduAttached = 'no'; /* r5gold restatement: answered detached */ return p; },
    exp: { 'MIX-01': 'FAIL' }, overall: 'FIX_ISSUES', plain: 'likely-no' },

  { id: 'C19', title: 'Attached garage conversion (II-G) on a lot that already has a detached ADU', why: 'Sheet II-G.3a: existing SFD + one attached State ADU + one detached State or Ordinance ADU + one JADU is allowed: must not FAIL.',
    make: () => { const p = base(); p.site.primary = rect(ft(5), ft(20), ft(20), ft(45)); p.adu.footprint = rect(ft(25), ft(30), ft(19), ft(20)); p.adu.garageAttachment = 'attached'; p.adu.hosePullFt = 50;
      p.adu.floorPlanSideSetbackMm = ft(6); p.adu.floorPlanRearSetbackMm = ft(100); p.site.existingAdus = 1; p.site.otherBuildings = 'yes'; p.site.otherBuildingGapMm = ft(40); return p; },
    exp: {}, not: { 'MIX-01': ['FAIL'] }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },

  { id: 'C20', title: 'Converting the garage AND building a new detached ADU 12 ft from it', why: 'II-C.5a / II-D.5a: only one detached-or-conversion State ADU per SFD lot -> the combination fails. (Model has no "planned second ADU" field; entered here as an ADU on the lot.)',
    make: () => { const p = base(); p.site.existingAdus = 1; p.site.otherBuildings = 'yes'; p.site.otherBuildingGapMm = ft(12); p.site.existingAduAttached = 'no'; /* r5gold restatement: answered detached */ return p; },
    exp: { 'MIX-01': 'FAIL' }, overall: 'FIX_ISSUES', plain: 'likely-no' },

  { id: 'C21', title: '900 sq ft (30x30) existing garage converted, 840 sq ft livable', why: 'The 800 sf cap is II-D.2 (NEW detached, GC 66323(a)(2)). A conversion of existing space has no size cap (II-C.2); over 750 sf the impact fee is not $0.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(14), ft(114), ft(30), ft(30)); p.adu.interiorLivableSqFt = 840; return p; },
    exp: {}, overall: 'READY_FOR_PREPARER', plain: 'likely-yes', extra: (_p, rep) => { expect(rep.results.find(r => r.rule.id === 'FEE-01')!.msg.en).toMatch(/Impact fee: estimate/); } },

  { id: 'C22', title: 'New detached ADU (city plan path) of 900 sq ft', why: 'Sheet II-D.2 / GC 66323(a)(2)(A): a new detached State ADU is capped at 800 sf. 900 sf is the Ordinance path (II-A, up to 1,200 sf) which the app does not check: never READY.',
    make: () => { const p = base(); p.adu.mode = 'youadu'; p.adu.footprint = rect(ft(14), ft(114), ft(30), ft(30)); p.adu.interiorLivableSqFt = 850; return p; },
    bare: true, exp: { 'SET-02': 'PASS', 'HGT-01': 'PASS' }, overall: 'NOT_SUPPORTED', plain: 'unsure' },

  { id: 'C23', title: 'HPOZ lot, all exterior work answered, stamps attached', why: 'HAZ-02 INFO (HPOZ review). Plain answer can only be "Maybe": a special area with extra review.',
    make: () => { const p = base(); p.site.flags.hpoz = 'yes'; return p; }, exp: { 'HAZ-02': 'INFO' }, overall: 'READY_FOR_PREPARER', plain: 'unsure' },

  { id: 'C24', title: 'Lot in two zones (R1-1 / C2-1VL)', why: 'A split-zoned lot: which zone the garage sits in decides the rules (sheet II-K.2 "ADU not permitted in the __ zone"). Plain answer must not be "likely yes".',
    make: () => { const p = base(); p.site.zone = 'R1-1 / C2-1VL'; return p; }, exp: {}, overall: 'READY_FOR_PREPARER', plain: 'not-likely-yes' },

  { id: 'C24b', title: 'Zone RAS4 (residential/accessory services, a commercial-style zone)', why: 'RAS zones are not plain single-family residential zones; plain answer stays "Maybe".',
    make: () => { const p = base(); p.site.zone = 'RAS4-1VL'; return p; }, exp: {}, overall: 'READY_FOR_PREPARER', plain: 'not-likely-yes' },

  { id: 'C25', title: 'Tandem (12x40) garage 3 ft from the side line, 1-hr wall, no openings there', why: 'III-D.1: 1-hr under 5 ft; FIR-02: no openings under 3 ft (3 ft exactly: 3-5 ft band, none planned). 480 sf, escape window on the inner wall.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(35), ft(104), ft(12), ft(40)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.interiorLivableSqFt = 440;
      p.adu.floorPlanSideSetbackMm = ft(3); p.adu.floorPlanRearSetbackMm = ft(6); return p; },
    exp: {}, overall: 'READY_FOR_PREPARER', plain: 'likely-yes' },

  { id: 'C26', title: 'Garage tucked UNDER the main house on a hillside (attached, house above)', why: 'II-G path (inside the existing SFD, garage included). Unit separation is a fire partition / horizontal assembly (III-D.5, an ask item). Hillside: HAZ-01 INFO. 22 ft building with no new story.',
    make: () => { const p = base(); p.site.primary = rect(ft(10), ft(20), ft(30), ft(45)); p.adu.footprint = rect(ft(10), ft(20), ft(20), ft(20)); p.adu.garageAttachment = 'attached'; p.adu.heightMm = ft(22); p.adu.newUpperFloor = 'no';
      p.adu.hosePullFt = 40; p.site.flags.hillside = 'yes'; p.site.flags.slopeOver10 = 'yes'; p.adu.floorPlanSideSetbackMm = ft(10); p.adu.floorPlanRearSetbackMm = ft(110); return p; },
    exp: { 'HAZ-01': 'INFO' }, overall: 'READY_FOR_PREPARER', plain: 'unsure', items: { 'II.G.2': 'autoPassed', 'III.D.5': 'covered' } },

  { id: 'C27', title: 'Garage 4 ft from the house: ADU wall rated, house wall has NO openings', why: 'Assumed line anywhere in a 4 ft gap leaves BOTH walls under 5 ft. LABC 705.3 / R302.1 Table R302.1(1): the existing house wall must also be 1-hr. Nothing asks if it will be, so not an automatic PASS.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(15), ft(69), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.houseFacingOpenings = 'no';
      p.adu.hosePullFt = 90; p.adu.floorPlanSideSetbackMm = ft(15); p.adu.floorPlanRearSetbackMm = ft(61); return p; },
    exp: { 'FIR-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },

  { id: 'C27b', title: 'Garage 5 ft from the house: ADU wall rated, eave 0, no ADU openings; house wall HAS windows', why: 'The assumed line may be placed anywhere (III-D.1). Put it on the ADU wall: house is 5 ft away (no limits), ADU at 0 ft is 1-hr with no openings and no projection: complies. Must not FAIL.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(15), ft(70), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.houseFacingOpenings = 'yes';
      p.adu.hosePullFt = 90; p.adu.floorPlanSideSetbackMm = ft(15); p.adu.floorPlanRearSetbackMm = ft(60); return p; },
    exp: {}, not: { 'FIR-01': ['FAIL'] }, overall: 'READY_FOR_PREPARER' },

  { id: 'C28', title: 'Masonry garage, owner prepares, no engineer named', why: 'B&P 5537(a) exempts wood-frame only: a licensed architect/engineer must prepare -> FAIL until one is on the project.',
    make: () => { const p = base(); p.adu.garageConstruction = 'masonry'; p.people.preparerRole = 'owner'; p.people.engineerName = ''; return p; },
    exp: { 'ENG-01': 'FAIL', 'OWN-01': 'INFO' }, overall: 'FIX_ISSUES', plain: 'likely-no' },

  { id: 'C28b', title: 'Concrete garage, drafter prepares, licensed engineer named', why: 'B&P 6737.1: the engineer designs/stamps the non-wood structure: requirement met (INFO).',
    make: () => { const p = base(); p.adu.garageConstruction = 'concrete'; return p; }, exp: { 'ENG-01': 'INFO' }, overall: 'READY_FOR_PREPARER' },

  { id: 'C29', title: 'Very High Fire zone, flat lot (not Hillside)', why: 'HAZ-01 only limits Hillside+VHFHSZ. R337/Ch.7A still applies (WUI-01 INFO, a safety note for I.C.8). Plain answer: Maybe.',
    make: () => { const p = base(); p.site.flags.vhfhsz = 'yes'; return p; }, exp: { 'WUI-01': 'INFO' }, overall: 'READY_FOR_PREPARER', plain: 'unsure', items: { 'I.C.8': 'needsAnswer' } },

  { id: 'C30', title: 'Bathroom ceiling 6\'-9" (drawn rooms), all else 8 ft', why: 'CRC R305.1 (2022) allows 6\'-8" in bathrooms; LADBS sheet III-G.1 prints 7\'-0" for baths. The two disagree, so the result must not be PASS (and ideally is a question, not a hard FAIL).',
    make: () => { const p = base(); p.adu.rooms = [
      { id: 'r1', name: 'Bedroom', use: 'sleeping', shape: 'rect', poly: rect(inch(4), inch(4), ft(12), ft(19) - inch(8)), tape: { w: null, d: null }, ceilingMm: null, openings: [{ id: 'o1', kind: 'window', wall: 3, offsetMm: ft(4), widthMm: inch(24), heightMm: inch(36), sillMm: inch(40) }, { id: 'd1', kind: 'door', wall: 1, offsetMm: ft(2), widthMm: inch(32), heightMm: inch(80), sillMm: null }] },
      { id: 'r2', name: 'Bath', use: 'bath', shape: 'rect', poly: rect(ft(12) + inch(4), inch(4), ft(8) - inch(8), ft(8)), tape: { w: null, d: null }, ceilingMm: inch(81), openings: [{ id: 'd2', kind: 'door', wall: 2, offsetMm: ft(1), widthMm: inch(32), heightMm: inch(80), sillMm: null }] } ]; return p; },
    exp: { 'ROM-01': 'PASS' }, not: { 'CEI-01': ['PASS'] }, overall: 'FIX_ISSUES' },

  { id: 'C31', title: 'Plain answer: sizes are still the example sizes', why: 'INP-01 UNKNOWN: every check ran on placeholder numbers. "Likely yes" would overstate.',
    make: () => { const p = base(); p.confirmed.adu = false; return p; }, exp: { 'INP-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },
  { id: 'C32', title: 'Plain answer: rule pack is stale for the application date', why: 'REV-01 UNKNOWN says "nothing here is ready to file". "Likely yes" would overstate.',
    make: () => { const p = base(); p.applicationDate = '2028-03-01'; return p; }, exp: { 'REV-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },
  { id: 'C33', title: 'Plain answer: burn-area (fire rebuild) question unanswered', why: 'HAZ-05 unknown: special rebuild orders may apply. Same as the 4 map overlays: Maybe, not likely yes.',
    make: () => { const p = base(); p.site.flags.fireRebuild = 'unknown'; return p; }, exp: { 'HAZ-05': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },
  { id: 'C34', title: 'Plain answer: address names Compton (jurisdiction not confirmed)', why: 'JUR-01 NOT_CHECKED: the lot may not be in LA City at all. Must not say likely yes, and must not say "0 questions left".',
    make: () => { const p = base(); p.site.address = '1234 W 50th St, Compton, CA 90220'; return p; }, exp: { 'JUR-01': 'NOT_CHECKED' }, overall: 'INCOMPLETE', plain: 'not-likely-yes', plainNot: /\b0 questions left/ },
  { id: 'C35', title: 'Plain answer: fire checks switched off', why: 'FIR-01/FIR-02/SPK-01/ACC-01 NOT_CHECKED. A "likely yes" with safety checks off overstates; "0 questions left" is false.',
    make: () => { const p = base(); p.modules.fire = false; return p; }, exp: { 'FIR-01': 'NOT_CHECKED', 'FIR-02': 'NOT_CHECKED', 'SPK-01': 'NOT_CHECKED', 'ACC-01': 'NOT_CHECKED' }, overall: 'INCOMPLETE', plain: 'not-likely-yes', plainNot: /\b0 questions left/ },
  { id: 'C36', title: 'Plain answer: number of ADUs already on the lot unknown', why: 'MIX-01 UNKNOWN: an existing detached ADU would make this a no (II-C.5a). Not likely yes.',
    make: () => { const p = base(); p.site.existingAdus = null; return p; }, exp: { 'MIX-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },
  { id: 'C37', title: 'Plain answer: garage permit status unknown, garage 2 ft from the line', why: 'SET-01 UNKNOWN: an unpermitted garage at 2 ft may need the 4 ft new-construction setback (a blocker). Not likely yes.',
    make: () => { const p = base(); p.adu.existingStructurePermitted = 'unknown'; p.adu.footprint = rect(ft(28), ft(124), ft(20), ft(20)); p.adu.eaveDepthMm = 0; p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = 'no'; p.adu.floorPlanSideSetbackMm = ft(2); return p; },
    exp: { 'SET-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },
  { id: 'C38', title: 'Plain answer: duplex on a LA City lot', why: 'MIX-01 unsupported (sheet II-E/II-I). Verdict unsure, but the reason is the building type, not "LA City only".',
    make: () => { const p = base(); p.site.mainBuilding = 'duplex'; return p; }, exp: { 'MIX-01': 'FAIL' }, overall: 'NOT_SUPPORTED', plain: 'unsure', plainNot: /City of Los Angeles only/ },
  { id: 'C39', title: 'Corner lot, garage 3 ft from the side street, street NOT marked (user skipped the question)', why: 'Without the street flag every line is a property line: 3 ft wall with windows -> 1-hr needed (FAIL) and openings 3-5 ft need analysis. Conservative and correct for the data entered.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(3), ft(124), ft(20), ft(20)); p.adu.openingsNearLine = 'yes'; p.adu.eaveDepthMm = 0; p.adu.floorPlanSideSetbackMm = ft(3); return p; },
    exp: { 'FIR-01': 'FAIL', 'FIR-02': 'UNKNOWN' }, overall: 'FIX_ISSUES', plain: 'likely-no' },
  { id: 'C40', title: 'Attached conversion + 100 sf entry addition', why: 'Sheet II-G.2: attached path is existing space only; the 150 sf allowance (II-C.3) is for detached accessory structures -> a question, not a pass.',
    make: () => { const p = base(); p.site.primary = rect(ft(5), ft(20), ft(20), ft(45)); p.adu.footprint = rect(ft(25), ft(30), ft(19), ft(20)); p.adu.garageAttachment = 'attached'; p.adu.hosePullFt = 50;
      p.adu.floorPlanSideSetbackMm = ft(6); p.adu.floorPlanRearSetbackMm = ft(100); p.adu.addedAreaSqFt = 100; p.adu.addedForIngressOnly = 'yes'; p.adu.addedSetbackMm = ft(6); p.adu.interiorLivableSqFt = 440; return p; },
    exp: { 'SCP-01': 'UNKNOWN', 'ADD-01': 'PASS' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },
];

const run = (p: Project) => { const rep = evaluate(p, RULES, PACK_ID, TODAY); return { rep, rd: readiness(p, rep) }; };

describe('golden LA garage-conversion cases', () => {
  for (const c of CASES) describe(`${c.id} ${c.title}`, () => {
    const exp = c.bare ? { ...c.exp } : { ...BASE, ...c.exp };
    for (const id of Object.keys(c.not ?? {})) delete (exp as Record<string, Exp>)[id];
    for (const [id, bad] of Object.entries(c.not ?? {})) it(`${id} is not ${bad.join('/')}`, () => {
      const { rep } = run(c.make()); const r = rep.results.find(x => x.rule.id === id);
      expect(bad, `${c.id} ${id}: ${r?.msg.en ?? 'not applied'} | ${c.why}`).not.toContain(r ? r.status : 'NA');
    });
    if (c.plain) it(`plain answer -> ${c.plain}`, () => { const p = c.make(); const a = plainAnswer(p, run(p).rep);
      if (c.plain === 'not-likely-yes') expect(a.verdict, `${c.id}: "${a.en}" | ${c.why}`).not.toBe('likely-yes'); else expect(a.verdict, `${c.id}: "${a.en}" | ${c.why}`).toBe(c.plain); });
    if (c.plainNot) it(`plain answer wording`, () => { const p = c.make(); const a = plainAnswer(p, run(p).rep); expect(a.en, c.why).not.toMatch(c.plainNot!); });
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
