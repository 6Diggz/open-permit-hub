/**
 * Golden cases, round 5 (seat r5gold). Builds on golden_cases_r4.test.ts and golden_base.ts.
 * Targets the round-4 logic: MIX-01 combinations (LADBS ADU/JADU/MTH correction sheet 2023 LABC/LARC, rev. Dec 8 2025:
 * II-C.5a, II-D.1, II-D.5a, II-G.3a), SIZ-01 (II-D.2, Gov. Code 66323(a)(2)), the house-wall rating (LARC Table R302.1(1),
 * LABC 705.3, sheet III-D.1), the assumed line on a rated blank ADU wall, plain-answer gating (EN + ES), other-city /
 * county / unknown jurisdiction, and LADBS item I.A.1 (auto again since r3market-06 added the 8.5x11 plot plan page).
 * Only the listed rules are asserted (no BASE spread), so a case stays readable. Cases tagged red: are expected to fail
 * on main d26ad77 until that r5gold finding is fixed.
 */
import { describe, it, expect } from 'vitest';
import { base, run, ft, rect } from './golden_base';
import { plainAnswer } from '../../app/src/rules/readiness';
import type { Project } from '../../app/src/core/model';

type Plain = 'likely-yes' | 'likely-no' | 'unsure' | 'not-likely-yes';
interface Case { id: string; title: string; why: string; red?: string; make: () => Project; exp: Record<string, string>; overall?: string; notOverall?: string;
  plain?: Plain; plainEn?: RegExp; plainEs?: RegExp; plainNotEn?: RegExp; plainNotEs?: RegExp; items?: Record<string, string> }

/** 4-8 ft house gap layouts: the garage moves toward the house (house rear wall at y = 65 ft). */
const gap = (g: number, aduOpen: 'yes' | 'no', houseOpen: 'yes' | 'no') => { const p = base(); p.adu.footprint = rect(ft(15), ft(65 + g), ft(20), ft(20)); p.adu.eaveDepthMm = 0;
  p.adu.ratedWallPlanned = 'yes'; p.adu.openingsNearLine = aduOpen; p.adu.houseFacingOpenings = houseOpen; p.adu.hosePullFt = 90;
  p.adu.floorPlanSideSetbackMm = ft(15); p.adu.floorPlanRearSetbackMm = ft(65 - g); return p; };
const att = (p: Project) => { p.site.primary = rect(ft(5), ft(20), ft(20), ft(45)); p.adu.footprint = rect(ft(25), ft(30), ft(19), ft(20)); p.adu.garageAttachment = 'attached';
  p.adu.hosePullFt = 50; p.adu.floorPlanSideSetbackMm = ft(6); p.adu.floorPlanRearSetbackMm = ft(100); return p; };
const nd = (p: Project) => { p.adu.mode = 'youadu'; return p; };

const CASES: Case[] = [
  // --- MIX-01 combinations ---
  { id: 'R5-01', title: 'C18 restated: existing DETACHED ADU (answered) + detached garage conversion', why: 'II-C.5a: one detached/conversion State ADU only. Golden C18/C20 left existingAduAttached unset and now read UNKNOWN (a correct move); answered "no" must FAIL.',
    make: () => { const p = base(); p.site.existingAdus = 1; p.site.existingAduAttached = 'no'; return p; }, exp: { 'MIX-01': 'FAIL' }, overall: 'FIX_ISSUES', plain: 'likely-no', items: { 'II.C.1': 'failing' } },
  { id: 'R5-02', title: 'Existing ATTACHED ADU + detached garage conversion', why: 'II-C.5a: SFD + one detached/conversion State ADU + one attached State or Ordinance ADU: allowed.',
    make: () => { const p = base(); p.site.existingAdus = 1; p.site.existingAduAttached = 'yes'; return p; }, exp: { 'MIX-01': 'PASS' }, overall: 'READY_FOR_PREPARER', plain: 'likely-yes' },
  { id: 'R5-03', title: 'Full II-C.5a mix: attached ADU + JADU already, converting the detached garage', why: 'II-C.5a lists exactly this: SFD + detached/conversion + attached ADU + attached JADU.',
    make: () => { const p = base(); p.site.existingAdus = 1; p.site.existingAduAttached = 'yes'; p.site.existingJadus = 1; return p; }, exp: { 'MIX-01': 'PASS' }, overall: 'READY_FOR_PREPARER' },
  { id: 'R5-04', title: 'Existing attached ADU + ATTACHED garage conversion', why: 'II-G.3a: one attached State ADU only (plus one detached, one JADU). Two attached = FAIL.',
    make: () => { const p = att(base()); p.site.existingAdus = 1; p.site.existingAduAttached = 'yes'; return p; }, exp: { 'MIX-01': 'FAIL' }, overall: 'FIX_ISSUES', plain: 'likely-no' },
  { id: 'R5-05', title: 'Existing detached ADU + ATTACHED garage conversion', why: 'II-G.3a: SFD + one attached State ADU + one detached State or Ordinance ADU: allowed.',
    make: () => { const p = att(base()); p.site.existingAdus = 1; p.site.existingAduAttached = 'no'; p.site.otherBuildings = 'yes'; p.site.otherBuildingGapMm = ft(40); return p; }, exp: { 'MIX-01': 'PASS' } },
  { id: 'R5-06', title: 'Existing ADU, attachment not answered', why: 'Attached vs detached decides II-C.5a: must be a question, and the plain answer cannot be "Likely yes" (MIX-01 is in the gate).',
    make: () => { const p = base(); p.site.existingAdus = 1; return p; }, exp: { 'MIX-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'unsure' },
  { id: 'R5-07', title: 'Two existing ADUs + garage conversion', why: 'No II-C/II-G combination allows a third ADU on an SFD lot.',
    make: () => { const p = base(); p.site.existingAdus = 2; p.site.existingAduAttached = 'yes'; return p; }, exp: { 'MIX-01': 'FAIL' }, overall: 'FIX_ISSUES' },
  { id: 'R5-08', title: 'Two existing JADUs', why: 'II-C.5a: one attached JADU. Gov. Code 66323(a)(1): one JADU per lot.',
    make: () => { const p = base(); p.site.existingJadus = 2; return p; }, exp: { 'MIX-01': 'FAIL' }, overall: 'FIX_ISSUES' },
  { id: 'R5-09', title: 'New detached ADU (city plan path) where a detached ADU already exists', red: 'r5gold-02', why: 'II-D.5a: SFD + ONE detached State ADU + one attached + one JADU. A second detached State ADU is not allowed; MIX-01 does not run on this path.',
    make: () => { const p = nd(base()); p.site.existingAdus = 1; p.site.existingAduAttached = 'no'; return p; }, exp: {}, notOverall: 'READY_FOR_PREPARER', plain: 'not-likely-yes' },
  { id: 'R5-10', title: 'New detached ADU (city plan path) on a duplex lot', red: 'r5gold-02', why: 'II-D.1: lot must have an SFD. Multifamily is II-E (GC 66323(a)(4)), not checked: never READY.',
    make: () => { const p = nd(base()); p.site.mainBuilding = 'duplex' as never; return p; }, exp: {}, notOverall: 'READY_FOR_PREPARER' },
  // --- SIZ-01 ---
  { id: 'R5-11', title: 'New detached ADU, exactly 800 sq ft livable', why: 'II-D.2 / GC 66323(a)(2): 800 sf is allowed ("not exceed").',
    make: () => { const p = nd(base()); p.adu.interiorLivableSqFt = 800; return p; }, exp: { 'SIZ-01': 'PASS' } },
  { id: 'R5-12', title: 'New detached ADU, 801 sq ft livable on a 400 sf footprint', why: 'Over 800 sf is the Ordinance path (II-A): NOT_SUPPORTED, plain "unsure" that names sheet II-D.2 in both languages.',
    make: () => { const p = nd(base()); p.adu.interiorLivableSqFt = 801; return p; }, exp: { 'SIZ-01': 'FAIL' }, overall: 'NOT_SUPPORTED', plain: 'unsure', plainEn: /II-D\.2/, plainEs: /II-D\.2/, items: { 'II.D.2': 'failing' } },
  { id: 'R5-13', title: 'Garage conversion of 840 sq ft: SIZ-01 does not apply', why: 'II-C.2 / GC 66323(a)(1)(A): existing space has no 800 sf cap.',
    make: () => { const p = base(); p.adu.footprint = rect(ft(14), ft(114), ft(30), ft(30)); p.adu.interiorLivableSqFt = 840; return p; }, exp: { 'SIZ-01': 'NA' } },
  // --- house wall rating / fire line ---
  { id: 'R5-14', title: '4 ft gap, ADU wall rated, house wall answered "will be 1-hour"', why: 'LARC Table R302.1(1) / LABC 705.3: both walls under 5 ft rated, no openings: complies.',
    make: () => { const p = gap(4, 'no', 'no'); p.adu.houseWallRated = 'yes'; return p; }, exp: { 'FIR-01': 'PASS' }, overall: 'READY_FOR_PREPARER', plain: 'likely-yes' },
  { id: 'R5-15', title: '4 ft gap, house wall answered "will NOT be rated"', why: 'Every assumed-line position leaves the house wall under 5 ft: FAIL.',
    make: () => { const p = gap(4, 'no', 'no'); p.adu.houseWallRated = 'no'; return p; }, exp: { 'FIR-01': 'FAIL' }, overall: 'FIX_ISSUES', plain: 'likely-no' },
  { id: 'R5-16', title: '7 ft gap, rated ADU wall WITH openings, blank unrated house wall', red: 'r5gold-03', why: 'ADU openings need the line 3 ft or more away; an unrated house needs 5 ft: 3 + 5 = 8 > 7. The house wall must be rated, so FIR-01 cannot PASS unasked.',
    make: () => gap(7, 'yes', 'no'), exp: {}, plain: 'not-likely-yes' },
  { id: 'R5-17', title: '8 ft gap, rated ADU wall WITH openings, blank unrated house wall', why: 'Line 3 ft from the ADU, 5 ft from the house: both sides comply without a house rating. FIR-01 must not FAIL.',
    make: () => gap(8, 'yes', 'no'), exp: { 'FIR-01': 'PASS' } },
  { id: 'R5-18', title: '5 ft gap, blank rated ADU wall, 1 ft eave (rated underside), house wall has windows', why: 'Line on the ADU wall: the eave crosses it. Line 3 ft out (eave tip 2 ft): house at 2 ft with windows (<3 ft banned). No position works: FAIL is right.',
    make: () => { const p = gap(5, 'no', 'yes'); p.adu.eaveDepthMm = ft(1); p.adu.ratedEaveUndersidePlanned = 'yes'; return p; }, exp: { 'FIR-01': 'FAIL' } },
  // --- plain-answer gating ---
  { id: 'R5-19', title: '180 ft hose pull, no sprinklers', red: 'r5gold-01', why: 'ACC-01 UNKNOWN is LAFD access review that can stop the project (critical): not "Likely yes".',
    make: () => { const p = base(); p.adu.hosePullFt = 180; return p; }, exp: { 'ACC-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'not-likely-yes' },
  { id: 'R5-20', title: 'All clear: plain answer wording in both languages', why: 'Likely yes, with the question count, in EN and ES.',
    make: () => base(), exp: {}, overall: 'READY_FOR_PREPARER', plain: 'likely-yes', plainEn: /^Likely yes, this garage can become an ADU/, plainEs: /^Probablemente sí, este garaje puede ser una ADU/ },
  // --- jurisdiction ---
  { id: 'R5-21', title: 'Unincorporated LA County lot', why: 'No county pack: JUR-01 FAIL, NOT_SUPPORTED, plain "unsure, LA City only" in EN and ES.',
    make: () => { const p = base(); p.site.jurisdiction = 'la-county' as never; return p; }, exp: { 'JUR-01': 'FAIL' }, overall: 'NOT_SUPPORTED', plain: 'unsure', plainEn: /City of Los Angeles only/, plainEs: /solo para la Ciudad de Los Ángeles/ },
  { id: 'R5-22', title: 'Another city', why: 'Same refusal as the county.',
    make: () => { const p = base(); p.site.jurisdiction = 'other' as never; return p; }, exp: { 'JUR-01': 'FAIL' }, overall: 'NOT_SUPPORTED', plain: 'unsure' },
  { id: 'R5-23', title: 'City not known yet', red: 'r5gold-04', why: 'The lot may well be in LA City: the plain answer must ask to confirm the city, not say the tool is LA-only.',
    make: () => { const p = base(); p.site.jurisdiction = 'unknown' as never; return p; }, exp: { 'JUR-01': 'UNKNOWN' }, overall: 'INCOMPLETE', plain: 'unsure', plainNotEn: /Los Angeles only/, plainNotEs: /solo para la Ciudad/ },
  // --- I.A.1 ---
  { id: 'R5-24', title: 'I.A.1 (8.5x11 plot plan) not answered', why: 'r3market-06: the plan PDF now ends with a dimensioned 8.5x11 plot plan page, so I.A.1 is checked by the app (auto).',
    make: () => { const p = base(); delete p.sheet['I.A.1']; return p; }, exp: {}, items: { 'I.A.1': 'autoPassed' } },
  { id: 'R5-25', title: 'I.A.1 answered "no"', why: 'r3market-06: I.A.1 is now auto (the app makes the 8.5x11 plot plan); a stale "no" answer does not override the app\'s own check.',
    make: () => { const p = base(); p.sheet['I.A.1'] = 'no' as never; return p; }, exp: {}, items: { 'I.A.1': 'autoPassed' } },
];

describe('golden r5 cases (round-4 logic)', () => {
  for (const c of CASES) describe(`${c.id} ${c.title}${c.red ? ` [red: ${c.red}]` : ''}`, () => {
    for (const [id, want] of Object.entries(c.exp)) it(`${id} -> ${want}`, () => { const { rep } = run(c.make()); const r = rep.results.find(x => x.rule.id === id);
      expect(r ? r.status : 'NA', `${c.id} ${id}: ${r?.msg.en ?? 'not applied'} | ${c.why}`).toBe(want); });
    if (c.overall) it(`overall -> ${c.overall}`, () => expect(run(c.make()).rep.overall, c.why).toBe(c.overall));
    if (c.notOverall) it(`overall is not ${c.notOverall}`, () => expect(run(c.make()).rep.overall, c.why).not.toBe(c.notOverall));
    if (c.plain) it(`plain -> ${c.plain}`, () => { const p = c.make(); const a = plainAnswer(p, run(p).rep);
      if (c.plain === 'not-likely-yes') expect(a.verdict, `${a.en} | ${c.why}`).not.toBe('likely-yes'); else expect(a.verdict, `${a.en} | ${c.why}`).toBe(c.plain);
      if (c.plainEn) expect(a.en).toMatch(c.plainEn); if (c.plainEs) expect(a.es).toMatch(c.plainEs);
      if (c.plainNotEn) expect(a.en).not.toMatch(c.plainNotEn); if (c.plainNotEs) expect(a.es).not.toMatch(c.plainNotEs); });
    if (c.items) for (const [item, state] of Object.entries(c.items)) it(`sheet ${item} -> ${state}`, () => expect(run(c.make()).rd.items.find(x => x.item.id === item)?.state, c.why).toBe(state));
  });
});
