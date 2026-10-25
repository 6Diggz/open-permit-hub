// r4gold-05: New detached ADU (mode youadu) of 900 sq ft reads READY / "Likely yes". Sheet II-D.2 + Gov. Code 66323(a)(2)(A): a new detached
// State ADU is capped at 800 sq ft; bigger is the Ordinance path (II-A, LAMC 12.22 A.33, up to 1,200 sf) which the app does not check.
import { it, expect } from 'vitest';
import { base, run, ft, rect } from '../r3/golden_base';
import { plainAnswer } from '../../rules/readiness';
const mk = (w: number, d: number, liv: number) => { const p = base(); p.adu.mode = 'youadu'; p.adu.footprint = rect(ft(50 - 6 - w), ft(150 - 6 - d), ft(w), ft(d)); p.adu.interiorLivableSqFt = liv; return p; };
it('900 sq ft new detached ADU is not READY and not likely yes', () => { const p = mk(30, 30, 850); const { rep } = run(p); expect(rep.overall).not.toBe('READY_FOR_PREPARER'); expect(plainAnswer(p, rep).verdict).not.toBe('likely-yes'); });
it('760 sq ft new detached ADU can still be READY', () => { const p = mk(28, 28, 720); expect(run(p).rep.overall).toBe('READY_FOR_PREPARER'); });
