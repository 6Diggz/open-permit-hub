import type { Project } from '../core/model';
import { SAFETY_MODULES } from '../core/model';

export type Status = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_CHECKED' | 'INFO';
export type L = { en: string; es: string };
export interface Cite { code: string; url?: string; verified: boolean; /** Code edition, e.g. "2023 LARC". */ edition?: string }
export interface Outcome { status: Status; msg: L; next?: L; values?: Record<string, string | number>; /** This project is outside what the pack covers (overall NOT_SUPPORTED). */ unsupported?: boolean }
export interface Rule {
  id: string; version: string; module: string; severity: 'critical' | 'major' | 'minor';
  title: L; cites: Cite[]; effectiveFrom: string; effectiveTo?: string;
  /** city: checked by LADBS (unknown blocks export). info: listed on cover only (PR03). */
  kind: 'city' | 'info';
  /** Health-and-safety rule: still enforced in AB 2533 legalization mode (Gov. Code §66332). */
  hs?: boolean;
  /** When true for this project, no other rule may show an automatic PASS. */
  suspendsAutoPass?: (p: Project) => boolean;
  applies: (p: Project) => boolean;
  /** ctx: the evaluation date and the vesting (application) date, both YYYY-MM-DD. */
  check: (p: Project, ctx?: { today: string; vestDate: string }) => Outcome;
}
export interface Result { rule: Rule; status: Status; msg: L; next?: L; values?: Record<string, string | number>; dismissed?: string; unsupported?: boolean }
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
    try { o = r.check(p, { today: local, vestDate }); } catch { o = { status: 'UNKNOWN', msg: { en: 'This check could not run on the data entered.', es: 'Esta revisión no pudo ejecutarse con los datos ingresados.' } }; }
    const d = p.dismissed.find(x => x.ruleId === r.id);
    results.push({ rule: r, ...o, dismissed: d && canDismiss(r) ? d.reason : undefined });
  }
  // AB 2533 legalization (Gov. Code §66332): the city may deny only over health and safety. Non-safety rules become notes.
  if (p.adu.legalization) results.forEach(r => { if (!r.rule.hs && r.rule.module !== 'core' && r.rule.kind === 'city' && r.status !== 'PASS' && r.status !== 'NOT_CHECKED') {
    r.status = 'INFO'; r.next = { en: 'Legalization (AB 2533): the city can\'t deny a pre-2020 unit over this unless it is needed for health and safety (Gov. Code §66332). Your preparer confirms.', es: 'Legalización (AB 2533): la ciudad no puede negar una unidad anterior a 2020 por esto salvo por salud y seguridad (Código de Gobierno §66332). Su preparador confirma.' }; } });
  // Burn-area / suspend rules: no automatic passes (F05). A rule with suspendsAutoPass that returns INFO turns PASS into INFO.
  const suspend = results.some(r => r.rule.suspendsAutoPass?.(p));
  if (suspend) results.forEach(r => { if (r.status === 'PASS' && r.rule.module !== 'core') { r.status = 'INFO'; r.next = { en: 'Special rebuild rules apply here. Confirm this item with the rebuild center.', es: 'Aplican reglas especiales de reconstrucción. Confirme con el centro de reconstrucción.' }; } });
  const counts = { PASS: 0, FAIL: 0, UNKNOWN: 0, NOT_CHECKED: 0, INFO: 0 } as Record<Status, number>;
  results.forEach(r => counts[r.status]++);
  let overall: Report['overall'] = 'READY_FOR_PREPARER';
  if (results.length === 0 || results.some(r => (r.rule.id === 'JUR-01' && r.status === 'FAIL') || r.unsupported)) overall = 'NOT_SUPPORTED';
  else if (results.some(r => r.rule.id === 'GEO-01' && r.status !== 'PASS')) overall = 'FIX_ISSUES';
  else if (results.some(r => r.status === 'FAIL' && !r.dismissed)) overall = 'FIX_ISSUES';
  else if (suspend || results.some(r => (r.status === 'UNKNOWN' && r.rule.kind === 'city') || r.status === 'NOT_CHECKED')) overall = 'INCOMPLETE';
  return { results, overall, counts, vestDate, pack: packId };
}

/** Only minor/major rules that are not health-and-safety may be dismissed (a dismissed safety FAIL could read READY). */
export const canDismiss = (r: Rule) => r.severity !== 'critical' && !r.hs;

/** Export gate (PR01/PR51): safety modules cannot be off; drafts always allowed. */
export function exportBlockers(p: Project, rep: Report): string[] {
  const b: string[] = [];
  SAFETY_MODULES.forEach(m => { if (!p.modules[m]) b.push(`Turn the "${m}" checks back on. Safety checks can't be off when you export.`); });
  if (p.site.apn.startsWith('0000-')) b.push('This is the demo lot. Start your own project to export a handoff packet.');
  if (p.site.jurisdiction !== 'la-city') b.push('Set the city to LA City. Only LA City is supported right now.');
  if (rep.overall === 'NOT_SUPPORTED') b.push('These rules do not cover this project or date.');
  if (rep.results.some(r => r.rule.id === 'GEO-01' && r.status !== 'PASS')) b.push('Fix the drawing first: the lot or ADU shape is not valid.');
  if (p.adu.mode === 'conversion' && p.adu.removesGarageDoorWall === 'yes' && !['engineer', 'architect'].includes(p.people.preparerRole) && !p.people.engineerName.trim())
    b.push('Name the licensed engineer for the garage door wall. That part is not conventional framing.');
  return b;
}

/** Hyphenated tokens that look like rule ids but are ordinary words or bill names. */
const NOT_IDS = /^(COVID|SB|AB|HR|ISO|UTF|US|CA|PM|AM|MPL|GPL|AGPL|LGPL|SHA|AES|PBKDF|R|TYPE|WCAG|ARCH|PC|STR|LA)-/;
/** AI guard: the assistant may only cite rule IDs that exist (UU fake-citation fix). */
export function validateCitations(text: string, rules: Rule[]): string[] {
  const ids = new Set(rules.map(r => r.id));
  return [...new Set([...text.matchAll(/\b([A-Za-z]{2,6}-\d{1,4}[a-z]?)\b/g)].map(m => m[1].toUpperCase()))].filter(id => !ids.has(id) && !NOT_IDS.test(id));
}

/** Code-section references (LAMC 12.22 A.33, Gov. Code §66314(d)(7), LARC R310.2, B&P §5537 ...), normalized for comparison. */
const FAM = String.raw`(LAMC|LABC|LARC|CRC|CBC|CFC|CPC|CEC|Gov\.?\s*Code|GC|B\s*&\s*P|HSC|Ed\.?\s*Code|Health\s*(?:and|&)\s*Safety\s*Code)`;
const SEC = String.raw`(?:§\s*)?([A-Z]?\d+(?:\.\d+)*(?:\([a-z0-9]+\))*(?:\s+[A-Z]\.\d+(?:\([a-z0-9]+\))*)?)`;
/** A section in a list after the family name must look like one (R310.2, 98.0605), not a bare number like "3 ft". */
const LSEC = String.raw`(?:§\s*)?((?:[A-Z]\d+(?:\.\d+)*|\d+\.\d+(?:\.\d+)*)(?:\([a-z0-9]+\))*)(?![\w.])`;
const famKey = (f: string) => { const k = f.replace(/[\s.]/g, '').toUpperCase(); return k === 'GOVCODE' || k === 'GC' ? 'GOV' : k === 'B&P' ? 'BP' : k.startsWith('HEALTH') ? 'HSC' : k === 'EDCODE' ? 'ED' : k; };
export function extractCodeRefs(text: string): string[] {
  const out: string[] = [];
  const norm = (s: string) => s.replace(/\s+/g, ' ').toUpperCase();
  for (const m of text.matchAll(new RegExp(FAM + String.raw`\s*` + SEC, 'gi'))) {
    const fam = famKey(m[1]); out.push(`${fam} ${norm(m[2])}`);
    // Lists after one family name: "LARC R310.1, R310.2", "LAMC 98.0602 and 98.0605"
    const more = new RegExp(String.raw`\s*(?:,|/|and|or|&)\s*` + LSEC, 'giy'); more.lastIndex = (m.index ?? 0) + m[0].length;
    for (let n = more.exec(text); n; n = more.exec(text)) out.push(`${fam} ${norm(n[1])}`);
  }
  return out;
}
/** Every code section any rule in the pack cites (with its parents, so "Gov. Code 66314" matches "§66314(d)(7)"). */
export function knownCodeRefs(rules: Rule[]): Set<string> {
  const k = new Set<string>();
  for (const r of rules) for (const c of r.cites) for (const ref of extractCodeRefs(c.code)) {
    k.add(ref); let x = ref; for (;;) { const y = x.replace(/(\s+[A-Z]\.\d+(\([A-Z0-9]+\))*|\([A-Z0-9]+\))$/, ''); if (y === x) break; k.add(y); x = y; }
  }
  return k;
}
/** Full guard for AI text: unknown rule ids AND code sections that no rule in the pack cites. */
export function checkCitations(text: string, rules: Rule[]): { ok: boolean; invalid_ids: string[]; unknown_codes: string[] } {
  const known = knownCodeRefs(rules);
  const unknown_codes = [...new Set(extractCodeRefs(text))].filter(c => !known.has(c));
  const invalid_ids = validateCitations(text, rules);
  return { ok: !invalid_ids.length && !unknown_codes.length, invalid_ids, unknown_codes };
}
