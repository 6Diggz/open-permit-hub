// r5whole-04: one check card, two different counts. Plain answer: "1 check found a problem ... 5 questions left".
// Score line right under it: "3 to fix, 106 questions to answer". Same project, same card (demo lot).
// Run: cd /home/claude/opa/app && npx vitest run --root /home/claude/stress/r5/tests r5whole-04
import { it, expect } from 'vitest';
import { demoProject } from '../../core/model';
import { evaluate } from '../../rules/engine';
import { RULES, PACK_ID } from '../../rules/la-city';
import { readiness, scoreLine, plainAnswer } from '../../rules/readiness';
it('plain answer and score line on the same card never give different "to fix" / "questions left" numbers', () => {
  const p = demoProject(); const rep = evaluate(p, RULES, PACK_ID, new Date('2026-10-24'));
  const plain = plainAnswer(p, rep).en, score = scoreLine(readiness(p, rep));
  const qPlain = Number(plain.match(/(\d+) questions? left/)?.[1]); const qScore = Number(score.match(/(\d+) questions to answer/)?.[1]);
  const fPlain = Number(plain.match(/(\d+) (?:checks? found a problem|sheet items? to fix)/)?.[1] ?? 0); const fScore = Number(score.match(/(\d+) to fix/)?.[1]);
  // Either the numbers match, or the plain answer names what it counts ("rule checks") so a reader is not shown 5 vs 106.
  const labelled = /rule check/i.test(plain) && /sheet item/i.test(score);
  expect(labelled || (qPlain === qScore && fPlain === fScore), `plain: "${plain}" | score: "${score}"`).toBe(true);
});
