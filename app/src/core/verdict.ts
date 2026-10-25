// One shared verdict (round 5): every surface (check card, plain answer, score line, PDF, HTML report, handoff README,
// plan-set check, field mode) reads the same computation, so they can never tell different stories about one project.
import type { Project } from './model';
import { evaluate, type Report } from '../rules/engine';
import { RULES, PACK_ID } from '../rules/la-city';
import { readiness, scoreLine, plainAnswer, type Readiness, type PlainVerdict } from '../rules/readiness';

export interface Verdict {
  report: Report; readiness: Readiness; counts: Report['counts'];
  plain: { verdict: PlainVerdict; en: string; es: string };
  score: { en: string; es: string };
  /** Sheet item id -> its readiness state, for the plan-set check and field mode. */
  itemState: (sheetId: string) => Readiness['items'][number]['state'] | null;
}

/** Derive the verdict from a report already computed for this project. */
export function verdictOf(p: Project, report: Report): Verdict {
  const rd = readiness(p, report);
  const byId = new Map(rd.items.map(x => [x.item.id, x.state]));
  return { report, readiness: rd, counts: report.counts, plain: plainAnswer(p, report), score: { en: scoreLine(rd, false), es: scoreLine(rd, true) }, itemState: id => byId.get(id) ?? null };
}

/** Evaluate and derive in one step. */
export function getVerdict(p: Project, today = new Date()): Verdict { return verdictOf(p, evaluate(p, RULES, PACK_ID, today)); }
