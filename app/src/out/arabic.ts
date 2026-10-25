// r4reach-11: Arabic-script text (Farsi names, addresses) for PDFs. pdf-lib draws glyphs left to right and does not reorder
// right-to-left text, so each Arabic run is shaped here into Presentation Forms (isolated/final/initial/medial) and then put in
// visual order. Digits inside a run keep left-to-right order. Covers Arabic letters plus the Persian پ چ ژ ک گ ی and lam-alef.
// Forms: [isolated, final, initial, medial]; two forms = right-joining only.
const F: Record<number, number[]> = {
  0x0621: [0xfe80], 0x0622: [0xfe81, 0xfe82], 0x0623: [0xfe83, 0xfe84], 0x0624: [0xfe85, 0xfe86], 0x0625: [0xfe87, 0xfe88], 0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],
  0x0627: [0xfe8d, 0xfe8e], 0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], 0x0629: [0xfe93, 0xfe94], 0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], 0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], 0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], 0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], 0x062f: [0xfea9, 0xfeaa], 0x0630: [0xfeab, 0xfeac],
  0x0631: [0xfead, 0xfeae], 0x0632: [0xfeaf, 0xfeb0], 0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], 0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8], 0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc],
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], 0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4], 0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8], 0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc],
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0], 0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], 0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8], 0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0], 0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], 0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8], 0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec],
  0x0648: [0xfeed, 0xfeee], 0x0649: [0xfeef, 0xfef0], 0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4],
  0x067e: [0xfb56, 0xfb57, 0xfb58, 0xfb59], 0x0686: [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d], 0x0698: [0xfb8a, 0xfb8b], 0x06a9: [0xfb8e, 0xfb8f, 0xfb90, 0xfb91],
  0x06af: [0xfb92, 0xfb93, 0xfb94, 0xfb95], 0x06cc: [0xfbfc, 0xfbfd, 0xfbfe, 0xfbff],
};
const LAMALEF: Record<number, number[]> = { 0x0622: [0xfef5, 0xfef6], 0x0623: [0xfef7, 0xfef8], 0x0625: [0xfef9, 0xfefa], 0x0627: [0xfefb, 0xfefc] };
const isMark = (n: number) => (n >= 0x064b && n <= 0x065f) || n === 0x0670;
export const isArabicChar = (n: number) => (n >= 0x0600 && n <= 0x06ff) || (n >= 0x0750 && n <= 0x077f) || (n >= 0xfb50 && n <= 0xfdff) || (n >= 0xfe70 && n <= 0xfeff);
const dual = (n: number | undefined) => n !== undefined && (F[n]?.length ?? 0) === 4;
const joins = (n: number | undefined) => n !== undefined && (F[n]?.length ?? 0) >= 2;

/** Contextual shaping of one logical-order Arabic word or phrase (ZWNJ breaks joining and is dropped). */
export function shapeArabic(s: string): string {
  const cps = [...s].map(c => c.codePointAt(0)!); const out: number[] = [];
  // neighbours ignoring marks
  const prev = (i: number) => { for (let j = i - 1; j >= 0; j--) if (!isMark(cps[j])) return cps[j] === 0x200c ? undefined : cps[j]; return undefined; };
  const next = (i: number) => { for (let j = i + 1; j < cps.length; j++) if (!isMark(cps[j])) return cps[j] === 0x200c ? undefined : cps[j]; return undefined; };
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i]; if (c === 0x200c || c === 0x200d) continue;
    const p = prev(i), nx = next(i), fromPrev = dual(p);
    if (c === 0x0644 && nx !== undefined && LAMALEF[nx]) { out.push(LAMALEF[nx][fromPrev ? 1 : 0]); let j = i + 1; while (isMark(cps[j])) out.push(cps[j++]); i = j; continue; }
    const f = F[c]; if (!f) { out.push(c); continue; }
    if (f.length === 1) { out.push(f[0]); continue; }
    const toNext = f.length === 4 && joins(nx);
    out.push(fromPrev ? (toNext ? f[3] : f[1]) : (toNext ? f[2] : f[0]));
  }
  return String.fromCodePoint(...out);
}
/**
 * Logical text -> text for pdf-lib/fontkit: every Arabic run (letters, marks, and the spaces and digits between
 * Arabic words) is shaped into presentation forms; fontkit then draws the run right to left; digit groups stay left to right. Text with no Arabic is returned unchanged.
 */
export function visualOrder(text: string): string {
  if (![...text].some(c => isArabicChar(c.codePointAt(0)!))) return text;
  const chars = [...text]; let out = ''; let i = 0;
  const ar = (c: string | undefined) => c !== undefined && !/[\u0660-\u0669\u06f0-\u06f9]/.test(c) && (isArabicChar(c.codePointAt(0)!) || c === '\u200c');
  while (i < chars.length) {
    if (!ar(chars[i])) { out += chars[i++]; continue; }
    let j = i; // extend over Arabic, and over spaces/digits that are followed by more Arabic
    while (j < chars.length) { if (ar(chars[j])) { j++; continue; } let k = j; while (k < chars.length && /\s/.test(chars[k])) k++; if (k > j && ar(chars[k])) { j = k; continue; } break; }
    const shaped = [...shapeArabic(chars.slice(i, j).join(''))];
    // reverse, keeping digit groups in their own order
    const parts: string[] = []; for (const c of shaped) { const d = /[\d۰-۹٠-٩]/.test(c); if (d && parts.length && /[\d۰-۹٠-٩]$/.test(parts[parts.length - 1])) parts[parts.length - 1] += c; else parts.push(c); }
    // fontkit (inside pdf-lib) lays out each Arabic word right to left by itself, but keeps words in their given order.
    // So letters are not reversed here; the word order of the run is, and digit groups stay left to right.
    out += parts.join('').split(/(\s+)/).reverse().join(''); i = j;
  }
  return out;
}
