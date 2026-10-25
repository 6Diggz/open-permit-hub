// r4juris-04: a second pack cannot pass export or the plain answer: 'la-city' is hard-coded outside the engine.
import { it, expect } from 'vitest';
import { evaluate, exportBlockers, type Rule } from '../../rules/engine';
import { plainAnswer } from '../../rules/readiness';
import { base } from '../r3/golden_base';
it('r4juris-04 a complete County pack is not blocked by LA-City-only checks', () => {
  const p = base(); p.site.address = '2600 Lincoln Ave, Altadena, CA 91001'; p.site.jurisdiction = 'la-county';
  const ok = { status: 'PASS' as const, msg: { en: 'ok', es: 'ok' } };
  const rules: Rule[] = ['GEO-01', 'INP-01', 'JUR-01'].map(id => ({ id, version: '1', module: 'core', severity: 'critical', kind: 'city', effectiveFrom: '2026-01-01', applies: () => true, title: { en: id, es: id }, cites: [{ code: 'x', verified: true }], check: () => ok }) as unknown as Rule);
  const rep = evaluate(p, rules, 'la-county@0.0.1', new Date('2026-10-24T12:00:00'));
  expect(rep.overall).toBe('READY_FOR_PREPARER');
  expect(exportBlockers(p, rep)).toEqual([]);
  expect(plainAnswer(p, rep).en).not.toMatch(/City of Los Angeles only/);
});
