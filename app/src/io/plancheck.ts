// Plan-set pre-check: reads the TEXT of an existing PDF plan set and maps what it finds to the LADBS correction-sheet
// items. It is an assist, not a review: drawings, stamps and signatures are pictures and are never read, so "not found"
// means "not found in the text", and every item carries a confidence. Everything runs on the device.
import { CATALOG } from '../rules/ladbs-adu-2025';
import { PARAMS } from '../rules/la-city';

/** One line of text on a page (items joined left to right). */
export interface PageText { page: number; lines: string[]; /** Positioned segments, used to read a title block label's value in its own column. */ segs?: Seg[] }
export type Confidence = 'high' | 'medium' | 'low';
/** r8-01 claim model: the check only claims what text can prove.
 * addressed = FOUND on a page (shown as "Found on page N. Confirm it is shown as provided."): never proof it is provided;
 * negated = SAYS NOT PROVIDED (an absence phrase such as N/A, TBD, by others, future, no aplica);
 * conflict = a number read from the text fails the rule; partial = part of it found; missing = not found in the text. */
export type ItemState = 'addressed' | 'negated' | 'conflict' | 'partial' | 'missing';
export interface Hit { page: number; text: string }
export interface CheckItem { id: string; state: ItemState; confidence: Confidence; pages: number[]; evidence: Hit[];
  /** Plain words about what matched, or what to look for (en / es). */ why: { en: string; es: string };
  /** A value read from the text that looks off for this item (e.g. a ceiling under 7 ft). */ attention?: { en: string; es: string } }
export type SheetKind = 'cover' | 'site' | 'floor' | 'existing' | 'elevation' | 'section' | 'roof' | 'foundation' | 'framing' | 'electrical' | 'plumbing' | 'mechanical' | 'energy' | 'notes' | 'structural' | 'details';
export interface Sheet { page: number; id: string | null; kinds: SheetKind[]; scales: string[]; chars: number }
export interface Dim { page: number; inches: number; text: string }
export interface WindowSize { page: number; w: number; h: number; text: string; ctx: string; /** r8-02: the words touching the size (2 before, 3 after, inside its clause). */ own: string }
export interface PlanCheck {
  pages: number; textPages: number; chars: number; scanned: boolean;
  sheets: Sheet[]; title: Partial<Record<TitleField, Hit>>; codes: { editions: Hit[]; sections: string[] };
  dims: { setbacks: (Dim & { side: 'side' | 'rear' | 'front' | 'any' })[]; ceilings: Dim[]; windows: WindowSize[] };
  items: CheckItem[];
}
export type TitleField = 'address' | 'apn' | 'owner' | 'preparer' | 'license' | 'date' | 'scope' | 'legal' | 'occupancy' | 'type' | 'stories' | 'lotArea' | 'floorArea' | 'height' | 'fireZone' | 'sheetIndex';

/** Limits so a huge or hostile file can't hang the phone. */
export const PLAN_LIMITS = { maxBytes: 80 * 1024 * 1024, maxPages: 150, maxCharsPerPage: 60_000 } as const;

/** Text clean-up: ligatures, curly quotes and primes become plain ' and ", spaces collapse. */
export function normalize(s: string): string {
  return s.replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
    // Some PDF fonts map the fi ligature to "{" (seen in exported sheets): only between letters.
    .replace(/(^|[^A-Za-z])\{(?=[a-z])/g, '$1fi').replace(/(?<=[a-z])\{(?=[a-z])/g, 'fi')
    .replace(/[‘’′´]/g, "'").replace(/[“”″]/g, '"').replace(/[‐-–−]/g, '-')
    .replace(/[×]/g, 'x').replace(/\s+/g, ' ').trim();
}

export interface Seg { x: number; y: number; s: string }
/** pdf.js text items -> segments: items on the same baseline (within 2 pt) and close together (gap under 3 em) join into one. */
export function toSegs(items: { str: string; transform: number[]; width?: number }[]): Seg[] {
  // r5plan-06: text turned 90 degrees (a vertical title block) is read in its own frame: along the text is x, across it is y.
  const rot = items.filter(i => Math.abs(i.transform[1]) > Math.abs(i.transform[0]));
  if (!rot.length) return toSegsFlat(items);
  const flat = toSegsFlat(items.filter(i => !rot.includes(i)));
  const frame = (dir: 1 | -1) => toSegsFlat(rot.map(i => ({ ...i, transform: [Math.abs(i.transform[1]), 0, 0, Math.abs(i.transform[1]), i.transform[5], -1e5 + dir * i.transform[4]] })));
  // Which way the lines run depends on the program; pick the frame where more labels have a value (not another label) under them.
  const score = (sg: Seg[]) => sg.filter(g => LABELS.some(([, r]) => r.test(g.s))).filter(g => { const b = sg.filter(v => v !== g && Math.abs(v.x - g.x) <= 12 && v.y < g.y && g.y - v.y <= 40).sort((a, b) => b.y - a.y)[0]; return b && !LABELS.some(([, r]) => r.test(b.s)); }).length;
  const a = frame(-1), b = frame(1);
  return [...flat, ...(score(b) > score(a) ? b : a)];
}
function toSegsFlat(items: { str: string; transform: number[]; width?: number }[]): Seg[] {
  const rows: { y: number; parts: { x: number; w: number; e: number; s: string }[] }[] = [];
  for (const it of items) { if (!it.str || !it.str.trim()) continue; const x = it.transform[4], y = it.transform[5];
    let r = rows.find(q => Math.abs(q.y - y) <= 2); if (!r) { r = { y, parts: [] }; rows.push(r); } r.parts.push({ x, w: it.width ?? 0, e: Math.abs(it.transform[0]) || 10, s: it.str }); }
  const out: Seg[] = [];
  for (const r of rows.sort((a, b) => b.y - a.y)) { const ps = r.parts.sort((a, b) => a.x - b.x); let cur: Seg | null = null; let end = 0;
    for (const q of ps) { if (cur && (q.w === 0 || q.x - end <= 3 * q.e)) { cur.s += ' ' + q.s; } else { if (cur) out.push(cur); cur = { x: q.x, y: r.y, s: q.s }; } end = q.x + (q.w || q.e * q.s.length * 0.5); }
    if (cur) out.push(cur); }
  return out.map(g => ({ ...g, s: normalize(g.s) })).filter(g => g.s);
}
/** Lines read top to bottom, left to right (segments on one baseline joined). */
export function toLines(items: { str: string; transform: number[]; width?: number }[]): string[] {
  const segs = toSegs(items.map(i => ({ ...i, width: 0 }))); return segs.map(g => g.s);
}

// ---- lengths ----
const FTIN = /(\d{1,3})\s*'\s*-?\s*(\d{1,2}(?:\.\d+)?)?(?:\s+(\d)\/(\d{1,2}))?\s*"?/;
/** Feet-inch text ("7'-6\"", "7' 6", "90\"", "7.5 ft") -> inches, or null. */
export function parseInches(s: string): number | null {
  let m = s.match(FTIN); if (m) return Number(m[1]) * 12 + (m[2] ? Number(m[2]) : 0) + (m[3] ? Number(m[3]) / Number(m[4]) : 0);
  m = s.match(/(\d{1,3}(?:\.\d+)?)\s*(?:"|in\b|inch)/i); if (m) return Number(m[1]);
  m = s.match(/(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet)\b/i); if (m) return Number(m[1]) * 12;
  // Metric drawings (r5plan-09): mm, cm, m.
  m = s.match(/(\d{2,5}(?:\.\d+)?)\s*mm\b/i); if (m) return Number(m[1]) / 25.4;
  m = s.match(/(\d{1,4}(?:\.\d+)?)\s*cm\b/i); if (m) return Number(m[1]) / 2.54;
  m = s.match(/(\d{1,2}(?:\.\d+)?)\s*m\b/i); if (m) return Number(m[1]) / 0.0254;
  return null;
}
const LEN_G = /\d{1,3}\s*'\s*-?\s*(?:\d{1,2}(?:\.\d+)?)?(?:\s+\d\/\d{1,2})?\s*"?|\d{1,3}(?:\.\d+)?\s*(?:"|in\b|ft\b|feet\b)|\d{2,5}(?:\.\d+)?\s*mm\b|\d{1,4}(?:\.\d+)?\s*cm\b|\d{1,2}\.\d+\s*m\b/gi;
const lengthsIn = (s: string) => [...s.matchAll(LEN_G)].map(m => ({ t: m[0].trim(), v: parseInches(m[0]) })).filter((x): x is { t: string; v: number } => x.v != null && x.v > 0);
/** The first length after the keyword (else the last one before it): "Outside 20' x 20' Ceiling 8'" -> 8'. */
/** The length next to a keyword. r6logic-06: tries every keyword hit and skips lengths outside [min, max] (a "1.5 m" fan is not a ceiling). */
function lenNear(s: string, re: RegExp, min = -Infinity, max = Infinity): { t: string; v: number }[] {
  const ok = (x: { v: number }) => x.v >= min && x.v <= max;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); const hits = [...s.matchAll(g)]; if (!hits.length) return [];
  for (const m of hits) { const a = lengthsIn(s.slice(m.index! + m[0].length)).find(ok); if (a) return [a]; }
  const before = lengthsIn(s.slice(0, hits[0].index!)).filter(ok); return before.length ? [before[before.length - 1]] : [];
}
export const fmtIn = (inches: number) => { const f = Math.floor(inches / 12); const i = Math.round((inches - f * 12) * 10) / 10; return `${f}' ${i}"`; };

// ---- sheets ----
const KIND: [SheetKind, RegExp][] = [
  ['cover', /\b(cover|title) sheet\b/i], ['site', /\b(site|plot) plan\b/i], ['floor', /\b(proposed )?floor plan\b/i],
  ['existing', /\b(existing|demo(lition)?) (floor )?plan\b/i], ['elevation', /\belevations?\b/i],
  ['section', /\b(building|cross|wall) sections?\b|\bsection [a-z]-[a-z]\b|^sections?$/i], ['roof', /\broof (framing )?plan\b/i],
  ['foundation', /\bfoundation plan\b/i], ['framing', /\b(floor|ceiling|roof)? ?framing plan\b/i], ['electrical', /\b(electrical|lighting|power) plan\b/i],
  ['plumbing', /\bplumbing plan\b/i], ['mechanical', /\bmechanical plan\b|\bhvac plan\b/i], ['energy', /\btitle[- ]24\b|\bcf1r\b|\benergy (compliance|calc)/i],
  ['notes', /\bgeneral notes\b/i], ['structural', /\bstructural (notes|details|plan)\b|\bshear ?wall (schedule|plan|elevation)/i], ['details', /\b(construction|typical) details\b|^details$/i],
];
/** r5plan-11: Simpson connector callouts (A34, A35, A21...) look like sheet ids. A bare id with no dot that is a known
 *  connector name, or that repeats on the page (callouts repeat; a sheet's own id shows once in the title block), is skipped. */
const SIMPSON_A = /^A(21|23|33|34|35|44|311)$/;
export function hardwareCallout(id: string, lines: string[]): boolean {
  if (/[.\-]/.test(id)) return false;
  if (SIMPSON_A.test(id)) return true;
  return lines.filter(l => l.trim().toUpperCase().replace(/\s/g, '') === id).length >= 2;
}
const SHEET_ID = /\b((?:A|AS|S|G|T|E|M|P|C|GN|SP|D)\s?-?\s?\d{1,2}(?:\.\d{1,2})?[A-Z]?)\b/;
const SCALE = /\bscale\s*:?\s*((?:\d+\/\d+|\d+(?:\.\d+)?)\s*"?\s*=\s*\d+\s*'?\s*-?\s*\d*\s*"?|n\.?t\.?s\.?|not to scale|as noted)/i;
const BARE_SCALE = /^\s*((?:\d+\/\d+|\d+(?:\.\d+)?)\s*"\s*=\s*1\s*'\s*-?\s*0\s*"?)\s*$/;
const NTS = /\b(n\.t\.s\.|not to scale)\b/i;

// ---- title block ----
const LABELS: [TitleField, RegExp][] = [
  ['address', /^(project |site |job |building )?address:?$/i], ['apn', /^(apn|a\.p\.n\.|parcel (no\.?|number)):?$/i], ['owner', /^(property )?owner('s)?( name)?:?$/i],
  ['preparer', /^(prepared by|designer|drafter|architect|engineer|plans by|drawn by):?$/i], ['license', /^(license|lic\.?|license no\.?|license #):?$/i],
  ['date', /^date:?$/i], ['scope', /^(scope( of work)?|project description|description( of work)?|work description):?$/i],
  ['legal', /^legal( description)?:?$/i], ['occupancy', /^occupancy( group| classification)?:?$/i], ['type', /^(construction )?type( of construction)?:?$/i],
  ['stories', /^(no\.? of )?stories:?$/i], ['lotArea', /^lot (area|size):?$/i], ['floorArea', /^(adu |livable |habitable |floor |building )area:?$|^adu footprint:?$/i],
  ['height', /^(adu |building )?height:?$/i], ['fireZone', /^(very high fire hazard severity zone|fire (hazard )?zone|vhfhsz):?$/i], ['sheetIndex', /^(sheet index|index of (sheets|drawings)|drawing index):?$/i],
];
const INLINE: [TitleField, RegExp][] = [
  ['apn', /\b(?:apn|a\.p\.n\.|assessor'?s? parcel(?: no\.?| number)?)\s*:?\s*(\d{4}-\d{3}-\d{3})\b/i],
  ['owner', /\bowner(?:'s name)?\s*:\s*(.{2,60})/i], ['preparer', /\b(?:prepared by|designer|architect|drawn by)\s*:\s*(.{2,60})/i],
  ['license', /\b((?:c|rce|ce|s\.?e\.?|pe)\s?-?\s?\d{4,6})\b|\blic(?:ense)?\.?\s*(?:no\.?|#)?\s*:?\s*(\d{4,8})\b/i],
  ['scope', /\b(?:scope of work|project description)\s*:\s*(.{4,120})/i], ['legal', /\b(tract:?\s*\d+.{0,40}\blot:?\s*\d+.*)/i],
  ['occupancy', /\b(?:occupancy(?: group)?\s*:?\s*)?(R-3(?:\/U)?)\b/i], ['type', /\b(type\s+v-?\s?[ab])\b/i],
  ['stories', /\b(\d)\s*stor(?:y|ies)\b|\bstories\s*:\s*(\d)/i], ['lotArea', /\blot (?:area|size)\s*:?\s*([\d,]{3,7}\s*(?:sq\.?\s?ft|s\.?f\.?))/i],
  ['floorArea', /\b([\d,]{3,5}\s*(?:sq\.?\s?ft|s\.?f\.?)\b.{0,20}(?:adu|livable|habitable|floor area|outside))/i],
  ['height', /\b(?:building |adu |max\.? )?height\s*:?\s*(\d{1,2}\s*'\s*-?\s*\d{0,2}"?)/i], ['fireZone', /\b(vhfhsz|very high fire hazard severity zone\s*:?\s*\w*|fire hazard severity zone)/i],
  ['date', /\bdate\s*:\s*(\d{1,4}[-/]\d{1,2}[-/]\d{1,4})/i], ['sheetIndex', /\b(sheet index|index of (?:sheets|drawings))\b/i],
];
const ADDRESS = /\b\d{2,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.' ]{2,30}?\s(?:st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|pl|place|way|ln|lane|ct|court|ter|terrace|cir|circle)\b\.?/i;

/** r7-01 (replaces the r5plan-01 / r6logic-01 regex swing): one clause-scoped classifier, driven by a labeled corpus
 * (src/test/r7/negation-corpus.test.ts, 80+ rows). Any change here must keep the whole corpus green.
 * provided = the note says the thing is there; not = it says it is absent (N/A, TBD, omitted, by owner, not installed...);
 * ambiguous = a bare "not" or a hedge we can't read ("where required", "verify") -> Found (confirm), check the wording. */
export type NoteIntent = 'provided' | 'not' | 'ambiguous';
// Compliant constructions: code minimums and double negatives. Removed before anything else is read.
const COMPLIANT = /(?<=\d\s*(?:cfm|mil)\b[^,;]*?)\bno\b|\bnot\s+(?:less|more|greater|smaller|larger|exceed(?:ing)?|to exceed|over|under|non[- ]rated|na)\b|\bshall not be\s+(?:less|more|greater|smaller|larger|battery|located|installed (?:within|closer|more|less))\b|\bnone (?:removed|omitted|deferred)\b|\bno gas\b|\bno (?:more|less|greater|fewer|smaller|larger) than\b|\b(?:with )?no exceptions?\b|\bwithout exceptions?\b|\bsin excepci[oó]n(?:es)?\b|\bno [a-z-]+(?: [a-z-]+)? (?:allowed|permitted)\b|\bshall not (?!be\b|include|apply|require|need|use|have|provide|install|show|exist)[a-z]+\b/gi;
// Absence phrases (read only inside the item's own clause).
const ABSENT = /\bnot (?:needed|specified|in scope|prov(?:ided)?|req(?:uired)?)\b|\b(?:future|deleted|removed|eliminated|absent|unknown|never|tbc|np|out of scope|in lieu|to follow|to be determined|under (?:separate|deferred) (?:permit|cover|submittal)|(?:by|see) struct\w*|by (?:gc|ec|contractor|owner\/contractor)|sin|ningun[oa]|pendiente|por (?:otros|el due[ñn]o|el propietario)|no (?:se )?(?:incluye[n]?|incluid[oa]s?|aplica|requiere))\b|(?:^|[\s:])-{3,}(?=\s|$)|\bnot (?:be )?(?:provided|shown|included|installed|applicable|required|used|proposed|available|part of|yet|in contract|designed)\b|\b(?:do|does|did|will|shall) not\b|\bnot\s*$|^\s*(?:note\s*:\s*)?not\s|\bna\b|\bnic\b|\bnone\b|\btbd\b|\bpending\b|\bomit(?:ted)?\b|\bexclud(?:ed|e)\b|\bdeferred\b|\bto be (?:provided|determined|added|installed) later\b|\blater\b|\bby (?:owner|others)\b|\bwithout\b|\bsee (?:structural |the )?(?:engineer|engineering|structural|s-sheets)\b|\bnon[- ]rated\b|\bno\b(?!\s*\.?\s*\d)/i;
const POSITIVE = /\d|\b(?:provided|installed|yes|s[ií]|per|hardwired|interconnected|each|every|at|in|with|new|nuevos?|en)\b/i;
const HEDGE = /\bnot\b|\b(?:where|if|when) (?:required|needed|applicable)\b|\bif any\b|\boptional\b|\bverify\b|\balternate\b|\bmay be\b/i;
const tidy = (t: string) => t.replace(/\bnot prov\.?(?=\s|$|[,;])/gi, 'not provided').replace(/\bnot req(?:'?d|\.)?(?=\s|$|[,;])/gi, 'not required').replace(/\bnot appl\.?(?=\s|$|[,;])/gi, 'not applicable')
  .replace(/\bn\s?\/\s?p\b|\bn\.p\.?(?=\s|$|[,;])/gi, 'NP').replace(/\bn\.r\.?(?=\s|$|[,;])/gi, 'not required').replace(/\b([eg])\.c\.?(?=\s|$|[,;])/gi, '$1c').replace(/\bstruct\./gi, 'struct ').replace(/\bn\.\s?i\.\s?c\.?/gi, 'NIC').replace(/\bt\.\s?b\.\s?d\.?/gi, 'TBD').replace(/\bn\s?\/\s?a\b|\bn\.a\./gi, 'NA').replace(/\bw\/o\b/gi, 'without').replace(/\bnot in contract\b/gi, 'NIC');
/** Classify what a note says about one item. `item` picks the clause that names it; `notRequiredOk` keeps "not required" a mention (III.E.4 sprinklers). */
export function noteIntent(text: string, item?: RegExp, notRequiredOk = false): NoteIntent {
  let t = tidy(text).replace(COMPLIANT, ' ');
  if (notRequiredOk) t = t.replace(/\bnot (?:be )?required\b[^;.,]*/gi, ' ');
  const cl = t.split(/;|,|\.(?=\s|$)/).map(c => c.trim()).filter(Boolean);
  const re = item ? new RegExp(item.source, item.flags.replace('g', '')) : null;
  let i = re ? cl.findIndex(c => re.test(c)) : -1;
  const scope: string[] = [];
  if (i < 0) scope.push(t); else {
    scope.push(cl[i]);
    // "SMOKE ALARMS, NOT PROVIDED": a bare item clause is answered by the clause right after it.
    const rest = cl[i].replace(re!, '').replace(/\bnote\b|[:\-–—]/gi, '').trim();
    if (!/[a-z0-9]/i.test(rest) && cl[i + 1]) scope.push(cl[i + 1]);
    // r8-01: "WATER HEATER STRAP: TANKLESS, NOT USED": unless the item clause itself says it is there, the comma clauses
    // that follow it in the same sentence still answer it.
    else if (!POSITIVE.test(cl[i].includes(':') ? cl[i].slice(cl[i].lastIndexOf(':') + 1) : rest)) { const sent = t.split(/;|\.(?=\s|$)/).find(x => re!.test(x)) ?? ''; const parts = sent.split(',').map(c => c.trim()); const k = parts.findIndex(c => re!.test(c)); if (k >= 0) scope.push(...parts.slice(k + 1)); }
  }
  const s = scope.join(' : ');
  // r9-02: a clause that also says the item is provided/installed (not "not provided", "provided later/by owner") is affirmative.
  const affirm = /\b(?:provided|installed|incluid[oa]s?)\b/i.test(s.replace(/\b(?:not|no|never) (?:be |se )?(?:provided|installed|incluid[oa]s?)\b|\b(?:provided|installed) (?:later|by (?:owner|others|gc|ec|contractor)|in (?:the )?future)\b|\bto be (?:provided|installed) later\b|\bwithout\b.*$/gi, ' '));
  if (ABSENT.test(s) && !affirm) return 'not';
  if (HEDGE.test(s)) return 'ambiguous';
  return 'provided';
}
export const negated = (t: string, item?: RegExp) => noteIntent(t, item) === 'not';
const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** r7-02: the words that belong to one window size: its parentheses if it sits inside some, else its sentence without other parenthetical asides. */
function sizeCtx(line: string, at: number, len: number): string {
  const open = line.lastIndexOf('(', at), close = line.lastIndexOf(')', at);
  if (open > close) { const end = line.indexOf(')', at + len); return line.slice(open + 1, end < 0 ? undefined : end); }
  let a = 0; for (const m of line.slice(0, at).matchAll(/[.;]\s/g)) a = m.index! + 2;
  const nx = line.slice(at + len).search(/[.;](?:\s|$)/); const b = nx < 0 ? line.length : at + len + nx;
  return line.slice(a, b).replace(/\([^)]{4,}\)/g, ' ');
}
/** r9-01: the marks bound to one size token. A mark is the size's own only when it sits directly before it ("(E) 36x48",
 * "EXISTING 36x48", "R.O. 20x22") or directly after it as its own tag ("36x48 (E)", "36x48 EXIST."). Words further away
 * ("REPLACES (E) ...", "AT (E) WALL", "IN EXISTING OPENING") belong to something else and never drop the size. */
const MARK_BEFORE = /(?:\(e\)|\bexist(?:ing|\.)?|\bremov(?:ed|e)|\bdemo(?:lish(?:ed)?)?|rough opening|\br\.?\s?o\.?)(?:\s+(?:window|wdw|opening|sash|unit|w\d+))?\s*:?\s*$/i;
const MARK_AFTER = /^\s*(?:\((?:e|exist(?:ing|\.)?|remov(?:ed|e)|demo(?:lish(?:ed)?)?|r\.?\s?o\.?)\)|exist\.(?=\s|$)|r\.?\s?o\.?(?=\s|$))/i;
function ownWords(line: string, at: number, len: number): string {
  const pre = line.slice(0, at).split(/[,;]|(?<!\b[a-z]\.[a-z])\.\s/i).pop()!;
  const post = line.slice(at + len);
  return `${MARK_BEFORE.test(pre) ? 'OWN' : ''} | ${MARK_AFTER.test(post) ? 'OWN' : ''}`;
}
export function analyze(pagesIn: PageText[], totalPages = pagesIn.length): PlanCheck {
  const pages = pagesIn.map(p => ({ page: p.page, lines: p.lines.map(normalize).filter(Boolean) }));
  const chars = pages.reduce((n, p) => n + p.lines.join(' ').length, 0);
  const textPages = pages.filter(p => p.lines.join(' ').length >= 40).length;
  // r5plan-11: overprinted text (Revit draws some labels twice) comes out as the same line twice in a row: keep one.
  const all = pages.flatMap(p => p.lines.filter((t, i) => i === 0 || t !== p.lines[i - 1]).map(text => ({ page: p.page, text })));
  const find = (re: RegExp, max = 6): Hit[] => { const out: Hit[] = []; for (const l of all) if (re.test(l.text)) { out.push({ page: l.page, text: clip(l.text) }); if (out.length >= max) break; } return out; };

  // Sheets
  const sheets: Sheet[] = pages.map(p => {
    const kinds = new Set<SheetKind>(); const scales: string[] = []; let id: string | null = null;
    p.lines.forEach((l, i) => {
      if (!id) { const lab = l.match(/^sheet(?: no\.?| number| #)?\s*:?\s*(.*)$/i);
        const cand = lab ? (lab[1] ? lab[1] : p.lines[i + 1] ?? '') : null;
        if (cand != null) { const m = cand.match(SHEET_ID); if (m) id = m[1].replace(/\s/g, '').toUpperCase(); } } });
    if (!id) for (const l of p.lines) { const m = l.match(new RegExp('^' + SHEET_ID.source + '(\\s|$)')); if (m && l.length < 50 && !/\s\S/.test(l.slice(m[0].length - 1).trim())) { const c = m[1].replace(/\s/g, '').toUpperCase(); if (hardwareCallout(c, p.lines)) continue; id = c; break; } }
    p.lines.forEach(l => {
      // r5plan-03: a sheet-index row ("A3.1 ELEVATIONS") names another sheet; it is not this sheet's own title.
      const row = l.match(new RegExp('^' + SHEET_ID.source + '\\s+\\S')); if (row && row[1].replace(/\s/g, '').toUpperCase() !== id) return;
      for (const [k, re] of KIND) if (re.test(l)) {
        // "section" also appears in code notes ("Section R310"): count it only on a short heading-like line.
        if (k === 'section' && l.length > 40) continue;
        if ((k === 'elevation' || k === 'floor' || k === 'site') && l.length > 60 && !/^[A-Z0-9 .,:'"\-/()]+$/.test(l)) continue;
        kinds.add(k);
      }
      const s = l.match(SCALE); if (s) scales.push(normalize(s[1])); else if (NTS.test(l)) scales.push('NTS');
      else if (BARE_SCALE.test(l)) scales.push(normalize(l.match(BARE_SCALE)![1])); // r5plan-08: Revit/ArchiCAD view scale with no word SCALE
    });
    return { page: p.page, id, kinds: [...kinds], scales: [...new Set(scales)].slice(0, 4), chars: p.lines.join(' ').length };
  });
  // r5plan-03: sheet-index rows name other sheets; they are never evidence for a note.
  const idOf = new Map(sheets.map(x => [x.page, x.id]));
  const indexRow = (page: number, t: string) => { const m = t.match(new RegExp('^' + SHEET_ID.source + '\\s+\\S')); return !!m && m[1].replace(/\s/g, '').toUpperCase() !== idOf.get(page); };
  for (let k = all.length - 1; k >= 0; k--) if (indexRow(all[k].page, all[k].text)) all.splice(k, 1);
  const kindPages = (k: SheetKind) => sheets.filter(s => s.kinds.includes(k)).map(s => s.page);

  // Title block (label on its own item/line, value on the next; or "Label: value" inline)
  const title: Partial<Record<TitleField, Hit>> = {};
  const isLabel = (v: string) => LABELS.some(([, r]) => r.test(v));
  for (const p of pagesIn) for (const g of p.segs ?? []) for (const [f, re] of LABELS) if (!title[f] && re.test(g.s)) {
    // The value is the closest segment below the label in the same column (within 3 lines), or right of it on the same baseline.
    const below = (p.segs ?? []).filter(v => v !== g && Math.abs(v.x - g.x) <= 12 && v.y < g.y && g.y - v.y <= 40).sort((a, b) => b.y - a.y)[0];
    const right = (p.segs ?? []).filter(v => v !== g && Math.abs(v.y - g.y) <= 2 && v.x > g.x).sort((a, b) => a.x - b.x)[0];
    const v = below ?? right; if (v && !isLabel(v.s) && v.s !== '-') title[f] = { page: p.page, text: clip(v.s, 70) };
  }
  for (const p of pages) p.lines.forEach((l, i) => {
    for (const [f, re] of LABELS) if (!title[f] && re.test(l)) { const v = p.lines[i + 1]; if (v && !isLabel(v) && v !== '-' && !pagesIn.find(q => q.page === p.page)?.segs) title[f] = { page: p.page, text: clip(v, 70) }; }
    for (const [f, re] of INLINE) if (!title[f]) { const m = l.match(re); if (m) title[f] = { page: p.page, text: clip((m.slice(1).find(Boolean) ?? m[0]).trim(), 70) }; }
  });
  if (!title.address) { for (const l of all) { const m = l.text.match(ADDRESS); if (m) { title.address = { page: l.page, text: m[0] }; break; } } }

  // Code notes
  const editions = find(/\b20(?:19|22|23|25)\s+(?:edition\s+)?(?:california|ca\b|los angeles|la\b|l\.a\.|lamc|labc|larc|crc|cbc|cec|cmc|cpc|calgreen|cal green|energy|title 24)/i, 8);
  const sections = [...new Set(all.flatMap(l => [...l.text.matchAll(/\b(?:CRC|LARC|CBC|LABC)?\s*(?:sec(?:tion)?\.?\s*)?(R\d{3}(?:\.\d+){0,3})\b/g)].map(m => m[1])))].sort().slice(0, 40);

  // Key dimensions
  const setbacks: PlanCheck['dims']['setbacks'] = []; const ceilings: Dim[] = []; const windows: WindowSize[] = [];
  for (const l of all) {
    if (/set\s?-?backs?|side yard|rear yard|front yard|\bfrom (?:the )?(?:property|lot) line\b|\bto (?:the )?(?:side |rear |front )?(?:property|lot) line\b|\btoP\.?L\.?|\bto\s?p\.l\./i.test(l.text)) {
      const side = /side/i.test(l.text) ? 'side' : /rear/i.test(l.text) ? 'rear' : /front/i.test(l.text) ? 'front' : 'any';
      for (const x of lengthsIn(l.text)) if (x.v <= 12 * 200) setbacks.push({ page: l.page, inches: x.v, text: clip(l.text), side });
    }
    const CEIL = /\b(ceiling|clg\.?)\s*(height|ht\.?)?\b|\bc\.h\.\s|\bplate (height|ht)/i;
    if (CEIL.test(l.text)) for (const x of lenNear(l.text, CEIL, 60, 240)) ceilings.push({ page: l.page, inches: x.v, text: clip(l.text) });
    if (/window|egress|escape|opening|net clear|\bw\d|\bclr\.?/i.test(l.text)) {
      for (const m of l.text.matchAll(/(\d)\s*'\s*-?\s*(\d{1,2})?\s*"?\s*[xX]\s*(\d)\s*'\s*-?\s*(\d{1,2})?\s*"?|\b(\d{2})\s*"?\s*[xX]\s*(\d{2})\s*"?/g)) {
        const w = m[5] ? Number(m[5]) : Number(m[1]) * 12 + Number(m[2] ?? 0), h = m[6] ? Number(m[6]) : Number(m[3]) * 12 + Number(m[4] ?? 0);
        if (w >= 12 && w <= 144 && h >= 12 && h <= 120) windows.push({ page: l.page, w, h, text: clip(l.text), ctx: sizeCtx(l.text, m.index!, m[0].length), own: ownWords(l.text, m.index!, m[0].length) });
      }
    }
  }

  // ---- map to LADBS sheet items ----
  const items: CheckItem[] = [];
  const uniq = (h: Hit[]) => [...new Set(h.map(x => x.page))].sort((a, b) => a - b);
  const add = (id: string, state: ItemState, confidence: Confidence, evidence: Hit[], why: { en: string; es: string }, attention?: { en: string; es: string }) =>
    items.push({ id, state, confidence: state === 'missing' ? 'low' : confidence, pages: uniq(evidence), evidence: evidence.slice(0, 4), why, ...(attention ? { attention } : {}) });
  const kw = (id: string, re: RegExp, enWhat: string, esWhat: string, strong?: RegExp) => {
    const all_ = find(re).map(x => ({ x, k: noteIntent(x.text, re, id === 'III.E.4') }));
    const neg = all_.filter(a => a.k === 'not').map(a => a.x); const h = all_.filter(a => a.k !== 'not').map(a => a.x);
    const s = strong ? all_.filter(a => a.k === 'provided' && strong.test(a.x.text)).map(a => a.x) : []; // ambiguous wording is never High
    const vague = h.length > 0 && all_.every(a => a.k !== 'provided');
    if (!h.length && neg.length) return add(id, 'negated', 'medium', neg, { en: `The note says ${enWhat} is not provided (for example N/A, TBD, by others or future).`, es: `La nota dice que ${esWhat} no se incluye (por ejemplo N/A, TBD, por otros o futuro).` });
    if (!h.length) return add(id, 'missing', 'low', [], { en: `No note about ${enWhat} was found in the text.`, es: `No se encontró una nota sobre ${esWhat} en el texto.` });
    // r8-01: text never proves an item is provided. Found = a neutral pointer with the quote, medium at most.
    const ev = s.length ? s : h; const pg = [...new Set(ev.map(x => x.page))].sort((a, b) => a - b).join(', ');
    add(id, 'addressed', 'medium', ev, vague
      ? { en: `Found ${enWhat} on page ${pg}. Confirm it is shown as provided. The wording is unclear (for example "where required" or a bare "not"), so check the wording.`, es: `Se encontró ${esWhat} en la página ${pg}. Confirme que se muestra como incluido. La redacción no es clara (por ejemplo "donde se requiera" o un "no" suelto), así que revise la redacción.` }
      : { en: `Found ${enWhat} on page ${pg}. Confirm it is shown as provided.`, es: `Se encontró ${esWhat} en la página ${pg}. Confirme que se muestra como incluido.` });
  };
  const sheetHit = (k: SheetKind): Hit[] => kindPages(k).map(page => ({ page, text: (sheets.find(s => s.page === page)!.id ?? '') + ' ' + k }));
  const P1 = pages[0]?.page ?? 1;

  // I.C.2 address and owner on the first sheet
  { const a = title.address, o = title.owner; const onFirst = [a, o].filter(x => x && x.page === P1) as Hit[];
    if (onFirst.length === 2) add('I.C.2', 'addressed', 'high', onFirst, { en: 'Address and owner are on the first sheet.', es: 'La dirección y el dueño están en la primera hoja.' });
    else if (a || o) add('I.C.2', 'partial', 'medium', [a, o].filter(Boolean) as Hit[], { en: `Found ${[a && (a.page === P1 ? 'the address' : `the address (page ${a.page}, not the first sheet)`), o && (o.page === P1 ? 'the owner' : `the owner (page ${o.page})`)].filter(Boolean).join(' and ')}; missing ${[!a && 'the address', !o && 'the owner'].filter(Boolean).join(' and ') || 'nothing else'}.`, es: `Se encontró ${[a && 'la dirección', o && 'el dueño'].filter(Boolean).join(' y ')}; falta ${[!a && 'la dirección', !o && 'el dueño'].filter(Boolean).join(' y ') || 'que esté en la primera hoja'}.` });
    else add('I.C.2', 'missing', 'low', [], { en: 'No address or owner was found in the title block text.', es: 'No se encontró la dirección ni el dueño en el texto del cuadro de título.' }); }
  // I.C.8 title sheet data
  { const want: TitleField[] = ['floorArea', 'occupancy', 'type', 'stories', 'fireZone', 'lotArea', 'height']; const got = want.filter(f => title[f]);
    const EN: Record<string, string> = { floorArea: 'area', occupancy: 'occupancy', type: 'construction type', stories: 'stories', fireZone: 'fire zone', lotArea: 'lot size', height: 'height' };
    const ES: Record<string, string> = { floorArea: 'área', occupancy: 'ocupación', type: 'tipo de construcción', stories: 'pisos', fireZone: 'zona de incendio', lotArea: 'tamaño del lote', height: 'altura' };
    const miss = want.filter(f => !title[f]);
    add('I.C.8', got.length === want.length ? 'addressed' : got.length >= 3 ? 'partial' : got.length ? 'partial' : 'missing', got.length >= 6 ? 'high' : 'medium', got.map(f => title[f]!),
      miss.length ? { en: `Found ${got.length} of ${want.length}. Not found: ${miss.map(f => EN[f]).join(', ')}.`, es: `Se encontraron ${got.length} de ${want.length}. No se encontró: ${miss.map(f => ES[f]).join(', ')}.` } : { en: 'All seven title-sheet facts were found.', es: 'Se encontraron los siete datos de la hoja de título.' }); }
  // I.C.1 license number (signatures and stamps are pictures: never verified)
  { const l = title.license; add('I.C.1', l ? 'partial' : 'missing', 'low', l ? [l] : [], l ? { en: 'A license number is in the text. Stamps and signatures are pictures, so they were not checked.', es: 'Hay un número de licencia en el texto. Sellos y firmas son imágenes y no se revisaron.' } : { en: 'No license number in the text. If an architect or engineer is required, check each sheet is stamped and signed.', es: 'No hay número de licencia en el texto. Si se requiere arquitecto o ingeniero, revise que cada hoja esté sellada y firmada.' }); }
  // I.A.1 / I.C.7 dimensioned plot plan
  for (const id of ['I.A.1', 'I.C.7']) { const sp = kindPages('site');
    if (!sp.length) { add(id, 'missing', 'low', [], { en: 'No site plan or plot plan title was found.', es: 'No se encontró el título de plano del sitio o del lote.' }); continue; }
    const pg = sp[0]; const sh = sheets.find(s => s.page === pg)!; const dims = all.filter(l => l.page === pg).flatMap(l => lengthsIn(l.text)).length;
    const lines = find(/property line|lot line|\bP\.?L\.?\b|setback/i).filter(h => sp.includes(h.page));
    const ok = dims >= 4 && sh.scales.length > 0 && (lines.length > 0 || setbacks.some(s => sp.includes(s.page)));
    add(id, ok ? 'addressed' : 'partial', ok ? 'medium' : 'low', [{ page: pg, text: `${sh.id ?? ''} site plan, ${dims} dimensions, scale ${sh.scales[0] ?? 'not found'}` }, ...lines.slice(0, 2)],
      ok ? { en: `Site plan on page ${pg} has dimensions, a scale and lot lines or setbacks in its text.`, es: `El plano del sitio en la página ${pg} tiene medidas, escala y líneas del lote o retiros en el texto.` }
        : { en: `Site plan on page ${pg} is missing ${[dims < 4 && 'dimensions', !sh.scales.length && 'a scale note', !(lines.length || setbacks.some(s => sp.includes(s.page))) && 'lot lines or setbacks'].filter(Boolean).join(', ')} in its text.`, es: `Al plano del sitio de la página ${pg} le falta en el texto: ${[dims < 4 && 'medidas', !sh.scales.length && 'nota de escala', !(lines.length || setbacks.some(s => sp.includes(s.page))) && 'líneas del lote o retiros'].filter(Boolean).join(', ')}.` }); }
  // I.C.5 required sheets / I.C.6 existing+proposed, framing, foundation
  { const need: SheetKind[] = ['floor', 'elevation', 'section', 'energy']; const got = need.filter(k => kindPages(k).length); const miss = need.filter(k => !got.includes(k));
    add('I.C.5', miss.length === 0 ? 'addressed' : got.length ? 'partial' : 'missing', 'medium', got.flatMap(sheetHit), miss.length ? { en: `Not found: ${miss.map(k => KIND_NAME[k].en).join(', ')}.`, es: `No se encontró: ${miss.map(k => KIND_NAME[k].es).join(', ')}.` } : { en: 'Floor plan, elevations, sections and energy notes were all found.', es: 'Se encontraron planta, elevaciones, cortes y notas de energía.' });
    const n6: SheetKind[] = ['existing', 'floor', 'framing', 'foundation']; const g6 = n6.filter(k => kindPages(k).length || (k === 'framing' && kindPages('roof').length)); const m6 = n6.filter(k => !g6.includes(k));
    add('I.C.6', m6.length === 0 ? 'addressed' : g6.length ? 'partial' : 'missing', 'medium', g6.flatMap(sheetHit), m6.length ? { en: `Not found: ${m6.map(k => KIND_NAME[k].en).join(', ')}.`, es: `No se encontró: ${m6.map(k => KIND_NAME[k].es).join(', ')}.` } : { en: 'Existing and proposed plans, framing and foundation plans were found.', es: 'Se encontraron planos existentes y propuestos, de estructura y de cimentación.' }); }
  // N.4 code edition
  add('N.4', editions.length ? 'addressed' : 'missing', editions.some(h => /2023|2025/.test(h.text)) ? 'high' : 'medium', editions, editions.length ? { en: `Code edition noted: ${[...new Set(editions.map(h => (h.text.match(/20\d\d/) ?? [''])[0]))].join(', ')}.`, es: `Edición del código indicada: ${[...new Set(editions.map(h => (h.text.match(/20\d\d/) ?? [''])[0]))].join(', ')}.` } : { en: 'No code edition (for example "2023 LARC") was found.', es: 'No se encontró la edición del código (por ejemplo "2023 LARC").' },
    editions.length && !editions.some(h => /2023|2025/.test(h.text)) ? { en: 'Only an older code edition was found. The sheet cites the 2023 LA codes.', es: 'Solo se encontró una edición anterior. La hoja cita los códigos de LA 2023.' } : undefined);
  // III.B.2 height on elevations
  { const ep = kindPages('elevation'); const h = find(/\b(height|ht\.?|max\.? hgt|top of (roof|ridge)|t\.o\.r\.)\b/i).filter(x => ep.includes(x.page));
    add('III.B.2', !ep.length ? 'missing' : h.length ? 'addressed' : 'partial', h.length ? 'medium' : 'low', h.length ? h : ep.map(page => ({ page, text: 'elevation' })), !ep.length ? { en: 'No elevation sheet was found.', es: 'No se encontró una hoja de elevaciones.' } : h.length ? { en: 'A height note is on an elevation sheet.', es: 'Hay una nota de altura en una hoja de elevaciones.' } : { en: 'Elevations found, but no height note in their text.', es: 'Hay elevaciones, pero sin nota de altura en el texto.' }); }
  // III.D.1 / III.D.2 fire-resistance
  kw('III.D.1', /\b(1|one)[- ]?(hour|hr)\b|fire[- ]?rated wall|fire resistan/i, 'a 1-hour rated wall', 'un muro de 1 hora', /\b(1|one)[- ]?(hour|hr)\b.*\b(wall|exterior|assembly)\b|\b(wall|exterior)\b.*\b(1|one)[- ]?(hour|hr)\b|R302/i);
  { const near5 = setbacks.filter(s => s.inches < 60 && s.side !== 'front');
    if (near5.length) { const last = items[items.length - 1]; last.attention = { en: `A setback under 5 ft was read (${fmtIn(near5[0].inches)}, page ${near5[0].page}). Walls that close usually need the 1-hour rating.`, es: `Se leyó un retiro de menos de 5 pies (${fmtIn(near5[0].inches)}, página ${near5[0].page}). Muros tan cerca suelen necesitar la protección de 1 hora.` }; } }
  kw('III.D.2', /\b(eave|overhang|projection|soffit)\b/i, 'eaves or projections', 'aleros o salientes', /\b(eave|overhang|projection)\b.*\d\s*'|\d\s*'.*\b(eave|overhang)\b/i);
  // III.E alarms and sprinklers
  kw('III.E.1', /\bsmoke (alarm|detector)s?\b|\b(?:detector(?:es)?|alarmas?) de humo\b|\bs\.?d\.?\s*=|\bsmoke\/co\b/i, 'smoke alarms', 'alarmas de humo', /smoke (alarm|detector).*(bedroom|each|every|sleeping|hall)|R314/i);
  kw('III.E.2', /hard[- ]?wired|battery back[- ]?up|interconnect/i, 'hardwired alarms with battery backup', 'alarmas cableadas con batería de respaldo', /hard[- ]?wired.*batter|batter.*hard[- ]?wired|interconnect/i);
  kw('III.E.3', /carbon monoxide|mon[oó]xido de carbono|\bco (alarm|detector)s?\b|smoke\/co|smoke & co/i, 'a carbon monoxide alarm', 'una alarma de monóxido de carbono', /carbon monoxide (alarm|detector)|R315/i);
  kw('III.E.4', /sprinkler|rociador/i, 'sprinklers', 'rociadores', /(nfpa ?13d|fire sprinkler system|sprinklers? (required|provided|not required))/i);
  // III.F.1 escape windows (sizes checked against the numbers on the sheet: 24" high, 20" wide, 5.7 sq ft, 5.0 at grade)
  { const h = find(/\b(egress|escape|emergency escape)\b/i); // r6logic-02: only sizes on an egress-tagged line count; on an egress page, untagged sizes count unless tagged bath/obscure/(E)/remove.
    const tagged = windows.filter(w => /egress|escape|\be\.?w\.?\b/i.test(w.text));
    // r7-02: each size is judged on its own words (its sentence, or its parentheses): (E), removed, demolished, rough opening, bath, obscure drop out.
    const NOT_ESCAPE = /\bbath|obscure|\(e\)|\bexist(?:ing|\.)|remov|demo(?:lish|\b)|rough opening|\br\.?\s?o\.?(?=\s|\)|$)/i;
    // r8-02: an egress-tagged size is dropped only when its OWN size token is marked (E), existing, removed or rough opening;
    // words elsewhere in the sentence (bath, replaces, adjacent, demo) describe something else.
    const OWN_MARK = /\bOWN\b/;
    const ew = tagged.length ? tagged.filter(w => !OWN_MARK.test(w.own)) : windows.filter(w => h.some(x => x.page === w.page)).filter(w => !NOT_ESCAPE.test(w.ctx));
    const E = PARAMS.egress; const bad = (w: WindowSize) => w.w < E.minWidthIn || w.h < E.minHeightIn || (w.w * w.h) / 144 < E.gradeSqFt;
    const small = ew.filter(bad); // every bedroom needs its own escape opening (CRC R310.1): any proposed size that fails conflicts
    add('III.F.1', !h.length ? (windows.length ? 'partial' : 'missing') : ew.length ? (small.length ? 'conflict' : 'addressed') : 'partial', h.length && ew.length ? 'medium' : 'low', [...h.slice(0, 2), ...(small.length ? small : ew).slice(0, 2).map(w => ({ page: w.page, text: `${w.w}" x ${w.h}" — ${w.text}` }))],
      !h.length ? (windows.length ? { en: `${windows.length} window sizes found, but no note says which is the escape window.`, es: `Se encontraron ${windows.length} medidas de ventanas, pero ninguna nota dice cuál es la de escape.` } : { en: 'No escape window note or window size was found.', es: 'No se encontró nota de ventana de escape ni medidas de ventanas.' })
        : ew.length ? { en: `Escape window note with ${ew.length} size${ew.length > 1 ? 's' : ''} read from the text.`, es: `Nota de ventana de escape con ${ew.length} medida${ew.length > 1 ? 's' : ''} leída${ew.length > 1 ? 's' : ''} del texto.` } : { en: 'Escape windows are mentioned, but no size was read next to them.', es: 'Se mencionan ventanas de escape, pero no se leyó una medida junto a ellas.' },
      small.length ? { en: `A size read as ${small[0].w}" x ${small[0].h}" (page ${small[0].page}) is under 20" wide, 24" high or 5.0 sq ft. Check whether it is the clear opening.`, es: `Una medida leída como ${small[0].w}" x ${small[0].h}" (página ${small[0].page}) tiene menos de 20" de ancho, 24" de alto o 5.0 pies². Revise si es la abertura libre.` } : undefined); }
  kw('III.F.2', /\b3\s*'\s*-?\s*0\s*"?\s*x\s*6\s*'\s*-?\s*8|\b36\s*"?\s*x\s*80\b/i, 'the exit door size', 'la medida de la puerta de salida', /\b3\s*'\s*-?\s*0\s*"?\s*x\s*6\s*'\s*-?\s*8|\b36\s*"?\s*x\s*80\b/i);
  // III.G.1 ceiling height (7 ft per the sheet)
  { const low = ceilings.filter(c => c.inches < PARAMS.ceilingMinIn);
    add('III.G.1', ceilings.length ? (low.length ? 'conflict' : 'addressed') : find(/ceiling height|clg\.? ht/i).length ? 'partial' : 'missing', ceilings.length ? 'high' : 'low', ceilings.length ? ceilings.slice(0, 3).map(c => ({ page: c.page, text: `${fmtIn(c.inches)} — ${c.text}` })) : find(/ceiling height|clg\.? ht/i),
      ceilings.length ? { en: `Ceiling height read: ${[...new Set(ceilings.map(c => fmtIn(c.inches)))].slice(0, 4).join(', ')}.`, es: `Altura de techo leída: ${[...new Set(ceilings.map(c => fmtIn(c.inches)))].slice(0, 4).join(', ')}.` } : { en: 'No ceiling height with a number was found.', es: 'No se encontró una altura de techo con número.' },
      low.length ? { en: `A ceiling height under 7 ft was read (${fmtIn(low[0].inches)}, page ${low[0].page}).`, es: `Se leyó una altura de techo de menos de 7 pies (${fmtIn(low[0].inches)}, página ${low[0].page}).` } : undefined); }
  kw('III.G.4', /exhaust fan|\bextractor\b|bath(room)? fan|\bexh\.? fan|\b50 cfm|\bcfm\b/i, 'a bathroom exhaust fan', 'un extractor en el baño', /exhaust fan.*(\d+\s*cfm|bath)|bath.*exhaust fan/i);
  kw('III.H.2', /tempered|safety glaz|vidrio templado/i, 'tempered glass', 'vidrio templado', /tempered.*(door|tub|shower|within|glass)|R308/i);
  kw('III.H.9', /\btitle[- ]?24\b|\bcf1r\b|\bhers\b|\benergy compliance\b/i, 'Title 24 energy compliance', 'el cumplimiento de energía Title 24', /\bcf1r\b|\bhers\b/i);
  kw('III.I.1', /all[- ]electric|no gas|heat pump/i, 'all-electric', 'todo eléctrico', /all[- ]electric/i);
  kw('III.I.6', /water heater.*(strap|brac)|(strap|brac).*water heater|seismic strap/i, 'water heater strapping', 'el amarre del calentador de agua', /strap/i);
  kw('III.J.1', /vapor (retarder|barrier)|barrera de vapor|epoxy/i, 'a slab vapor retarder or epoxy', 'una barrera de vapor o epóxico en la losa', /(6|10|15)[- ]?mil|vapor retarder.*slab|slab.*vapor/i);
  kw('III.J.9', /\b(2|4|6)\s?x\s?(4|6|8|10|12)\b.*(@|o\.?c\.?|joist|rafter|header|beam|stud)/i, 'framing member sizes', 'las medidas de las piezas de madera', /(joist|rafter|header|beam).*@\s*\d+|@\s*\d+\s*"?\s*o\.?c\.?/i);
  kw('III.J.18', /anchor bolt|pernos? de anclaje|\bA\.?B\.?\s*@/i, 'anchor bolts', 'los pernos de anclaje', /anchor bolts?.*(\d\/\d|@|embed)/i);

  // Claim model (r5plan-01..05, r5whole-01): text matching proves a mention, not compliance. High confidence only where a number
  // read from the text passes the rule (ceiling, escape window, code edition); partial, negated and conflict are never high.
  // r8-01: "Found" is a pointer, never proof it is provided, so no item is ever shown above medium.
  items.forEach(i => { if (i.confidence === 'high') i.confidence = 'medium'; });
  // r5plan-10: pages past the read limit were never read; a missing item may be on them (Title 24 sheets are often last).
  const last = pagesIn.length ? Math.max(...pagesIn.map(q => q.page)) : 0;
  if (totalPages > last) items.forEach(i => { if (i.state === 'missing') i.why = { en: `${i.why.en} Pages ${last + 1} to ${totalPages} were not read.`, es: `${i.why.es} No se leyeron las páginas ${last + 1} a ${totalPages}.` }; });
  const order = CATALOG.map(c => c.id); items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { pages: pages.length, textPages, chars, scanned: pages.length > 0 && textPages < Math.ceil(pages.length / 2), sheets, title, codes: { editions, sections }, dims: { setbacks, ceilings, windows }, items };
}

export const KIND_NAME: Record<SheetKind, { en: string; es: string }> = {
  cover: { en: 'cover sheet', es: 'portada' }, site: { en: 'site plan', es: 'plano del sitio' }, floor: { en: 'floor plan', es: 'planta' }, existing: { en: 'existing plan', es: 'plano existente' },
  elevation: { en: 'elevations', es: 'elevaciones' }, section: { en: 'sections', es: 'cortes' }, roof: { en: 'roof plan', es: 'plano de techo' }, foundation: { en: 'foundation plan', es: 'plano de cimentación' },
  framing: { en: 'framing plan', es: 'plano de estructura' }, electrical: { en: 'electrical plan', es: 'plano eléctrico' }, plumbing: { en: 'plumbing plan', es: 'plano de plomería' },
  mechanical: { en: 'mechanical plan', es: 'plano mecánico' }, energy: { en: 'energy (Title 24) notes', es: 'notas de energía (Title 24)' }, notes: { en: 'general notes', es: 'notas generales' },
  structural: { en: 'structural sheets', es: 'hojas estructurales' }, details: { en: 'details', es: 'detalles' },
};

export const counts = (c: PlanCheck): Record<ItemState, number> => { const n = (s: ItemState) => c.items.filter(i => i.state === s).length; return { addressed: n('addressed'), negated: n('negated'), conflict: n('conflict'), partial: n('partial'), missing: n('missing') }; };

// ---- PDF text extraction (pdf.js, loaded only when used) ----
type PdfLib = { getDocument: (o: any) => { promise: Promise<any>; destroy?: () => void }; GlobalWorkerOptions?: { workerSrc: string } };
export type PlanErrorCode = 'size' | 'notpdf' | 'locked' | 'damaged';
export class PlanError extends Error { code: PlanErrorCode; constructor(code: PlanErrorCode, msg: string) { super(msg); this.code = code; } }
/** Reads the text of each page. `lib` is injected in tests (Node); the app passes the browser build with its precached worker. */
export async function extractPages(bytes: Uint8Array, lib: PdfLib, onPage?: (n: number, of: number) => void, signal?: { cancelled: boolean }): Promise<{ pages: PageText[]; total: number }> {
  if (bytes.byteLength > PLAN_LIMITS.maxBytes) throw new PlanError('size', 'too large');
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF-')) throw new PlanError('notpdf', 'not a pdf');
  let doc: any;
  try { doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false, verbosity: 0 }).promise; }
  catch (e) { const n = (e as Error)?.name; if (n === 'PasswordException') throw new PlanError('locked', 'locked'); throw new PlanError('damaged', 'damaged'); }
  try {
    const total = doc.numPages as number; const n = Math.min(total, PLAN_LIMITS.maxPages); const pages: PageText[] = [];
    for (let i = 1; i <= n; i++) {
      if (signal?.cancelled) break;
      onPage?.(i, n);
      try { const pg = await doc.getPage(i); const tc = await pg.getTextContent();
        let c = 0; const segs = toSegs(tc.items as any).filter(g => (c += g.s.length) <= PLAN_LIMITS.maxCharsPerPage); pages.push({ page: i, lines: segs.map(g => g.s), segs }); pg.cleanup?.(); }
      catch { pages.push({ page: i, lines: [] }); }
    }
    return { pages, total };
  } finally { try { await doc.destroy(); } catch { /* already gone */ } }
}
