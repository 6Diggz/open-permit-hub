// One internal unit: millimetres as float64. Round only for display (fix UU008/UU010).
export const MM_PER_IN = 25.4;
export const MM_PER_FT = 304.8;
export const SQMM_PER_SQFT = MM_PER_FT * MM_PER_FT;

export const ft = (v: number) => v * MM_PER_FT;
export const inch = (v: number) => v * MM_PER_IN;
export const toFt = (mm: number) => mm / MM_PER_FT;
export const toSqFt = (sqmm: number) => sqmm / SQMM_PER_SQFT;

/** Largest length any field accepts (a lot or building side). Bigger input is a typo. */
export const MAX_LEN_MM = ft(5000);
/** A finite, real number (rejects NaN, Infinity, null, strings). Use for every stored number. */
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Phone keyboards: smart quotes, prime marks, full-width and Arabic-Indic digits. */
export function normalizeLengthText(raw: string): string {
  let s = raw.normalize('NFKC');
  s = s.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x06F0));
  s = s.replace(/[‘’′´`]/g, "'").replace(/[“”″]/g, '"').replace(/''/g, '"');
  s = s.replace(/[–—−]/g, '-').replace(/⁄/g, '/');
  // A decimal comma is only safe with a metric unit (6,25 m). "20,6" could mean 20.6 ft or 20' 6": refuse it (parseLength returns null).
  s = s.replace(/(\d),(\d+)\s*(mm|cm|m)\b/g, '$1.$2 $3');
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Parse lengths like 20' 6 1/2", 20ft 6in, 20-6, 6'6, 5 ft 6, 20.5, 6.25m, 450mm, 18". Returns mm or null.
 * Rejects anything that is not a finite size between 0 and MAX_LEN_MM, a zero denominator, and inches of 12 or more after feet.
 * `signed` allows a leading minus (moves, offsets).
 */
export function parseLength(raw: string, opts: { signed?: boolean; max?: number; /** Unit for a bare number: feet (default) or inches (window fields). */ bare?: 'ft' | 'in' } = {}): number | null {
  let s = normalizeLengthText(raw);
  if (!s) return null;
  let sign = 1;
  if (s.startsWith('-')) { if (!opts.signed) return null; sign = -1; s = s.slice(1).trim(); }
  if (s.startsWith('+')) s = s.slice(1).trim();
  if (s.includes(',')) return null;
  const v = parseUnsigned(s, opts.bare ?? 'ft');
  if (v == null || !Number.isFinite(v) || v < 0 || v > (opts.max ?? MAX_LEN_MM)) return null;
  return sign * v;
}

const NUM = '\\d+(?:\\.\\d+)?';
function frac(t: string): number {
  const m = t.trim().match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+)|\/(\d+))?$/);
  if (!m) return NaN;
  if (m[4]) { const den = parseInt(m[4]); return den > 0 ? parseFloat(m[1]) / den : NaN; }
  if (m[2]) { const den = parseInt(m[3]); return den > 0 ? parseFloat(m[1]) + parseInt(m[2]) / den : NaN; }
  return parseFloat(m[1]);
}
function parseUnsigned(s0: string, bare: 'ft' | 'in'): number | null {
  // 20'-6" and 20' - 6": the dash between feet and inches is a separator.
  const s = s0.replace(/^(\d+(?:\.\d+)?)\s*'\s*-\s*(?=\d)/, "$1' ");
  const metric = s.match(new RegExp(`^(${NUM})\\s*(mm|cm|m)$`));
  if (metric) { const n = parseFloat(metric[1]); return metric[2] === 'mm' ? n : metric[2] === 'cm' ? n * 10 : n * 1000; }
  // 20-6, 20-6 1/2 (feet-inches)
  const dash = s.match(/^(\d+)-(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)$/);
  if (dash) { const i = frac(dash[2]); if (!(i >= 0 && i < 12)) return null; return ft(parseInt(dash[1])) + inch(i); }
  const IN = `(\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+)`;
  // feet mark followed by optional inches, with or without an inch mark: 20' 6", 6'6, 5 ft 6
  const fi = s.match(new RegExp(`^(${NUM})\\s*(?:'|ft|feet|foot)\\s*(?:${IN}\\s*(?:"|in|inch|inches)?)?$`));
  if (fi) { const f = parseFloat(fi[1]); const i = fi[2] ? frac(fi[2]) : 0; if (!(i >= 0 && i < 12)) return null; return ft(f) + inch(i); }
  const onlyIn = s.match(new RegExp(`^${IN}\\s*(?:"|in|inch|inches)$`));
  if (onlyIn) { const i = frac(onlyIn[1]); return Number.isFinite(i) ? inch(i) : null; }
  if (new RegExp(`^${NUM}$`).test(s)) return bare === 'in' ? inch(parseFloat(s)) : ft(parseFloat(s)); // bare number = feet, or inches in window fields
  return null;
}

/** 6096 -> 20' 0"  (nearest 1/4"). Non-finite values print as a dash, never "NaN". */
export function fmtFtIn(mm: number): string {
  if (!Number.isFinite(mm)) return '—';
  const neg = mm < 0; const q = Math.round(Math.abs(mm) / MM_PER_IN * 4) / 4;
  let f = Math.floor(q / 12); let i = q - f * 12;
  if (i >= 12) { f += 1; i -= 12; }
  const whole = Math.floor(i); const r = i - whole;
  const fr = r === 0 ? '' : r === 0.25 ? ' 1/4' : r === 0.5 ? ' 1/2' : ' 3/4';
  return `${neg ? '-' : ''}${f}' ${whole}${fr}"`;
}
export const fmtSqFt = (sqmm: number) => Number.isFinite(sqmm) ? `${Math.round(toSqFt(sqmm)).toLocaleString('en-US')} sq ft` : '—';

/** Soft plausibility ranges (mm) for a garage ADU. Outside: accept but say "check this number". */
export const RANGES = {
  lot: [ft(15), ft(1000)], building: [ft(8), ft(200)], height: [ft(7), ft(40)], ceiling: [ft(6), ft(14)],
  setback: [0, ft(500)], window: [inch(6), ft(12)], sill: [0, ft(8)], uncertainty: [0, ft(20)],
} as const satisfies Record<string, readonly [number, number]>;
export const outOfRange = (mm: number | null, r: readonly [number, number]) => mm != null && (mm < r[0] || mm > r[1]);
/** A real number, but larger than any lot or building (a typo like 99999'). */
export const lengthTooLarge = (raw: string) => parseLength(raw) == null && (parseLength(raw, { max: Number.MAX_VALUE }) ?? 0) > MAX_LEN_MM;

/**
 * What a length field does when the user leaves it: the parsed value, whether to commit it, and whether the text is bad.
 * `always`: commit even when the value equals what is shown (typing the real size that happens to match the example confirms it).
 */
export function lengthBlur(txt: string, mm: number | null, o: { allowZero?: boolean; bare?: 'ft' | 'in'; always?: boolean } = {}): { bad: boolean; commit: boolean; value: number | null } {
  if (!txt.trim()) return { bad: false, commit: mm != null, value: null };
  const v = parseLength(txt, { bare: o.bare });
  const ok = v != null && Number.isFinite(v) && (o.allowZero ? v >= 0 : v > 0);
  if (!ok) return { bad: true, commit: false, value: null };
  return { bad: false, commit: !!o.always || mm == null || Math.abs(v - mm) > 1e-6, value: v };
}
