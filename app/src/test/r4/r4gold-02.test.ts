// r4gold-02: plainAnswer() says "Likely yes" while gating checks are open (example sizes, stale rule pack, address in another city,
// burn area unknown, ADU count unknown, permit unknown, fire module off) and reports "0 questions left" when NOT_CHECKED items remain.
// Run: cd /home/claude/opa/app && npx vitest run --root /home/claude/stress/r4/tests r4gold-02
import { it, expect } from 'vitest';
import { base, run } from '../r3/golden_base';
import { plainAnswer } from '../../rules/readiness';
import type { Project } from '../../core/model';
const pa = (p: Project) => plainAnswer(p, run(p).rep);
const cases: [string, (p: Project) => void][] = [
  ['example sizes (INP-01)', p => { p.confirmed.adu = false; }],
  ['stale rule pack (REV-01)', p => { p.applicationDate = '2028-03-01'; }],
  ['address names Compton (JUR-01 NOT_CHECKED)', p => { p.site.address = '1234 W 50th St, Compton, CA 90220'; }],
  ['burn area unknown (HAZ-05)', p => { p.site.flags.fireRebuild = 'unknown'; }],
  ['existing ADU count unknown (MIX-01)', p => { p.site.existingAdus = null; }],
  ['attached/detached unknown (GAR-01)', p => { p.adu.garageAttachment = 'unknown'; }],
  ['garage permit unknown (SET-01)', p => { p.adu.existingStructurePermitted = 'unknown'; }],
  ['fire checks switched off', p => { p.modules.fire = false; }],
];
for (const [n, f] of cases) it(`not "likely yes" when ${n}`, () => { const p = base(); f(p); expect(pa(p).verdict).not.toBe('likely-yes'); });
it('NOT_CHECKED items count as open questions', () => { const p = base(); p.modules.fire = false; expect(pa(p).en).not.toMatch(/\b0 questions left/); });
