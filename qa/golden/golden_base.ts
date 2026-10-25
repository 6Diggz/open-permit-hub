import { blankProject, type Project } from '/home/claude/opa/app/src/core/model';
import { CATALOG } from '/home/claude/opa/app/src/rules/ladbs-adu-2025';
import { evaluate } from '/home/claude/opa/app/src/rules/engine';
import { RULES, PACK_ID } from '/home/claude/opa/app/src/rules/la-city';
import { readiness } from '/home/claude/opa/app/src/rules/readiness';
import { rect } from '/home/claude/opa/app/src/core/geom';
import { ft, inch } from '/home/claude/opa/app/src/core/units';
export { ft, inch, rect };
export const run = (p: Project) => { const rep = evaluate(p, RULES, PACK_ID, new Date('2026-10-24T12:00:00')); return { rep, rd: readiness(p, rep), st: (id: string) => rep.results.find(r => r.rule.id === id)?.status ?? 'NA' }; };
/** A fully answered, permitted, wood-frame, detached 20x20 garage at the rear of a 50x150 R1 lot, 6 ft from side and rear lines. */
export function base(): Project {
  const p = blankProject();
  p.confirmed = { lot: true, house: true, adu: true };
  p.name = 'golden'; p.site.address = '1234 W 50th St, Los Angeles, CA 90037'; p.site.apn = '5001-002-003';
  p.site.jurisdiction = 'la-city'; p.site.zone = 'R1-1'; p.site.mainBuilding = 'sfd'; p.site.existingAdus = 0; p.site.existingJadus = 0;
  p.site.otherBuildings = 'no'; p.site.lotSource = 'survey'; p.site.lotUncertaintyMm = 0;
  p.site.lot = rect(0, 0, ft(50), ft(150)); p.site.streetEdge = 0;
  p.site.primary = rect(ft(10), ft(20), ft(30), ft(45));
  p.site.flags = { hillside: 'no', vhfhsz: 'no', hpoz: 'no', coastal: 'no', methane: 'no', fireRebuild: 'no', transitHalfMile: 'no', easementsKnown: 'yes', anyUnitRented: 'no', primarySprinklered: 'no', slopeOver10: 'no', dwpEasement10ft: 'no' };
  p.adu = { ...p.adu, mode: 'conversion', footprint: rect(ft(24), ft(124), ft(20), ft(20)), heightMm: ft(12), interiorLivableSqFt: 370,
    ceilingHeightMm: inch(96), existingStructurePermitted: 'yes', builtBefore2020: 'yes', usedAsHomeBefore2020: 'no', mainRoomSleeping: 'yes',
    eaveDepthMm: inch(6), addedAreaSqFt: 0, addedSetbackMm: null, removesGarageDoorWall: 'yes', ratedWallPlanned: 'no', sprinklered: 'no', hosePullFt: 140,
    roofPitchMatches: 'unknown', bedrooms: 1, smokeCoPlanned: 'yes', allElectric: 'yes', garageAttachment: 'detached', staysInsideWalls: 'yes',
    addedForIngressOnly: 'unknown', legalization: false, slabVaporBarrier: 'yes', openingsNearLine: 'no', smokeHardwired: 'yes', panelAmps: 200,
    separateGasMeter: 'no', floorPlanSideSetbackMm: ft(6), floorPlanRearSetbackMm: ft(6), garageConstruction: 'wood', ratedEaveUndersidePlanned: 'no', rooms: [],
    windows: [{ id: 'w1', room: 'Bedroom', sleeping: true, clearWidthMm: inch(24), clearHeightMm: inch(36), sillMm: inch(40), gradeFloor: false }] };
  p.people = { ownerName: 'Test Owner', preparerRole: 'drafter', preparerName: 'Test Drafter', preparerLicense: '', language: 'en', engineerName: 'Test Engineer PE' };
  // Every "ask" item answered as shown on plans, every document attached (so readiness reflects only the rules under test).
  CATALOG.forEach(i => { if (i.mode === 'ask') p.sheet[i.id] = 'yes'; if (i.mode === 'doc') p.docs[i.id] = true; });
  p.docs['NRG.CF1R'] = true; p.docs['NRG.HERS'] = true;
  return p;
}

