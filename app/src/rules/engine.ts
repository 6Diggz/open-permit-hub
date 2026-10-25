import type { Project } from '../core/model';
import { SAFETY_MODULES } from '../core/model';

export type Status = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_CHECKED' | 'INFO';
export type L = { en: string; es: string };
export interface Cite { code: string; url?: string; verified: boolean }
export interface Outcome { status: Exclude<Status, 'NOT_CHECKED'>; msg: L; next?: L; values?: Record<string, string | number> }
export interface Rule {
  id: string; version: string; module: string; severity: 'critical' | 'major' | 'minor';
  title: L; cites: Cite[]; effectiveFrom: string; effectiveTo?: string;
  /** city: checked by LADBS (unknown blocks export). info: listed on cover only (PR03). */
  kind: 'city' | 'info';
  /** When true for this project, no other rule may show an automatic PASS. */
  suspendsAutoPass?: (p: Project) => boolean;
  applies: (p: Project) => boolean;
  check: (p: Project) => Outcome;
}
export interface Result { rule: Rule; status: Status; msg: L; next?: L; values?: Record<string, string | number>; dismissed?: string }
export interface Report { results: Result[]; overall: 'READY_FOR_PREPARER' | 'FIX_ISSUES' | 'INCOMPLETE' | 'NOT_SUPPORTED'; counts: Record<Status, number>; vestDate: string; pack: string }

export function evaluate(p: Project, rules: Rule[], packId: string, today = new Date()): Report {
  if (p.applicationDate && !/^\d{4}-\d{2}-\d{2}$/.test(p.applicationDate)) p = { ...p, applicationDate: null };
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const vestDate = (p.applicationDate ?? local);
  const results: Result[] = [];
  for (const r of rules) {
    if (vestDate < r.effectiveFrom || (r.effectiveTo && vestDate > r.effectiveTo)) continue;
    if (!r.applies(p)) continue;
    if (r.module !== 'core' && !p.modules[r.module]) {
      results.push({ rule: r, status: 'NOT_CHECKED', msg: { en: 'Not checked: this module is switched off.', es: 'No revisado: este módulo está apagado.' } });
      continue;
    }
    let o: Outcome;
    try { o = r.check(p); } catch { o = { status: 'UNKNOWN', msg: { en: 'This check could not run on the data entered.', es: 'Esta revisión no pudo ejecutarse con los datos ingresados.' } }; }
    const d = p.dismissed.find(x => x.ruleId === r.id);
    results.push({ rule: r, ...o, dismissed: d && r.severity !== 'critical' ? d.reason : undefined });
  }
  // Burn-area / suspend rules: no automatic passes (F05). A rule with suspendsAutoPass that returns INFO turns PASS into INFO.
  const suspend = results.some(r => r.rule.suspendsAutoPass?.(p));
  if (suspend) results.forEach(r => { if (r.status === 'PASS' && r.rule.module !== 'core') { r.status = 'INFO'; r.next = { en: 'Special rebuild rules apply here. Confirm this item with the rebuild center.', es: 'Aplican reglas especiales de reconstrucción. Confirme con el centro de reconstrucción.' }; } });
  const counts = { PASS: 0, FAIL: 0, UNKNOWN: 0, NOT_CHECKED: 0, INFO: 0 } as Record<Status, number>;
  results.forEach(r => counts[r.status]++);
  let overall: Report['overall'] = 'READY_FOR_PREPARER';
  if (results.length === 0 || results.some(r => r.rule.id === 'JUR-01' && r.status === 'FAIL')) overall = 'NOT_SUPPORTED';
  else if (results.some(r => r.rule.id === 'GEO-01' && r.status !== 'PASS')) overall = 'FIX_ISSUES';
  else if (results.some(r => r.status === 'FAIL' && !r.dismissed)) overall = 'FIX_ISSUES';
  else if (suspend || results.some(r => (r.status === 'UNKNOWN' && r.rule.kind === 'city') || r.status === 'NOT_CHECKED')) overall = 'INCOMPLETE';
  return { results, overall, counts, vestDate, pack: packId };
}

/** Export gate (PR01/PR51): safety modules cannot be off; drafts always allowed. */
export function exportBlockers(p: Project, rep: Report): string[] {
  const b: string[] = [];
  SAFETY_MODULES.forEach(m => { if (!p.modules[m]) b.push(`Turn the "${m}" checks back on. Safety checks can't be off when you export.`); });
  if (p.site.apn.startsWith('0000-')) b.push('This is the demo lot. Start your own project to export a handoff packet.');
  if (p.site.jurisdiction !== 'la-city') b.push('Set the city to LA City. Only LA City is supported right now.');
  if (rep.overall === 'NOT_SUPPORTED') b.push('These rules do not cover this project or date.');
  if (rep.results.some(r => r.rule.id === 'GEO-01' && r.status !== 'PASS')) b.push('Fix the drawing first: the lot or ADU shape is not valid.');
  return b;
}

/** AI guard: the assistant may only cite rule IDs that exist (UU fake-citation fix). */
export function validateCitations(text: string, rules: Rule[]): string[] {
  const ids = new Set(rules.map(r => r.id));
  return [...new Set([...text.matchAll(/\b([A-Za-z]{2,6}-\d{1,4}[a-z]?)\b/g)].map(m => m[1].toUpperCase()))].filter(id => !ids.has(id));
}
