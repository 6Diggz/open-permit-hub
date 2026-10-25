// r4gold-01: MIX-01 fails ANY existing ADU. LADBS PC/STR/Corr.Lst.20A (Rev 10/01/2025) II-C.5a allows an existing SFD + one detached/conversion
// State ADU + one ATTACHED ADU + one JADU; II-G.3a allows an attached conversion + one DETACHED ADU + one JADU.
// Run: cd /home/claude/opa/app && npx vitest run --root /home/claude/stress/r4/tests r4gold-01
import { it, expect } from 'vitest';
import { base, run, ft, rect } from '../r3/golden_base';
it('detached garage conversion + existing attached ADU: MIX-01 is not FAIL', () => { const p = base(); p.site.existingAdus = 1; expect(run(p).st('MIX-01')).not.toBe('FAIL'); });
it('attached garage conversion + existing detached ADU: MIX-01 is not FAIL', () => {
  const p = base(); p.site.primary = rect(ft(5), ft(20), ft(20), ft(45)); p.adu.footprint = rect(ft(25), ft(30), ft(19), ft(20)); p.adu.garageAttachment = 'attached';
  p.site.existingAdus = 1; p.site.otherBuildings = 'yes'; p.site.otherBuildingGapMm = ft(40); expect(run(p).st('MIX-01')).not.toBe('FAIL'); });
