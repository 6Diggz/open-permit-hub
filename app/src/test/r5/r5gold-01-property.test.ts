// Coordinator (r5gold-01 root cause): deny-by-default plain answer. Forcing any one rule to UNKNOWN or FAIL on a READY
// project must drop "Likely yes", unless that rule is on the reviewed MAY_STAY_OPEN list (UNKNOWN only).
import { it, expect } from 'vitest';
import { base, run } from '../r3/golden_base';
import { plainAnswer, MAY_STAY_OPEN } from '../../rules/readiness';
import { RULES } from '../../rules/la-city';
it('the golden base project reads Likely yes', () => { const p = base(); expect(plainAnswer(p, run(p).rep).verdict).toBe('likely-yes'); });
for (const rule of RULES) for (const st of ['UNKNOWN', 'FAIL'] as const) it(`${rule.id} forced ${st}`, () => {
  const p = base(); const { rep } = run(p);
  const results = rep.results.map(r => r.rule.id === rule.id ? { ...r, status: st } : r);
  if (!results.some(r => r.rule.id === rule.id)) results.push({ rule, status: st, msg: { en: '', es: '' } } as never);
  const counts = { ...rep.counts }; for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] = results.filter(r => r.status === k).length;
  const v = plainAnswer(p, { ...rep, results, counts }).verdict;
  if (st === 'UNKNOWN' && MAY_STAY_OPEN.includes(rule.id)) return; // reviewed: may stay open
  expect(v).not.toBe('likely-yes');
});
