// Embedded fonts for every PDF sheet and report: Public Sans (SIL OFL 1.1, the app's own UI font), whole font (stable glyph ids; about 25 KB per weight).
// Plan-intake systems (ePlanLA / ProjectDox) and PDF/A expect embedded fonts; base-14 Helvetica is never embedded.
import { StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { unzlibSync } from 'fflate';
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

/** Regular and bold, embedded. Falls back to Helvetica only if the font cannot be read (the export still works). */
const cache = new WeakMap<PDFDocument, Promise<{ f: PDFFont; fb: PDFFont }>>();
export function sheetFonts(doc: PDFDocument): Promise<{ f: PDFFont; fb: PDFFont }> {
  let c = cache.get(doc); if (!c) { c = load(doc); cache.set(doc, c); } return c;
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
  const runs = o.font ? fontRuns(text, o.font) : [];
  if (runs.length <= 1 || o.rotate || o.lineHeight || /\n/.test(text)) { pg.drawText(text, o); return; }
  let x = o.x ?? 0; for (const r of runs) { pg.drawText(r.t, { ...o, x, font: r.font }); x += r.font.widthOfTextAtSize(r.t, o.size ?? 12); }
}
