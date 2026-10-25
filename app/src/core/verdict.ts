// One shared verdict (round 5): the check card, plain answer, score line, PDF, HTML report, handoff README and field mode
// all read this computation (r6logic-07: the plan-set check reads plan text only, not the verdict), so they can never tell different stories about one project.
import type { Project } from './model';
import { evaluate, type Report } from '../rules/engine';
import { RULES, PACK_ID } from '../rules/la-city';
import { readiness, scoreLine, plainAnswer, type Readiness, type PlainVerdict } from '../rules/readiness';

export interface Verdict {
  report: Report; readiness: Readiness; counts: Report['counts'];
  plain: { verdict: PlainVerdict; en: string; es: string };
  score: { en: string; es: string };
}

/** Derive the verdict from a report already computed for this project. */
export function verdictOf(p: Project, report: Report): Verdict {
  const rd = readiness(p, report);
  return { report, readiness: rd, counts: report.counts, plain: plainAnswer(p, report), score: { en: scoreLine(rd, false), es: scoreLine(rd, true) } };
}

/** Evaluate and derive in one step. */
export function getVerdict(p: Project, today = new Date()): Verdict { return verdictOf(p, evaluate(p, RULES, PACK_ID, today)); }
