import type { Project } from '../core/model';
import { SAFETY_MODULES } from '../core/model';
import { withRooms } from '../core/rooms';
import { CATALOG } from './ladbs-adu-2025';

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
  // Drawn rooms are the source of bedrooms and escape windows (one truth for the drawing and the checks).
  p = withRooms(p);
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
  if (results.length === 0 || results.some(r => ((r.rule.id === 'JUR-01' || r.rule.id === 'CJUR-01') && r.status === 'FAIL') || r.unsupported)) overall = 'NOT_SUPPORTED';
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
  // r4juris-04: blocked when the report was not made with this jurisdiction's own pack (pack id "<jurisdiction>@<version>").
  if (!rep.pack.startsWith(p.site.jurisdiction + '@')) b.push(p.site.jurisdiction === 'la-county' ? 'Turn on "Beta: LA County (unincorporated)" to check this lot. Export stays off for the beta.' : 'Set the city to LA City. Only LA City is supported right now.');
  // OUT-15: beta packs (LA County) check only; the handoff packet and PDF are written for the LADBS sheet.
  if (rep.pack.includes('-beta')) b.push('The LA County rules are a beta. Export is off until a reviewer checks them.');
  if (rep.overall === 'NOT_SUPPORTED') b.push('These rules do not cover this project or date.');
  if (rep.results.some(r => r.rule.id === 'GEO-01' && r.status !== 'PASS')) b.push('Fix the drawing first: the lot or ADU shape is not valid.');
  if (rep.results.some(r => r.rule.id === 'INP-01' && r.status !== 'PASS')) b.push('Enter your real lot, house and garage sizes. The sheets still show example numbers.');
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

/** Code-section references (LAMC 12.22 A.33, Gov. Code §66314(d)(7), LARC R310.2, B&P §5537 ...), normalized for comparison.
 *  Spelled-out names count too ("Government Code section 66314", "Los Angeles Municipal Code 12.22", "Residential Code R310.2"),
 *  so an invented section written in words is caught like an abbreviated one (r4agent-02). Longest names first. */
const FAM = String.raw`(L\.?\s*A\.?\s*M\.?\s*C\.?|LABC|LARC|LAFC|CRC|CBC|CFC|CPC|CEC|Gov\.?\s*Code|GC|B\s*&\s*P(?:\s*Code)?|HSC|H\s*&\s*S(?:\s*Code)?|Ed\.?\s*Code|Health\s*(?:and|&)\s*Safety\s*Code|`
  + String.raw`(?:(?:City\s+of\s+)?(?:Los\s+Angeles|L\.?\s*A\.?)\s+)?Municipal\s+Code|(?:(?:California|Cal\.?|CA|Los\s+Angeles|L\.?\s*A\.?)\s+)?(?:Residential|Building|Fire|Plumbing|Electrical)\s+Code|`
  + String.raw`(?:California\s+)?Government\s+Code|(?:California\s+)?Business\s+(?:and|&)\s+Professions\s+Code|(?:California\s+)?Education\s+Code)`;
const SEC = String.raw`(?:(?:sections?|secs?\.?|§)\s*)?(?:§\s*)?([A-Z]?\d+(?:\.\d+)*(?:\([a-z0-9]+\))*(?:\s+[A-Z]\.\d+(?:\([a-z0-9]+\))*)?)`;
/** A section in a list after the family name must look like one (R310.2, 98.0605), not a bare number like "3 ft". */
const LSEC = String.raw`(?:§\s*)?((?:[A-Z]\d+(?:\.\d+)*|\d+\.\d+(?:\.\d+)*)(?:\([a-z0-9]+\))*)(?![\w.])`;
/** One key per code family: the LA and California editions of the same model code compare as one ("LARC R310.2" = "CRC R310.2"). */
const famKey = (f: string) => {
  const w = f.replace(/\s+/g, ' ').trim().toUpperCase(); const k = w.replace(/[\s.]/g, '');
  if (/MUNICIPAL CODE$/.test(w) || k === 'LAMC') return 'LAMC';
  if (/RESIDENTIAL CODE$/.test(w) || k === 'LARC' || k === 'CRC') return 'RC';
  if (/BUILDING CODE$/.test(w) || k === 'LABC' || k === 'CBC') return 'BC';
  if (/FIRE CODE$/.test(w) || k === 'LAFC' || k === 'CFC') return 'FC';
  if (/PLUMBING CODE$/.test(w) || k === 'CPC') return 'PC';
  if (/ELECTRICAL CODE$/.test(w)) return 'EC';
  if (/GOVERNMENT CODE$/.test(w) || k === 'GOVCODE' || k === 'GC') return 'GOV';
  if (/PROFESSIONS CODE$/.test(w) || k.startsWith('B&P')) return 'BP';
  if (k.startsWith('HEALTH') || k.startsWith('H&S') || k === 'HSC') return 'HSC';
  if (/EDUCATION CODE$/.test(w) || k === 'EDCODE') return 'ED';
  return k;
};
/** Reversed form: "Section 12.22 A.33 of the LA code", "R310.9 of the residential code". */
const REV = String.raw`(?:(?:sections?|secs?\.?|§)\s*)?((?:[A-Z]\d+|\d+)(?:\.\d+)*(?:\([a-z0-9]+\))*(?:\s+[A-Z]\.\d+(?:\([a-z0-9]+\))*)?)\s+of\s+the\s+((?:(?:California|Los\s+Angeles|L\.?\s*A\.?|city(?:'s)?|state)\s+)?(?:residential|building|fire|plumbing|electrical|municipal|government|LA|L\.A\.|city)(?:\s+code)?)\b`;
const revFam = (f: string) => { const w = f.toUpperCase(); return /RESIDENTIAL/.test(w) ? 'RC' : /BUILDING/.test(w) ? 'BC' : /FIRE/.test(w) ? 'FC' : /PLUMBING/.test(w) ? 'PC' : /ELECTRICAL/.test(w) ? 'EC' : /GOVERNMENT|STATE/.test(w) ? 'GOV' : 'LAMC'; };
export function extractCodeRefs(text: string): string[] {
  const out: string[] = []; const spans: [number, number][] = [];
  const norm = (s: string) => s.replace(/\s+/g, ' ').toUpperCase();
  for (const m of text.matchAll(new RegExp(String.raw`\b` + FAM + String.raw`[\s,]*` + SEC, 'gi'))) {
    const fam = famKey(m[1]); out.push(`${fam} ${norm(m[2])}`); let end = (m.index ?? 0) + m[0].length;
    // Lists after one family name: "LARC R310.1, R310.2", "LAMC 98.0602 and 98.0605"
    const more = new RegExp(String.raw`\s*(?:,|/|and|or|&)\s*` + LSEC, 'giy'); more.lastIndex = end;
    for (let n = more.exec(text); n; n = more.exec(text)) { out.push(`${fam} ${norm(n[1])}`); end = more.lastIndex; }
    spans.push([m.index ?? 0, end]);
  }
  const free = (a: number, b: number) => !spans.some(([x, y]) => a < y && b > x);
  for (const m of text.matchAll(new RegExp(REV, 'gi'))) { const a = m.index ?? 0; if (!free(a, a + m[0].length)) continue; out.push(`${revFam(m[2])} ${norm(m[1])}`); spans.push([a, a + m[0].length]); }
  // A bare residential-code section (R310.9) with no family name is still a code citation: check it as residential code.
  for (const m of text.matchAll(/\bR\d{3}(?:\.\d+)+(?:\([a-z0-9]+\))*/gi)) { const a = m.index ?? 0; if (free(a, a + m[0].length)) out.push(`RC ${norm(m[0])}`); }
  return out;
}
/** Every code section any rule in the pack cites, plus any the LADBS sheet catalog names (with parents, so "Gov. Code 66314" matches "§66314(d)(7)"). */
export function knownCodeRefs(rules: Rule[], extra: string[] = CATALOG.map(i => i.summary.en)): Set<string> {
  const k = new Set<string>();
  for (const ref of [...rules.flatMap(r => r.cites.flatMap(c => extractCodeRefs(c.code))), ...extra.flatMap(extractCodeRefs)]) {
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
