// One internal unit: millimetres as float64. Round only for display (fix UU008/UU010).
export const MM_PER_IN = 25.4;
export const MM_PER_FT = 304.8;
export const SQMM_PER_SQFT = MM_PER_FT * MM_PER_FT;

export const ft = (v: number) => v * MM_PER_FT;
export const inch = (v: number) => v * MM_PER_IN;
export const toFt = (mm: number) => mm / MM_PER_FT;
export const toSqFt = (sqmm: number) => sqmm / SQMM_PER_SQFT;

/** Parse lengths like 20' 6 1/2", 20ft 6in, 20-6, 20.5, 6.25m, 450mm, 18". Returns mm or null. */
export function parseLength(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  const metric = s.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m)$/);
  if (metric) {
    const n = parseFloat(metric[1]);
    return metric[2] === 'mm' ? n : metric[2] === 'cm' ? n * 10 : n * 1000;
  }
  const frac = (t: string) => {
    const m = t.trim().match(/^(\d+)(?:\s+(\d+)\/(\d+)|\/(\d+))?$/);
    if (!m) return NaN;
    if (m[4]) return parseInt(m[1]) / parseInt(m[4]); // "1/2"
    return parseInt(m[1]) + (m[2] ? parseInt(m[2]) / parseInt(m[3]) : 0);
  };
  const dash = s.match(/^(\d+)-(\d+(?:\s+\d+\/\d+)?)$/);
  if (dash) return ft(parseInt(dash[1])) + inch(frac(dash[2]));
  const fi = s.match(/^(?:(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot))?\s*(?:(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(?:"|in|inch|inches))?$/);
  if (fi && (fi[1] || fi[2])) {
    const f = fi[1] ? parseFloat(fi[1]) : 0;
    const i = fi[2] ? (fi[2].includes('/') ? frac(fi[2]) : parseFloat(fi[2])) : 0;
    if (Number.isNaN(i)) return null;
    return ft(f) + inch(i);
  }
  const bare = s.match(/^-?\d+(?:\.\d+)?$/);
  if (bare) return ft(parseFloat(s)); // bare number = feet
  return null;
}

/** 6096 -> 20' 0"  (nearest 1/4") */
export function fmtFtIn(mm: number): string {
  const neg = mm < 0; let q = Math.round(Math.abs(mm) / MM_PER_IN * 4) / 4;
  let f = Math.floor(q / 12); let i = q - f * 12;
  if (i >= 12) { f += 1; i -= 12; }
  const whole = Math.floor(i); const r = i - whole;
  const fr = r === 0 ? '' : r === 0.25 ? ' 1/4' : r === 0.5 ? ' 1/2' : ' 3/4';
  return `${neg ? '-' : ''}${f}' ${whole}${fr}"`;
}
export const fmtSqFt = (sqmm: number) => `${Math.round(toSqFt(sqmm)).toLocaleString('en-US')} sq ft`;
