// r5gold-02: new detached ADU path (youadu) never checks the unit mix or the main building (sheet II-D.1, II-D.5a).
import { describe, it, expect } from 'vitest';
import { base, run } from '../r3/golden_base';
import { plainAnswer } from '../../rules/readiness';
describe('r5gold-02 new detached ADU unit mix', () => {
  it('existing detached ADU + new detached ADU is not READY / Likely yes (II-D.5a: one detached State ADU)', () => {
    const p = base(); p.adu.mode = 'youadu'; p.site.existingAdus = 1; p.site.existingAduAttached = 'no'; const { rep } = run(p);
    expect(rep.overall).not.toBe('READY_FOR_PREPARER'); expect(plainAnswer(p, rep).verdict).not.toBe('likely-yes'); });
  it('duplex lot on the new detached SFD path is not READY (II-D.1 needs an SFD; multifamily is II-E)', () => {
    const p = base(); p.adu.mode = 'youadu'; p.site.mainBuilding = 'duplex' as never; const { rep } = run(p);
    expect(rep.overall).not.toBe('READY_FOR_PREPARER'); });
  it('existing attached ADU + new detached ADU is still allowed', () => {
    const p = base(); p.adu.mode = 'youadu'; p.site.existingAdus = 1; p.site.existingAduAttached = 'yes'; const { rep } = run(p);
    expect(rep.results.filter(r => r.status === 'FAIL').map(r => r.rule.id)).toEqual([]); });
});
