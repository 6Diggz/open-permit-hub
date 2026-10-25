// Sev 3: VHFHSZ lot: no rule surfaces CRC R337 / LABC Ch. 7A wildfire construction; a VHFHSZ-only lot gets HAZ-01 PASS.
import { it, expect } from 'vitest'; import { base, run } from './golden_base';
it('VHFHSZ surfaces wildfire construction', () => {
  const p = base(); p.site.flags.vhfhsz = 'yes';
  const r = run(p); expect(r.rep.results.some(x => x.status !== 'PASS' && x.rule.cites.some(c => /R337|7A/.test(c.code)))).toBe(true);
});
