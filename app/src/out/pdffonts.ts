// Embedded fonts for every PDF sheet and report: Public Sans (SIL OFL 1.1, the app's own UI font), whole font (stable glyph ids; about 25 KB per weight).
// Plan-intake systems (ePlanLA / ProjectDox) and PDF/A expect embedded fonts; base-14 Helvetica is never embedded.
import { StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { unzlibSync } from 'fflate';
import { visualOrder } from './arabic';
import regular from '@fontsource/public-sans/files/public-sans-latin-400-normal.woff?inline';
import bold from '@fontsource/public-sans/files/public-sans-latin-700-normal.woff?inline';
// r4reach-10: fallbacks so names in Vietnamese, other Latin scripts, Russian/Ukrainian and Armenian print (LA language access tiers).
import rExt from '@fontsource/public-sans/files/public-sans-latin-ext-400-normal.woff?inline';
import bExt from '@fontsource/public-sans/files/public-sans-latin-ext-700-normal.woff?inline';
import rVi from '@fontsource/public-sans/files/public-sans-vietnamese-400-normal.woff?inline';
import bVi from '@fontsource/public-sans/files/public-sans-vietnamese-700-normal.woff?inline';
import rCy from '@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff?inline';
import bCy from '@fontsource/noto-sans/files/noto-sans-cyrillic-700-normal.woff?inline';
import rCyx from '@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-normal.woff?inline';
import bCyx from '@fontsource/noto-sans/files/noto-sans-cyrillic-ext-700-normal.woff?inline';
import rHy from '@fontsource/noto-sans-armenian/files/noto-sans-armenian-armenian-400-normal.woff?inline';
import bHy from '@fontsource/noto-sans-armenian/files/noto-sans-armenian-armenian-700-normal.woff?inline';

const bytes = (dataUrl: string) => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), c => c.charCodeAt(0));
const NOLIG = { liga: false, clig: false, dlig: false, rlig: false };
/** WOFF 1.0 -> TrueType (sfnt): inflate each table and lay them out again. A PDF FontFile2 must be TrueType, not WOFF. */
export function woffToTtf(w: Uint8Array): Uint8Array {
  const dv = new DataView(w.buffer, w.byteOffset, w.byteLength); if (dv.getUint32(0) !== 0x774f4646) return w;
  const n = dv.getUint16(12); const tabs = [];
  for (let i = 0; i < n; i++) { const o = 44 + i * 20; const off = dv.getUint32(o + 4), comp = dv.getUint32(o + 8), orig = dv.getUint32(o + 12);
    const raw = w.subarray(off, off + comp); tabs.push({ tag: dv.getUint32(o), sum: dv.getUint32(o + 16), data: comp < orig ? unzlibSync(raw) : raw }); }
  let size = 12 + n * 16; for (const t of tabs) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size); const ov = new DataView(out.buffer);
  let sel = 0; while (2 << sel <= n) sel++; const range = (1 << sel) * 16;
  ov.setUint32(0, dv.getUint32(4)); ov.setUint16(4, n); ov.setUint16(6, range); ov.setUint16(8, sel); ov.setUint16(10, n * 16 - range);
  let at = 12 + n * 16;
  tabs.forEach((t, i) => { const o = 12 + i * 16; ov.setUint32(o, t.tag); ov.setUint32(o + 4, t.sum); ov.setUint32(o + 8, at); ov.setUint32(o + 12, t.data.length); out.set(t.data, at); at += (t.data.length + 3) & ~3; });
  return out;
}

/** Regular and bold, embedded. Falls back to Helvetica only if the font cannot be read (the export still works).
 *  `text`: what will print (names, address...). Korean, Chinese and Arabic-script letters in it pull in only the Noto pieces they need. */
const cache = new WeakMap<PDFDocument, Promise<{ f: PDFFont; fb: PDFFont }>>();
export function sheetFonts(doc: PDFDocument, text = ''): Promise<{ f: PDFFont; fb: PDFFont }> {
  let c = cache.get(doc); if (!c) { c = load(doc).then(async r => { await scriptFonts(doc, r, text).catch(() => { /* the main fonts still work; letters print via the missing-glyph note */ }); return r; }); cache.set(doc, c); } return c;
}

// OUT2-17 / r4reach-11: lazy Noto Sans (SIL OFL 1.1) for Hangul, Han (Simplified/Traditional) and Arabic script (Farsi).
// Fontsource splits CJK into ~100 unicode-range pieces; only the pieces holding the letters in `text` are loaded and embedded.
// Each piece is its own lazy chunk, left out of the offline precache (sw-build.ts) and cached on first use.
const CJK = import.meta.glob<string>('../../node_modules/@fontsource/noto-sans-{kr,sc,tc}/files/noto-sans-{kr,sc,tc}-*-400-normal.woff', { query: '?inline', import: 'default' });
const RANGES: Record<string, () => Promise<Record<string, string>>> = {
  kr: () => import('@fontsource/noto-sans-kr/unicode.json').then(m => m.default as Record<string, string>),
  sc: () => import('@fontsource/noto-sans-sc/unicode.json').then(m => m.default as Record<string, string>),
  tc: () => import('@fontsource/noto-sans-tc/unicode.json').then(m => m.default as Record<string, string>),
};
const ARABIC = [() => import('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff?inline').then(m => m.default as string), () => import('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff?inline').then(m => m.default as string)];
const isHangul = (n: number) => (n >= 0xac00 && n <= 0xd7af) || (n >= 0x1100 && n <= 0x11ff) || (n >= 0x3130 && n <= 0x318f);
const isHan = (n: number) => (n >= 0x4e00 && n <= 0x9fff) || (n >= 0x3400 && n <= 0x4dbf) || (n >= 0x3000 && n <= 0x303f) || (n >= 0xff00 && n <= 0xffef) || (n >= 0xf900 && n <= 0xfaff);
const isArabic = (n: number) => (n >= 0x0600 && n <= 0x06ff) || (n >= 0x0750 && n <= 0x077f) || (n >= 0xfb50 && n <= 0xfdff) || (n >= 0xfe70 && n <= 0xfeff);
/** Which lazy font families a text needs. Han goes to Traditional when the text or the UI language looks Traditional. */
export function scriptsNeeded(text: string, hint = ''): { cjk: ('kr' | 'sc' | 'tc')[]; arabic: boolean } {
  const cps = [...text].map(c => c.codePointAt(0)!); const cjk = new Set<'kr' | 'sc' | 'tc'>();
  if (cps.some(isHangul)) cjk.add('kr');
  if (cps.some(isHan)) cjk.add(/hant|tw|hk/i.test(hint) ? 'tc' : 'sc');
  return { cjk: [...cjk], arabic: cps.some(isArabic) };
}
const inRange = (n: number, spec: string) => spec.split(',').some(r => { const m = r.trim().replace(/^U\+/i, '').split('-'); const a = parseInt(m[0], 16), b = m[1] ? parseInt(m[1], 16) : a; return n >= a && n <= b; });
async function scriptFonts(doc: PDFDocument, r: { f: PDFFont; fb: PDFFont }, text: string) {
  const need = scriptsNeeded(text, typeof document !== 'undefined' ? document.documentElement.lang : ''); if (!need.cjk.length && !need.arabic) return;
  const fbF = FALLBACK.get(r.f), fbB = FALLBACK.get(r.fb); if (!fbF || !fbB) return; // Helvetica fallback: nothing to add to
  const emb = (d: string) => doc.embedFont(woffToTtf(bytes(d)), { subset: false, features: NOLIG });
  if (need.arabic) { const [a4, a7] = await Promise.all(ARABIC.map(x => x())); fbF.push(await doc.embedFont(woffToTtf(bytes(a4)), { subset: false })); fbB.push(await doc.embedFont(woffToTtf(bytes(a7)), { subset: false })); }
  for (const fam of need.cjk) {
    const ranges = await RANGES[fam](); const cps = [...new Set([...text].map(c => c.codePointAt(0)!))].filter(n => n > 0x2fff || isHangul(n));
    const pieces = Object.entries(ranges).filter(([k, spec]) => /^\[\d+\]$/.test(k) && cps.some(n => inRange(n, spec))).map(([k]) => k.slice(1, -1));
    for (const id of pieces) { const load = Object.entries(CJK).find(([p]) => p.endsWith(`noto-sans-${fam}-${id}-400-normal.woff`))?.[1]; if (!load) continue;
      const font = await emb(await load()); fbF.push(font); fbB.push(font); }
  }
}
async function load(doc: PDFDocument): Promise<{ f: PDFFont; fb: PDFFont }> {
  // r4reach-01: no ligatures. A drawn "fi" glyph has no text mapping, so "fix" copied or read aloud as "x".
  try { doc.registerFontkit(fontkit); const emb = (d: string) => doc.embedFont(woffToTtf(bytes(d)), { subset: false, features: NOLIG });
    const f = await emb(regular), fb = await emb(bold);
    FALLBACK.set(f, await Promise.all([rExt, rVi, rCy, rCyx, rHy].map(emb))); FALLBACK.set(fb, await Promise.all([bExt, bVi, bCy, bCyx, bHy].map(emb)));
    return { f, fb }; }
  catch { return { f: await doc.embedFont(StandardFonts.Helvetica), fb: await doc.embedFont(StandardFonts.HelveticaBold) }; }
}
const FALLBACK = new WeakMap<PDFFont, PDFFont[]>();
const sets = new WeakMap<PDFFont, Set<number>>();
const has = (font: PDFFont, c: string) => { let st = sets.get(font); if (!st) { st = new Set(font.getCharacterSet()); sets.set(font, st); } return st.has(c.codePointAt(0)!) || /\s/.test(c); };
/** Split text into runs, each in the first font (main, then fallbacks) that has the letter. */
export function fontRuns(text: string, font: PDFFont): { t: string; font: PDFFont }[] {
  const fb = FALLBACK.get(font); if (!fb) return [{ t: text, font }];
  const out: { t: string; font: PDFFont }[] = [];
  for (const c of text) { const use = has(font, c) ? font : fb.find(x => has(x, c)) ?? font; const last = out[out.length - 1]; if (last && last.font === use) last.t += c; else out.push({ t: c, font: use }); }
  return out;
}
export const textWidth = (text: string, font: PDFFont, size: number) => fontRuns(text, font).reduce((w, r) => w + r.font.widthOfTextAtSize(r.t, size), 0);
type DrawOpts = NonNullable<Parameters<PDFPage['drawText']>[1]>;
/** pg.drawText with fallback fonts. Rotated text and multi-line text use the main font only. */
export function drawT(pg: PDFPage, text: string, o: DrawOpts) {
  text = visualOrder(text); // r4reach-11: Arabic-script runs shaped and put right to left
  const runs = o.font ? fontRuns(text, o.font) : [];
  // A text wholly in one fallback font (an Armenian or Korean name alone) must use that font, not the main one (glyph 0 boxes).
  if (runs.length === 1) { pg.drawText(text, { ...o, font: runs[0].font }); return; }
  if (!runs.length || o.rotate || o.lineHeight || /\n/.test(text)) { pg.drawText(text, o); return; }
  let x = o.x ?? 0; for (const r of runs) { pg.drawText(r.t, { ...o, x, font: r.font }); x += r.font.widthOfTextAtSize(r.t, o.size ?? 12); }
}
