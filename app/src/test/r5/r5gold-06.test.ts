// @ts-nocheck -- vendored seat test (round 5)
// r5gold-06: plain answer grammar: "1 questions left", "quedan 1 preguntas", "1 revisión(es) encontraron".
import { it, expect } from 'vitest';
import { base, run, ft } from '../r3/golden_base';
import { plainAnswer } from '../../rules/readiness';
it('singular counts read right in both languages', () => {
  const p = base(); p.adu.hosePullFt = 180; let a = plainAnswer(p, run(p).rep);
  expect(a.en).not.toMatch(/\b1 questions\b/); expect(a.es).not.toMatch(/\b1 preguntas\b/);
  const q = base(); q.adu.garageConstruction = 'masonry'; q.people.engineerName = ''; q.people.preparerRole = 'owner'; a = plainAnswer(q, run(q).rep);
  expect(a.es).not.toMatch(/\(es\)/);
});
